/*
 * shotkit — CLI argument parsing, separated from bin/ so it's unit-testable.
 *
 * Agent contract (the reason --json exists): with --json, stdout carries
 * exactly ONE JSON object and all progress logs move to stderr, so a coding
 * agent can `JSON.parse(stdout)` blindly. Exit codes are part of the same
 * contract: 0 ok · 1 runtime failure · 2 usage / no config found.
 */

const fs = require('fs');
const path = require('path');

const USAGE = `shotkit — autonomously build and verify launch assets, then gate final user approval

Usage: shotkit [path] [options]
       shotkit demo <url|dir|file.html> [options]   zero-config proof clip
                                                    (see: shotkit demo --help)

Arguments:
  path              repo to run against (default: current directory);
                    its shotkit.config.js / store.config.js is used

Options:
  --config <path>   config file (default: shotkit.config.js | store.config.js)
  --scene <name>    only capture this scene/promoTile/demo/demos entry,
                    "description", or "privacy";
                    repeatable, or comma-separated. When given, nothing else runs.
  --target <id>     only render configured channel targets (cws-youtube, x,
                    youtube-shorts); repeatable, or comma-separated
  --attempt <n>     automation retry number (default: 1; agents increment it)
  --campaign        open the local campaign recipe dashboard
  --calibrate       open the local exception-only composition calibrator
  --port <n>        local dashboard port (default: choose an available port)
  --no-open         start the dashboard without opening a browser window
  --json            machine-readable mode: stdout gets one JSON object
                    {ok, status, machineStatus, outDir, manifest, produced[]};
                    logs go to stderr. machineStatus is technical QA; status
                    also enforces the user's final approval decision.
  --no-video        skip the demo screencast
  --mp4             also convert the demo to H.264 mp4 (needs ffmpeg on PATH
                    or SHOTKIT_FFMPEG; SNS uploaders want mp4, not webm)
  --no-build        skip the config's build step (use an already-built bundle)
  --live-gt         pass flags.liveGt to config hooks
  --freeze          pass flags.freeze to config hooks
  -h, --help        show this help

Handoff: successful runs also write a self-contained schema-backed pack with
shotkit-manifest.json as its entrypoint unless the config sets handoff:false.

Exit codes: 0 ok · 1 runtime failure · 2 usage / no config found
`;

function parseArgs(argv) {
  const opts = {
    scenes: [],
    targets: [],
    attempt: 1,
    campaign: false,
    calibrate: false,
    port: null,
    open: true,
    errors: [],
    noVideo: false,
    noBuild: false,
    liveGt: false,
    freeze: false,
    config: null,
    json: false,
    mp4: false,
    help: false,
    path: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scene' || a.startsWith('--scene=')) {
      const inline = a.startsWith('--scene=');
      const value = inline ? a.slice('--scene='.length) : argv[++i];
      if (!value || value.startsWith('-')) {
        opts.errors.push('--scene requires a scene name');
        if (!inline && value && value.startsWith('-')) i--;
      } else {
        const scenes = value.split(',').filter(Boolean);
        if (scenes.length) opts.scenes.push(...scenes);
        else opts.errors.push('--scene requires a scene name');
      }
    }
    else if (a === '--target' || a.startsWith('--target=')) {
      const inline = a.startsWith('--target=');
      const value = inline ? a.slice('--target='.length) : argv[++i];
      if (!value || value.startsWith('-')) {
        opts.errors.push('--target requires a channel target');
        if (!inline && value && value.startsWith('-')) i--;
      } else {
        const targets = value.split(',').filter(Boolean);
        if (targets.length) opts.targets.push(...targets);
        else opts.errors.push('--target requires a channel target');
      }
    }
    else if (a === '--config' || a.startsWith('--config=')) {
      const inline = a.startsWith('--config=');
      const value = inline ? a.slice('--config='.length) : argv[++i];
      if (!value || value.startsWith('-')) {
        opts.errors.push('--config requires a config path');
        if (!inline && value && value.startsWith('-')) i--;
      } else {
        opts.config = value;
      }
    }
    else if (a === '--attempt' || a.startsWith('--attempt=')) {
      const inline = a.startsWith('--attempt=');
      const value = inline ? a.slice('--attempt='.length) : argv[++i];
      if (!value || value.startsWith('-') || !Number.isInteger(Number(value)) || Number(value) < 1) {
        opts.errors.push('--attempt requires a positive integer');
        if (!inline && value && value.startsWith('-')) i--;
      } else {
        opts.attempt = Number(value);
      }
    }
    else if (a === '--port' || a.startsWith('--port=')) {
      const inline = a.startsWith('--port=');
      const value = inline ? a.slice('--port='.length) : argv[++i];
      if (!value || value.startsWith('-') || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 65535) {
        opts.errors.push('--port requires an integer between 0 and 65535');
        if (!inline && value && value.startsWith('-')) i--;
      } else {
        opts.port = Number(value);
      }
    }
    else if (a === '--campaign') opts.campaign = true;
    else if (a === '--calibrate') opts.calibrate = true;
    else if (a === '--no-open') opts.open = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--mp4') opts.mp4 = true;
    else if (a === '--no-video') opts.noVideo = true;
    else if (a === '--no-build') opts.noBuild = true;
    else if (a === '--live-gt') opts.liveGt = true;
    else if (a === '--freeze') opts.freeze = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-') && opts.path === null) opts.path = a;
    else if (!a.startsWith('-')) opts.errors.push(`unexpected positional argument: ${a}`);
    else opts.errors.push(`unknown option: ${a}`);
  }
  if (opts.campaign && opts.calibrate) opts.errors.push('--campaign and --calibrate cannot be used together');
  return opts;
}

/** Resolve the config file inside `cwd`: --config wins, else the two defaults. */
function resolveConfigPath(explicit, cwd) {
  if (explicit) return path.resolve(cwd, explicit);
  for (const name of ['shotkit.config.js', 'store.config.js']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { parseArgs, resolveConfigPath, USAGE };
