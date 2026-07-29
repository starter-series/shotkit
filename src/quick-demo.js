/*
 * shotkit quick demo — zero-config proof clip for any web app.
 *
 * `shotkit demo <url|dir|file.html>` needs no shotkit.config.js: it
 * synthesizes a one-demo config that loads the target, captions the clip with
 * the page's own title and headings, and walks the page with a paced scroll,
 * so the recording proves the app actually renders from a clean run. Video
 * recording, caption overlay, mp4/thumbnail post-processing, and QA all reuse
 * the standard capture engine — this module only decides what to show.
 */

const fs = require('fs');
const path = require('path');

const { serveDirectory } = require('./serve');
const { findFfmpeg } = require('./video');

const DEFAULT_DEMO_NAME = 'demo';
const DEFAULT_OUT_DIR = 'shotkit-demo';
const DEFAULT_DURATION_S = 20;
const MIN_DURATION_S = 5;
const MAX_DURATION_S = 120;
const INTRO_HOLD_MS = 2400;
const OUTRO_HOLD_MS = 1600;
const MIN_STEP_HOLD_MS = 1200;
const MAX_SCROLL_STEPS = 8;

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

/**
 * Classify what the user pointed shotkit at.
 * @returns {{kind:'url',url:string}|{kind:'static',dir:string,fallback:string}}
 */
function resolveDemoTarget(input, cwd = process.cwd()) {
  if (!input || typeof input !== 'string') {
    throw usageError('demo target required: a URL (http://localhost:3000) or a static directory / .html file');
  }
  if (/^https?:\/\//i.test(input)) return { kind: 'url', url: input };

  const resolved = path.resolve(cwd, input);
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return { kind: 'static', dir: resolved, fallback: 'index.html' };
    if (/\.html?$/i.test(resolved)) {
      return { kind: 'static', dir: path.dirname(resolved), fallback: path.basename(resolved) };
    }
    throw usageError(`demo target ${input} is a file but not .html — pass a URL, a directory, or an .html file`);
  }

  // localhost:3000 / 127.0.0.1:8080 / app.localhost:3000 style shorthand.
  if (/^[\w.-]+(:\d+)?(\/.*)?$/.test(input) && /localhost|^127\.|^0\.0\.0\.0|^\[?::1/.test(input)) {
    return { kind: 'url', url: `http://${input}` };
  }
  throw usageError(`demo target not found: ${input} (no such path, and not an http(s):// or localhost URL)`);
}

function trimText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * The auto walkthrough: load → title caption → paced scroll with heading
 * captions → return to top. Runs inside the standard demo controller, so
 * captions land in the recorded clip and in caption QA metrics.
 */
function makeQuickDemoRun({ url, durationS }) {
  const durationMs = durationS * 1000;
  return async function quickDemoRun({ page, demo, baseUrl }) {
    const startUrl = url || baseUrl;
    if (!startUrl) throw new Error('quick demo: no target URL (static server did not provide baseUrl)');

    await page.goto(startUrl, { waitUntil: 'load', timeout: 30_000 });
    // Settle async rendering without hanging on dev servers that never go idle.
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});

    const surveyed = await page.evaluate(() => {
      const body = document.body;
      const doc = document.documentElement;
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            top: rect.top + window.scrollY,
            visible: rect.width > 0 && rect.height > 0,
          };
        })
        .filter((h) => h.text && h.visible)
        .slice(0, 24);
      return {
        title: document.title || location.host,
        scrollHeight: Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0),
        viewportH: window.innerHeight,
        headings,
      };
    });

    const title = trimText(surveyed.title) || startUrl;
    await demo.caption(title);
    await demo.wait(INTRO_HOLD_MS);

    const scrollable = Math.max(0, surveyed.scrollHeight - surveyed.viewportH);
    if (scrollable >= 40) {
      const stride = Math.max(1, Math.round(surveyed.viewportH * 0.85));
      const steps = Math.min(MAX_SCROLL_STEPS, Math.max(1, Math.ceil(scrollable / stride)));
      const budget = Math.max(0, durationMs - INTRO_HOLD_MS - OUTRO_HOLD_MS);
      const holdMs = Math.max(MIN_STEP_HOLD_MS, Math.floor(budget / steps));
      let lastCaption = title;
      for (let step = 1; step <= steps; step++) {
        const top = Math.min(scrollable, Math.round((scrollable * step) / steps));
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), top);
        const heading = surveyed.headings.find(
          (h) => h.top >= top && h.top <= top + surveyed.viewportH * 0.8,
        );
        const captionText = heading ? trimText(heading.text) : null;
        if (captionText && captionText !== lastCaption) {
          await demo.caption(captionText);
          lastCaption = captionText;
        }
        await demo.wait(holdMs);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await demo.caption(title);
      await demo.wait(OUTRO_HOLD_MS);
    } else {
      // Single-screen app: hold the loaded state for the remaining budget.
      await demo.wait(Math.max(OUTRO_HOLD_MS, durationMs - INTRO_HOLD_MS));
    }
    await demo.hide();
  };
}

/**
 * Build the synthetic capture config for a zero-config demo run.
 *
 * @param {object} opts
 * @param {{kind:string,url?:string,dir?:string,fallback?:string}} opts.target  from resolveDemoTarget()
 * @param {string} [opts.name]        demo/asset name (default "demo")
 * @param {string} [opts.outDir]      output dir (default "shotkit-demo")
 * @param {number} [opts.durationS]   clip length budget in seconds (default 20)
 * @param {boolean|'auto'} [opts.mp4] 'auto' = mp4+thumbnail when ffmpeg is found
 * @param {{width:number,height:number}} [opts.viewport]
 * @param {object} [opts.env]         env for ffmpeg discovery (tests)
 */
function buildQuickDemoConfig({
  target,
  name = DEFAULT_DEMO_NAME,
  outDir = DEFAULT_OUT_DIR,
  durationS = DEFAULT_DURATION_S,
  mp4 = 'auto',
  viewport,
  env = process.env,
} = {}) {
  if (!target || !target.kind) throw usageError('buildQuickDemoConfig: target required (use resolveDemoTarget)');
  const clampedDurationS = Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, Number(durationS) || DEFAULT_DURATION_S));
  const wantsMp4 = mp4 === 'auto' ? !!findFfmpeg(env) : !!mp4;

  const config = {
    outDir,
    // Own-app proof clips need no trademark disclaimer band by default.
    disclaimer: false,
    // Keep the zero-config surface light: files, not the approval/handoff pack.
    handoff: false,
    demos: [
      {
        name,
        viewport: viewport || { width: 1280, height: 800 },
        mp4: wantsMp4,
        ...(wantsMp4 ? { thumbnail: { at: 1.0 } } : {}),
        captions: [],
        // Captions are rendered at runtime from the page's own title/headings,
        // so static storyboard lint has nothing to check.
        lint: false,
        run: makeQuickDemoRun({
          url: target.kind === 'url' ? target.url : null,
          durationS: clampedDurationS,
        }),
      },
    ],
  };

  if (target.kind === 'static') {
    config.setup = async () => {
      const server = await serveDirectory(target.dir, { fallback: target.fallback });
      return { env: { baseUrl: `${server.baseUrl}/${target.fallback}` }, teardown: () => server.close() };
    };
  }
  return config;
}

const DEMO_USAGE = `shotkit demo — record a captioned proof clip of any web app, no config needed

Usage: shotkit demo <url|dir|file.html> [options]

Arguments:
  target            what to record: an http(s) URL (dev server), a static
                    directory (served locally), or a single .html file

Options:
  --out <dir>       output directory (default: ${DEFAULT_OUT_DIR})
  --name <name>     clip name (default: ${DEFAULT_DEMO_NAME})
  --duration <s>    clip length budget in seconds (default: ${DEFAULT_DURATION_S}, ${MIN_DURATION_S}-${MAX_DURATION_S})
  --no-mp4          keep only the webm (default: mp4 + thumbnail when ffmpeg exists)
  --json            machine-readable: stdout gets one JSON object
                    {ok, outDir, produced[]}; logs go to stderr
  -h, --help        show this help

Output: <name>.webm, and with ffmpeg also <name>.mp4 + <name>-thumb.png.
Captions come from the page's own title and headings.

Exit codes: 0 ok · 1 runtime failure · 2 usage error
`;

function parseDemoArgs(argv) {
  const opts = {
    target: null,
    out: DEFAULT_OUT_DIR,
    name: DEFAULT_DEMO_NAME,
    duration: DEFAULT_DURATION_S,
    mp4: 'auto',
    json: false,
    help: false,
    errors: [],
  };
  const takeValue = (flag, i) => {
    const value = argv[i + 1];
    if (value == null || value.startsWith('-')) {
      opts.errors.push(`${flag} requires a value`);
      return null;
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-mp4') opts.mp4 = false;
    else if (a === '--out') { const v = takeValue(a, i); if (v != null) { opts.out = v; i++; } }
    else if (a === '--name') { const v = takeValue(a, i); if (v != null) { opts.name = v; i++; } }
    else if (a === '--duration') {
      const v = takeValue(a, i);
      if (v != null) {
        i++;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) opts.errors.push('--duration requires a positive number of seconds');
        else opts.duration = n;
      }
    } else if (a.startsWith('-')) opts.errors.push(`unknown option: ${a}`);
    else if (opts.target == null) opts.target = a;
    else opts.errors.push(`unexpected argument: ${a}`);
  }
  if (!opts.help && !opts.target) opts.errors.push('demo target required (a URL, directory, or .html file)');
  return opts;
}

module.exports = {
  DEMO_USAGE,
  buildQuickDemoConfig,
  makeQuickDemoRun,
  parseDemoArgs,
  resolveDemoTarget,
};
