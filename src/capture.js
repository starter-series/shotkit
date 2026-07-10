/*
 * shotkit — the capture runner (programmatic API).
 *
 * `capture(config, opts)` builds the project (if configured), loads the built
 * extension into Playwright, drives each scene into a money-shot state, and
 * writes into `outDir`:
 *   - <scene>.png      one screenshot per scene (CWS or SNS sizes)
 *   - <promoTile>.png  one promo tile per promoTiles entry
 *   - <demo>.webm      a captionable demo screencast (unless opts.noVideo)
 *   - <demo>.mp4       optional H.264 version for SNS
 *   - storyboard.json / captions.json / shotkit-manifest.json
 *   - description.md   listing copy extracted from STORE_LISTING.md or product.manifest.json
 *   - privacy-disclosure.md worksheet extracted from product.manifest.json
 *
 * Because it runs the project's real `build` first and loads the BUILT bundle,
 * a clean run doubles as a real-bundle smoke test: a screenshot only appears if
 * that feature rendered from the shipped code.
 *
 * The CLI (bin/shotkit.js), --json agent contract, and capture skill are thin
 * wrappers over this function.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const { launchWithExtension, closeContext } = require('./launch');
const { compositeCaption, DEFAULT_BAND_HEIGHT } = require('./caption');
const { renderPromoTile } = require('./promo');
const {
  extractListing,
  extractProductManifest,
  hasJsonExtension,
  renderDescriptionDoc,
  renderPrivacyDisclosureDoc,
} = require('./describe');
const { resolveSize } = require('./presets');
const { postProcessDemo, probeVideo } = require('./video');
const { analyzeDemoStoryboard, createDemoController, installDemoCaptionOverlay, normalizeDemoConfigs } = require('./demo');
const { analyzeDemoCaptionMetrics } = require('./demo-caption-qa');
const { applyCalibrationProfiles, loadCalibration } = require('./calibration');
const { assetRecord, writeHandoffDocs } = require('./handoff');
const { analyzePng } = require('./image-qa');

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

/** Normalize whatever setup() returns into { env, teardown }. */
function normalizeSetup(result) {
  if (!result) return { env: {}, teardown: async () => {} };
  if (typeof result.teardown === 'function') return { env: result.env || {}, teardown: result.teardown };
  return { env: result.env || result, teardown: async () => {} };
}

function isManagedTempDir(dir, prefix) {
  const resolved = path.resolve(dir);
  return path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith(prefix);
}

function normalizePreparedExtension(result) {
  if (typeof result === 'string') {
    return {
      dir: result,
      cleanup: isManagedTempDir(result, 'store-ext-') ? () => fs.rmSync(result, { recursive: true, force: true }) : null,
    };
  }
  if (result && typeof result.dir === 'string') {
    return {
      dir: result.dir,
      cleanup: typeof result.cleanup === 'function' ? result.cleanup : null,
    };
  }
  throw new Error('prepareExtension() must return an extension directory string or { dir, cleanup }');
}

function wantsAny(only, names) {
  if (only.size === 0) return names.length > 0;
  return names.some((name) => only.has(name));
}

function visualOutputNames(config) {
  return [
    ...(config.scenes || []).map((scene) => scene.name),
    ...(config.promoTiles || []).map((tile) => tile.name),
  ].filter(Boolean);
}

function textOutputNames(config, cwd) {
  const names = [];
  if (config.description && config.description.from) {
    const sourcePath = path.resolve(cwd, config.description.from);
    names.push('description');
    if (hasJsonExtension(sourcePath)) names.push('privacy');
  }
  return names.filter(Boolean);
}

function outputNames(config, cwd, demoConfigs) {
  return [
    ...visualOutputNames(config),
    ...textOutputNames(config, cwd),
    ...demoConfigs.flatMap((demo) => [demo.name, demo.story]).filter(Boolean),
  ];
}

function usageError(message) {
  const err = new Error(message);
  err.exitCode = 2;
  return err;
}

/**
 * @param {object} config  the project's shotkit config object (scenes, etc.)
 * @param {object} [opts]
 * @param {string[]} [opts.scenes]   only capture these names (scenes/promoTiles/demo/demos/"description"/"privacy")
 * @param {string[]} [opts.targets]  only capture these configured channel targets
 * @param {boolean} [opts.noVideo]   skip the demo screencast
 * @param {boolean} [opts.noBuild]   skip config.build
 * @param {boolean} [opts.mp4]       also convert the demo webm to H.264 mp4
 * @param {boolean} [opts.liveGt]    passed to config hooks as flags.liveGt
 * @param {boolean} [opts.freeze]    passed to config hooks as flags.freeze
 * @param {string}  [opts.cwd]       project root for build / outDir / listing sources
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{produced: string[], outDir: string, manifest: string|null, status:string}>}
 */
async function capture(config, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const only = new Set(opts.scenes || []);
  const targetOnly = new Set(opts.targets || []);
  const wants = (name) => only.size === 0 || only.has(name);
  const wantsDemo = (demo) => wants(demo.name) || (demo.story && only.has(demo.story));
  const wantsTarget = (demo) => targetOnly.size === 0 || targetOnly.has(demo.target);
  const log = opts.log || ((msg) => console.log(`[shotkit] ${msg}`));
  const passFlags = { liveGt: !!opts.liveGt, freeze: !!opts.freeze };

  const outDir = path.resolve(cwd, config.outDir || 'store-assets');
  const defaultViewport = resolveSize(config.viewport, DEFAULT_VIEWPORT);
  const bandHeight = config.bandHeight || DEFAULT_BAND_HEIGHT;
  const produced = [];
  let manifest = null;
  let status = 'not-requested';
  const assets = [];
  const calibration = loadCalibration(config, cwd);
  const demoConfigs = applyCalibrationProfiles(normalizeDemoConfigs(config), calibration.document);
  const capturedDemoConfigs = [];
  const demoViewports = {};
  const demoWarnings = {};
  const shouldRunVisualPass = targetOnly.size === 0 && wantsAny(only, visualOutputNames(config));
  const shouldRunTextPass = targetOnly.size === 0 && wantsAny(only, textOutputNames(config, cwd));
  const requestedDemoConfigs = demoConfigs.filter((demoConfig) => wantsDemo(demoConfig) && wantsTarget(demoConfig));
  const selectedDemoConfigs = requestedDemoConfigs.filter(() => !opts.noVideo);
  const needsBrowser = shouldRunVisualPass || selectedDemoConfigs.length > 0;
  if (only.size > 0) {
    const knownNames = new Set(outputNames(config, cwd, demoConfigs));
    const unknownNames = [...only].filter((name) => !knownNames.has(name));
    if (unknownNames.length) {
      throw usageError(`unknown scene: ${unknownNames.join(', ')}. Known: ${[...knownNames].join(', ') || '(none)'}`);
    }
  }
  if (targetOnly.size > 0) {
    const configuredTargets = new Set(demoConfigs.map((demo) => demo.target).filter(Boolean));
    const unknownTargets = [...targetOnly].filter((target) => !configuredTargets.has(target));
    if (unknownTargets.length) {
      throw usageError(`target not configured: ${unknownTargets.join(', ')}. Configured: ${[...configuredTargets].join(', ') || '(none)'}`);
    }
    if (!requestedDemoConfigs.length) {
      throw usageError('no configured demo matches the requested scene and target filters');
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const tempDirs = [];
  let fatalDemoError = null;
  const demoErrors = [];
  let cleaned = false;
  let extensionCleanup = null;

  const cleanupTempResources = async () => {
    if (cleaned) return;
    cleaned = true;
    for (const d of tempDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch (err) {
        log(`⚠️  cleanup failed for ${d}: ${err.message}`);
      }
    }
    if (extensionCleanup) {
      try {
        await extensionCleanup();
      } catch (err) {
        log(`⚠️  extension cleanup failed: ${err.message}`);
      }
    }
  };

  const registerAsset = (filePath, meta, message) => {
    produced.push(filePath);
    assets.push(assetRecord({ cwd, outDir, filePath, ...meta }));
    if (message) log(message);
  };
  const writeAsset = (filePath, data, meta, message) => {
    fs.writeFileSync(filePath, data);
    registerAsset(filePath, meta, message);
  };

  try {
    // 1. Build — the smoke test starts here. `config.build` is a repo-committed
    // command string (same trust boundary as a package.json script), run through
    // a shell so projects can write `npm run build:bundle`; never user input.
    if (config.build && !opts.noBuild && needsBrowser) {
      log(`build: ${config.build}`);
      // In --json mode stdout must stay a single JSON object, so route the build
      // command's stdout to our stderr (fd 2) instead of inheriting it.
      execSync(config.build, { stdio: opts.json ? ['ignore', 2, 2] : 'inherit', cwd });
    }

    if (shouldRunTextPass && config.description && config.description.from) {
      const sourcePath = path.resolve(cwd, config.description.from);
      if (hasJsonExtension(sourcePath)) {
        const product = extractProductManifest(sourcePath, { channel: config.description.channel });
        if (wants('description')) {
          writeAsset(
            path.join(outDir, 'description.md'),
            renderDescriptionDoc(product.listing),
            {
              name: 'description',
              type: 'text',
              role: 'store-listing-copy',
              source: { kind: 'productManifest', path: config.description.from },
            },
            '✓ description.md',
          );
          if (product.listing.warnings.length) log(`⚠️  ${product.listing.warnings.join('; ')}`);
        }
        if (wants('privacy')) {
          writeAsset(
            path.join(outDir, 'privacy-disclosure.md'),
            renderPrivacyDisclosureDoc(product.privacy),
            {
              name: 'privacy',
              type: 'text',
              role: 'privacy-disclosure',
              source: { kind: 'productManifest', path: config.description.from },
            },
            '✓ privacy-disclosure.md',
          );
          if (product.privacy.warnings.length) log(`⚠️  ${product.privacy.warnings.join('; ')}`);
        }
      } else if (wants('description')) {
        const listing = extractListing(sourcePath);
        writeAsset(
          path.join(outDir, 'description.md'),
          renderDescriptionDoc(listing),
          {
            name: 'description',
            type: 'text',
            role: 'store-listing-copy',
            source: { kind: 'description' },
          },
          '✓ description.md',
        );
        if (listing.warnings.length) log(`⚠️  ${listing.warnings.join('; ')}`);
      }
    }

    // 2. Prepare the unpacked extension dir to load only when a browser capture
    // is required. Text-only description/privacy runs should not depend on
    // Chromium, build artifacts, or extension manifests.
    let extensionDir = null;
    if (needsBrowser) {
      const preparedExtension = normalizePreparedExtension(await config.prepareExtension(passFlags));
      extensionDir = preparedExtension.dir;
      extensionCleanup = preparedExtension.cleanup;
    }

    // 3. Screenshots + promo run in a no-video context.
    if (shouldRunVisualPass) {
      const ctx = await launchWithExtension({ extensionDir, viewport: defaultViewport });
      let setup = normalizeSetup(null);
      try {
        setup = normalizeSetup(
          config.setup ? await config.setup({ context: ctx.context, extensionId: ctx.extensionId, flags: passFlags }) : null,
        );
        for (const scene of config.scenes || []) {
          if (!wants(scene.name)) continue;
          const viewport = resolveSize(scene.preset || scene.viewport, defaultViewport);
          const captioned = !!(config.disclaimer || scene.caption);
          const captureHeight = captioned ? viewport.height - bandHeight : viewport.height;

          const page = await ctx.context.newPage();
          try {
            await page.setViewportSize({ width: viewport.width, height: captureHeight });
            await scene.run({ page, context: ctx.context, extensionId: ctx.extensionId, env: setup.env, baseUrl: setup.env.baseUrl, flags: passFlags });
            let buf = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: captureHeight } });
            if (captioned) {
              buf = await compositeCaption({
                context: ctx.context, imageBuffer: buf,
                width: viewport.width, height: viewport.height, bandHeight,
                caption: scene.caption, disclaimer: config.disclaimer,
              });
            }
            writeAsset(
              path.join(outDir, `${scene.name}.png`),
              buf,
              {
                name: scene.name,
                type: 'image',
                role: 'store-screenshot',
                width: viewport.width,
                height: viewport.height,
                source: { kind: 'scene', name: scene.name },
              },
              `✓ ${scene.name}.png (${viewport.width}×${viewport.height})`,
            );
          } finally {
            await page.close();
          }
        }

        for (const tile of config.promoTiles || []) {
          if (!wants(tile.name)) continue;
          const { width, height } = resolveSize(tile.preset || { width: tile.width, height: tile.height }, defaultViewport);
          const buf = await renderPromoTile({ context: ctx.context, template: tile.template, width, height, replacements: tile.replacements });
          writeAsset(
            path.join(outDir, `${tile.name}.png`),
            buf,
            {
              name: tile.name,
              type: 'image',
              role: 'promo-tile',
              width,
              height,
              source: { kind: 'promoTile', name: tile.name },
            },
            `✓ ${tile.name}.png (${width}×${height})`,
          );
        }

      } finally {
        // Close the context (drops the browser's sockets) BEFORE the fixture server:
        // server.close() waits for open connections to drain, and a still-open page
        // keeps a keep-alive socket that would otherwise deadlock the close.
        try {
          await closeContext(ctx);
        } finally {
          await setup.teardown();
        }
      }
    }

    // 4. Demo screencasts — separate context per demo so only that walkthrough
    // records video and each clip can choose its own viewport/captions/trim.
    for (const demoConfig of selectedDemoConfigs) {
      const viewport = resolveSize(demoConfig.preset || demoConfig.viewport, defaultViewport);
      demoViewports[demoConfig.name] = viewport;
      const warnings = analyzeDemoStoryboard(demoConfig, {
        viewport,
        mp4Requested: !!(demoConfig.mp4 || opts.mp4 || demoConfig.crop || demoConfig.zoom),
      });
      demoWarnings[demoConfig.name] = warnings;
      for (const warning of warnings) {
        log(`⚠️  ${demoConfig.name}: ${warning.message}${warning.fix ? `; ${warning.fix}` : ''}`);
      }
      const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotkit-video-'));
      tempDirs.push(videoDir);
      const demoCtx = await launchWithExtension({ extensionDir, viewport, recordVideoDir: videoDir, recordVideoSize: viewport });
      let setup2 = normalizeSetup(null);
      let page = null;
      try {
        await installDemoCaptionOverlay(demoCtx.context, demoConfig.captionOptions || {});

        // Keep a small "unofficial" badge on screen across navigations. A
        // target-specific story may shorten or disable the global screenshot
        // disclaimer when the video header has less room.
        const demoDisclaimer = Object.prototype.hasOwnProperty.call(demoConfig, 'disclaimer')
          ? demoConfig.disclaimer
          : config.disclaimer;
        if (demoDisclaimer != null && demoDisclaimer !== false
          && (typeof demoDisclaimer !== 'string' || !demoDisclaimer.trim())) {
          throw new Error(`demo "${demoConfig.name}".disclaimer must be a non-empty string or false`);
        }
        if (demoDisclaimer) {
          await demoCtx.context.addInitScript((text) => {
            const add = () => {
              if (document.getElementById('__shotkit_badge__') || !document.body) return;
              const b = document.createElement('div');
              b.id = '__shotkit_badge__';
              b.textContent = text;
              b.style.cssText = 'position:fixed;top:10px;left:10px;z-index:2147483647;background:rgba(20,21,26,.86);color:#fff;font:600 11px -apple-system,Segoe UI,Roboto,sans-serif;padding:5px 9px;border-radius:6px;pointer-events:none';
              document.body.appendChild(b);
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true });
            else add();
          }, demoDisclaimer);
        }

        setup2 = normalizeSetup(
          config.setup ? await config.setup({ context: demoCtx.context, extensionId: demoCtx.extensionId, flags: passFlags }) : null,
        );
        page = await demoCtx.context.newPage();
        await page.setViewportSize(viewport);
        const demo = createDemoController({
          page,
          captions: demoConfig.captions,
          captionOptions: demoConfig.captionOptions,
        });
        let captionMetricReport;
        try {
          await demoConfig.run({
            page,
            context: demoCtx.context,
            extensionId: demoCtx.extensionId,
            env: setup2.env,
            baseUrl: setup2.env.baseUrl,
            flags: passFlags,
            demo,
            target: demoConfig.targetProfile || null,
            calibration: demoConfig.calibrationProfile || null,
          });
        } finally {
          captionMetricReport = demo.captionMetrics();
          demo.stop();
        }
        const calibrationProfile = demoConfig.calibrationProfile || {};
        const runtimeCaptionWarnings = analyzeDemoCaptionMetrics(captionMetricReport, {
          viewport,
          protectedRegions: calibrationProfile.protectedRegions || [],
          framing: calibrationProfile.framing || null,
        });
        demoWarnings[demoConfig.name].push(...runtimeCaptionWarnings);
        for (const warning of runtimeCaptionWarnings) {
          log(`⚠️  ${demoConfig.name}: ${warning.message}${warning.fix ? `; ${warning.fix}` : ''}`);
        }
        // Ordering: grab the video handle, page.close() (finalizes recording +
        // drops the page socket), video.saveAs() while the browser is still up,
        // THEN closeContext, THEN server teardown (no page holds a socket → no
        // deadlock). See the screenshots finally above.
        const video = page.video();
        await page.close();
        if (!video) throw new Error(`demo "${demoConfig.name}" did not produce a video recording`);
        const out = path.join(outDir, `${demoConfig.name}.webm`);
        await video.saveAs(out);
        capturedDemoConfigs.push(demoConfig);
        registerAsset(out, {
          name: demoConfig.name,
          type: 'video',
          role: 'source-demo-webm',
          width: viewport.width,
          height: viewport.height,
          target: demoConfig.target,
          channel: demoConfig.channel,
          source: { kind: 'demo', name: demoConfig.name, story: demoConfig.story, target: demoConfig.target },
        }, `✓ ${demoConfig.name}.webm (${viewport.width}×${viewport.height})`);
        // SNS post-processing: mp4 (H.264) and/or trim — needs a real ffmpeg,
        // fails loudly if one was requested but none is installed.
        let extra;
        try {
          extra = postProcessDemo({
            webmPath: out,
            mp4: demoConfig.mp4 || opts.mp4,
            trim: demoConfig.trim,
            crop: demoConfig.crop,
            zoom: demoConfig.zoom,
            thumbnail: demoConfig.thumbnail,
            log,
          });
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          fatalDemoError = new Error(`demo "${demoConfig.name}" post-processing failed: ${msg}`, { cause: err });
          log(`❌ ${fatalDemoError.message}`);
          break;
        }
        for (const extraPath of extra) {
          const format = path.extname(extraPath).toLowerCase();
          const media = format === '.mp4' && demoConfig.target ? probeVideo(extraPath) : undefined;
          const visual = format === '.png' && demoConfig.target ? analyzePng(extraPath) : undefined;
          registerAsset(extraPath, {
            name: path.basename(extraPath, path.extname(extraPath)),
            type: format === '.png' ? 'image' : 'video',
            role: format === '.png' ? 'thumbnail' : 'sns-demo-mp4',
            width: media && media.ok ? media.width : undefined,
            height: media && media.ok ? media.height : undefined,
            target: demoConfig.target,
            channel: demoConfig.channel,
            media,
            visual,
            source: { kind: 'demo', name: demoConfig.name, story: demoConfig.story, target: demoConfig.target },
          });
        }
      } catch (err) {
        // One demo run/recording failure must not abort the remaining demos, the
        // later teardown, but it must still make the run fail. A requested demo
        // clip missing from produced[] is a false-positive success signal.
        demoErrors.push({ name: demoConfig.name, error: err });
        log(`❌ demo "${demoConfig.name}" failed: ${err.message} — continuing with the remaining demos`);
      } finally {
        if (page && !page.isClosed()) await page.close().catch(() => {});
        try {
          await closeContext(demoCtx);
        } finally {
          await setup2.teardown();
        }
      }
    }

    if (fatalDemoError) throw fatalDemoError;
    if (demoErrors.length) {
      const names = demoErrors.map((item) => item.name).join(', ');
      throw new Error(`demo capture failed for: ${names}`, { cause: demoErrors[0].error });
    }

    // 5. Machine contract — target QA and fix/retry actions for agents, with
    // legacy adapter hints available only when manual fallback is requested.
    if (config.handoff !== false) {
      const handoffPaths = writeHandoffDocs({
        cwd,
        outDir,
        config,
        assets,
        demoConfigs: capturedDemoConfigs,
        demoViewports,
        demoWarnings,
        flags: passFlags,
        // Scene-filtered or --no-video runs only re-capture a subset; merge into
        // the existing handoff contract rather than clobbering a prior full run.
        partial: only.size > 0 || targetOnly.size > 0 || !!opts.noVideo,
        run: {
          requestedScenes: [...only],
          requestedTargets: [...targetOnly],
          attempt: opts.attempt || 1,
          video: !opts.noVideo,
          noBuild: !!opts.noBuild,
          mp4: !!opts.mp4,
          configuredDemos: demoConfigs.map((demoConfig) => demoConfig.name),
          configuredTargets: [...new Set(demoConfigs.map((demoConfig) => demoConfig.target).filter(Boolean))],
          configuredTargetDemos: demoConfigs
            .filter((demoConfig) => demoConfig.target)
            .map((demoConfig) => ({ name: demoConfig.name, story: demoConfig.story, target: demoConfig.target })),
          selectedDemos: requestedDemoConfigs.map((demoConfig) => demoConfig.name),
          capturedDemos: capturedDemoConfigs.map((demoConfig) => demoConfig.name),
          skippedDemos: requestedDemoConfigs
            .filter((demoConfig) => !capturedDemoConfigs.includes(demoConfig))
            .map((demoConfig) => demoConfig.name),
        },
      });
      produced.push(...handoffPaths);
      manifest = path.join(outDir, 'shotkit-manifest.json');
      const handoff = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      status = handoff.handoff && handoff.handoff.automation
        ? handoff.handoff.automation.status
        : 'not-requested';
      log(`automation: ${status}`);
      for (const out of handoffPaths) log(`✓ ${path.basename(out)}`);
    }

    log(`done — ${produced.length} asset(s) in ${path.relative(cwd, outDir) || '.'}/`);
    return { produced, outDir, manifest, status };
  } finally {
    await cleanupTempResources();
  }
}

module.exports = { capture, DEFAULT_VIEWPORT };
