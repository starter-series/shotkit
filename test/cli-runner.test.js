const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCli } = require('../src/cli-runner');

function streamBuffer() {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value,
  };
}

function tmpProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cli-runner-'));
  const configPath = path.join(cwd, 'shotkit.config.js');
  fs.writeFileSync(configPath, 'module.exports = {};');
  return { cwd, configPath };
}

describe('runCli', () => {
  test('json success writes exactly one parseable stdout object and routes progress to stderr', async () => {
    const { cwd, configPath } = tmpProject();
    const stdout = streamBuffer();
    const stderr = streamBuffer();
    const capture = jest.fn(async (_config, opts) => {
      opts.log('capturing');
      return {
        outDir: path.join(cwd, 'store-assets'),
        manifest: path.join(cwd, 'store-assets', 'shotkit-manifest.json'),
        status: 'publish-ready',
        produced: [path.join(cwd, 'store-assets', 'a.png')],
      };
    });

    const code = await runCli(['--json'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      processCwd: () => cwd,
    }, {
      capture,
      loadConfig: jest.fn(() => ({ loadedFrom: configPath })),
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual({
      ok: true,
      status: 'publish-ready',
      outDir: path.join(cwd, 'store-assets'),
      manifest: path.join(cwd, 'store-assets', 'shotkit-manifest.json'),
      produced: [path.join(cwd, 'store-assets', 'a.png')],
    });
    expect(stderr.read()).toContain('[shotkit] capturing');
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ loadedFrom: configPath }), expect.objectContaining({ cwd, json: true }));
  });

  test('json runtime failures write the error payload to stdout', async () => {
    const { cwd } = tmpProject();
    const stdout = streamBuffer();
    const stderr = streamBuffer();

    const code = await runCli(['--json'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      processCwd: () => cwd,
    }, {
      capture: jest.fn(async () => {
        throw new Error('boom');
      }),
      loadConfig: jest.fn(() => ({})),
    });

    expect(code).toBe(1);
    expect(JSON.parse(stdout.read())).toEqual({ ok: false, error: 'boom', code: 1 });
    expect(stderr.read()).toBe('');
  });

  test('starts the calibrator without running capture', async () => {
    const { cwd, configPath } = tmpProject();
    const stdout = streamBuffer();
    const stderr = streamBuffer();
    const capture = jest.fn();
    const startCalibrator = jest.fn(async () => ({ url: 'http://127.0.0.1:4312' }));
    const config = { calibration: { from: 'shotkit.calibration.json' } };

    const code = await runCli(['--calibrate', '--port', '4312', '--no-open', '--json'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      processCwd: () => cwd,
    }, {
      capture,
      startCalibrator,
      loadConfig: jest.fn(() => config),
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual({
      ok: true,
      status: 'calibrating',
      url: 'http://127.0.0.1:4312',
    });
    expect(startCalibrator).toHaveBeenCalledWith({
      cwd,
      config,
      configPath,
      port: 4312,
      open: false,
    });
    expect(capture).not.toHaveBeenCalled();
  });
});
