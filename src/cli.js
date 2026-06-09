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

const USAGE = `shotkit — capture store/social assets from a built extension

Usage: shotkit [path] [options]

Arguments:
  path              repo to run against (default: current directory);
                    its shotkit.config.js / store.config.js is used

Options:
  --config <path>   config file (default: shotkit.config.js | store.config.js)
  --scene <name>    only capture this scene/promoTile/demo, or "description";
                    repeatable, or comma-separated. When given, nothing else runs.
  --json            machine-readable mode: stdout gets one JSON object
                    {ok, outDir, produced[]}; progress logs move to stderr
  --no-video        skip the demo screencast
  --no-build        skip the config's build step (use an already-built bundle)
  --live-gt         pass flags.liveGt to config hooks
  --freeze          pass flags.freeze to config hooks
  -h, --help        show this help

Exit codes: 0 ok · 1 runtime failure · 2 usage / no config found
`;

function parseArgs(argv) {
  const opts = {
    scenes: [],
    noVideo: false,
    noBuild: false,
    liveGt: false,
    freeze: false,
    config: null,
    json: false,
    help: false,
    path: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scene') opts.scenes.push(...(argv[++i] || '').split(',').filter(Boolean));
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--no-video') opts.noVideo = true;
    else if (a === '--no-build') opts.noBuild = true;
    else if (a === '--live-gt') opts.liveGt = true;
    else if (a === '--freeze') opts.freeze = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-') && opts.path === null) opts.path = a;
  }
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
