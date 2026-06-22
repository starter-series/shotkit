const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, resolveConfigPath, USAGE } = require('../src/cli');

const BIN = path.resolve(__dirname, '..', 'bin', 'shotkit.js');

describe('parseArgs', () => {
  test('defaults', () => {
    expect(parseArgs([])).toMatchObject({ scenes: [], errors: [], json: false, noVideo: false, help: false, path: null });
  });

  test('positional path + flags', () => {
    const o = parseArgs(['../my-ext', '--json', '--no-video']);
    expect(o.path).toBe('../my-ext');
    expect(o.json).toBe(true);
    expect(o.noVideo).toBe(true);
  });

  test('--scene accepts comma lists and repeats', () => {
    expect(parseArgs(['--scene', 'a,b', '--scene', 'c']).scenes).toEqual(['a', 'b', 'c']);
    expect(parseArgs(['--scene=a,b']).scenes).toEqual(['a', 'b']);
  });

  test('usage errors are explicit for missing values and unknown options', () => {
    expect(parseArgs(['--scene']).errors).toEqual(['--scene requires a scene name']);
    expect(parseArgs(['--scene=']).errors).toEqual(['--scene requires a scene name']);
    expect(parseArgs(['--config', '--json']).errors).toEqual(['--config requires a config path']);
    expect(parseArgs(['--config=']).errors).toEqual(['--config requires a config path']);
    expect(parseArgs(['--wat']).errors).toEqual(['unknown option: --wat']);
  });

  test('--config consumes its value (not mistaken for the positional)', () => {
    const o = parseArgs(['--config', 'x.js', 'repo']);
    expect(o.config).toBe('x.js');
    expect(o.path).toBe('repo');

    const inline = parseArgs(['--config=x.js', 'repo']);
    expect(inline.config).toBe('x.js');
    expect(inline.path).toBe('repo');
  });

  test('only one positional path is accepted', () => {
    const opts = parseArgs(['a', 'b']);
    expect(opts.path).toBe('a');
    expect(opts.errors).toEqual(['unexpected positional argument: b']);
  });

  test('USAGE documents the agent contract', () => {
    expect(USAGE).toContain('--json');
    expect(USAGE).toContain('Exit codes');
  });
});

describe('shotkit CLI usage errors', () => {
  function run(args) {
    return spawnSync(process.execPath, [BIN, ...args], {
      cwd: os.tmpdir(),
      encoding: 'utf8',
    });
  }

  test('unknown flags and flag typos fail before config resolution', () => {
    const res = run(['--no-buid']);

    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('unknown option: --no-buid');
    expect(res.stderr).toContain('Usage: shotkit');
  });

  test('missing option values fail with usage code 2', () => {
    const res = run(['--scene']);

    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('--scene requires a scene name');
    expect(res.stderr).toContain('Usage: shotkit');
  });

  test('--json usage errors keep stdout empty and write JSON to stderr', () => {
    const res = run(['--config', '--json']);

    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
    expect(JSON.parse(res.stderr)).toEqual({
      ok: false,
      error: '--config requires a config path',
      code: 2,
    });
  });
});

describe('resolveConfigPath', () => {
  test('prefers shotkit.config.js, falls back to store.config.js, else null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cli-'));
    expect(resolveConfigPath(null, dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'store.config.js'), 'module.exports={}');
    expect(resolveConfigPath(null, dir)).toBe(path.join(dir, 'store.config.js'));
    fs.writeFileSync(path.join(dir, 'shotkit.config.js'), 'module.exports={}');
    expect(resolveConfigPath(null, dir)).toBe(path.join(dir, 'shotkit.config.js'));
  });

  test('explicit --config resolves against the target dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cli-'));
    expect(resolveConfigPath('custom.js', dir)).toBe(path.resolve(dir, 'custom.js'));
  });
});
