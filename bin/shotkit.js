#!/usr/bin/env node
/*
 * shotkit CLI — thin wrapper over capture().
 *
 *   shotkit [--config <path>] [--scene <name>]... [--no-video] [--no-build]
 *           [--live-gt] [--freeze]
 *
 * Looks for a config at --config, else shotkit.config.js, else store.config.js
 * (back-compat) in the current directory.
 */

const fs = require('fs');
const path = require('path');
const { capture } = require('../src');

const USAGE = `shotkit — capture store/social assets from a built extension

Usage: shotkit [options]

Options:
  --config <path>   config file (default: shotkit.config.js | store.config.js)
  --scene <name>    only capture this scene/promoTile/demo, or "description";
                    repeatable, or comma-separated. When given, nothing else runs.
  --no-video        skip the demo screencast
  --no-build        skip the config's build step (use an already-built bundle)
  --live-gt         pass flags.liveGt to config hooks
  --freeze          pass flags.freeze to config hooks
  -h, --help        show this help
`;

function parseArgs(argv) {
  const opts = { scenes: [], noVideo: false, noBuild: false, liveGt: false, freeze: false, config: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scene') opts.scenes.push(...(argv[++i] || '').split(',').filter(Boolean));
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--no-video') opts.noVideo = true;
    else if (a === '--no-build') opts.noBuild = true;
    else if (a === '--live-gt') opts.liveGt = true;
    else if (a === '--freeze') opts.freeze = true;
    else if (a === '-h' || a === '--help') opts.help = true;
  }
  return opts;
}

function resolveConfigPath(explicit, cwd) {
  if (explicit) return path.resolve(cwd, explicit);
  for (const name of ['shotkit.config.js', 'store.config.js']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  const cwd = process.cwd();
  const configPath = resolveConfigPath(opts.config, cwd);
  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error(`No config found (looked for shotkit.config.js / store.config.js in ${cwd}). Pass --config <path>.`);
  }
  const config = require(configPath);
  await capture(config, { ...opts, cwd });
}

main().catch((err) => {
  console.error('[shotkit] FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
