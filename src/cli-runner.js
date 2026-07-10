const fs = require('fs');
const path = require('path');

const { parseArgs, resolveConfigPath, USAGE } = require('./cli');
const { capture: defaultCapture } = require('./capture');
const { startCalibrator: defaultStartCalibrator } = require('./calibrator-server');

function writeJson(stream, payload) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

function errorPayload(error, code) {
  return { ok: false, error, code };
}

async function runCli(argv, io = {}, deps = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const processCwd = io.processCwd || (() => process.cwd());
  const capture = deps.capture || defaultCapture;
  const startCalibrator = deps.startCalibrator || defaultStartCalibrator;
  const loadConfig = deps.loadConfig || ((configPath) => require(configPath));

  const opts = parseArgs(argv);
  if (opts.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (opts.errors.length) {
    const msg = opts.errors.join('; ');
    if (opts.json) writeJson(stdout, errorPayload(msg, 2));
    else stderr.write(`[shotkit] ${msg}\n\n${USAGE}`);
    return 2;
  }

  const cwd = path.resolve(processCwd(), opts.path || '.');
  const configPath = resolveConfigPath(opts.config, cwd);
  if (!configPath || !fs.existsSync(configPath)) {
    const msg = `No config found (looked for shotkit.config.js / store.config.js in ${cwd}). Pass --config <path>.`;
    if (opts.json) writeJson(stdout, errorPayload(msg, 2));
    else stderr.write(`[shotkit] ${msg}\n`);
    return 2;
  }

  try {
    const config = loadConfig(configPath);
    if (opts.calibrate || opts.campaign) {
      const calibrator = await startCalibrator({
        cwd,
        config,
        configPath,
        port: opts.port == null ? 0 : opts.port,
        open: opts.open,
        ...(opts.campaign ? { view: 'campaign' } : {}),
      });
      const dashboardUrl = opts.campaign ? calibrator.campaignUrl || `${calibrator.url}/campaign/` : calibrator.url;
      const status = opts.campaign ? 'campaign-dashboard' : 'calibrating';
      if (opts.json) writeJson(stdout, { ok: true, status, url: dashboardUrl });
      else stdout.write(`[shotkit] ${opts.campaign ? 'campaign dashboard' : 'calibrator'}: ${dashboardUrl}\n`);
      return 0;
    }
    const log = opts.json ? (m) => stderr.write(`[shotkit] ${m}\n`) : undefined;
    const {
      produced,
      outDir,
      manifest = null,
      status = 'not-requested',
      machineStatus = 'not-requested',
    } = await capture(config, { ...opts, cwd, log });
    if (opts.json) writeJson(stdout, { ok: true, status, machineStatus, outDir, manifest, produced });
    return 0;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const code = Number.isInteger(err && err.exitCode) ? err.exitCode : 1;
    if (opts.json) {
      writeJson(stdout, errorPayload(msg, code));
    } else {
      const detail = code === 2 ? msg : (err && err.stack ? err.stack : err);
      stderr.write(`[shotkit] ${code === 2 ? msg : `FAILED: ${detail}`}\n`);
    }
    return code;
  }
}

module.exports = { runCli };
