/*
 * shotkit — handoff contract exports.
 *
 * These files are the autonomous machine boundary: captured evidence,
 * captions, integrity, target QA, agent-owned fix/retry actions, and the final
 * user approval gate. Users review media, not manifests or repair mechanics.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeDemoCaptions, parseTimeToMs } = require('./demo-time');
const { buildCaptionFrames, buildCaptionTimeline, captionStyle } = require('./demo-caption-focus');
const { buildHandoffRecommendations } = require('./integrations');
const { buildPublishPlan } = require('./publish');
const {
  APPROVAL_SCHEMA_ID,
  emptyApprovalDocument,
  loadApproval,
  syncManifestApproval,
} = require('./approval');
const { isValidHandoffDocs, validateHandoffDocs } = require('./handoff-validator');
const {
  copyHandoffSchemas,
  hydrateManifestAssets,
  mergeByKey,
  namesMatch,
  readJsonIfExists,
  validateFinalPack,
  writeJson,
} = require('./handoff-files');

const HANDOFF_VERSION = 1;
const HANDOFF_KINDS = Object.freeze({
  manifest: 'shotkit.manifest',
  storyboard: 'shotkit.storyboard',
  captions: 'shotkit.captions',
});
const HANDOFF_SCHEMA_IDS = Object.freeze({
  manifest: 'urn:starter-series:shotkit:schema:shotkit-manifest:v1',
  storyboard: 'urn:starter-series:shotkit:schema:storyboard:v1',
  captions: 'urn:starter-series:shotkit:schema:captions:v1',
  approval: APPROVAL_SCHEMA_ID,
});
const HANDOFF_SCHEMA_FILES = Object.freeze({
  manifest: 'schemas/shotkit-manifest.schema.json',
  storyboard: 'schemas/storyboard.schema.json',
  captions: 'schemas/captions.schema.json',
  approval: 'schemas/approval.schema.json',
});

function readProjectInfo(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private,
    };
  } catch (_e) {
    return {};
  }
}

function rel(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}

function ext(filePath) {
  return path.extname(filePath).replace(/^\./, '').toLowerCase();
}

function stableIdPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function assetRecord({ cwd, outDir, filePath, name, type, role, width, height, source, target, channel, media, visual }) {
  const assetName = name || path.basename(filePath, path.extname(filePath));
  return {
    id: `${stableIdPart(role)}:${stableIdPart(assetName)}`,
    name: assetName,
    type,
    role,
    format: ext(filePath),
    path: rel(cwd, filePath),
    outPath: rel(outDir, filePath),
    width,
    height,
    target,
    channel,
    media,
    visual,
    source,
  };
}

function demoAudience(demoConfig) {
  return demoConfig.audience || demoConfig.channel || 'sns';
}

function demoNextTool(demoConfig) {
  if (demoConfig.targetProfile && demoConfig.targetProfile.connector) {
    return `${demoConfig.targetProfile.connector}-upload`;
  }
  if (demoConfig.nextTool) return demoConfig.nextTool;
  if (demoConfig.handoff && demoConfig.handoff.nextTool) return demoConfig.handoff.nextTool;
  return 'manual-editor';
}

// The delivered mp4/webm has trim.start cut off its head, so caption/beat times
// in the handoff contract must be relative to the DELIVERABLE, not the raw
// recording. Returns 0 unless trim is an object with a parseable start.
function trimStartMs(demoConfig) {
  const trim = demoConfig.trim;
  if (!trim || typeof trim !== 'object' || trim.start == null) return 0;
  try {
    return parseTimeToMs(trim.start, 'trim.start');
  } catch (_e) {
    return 0;
  }
}

function trimEndMs(demoConfig, startMs) {
  const trim = demoConfig.trim;
  if (!trim || typeof trim !== 'object' || trim.duration == null) return null;
  try {
    return startMs + parseTimeToMs(trim.duration, 'trim.duration');
  } catch (_e) {
    return null;
  }
}

// Shift caption times by the trimmed-off prefix and drop captions that fall
// before the clip starts (they are not in the deliverable). Output conforms to
// the beat/caption schema: at >= 0 (number), atMs >= 0 (integer).
function deliverableBeats(captions, startMs) {
  return captions
    .map((caption) => ({
      atMs: caption.atMs - startMs,
      text: caption.text,
      ...(caption.role == null ? {} : { role: caption.role }),
    }))
    .filter((beat) => beat.atMs >= 0)
    .map((beat) => ({ at: beat.atMs / 1000, ...beat }));
}

// Coerce loosely-typed demo config into the storyboard schema's shape: preset
// must be a string (object presets are omitted), trim object|null, thumbnail
// object|boolean|null (a bare number becomes { at }).
function storyboardPreset(preset) {
  return typeof preset === 'string' ? preset : undefined;
}
function storyboardTrim(trim) {
  return trim && typeof trim === 'object' ? trim : null;
}
function storyboardThumbnail(thumbnail) {
  if (typeof thumbnail === 'number') return { at: thumbnail };
  return thumbnail || null;
}

function demoStoryboard(demoConfig, viewport) {
  const captions = normalizeDemoCaptions(demoConfig.captions || []);
  const startMs = trimStartMs(demoConfig);
  return {
    name: demoConfig.name,
    story: demoConfig.story,
    target: demoConfig.target,
    lintEnabled: demoConfig.storyboardLint !== false,
    audience: demoAudience(demoConfig),
    channelProfile: demoConfig.targetProfile ? {
      id: demoConfig.targetProfile.id,
      label: demoConfig.targetProfile.label,
      platform: demoConfig.targetProfile.platform,
      delivery: demoConfig.targetProfile.delivery,
      specUrl: demoConfig.targetProfile.specUrl,
    } : undefined,
    preset: storyboardPreset(demoConfig.preset),
    viewport,
    recommendedNextTool: demoNextTool(demoConfig),
    trim: storyboardTrim(demoConfig.trim),
    framing: {
      crop: demoConfig.crop || null,
      zoom: demoConfig.zoom || null,
    },
    calibration: demoConfig.calibrationProfile ? {
      profileHash: demoConfig.calibrationProfile.profileHash,
      layoutPreset: demoConfig.calibrationProfile.layoutPreset,
      protectedRegions: demoConfig.calibrationProfile.protectedRegions || [],
    } : null,
    captionStyle: captionStyle(demoConfig.captionOptions || {}),
    thumbnail: storyboardThumbnail(demoConfig.thumbnail),
    recommendedStory: {
      durationSeconds: { min: 20, max: 40 },
      shape: ['result-first', 'action', 'proof', 'safety-restore'],
    },
    beats: deliverableBeats(captions, startMs),
    guidance: demoConfig.guidance || null,
  };
}

function finiteSampleValues(samples, key) {
  return samples.map((sample) => sample[key]).filter(Number.isFinite);
}

function captionQaReport(report) {
  if (!report) return undefined;
  const expectedFrames = Array.isArray(report.expectedFrames) ? report.expectedFrames : [];
  const samples = Array.isArray(report.samples) ? report.samples : [];
  const fontSamples = samples.filter((sample) => sample.fontConfigured);
  const fontLoadTimes = finiteSampleValues(fontSamples, 'fontLoadMs');
  const fontSizes = finiteSampleValues(samples, 'fontSize');
  const lineCounts = finiteSampleValues(samples, 'lineCount');
  const lineBalances = finiteSampleValues(samples, 'lineBalance');
  const typographyEnabled = !!(report.typography && report.typography.enabled);
  const allFramesLoaded = samples.length
    ? samples.every((sample) => sample.fontConfigured === true && sample.fontLoaded === true)
    : null;
  return {
    scheduledFrameCount: expectedFrames.length,
    measuredFrameCount: samples.length,
    typography: report.typography || null,
    rendering: {
      fontLoaded: typographyEnabled
        ? allFramesLoaded
        : fontSamples.length ? fontSamples.every((sample) => sample.fontLoaded === true) : null,
      maxFontLoadMs: fontLoadTimes.length ? Math.max(...fontLoadTimes) : null,
      fitStatuses: [...new Set(samples.map((sample) => sample.fitStatus).filter(Boolean))],
      resolvedFontSize: fontSizes.length ? { min: Math.min(...fontSizes), max: Math.max(...fontSizes) } : null,
      maxLineCount: lineCounts.length ? Math.max(...lineCounts) : 0,
      minLineBalance: lineBalances.length ? Math.min(...lineBalances) : null,
    },
  };
}

function demoCaptions(demoConfig, captionReport) {
  const startMs = trimStartMs(demoConfig);
  const captions = normalizeDemoCaptions(demoConfig.captions || []);
  const frames = buildCaptionFrames(captions, demoConfig.captionOptions);
  return {
    name: demoConfig.name,
    story: demoConfig.story,
    target: demoConfig.target,
    style: captionStyle(demoConfig.captionOptions || {}),
    ...(captionReport ? { qa: captionQaReport(captionReport) } : {}),
    captions: deliverableBeats(captions, startMs),
    timeline: buildCaptionTimeline(frames, { startMs, endMs: trimEndMs(demoConfig, startMs) }),
  };
}

function storyboardLintSummary(warnings) {
  return Object.entries(warnings || {}).map(([name, items]) => ({
    name,
    ok: !items.length,
    warnings: items,
  }));
}

function handoffReview(storyboardLint, run = {}, assets = []) {
  const warnings = (storyboardLint || []).flatMap((summary) => (
    (summary.warnings || []).map((warning) => ({ demo: summary.name, ...warning }))
  ));
  const incomplete = (run.skippedDemos || []).map((name) => ({
    code: 'demo-skipped',
    demo: name,
    reason: run.video ? 'not-captured' : 'video-disabled',
    fix: run.video ? `capture the ${name} demo` : 'rerun without --no-video',
  }));
  for (const asset of assets.filter((item) => item.state === 'modified')) {
    incomplete.push({
      code: 'asset-integrity-mismatch',
      asset: asset.id,
      reason: 'retained-file-changed',
      fix: `rerun the source for ${asset.id}`,
    });
  }
  return {
    status: incomplete.length ? 'incomplete' : warnings.length ? 'needs-review' : 'ready',
    warningCount: warnings.length,
    warnings,
    incomplete,
  };
}

function refreshManifestHandoff(manifest, storyboard, config, approvalDocument = emptyApprovalDocument()) {
  const automation = buildPublishPlan({
    assets: manifest.assets,
    storyboard,
    run: manifest.run,
    config,
  });
  const adapterHints = automation.status !== 'not-requested' && !automation.manualFallback ? [] : buildHandoffRecommendations({
    assets: manifest.assets,
    config,
    context: { storyboardDemoCount: storyboard.demos.length },
  });
  manifest.handoff.adapterHints = adapterHints;
  manifest.handoff.automation = automation;
  syncManifestApproval(manifest, approvalDocument);
  manifest.handoff.review = handoffReview(storyboard.storyboardLint, manifest.run, manifest.assets);
  manifest.handoff.summary = {
    assetCount: manifest.assets.length,
    demoCount: storyboard.demos.length,
    readyAdapterCount: adapterHints.filter((hint) => hint.readiness === 'ready').length,
    publishReadyTargetCount: automation.targets.filter((target) => target.status === 'publish-ready').length,
    approvedTargetCount: manifest.handoff.approval.targets.filter((target) => target.status === 'approved').length,
  };
}

function buildHandoffDocs({
  cwd,
  outDir,
  config,
  assets,
  demoConfigs,
  demoViewports,
  demoWarnings,
  demoCaptionReports = {},
  flags,
  run = {},
}) {
  const generatedAt = new Date().toISOString();
  const project = readProjectInfo(cwd);
  const runInfo = {
    id: crypto.randomUUID(),
    mode: run.mode || 'full',
    requestedScenes: run.requestedScenes || [],
    requestedTargets: run.requestedTargets || [],
    attempt: run.attempt || 1,
    video: run.video !== false,
    noBuild: !!run.noBuild,
    mp4: !!run.mp4,
    configuredDemos: run.configuredDemos || [],
    configuredTargets: run.configuredTargets || [],
    configuredTargetDemos: run.configuredTargetDemos || [],
    selectedDemos: run.selectedDemos || [],
    capturedDemos: run.capturedDemos || [],
    skippedDemos: run.skippedDemos || [],
  };
  const currentAssets = assets.map((asset) => ({
    ...asset,
    runId: runInfo.id,
    capturedAt: generatedAt,
    state: 'produced',
  }));
  const storyboard = {
    $schema: HANDOFF_SCHEMA_IDS.storyboard,
    kind: HANDOFF_KINDS.storyboard,
    version: HANDOFF_VERSION,
    generatedAt,
    project,
    purpose: 'browser-extension-demo-starter-pack',
    demos: demoConfigs.map((demoConfig) => demoStoryboard(demoConfig, demoViewports[demoConfig.name])),
    storyboardLint: storyboardLintSummary(demoWarnings),
  };
  const captions = {
    $schema: HANDOFF_SCHEMA_IDS.captions,
    kind: HANDOFF_KINDS.captions,
    version: HANDOFF_VERSION,
    generatedAt,
    project,
    demos: demoConfigs.map((demoConfig) => demoCaptions(demoConfig, demoCaptionReports[demoConfig.name])),
  };
  const manifest = {
    $schema: HANDOFF_SCHEMA_IDS.manifest,
    kind: HANDOFF_KINDS.manifest,
    version: HANDOFF_VERSION,
    generatedAt,
    tool: 'shotkit',
    project,
    outDir: rel(cwd, outDir),
    flags,
    run: runInfo,
    positioning: 'capture-and-handoff-kit',
    category: 'agent-ready-launch-asset-pipeline',
    handoff: {
      contractVersion: HANDOFF_VERSION,
      entrypoint: 'shotkit-manifest.json',
      schemas: HANDOFF_SCHEMA_IDS,
      schemaFiles: HANDOFF_SCHEMA_FILES,
      storyboards: 'storyboard.json',
      captions: 'captions.json',
      recommendedFlow: [
        'read handoff.automation and apply every agent-owned action',
        'retry listed scenes until every requested target is publish-ready',
        'present technically ready media to the user for final approval',
        'upload only the exact deliverable digest the user approved',
        'keep repo fixtures and storyboard as the repeatable source of truth',
      ],
      adapterHints: [],
      automation: null,
      approval: null,
      review: handoffReview(storyboard.storyboardLint, runInfo),
      summary: {
        assetCount: currentAssets.length,
        demoCount: storyboard.demos.length,
        readyAdapterCount: 0,
        publishReadyTargetCount: 0,
      },
    },
    assets: currentAssets,
    config: {
      disclaimer: config.disclaimer || null,
      description: config.description || null,
    },
  };
  refreshManifestHandoff(manifest, storyboard, config);
  return { storyboard, captions, manifest };
}

function compatiblePreviousPack(previous, current) {
  const { manifest, storyboard, captions } = previous;
  if (!manifest || !storyboard || !captions) return false;
  if (!isValidHandoffDocs(previous)) return false;
  if (manifest.kind !== HANDOFF_KINDS.manifest || manifest.version !== HANDOFF_VERSION) return false;
  if (storyboard.kind !== HANDOFF_KINDS.storyboard || storyboard.version !== HANDOFF_VERSION) return false;
  if (captions.kind !== HANDOFF_KINDS.captions || captions.version !== HANDOFF_VERSION) return false;
  if (!Array.isArray(manifest.assets) || !Array.isArray(storyboard.demos)
    || !Array.isArray(storyboard.storyboardLint) || !Array.isArray(captions.demos)) return false;
  if (!namesMatch(storyboard.demos, captions.demos)) return false;
  const previousProject = manifest.project && manifest.project.name;
  const currentProject = current.manifest.project && current.manifest.project.name;
  return !previousProject || !currentProject || previousProject === currentProject;
}

function writeHandoffDocs({
  cwd,
  outDir,
  config,
  assets,
  demoConfigs,
  demoViewports,
  demoWarnings,
  demoCaptionReports = {},
  flags,
  partial = false,
  run = {},
}) {
  const storyboardPath = path.join(outDir, 'storyboard.json');
  const captionsPath = path.join(outDir, 'captions.json');
  const manifestPath = path.join(outDir, 'shotkit-manifest.json');
  const refreshedAssetKeys = new Set(assets.map((asset) => (
    (asset.source && asset.source.name) || asset.name
  )));
  const schemaPaths = copyHandoffSchemas(outDir, HANDOFF_SCHEMA_FILES);
  const contractAssets = [
    assetRecord({
      cwd, outDir, filePath: storyboardPath,
      name: 'storyboard', type: 'json', role: 'storyboard-contract',
      source: { kind: 'handoff' },
    }),
    assetRecord({
      cwd, outDir, filePath: captionsPath,
      name: 'captions', type: 'json', role: 'captions-contract',
      source: { kind: 'handoff' },
    }),
    assetRecord({
      cwd, outDir, filePath: manifestPath,
      name: 'shotkit-manifest', type: 'json', role: 'handoff-manifest',
      source: { kind: 'handoff' },
    }),
    ...schemaPaths.map((filePath) => assetRecord({
      cwd,
      outDir,
      filePath,
      name: path.basename(filePath, path.extname(filePath)),
      type: 'json',
      role: 'handoff-schema',
      source: { kind: 'handoff-schema' },
    })),
  ];
  const docs = buildHandoffDocs({
    cwd,
    outDir,
    config,
    assets: [...assets, ...contractAssets],
    demoConfigs,
    demoViewports,
    demoWarnings,
    demoCaptionReports,
    flags,
    run: { ...run, mode: partial ? 'partial' : 'full' },
  });
  // A partial run (scene filter or --no-video) only re-captures a subset, so
  // merge into the existing contract instead of overwriting a prior full run's
  // storyboard/captions/manifest with just this run's subset.
  if (partial) {
    const prevStoryboard = readJsonIfExists(storyboardPath);
    const prevCaptions = readJsonIfExists(captionsPath);
    const prevManifest = readJsonIfExists(manifestPath);
    const previous = { manifest: prevManifest, storyboard: prevStoryboard, captions: prevCaptions };
    if (compatiblePreviousPack(previous, docs)) {
      docs.storyboard.demos = mergeByKey(prevStoryboard.demos, docs.storyboard.demos, (d) => d.name);
      docs.storyboard.storyboardLint = mergeByKey(prevStoryboard.storyboardLint, docs.storyboard.storyboardLint, (l) => l.name);
      docs.captions.demos = mergeByKey(prevCaptions.demos, docs.captions.demos, (d) => d.name);
      const previousRunId = prevManifest.run && prevManifest.run.id
        ? prevManifest.run.id
        : `legacy:${prevManifest.generatedAt}`;
      const previousAssets = (prevManifest.assets || [])
        .filter((asset) => !refreshedAssetKeys.has((asset.source && asset.source.name) || asset.name))
        .map((asset) => ({
          ...asset,
          runId: asset.runId || previousRunId,
          capturedAt: asset.capturedAt || prevManifest.generatedAt,
          state: 'retained',
        }));
      docs.manifest.assets = mergeByKey(previousAssets, docs.manifest.assets, (a) => a.id);
    }
  }
  writeJson(storyboardPath, docs.storyboard);
  writeJson(captionsPath, docs.captions);
  // Partial runs can inherit an older inventory. Prune entries whose files no
  // longer exist, then recompute recommendations from the actual final bundle.
  docs.manifest.assets = hydrateManifestAssets(docs.manifest.assets, outDir, manifestPath);
  refreshManifestHandoff(docs.manifest, docs.storyboard, config, loadApproval(outDir).document);
  validateHandoffDocs(docs);
  validateFinalPack(docs, outDir, manifestPath);
  writeJson(manifestPath, docs.manifest);
  return [storyboardPath, captionsPath, manifestPath, ...schemaPaths];
}

module.exports = {
  HANDOFF_KINDS,
  HANDOFF_SCHEMA_IDS,
  HANDOFF_VERSION,
  assetRecord,
  buildHandoffDocs,
  demoStoryboard,
  writeHandoffDocs,
};
