#!/usr/bin/env node
/*
 * shotkit CLI — thin wrapper over capture().
 *
 *   shotkit [path] [--config <path>] [--scene <name>]... [--json]
 *           [--no-video] [--no-build] [--live-gt] [--freeze]
 *
 * `path` (optional positional) is the repo to run against (default: cwd) —
 * lets an agent invoke shotkit against any checkout without cd'ing first.
 * Config resolution: --config, else shotkit.config.js, else store.config.js
 * (back-compat) inside that directory.
 *
 * Exit codes: 0 ok · 1 runtime failure · 2 usage / no config found.
 * With --json, stdout carries exactly one JSON object and progress logs go
 * to stderr, so agents can parse stdout blindly.
 */

const fs = require('fs');
const path = require('path');
const { capture } = require('../src');
const { parseArgs, resolveConfigPath, USAGE } = require('../src/cli');

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  const cwd = path.resolve(process.cwd(), opts.path || '.');
  const configPath = resolveConfigPath(opts.config, cwd);
  if (!configPath || !fs.existsSync(configPath)) {
    const msg = `No config found (looked for shotkit.config.js / store.config.js in ${cwd}). Pass --config <path>.`;
    if (opts.json) process.stderr.write(JSON.stringify({ ok: false, error: msg, code: 2 }) + '\n');
    else console.error(`[shotkit] ${msg}`);
    process.exit(2);
  }
  const config = require(configPath);
  // In JSON mode, route human-readable progress to stderr so stdout stays pure.
  const log = opts.json ? (m) => process.stderr.write(`[shotkit] ${m}\n`) : undefined;
  const { produced, outDir } = await capture(config, { ...opts, cwd, log });
  if (opts.json) process.stdout.write(JSON.stringify({ ok: true, outDir, produced }) + '\n');
}

main().catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  if (process.argv.includes('--json')) {
    process.stderr.write(JSON.stringify({ ok: false, error: msg, code: 1 }) + '\n');
  } else {
    console.error('[shotkit] FAILED:', err && err.stack ? err.stack : err);
  }
  process.exit(1);
});
