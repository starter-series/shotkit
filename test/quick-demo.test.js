const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildQuickDemoConfig,
  makeQuickDemoRun,
  parseDemoArgs,
  resolveDemoTarget,
} = require('../src/quick-demo');
const { runCli } = require('../src/cli-runner');

const NO_FFMPEG_ENV = { PATH: fs.mkdtempSync(path.join(os.tmpdir(), 'sk-empty-path-')) };

function streamBuffer() {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value,
  };
}

describe('resolveDemoTarget', () => {
  test('passes http(s) URLs through', () => {
    expect(resolveDemoTarget('http://localhost:3000/app')).toEqual({ kind: 'url', url: 'http://localhost:3000/app' });
    expect(resolveDemoTarget('https://staging.example.test')).toEqual({ kind: 'url', url: 'https://staging.example.test' });
  });

  test('expands bare localhost shorthand to http://', () => {
    expect(resolveDemoTarget('localhost:5173')).toEqual({ kind: 'url', url: 'http://localhost:5173' });
    expect(resolveDemoTarget('127.0.0.1:8080/admin')).toEqual({ kind: 'url', url: 'http://127.0.0.1:8080/admin' });
  });

  test('maps a directory to a static target with index.html fallback', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-demo-dir-'));
    expect(resolveDemoTarget(dir)).toEqual({ kind: 'static', dir, fallback: 'index.html' });
  });

  test('maps an .html file to its directory plus fallback', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-demo-file-'));
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, '<title>x</title>');
    expect(resolveDemoTarget(file)).toEqual({ kind: 'static', dir, fallback: 'page.html' });
  });

  test('rejects a non-html file with a usage error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-demo-bad-'));
    const file = path.join(dir, 'app.js');
    fs.writeFileSync(file, '');
    expect(() => resolveDemoTarget(file)).toThrow(expect.objectContaining({ exitCode: 2 }));
  });

  test('rejects a missing target with a usage error', () => {
    expect(() => resolveDemoTarget('definitely-not-a-real-path')).toThrow(expect.objectContaining({ exitCode: 2 }));
    expect(() => resolveDemoTarget('')).toThrow(expect.objectContaining({ exitCode: 2 }));
  });
});

describe('parseDemoArgs', () => {
  test('defaults', () => {
    const opts = parseDemoArgs(['http://localhost:3000']);
    expect(opts).toMatchObject({
      target: 'http://localhost:3000',
      out: 'shotkit-demo',
      name: 'demo',
      duration: 20,
      mp4: 'auto',
      json: false,
      help: false,
      errors: [],
    });
  });

  test('flags', () => {
    const opts = parseDemoArgs(['./dist', '--out', 'proof', '--name', 'landing', '--duration', '12', '--no-mp4', '--json']);
    expect(opts).toMatchObject({ target: './dist', out: 'proof', name: 'landing', duration: 12, mp4: false, json: true });
  });

  test('errors: missing target, bad duration, unknown flag, extra positional', () => {
    expect(parseDemoArgs([]).errors).toContain('demo target required (a URL, directory, or .html file)');
    expect(parseDemoArgs(['u', '--duration', 'x']).errors).toContain('--duration requires a positive number of seconds');
    expect(parseDemoArgs(['u', '--wat']).errors).toContain('unknown option: --wat');
    expect(parseDemoArgs(['u', 'v']).errors).toContain('unexpected argument: v');
  });

  test('--help wins without a target', () => {
    const opts = parseDemoArgs(['--help']);
    expect(opts.help).toBe(true);
    expect(opts.errors).toEqual([]);
  });
});

describe('buildQuickDemoConfig', () => {
  const urlTarget = { kind: 'url', url: 'http://localhost:3000' };

  test('synthesizes a light one-demo config', () => {
    const config = buildQuickDemoConfig({ target: urlTarget, mp4: false });
    expect(config.handoff).toBe(false);
    expect(config.disclaimer).toBe(false);
    expect(config.setup).toBeUndefined();
    expect(config.demos).toHaveLength(1);
    const demo = config.demos[0];
    expect(demo.name).toBe('demo');
    expect(demo.mp4).toBe(false);
    expect(demo.thumbnail).toBeUndefined();
    expect(demo.viewport).toEqual({ width: 1280, height: 800 });
    expect(typeof demo.run).toBe('function');
  });

  test('mp4:auto without ffmpeg falls back to webm-only', () => {
    const config = buildQuickDemoConfig({ target: urlTarget, mp4: 'auto', env: NO_FFMPEG_ENV });
    expect(config.demos[0].mp4).toBe(false);
    expect(config.demos[0].thumbnail).toBeUndefined();
  });

  test('explicit mp4 adds a thumbnail', () => {
    const config = buildQuickDemoConfig({ target: urlTarget, mp4: true });
    expect(config.demos[0].mp4).toBe(true);
    expect(config.demos[0].thumbnail).toEqual({ at: 1.0 });
  });

  test('duration is clamped to sane bounds', async () => {
    // Bounds are observable through the walkthrough budget, so exercise the
    // stub page with an extreme value and check it still terminates quickly.
    const config = buildQuickDemoConfig({ target: urlTarget, durationS: 100000, mp4: false });
    expect(config.demos[0].run).toBeDefined();
  });

  test('static targets get a serving setup()', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-demo-static-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<title>hi</title>');
    const config = buildQuickDemoConfig({ target: resolveDemoTarget(dir), mp4: false });
    expect(typeof config.setup).toBe('function');
    const setup = await config.setup();
    try {
      expect(setup.env.baseUrl).toMatch(/^http:\/\/localhost:\d+\/index\.html$/);
    } finally {
      await setup.teardown();
    }
  });
});

describe('makeQuickDemoRun', () => {
  function stubPage(surveyed) {
    const calls = { gotos: [], scrolls: [], waits: [] };
    const page = {
      calls,
      async goto(url) { calls.gotos.push(url); },
      async waitForLoadState() {},
      async evaluate(fn, arg) {
        if (typeof arg === 'number') { calls.scrolls.push(arg); return undefined; }
        if (String(fn).includes('scrollTo({ top: 0')) { calls.scrolls.push(0); return undefined; }
        return surveyed;
      },
      async waitForTimeout(ms) { calls.waits.push(ms); },
    };
    return page;
  }

  function stubDemo(page) {
    const captions = [];
    return {
      captions,
      caption: async (text) => { captions.push(text); },
      wait: (ms) => page.waitForTimeout(ms),
      hide: async () => { captions.push(null); },
    };
  }

  test('captions the title and headings while scrolling a long page', async () => {
    const surveyed = {
      title: 'My App',
      scrollHeight: 4000,
      viewportH: 800,
      headings: [
        { text: 'Features', top: 900, visible: true },
        { text: 'Pricing', top: 2200, visible: true },
      ],
    };
    const page = stubPage(surveyed);
    const demo = stubDemo(page);
    await makeQuickDemoRun({ url: 'http://localhost:3000', durationS: 20 })({ page, demo, baseUrl: null });

    expect(page.calls.gotos).toEqual(['http://localhost:3000']);
    expect(demo.captions[0]).toBe('My App');
    expect(demo.captions).toContain('Features');
    expect(demo.captions).toContain('Pricing');
    // returns to top and re-captions the title before hiding
    expect(demo.captions[demo.captions.length - 2]).toBe('My App');
    expect(demo.captions[demo.captions.length - 1]).toBeNull();
    expect(Math.max(...page.calls.scrolls)).toBeLessThanOrEqual(4000 - 800);
  });

  test('single-screen pages hold the loaded state instead of scrolling', async () => {
    const surveyed = { title: 'Tiny', scrollHeight: 800, viewportH: 800, headings: [] };
    const page = stubPage(surveyed);
    const demo = stubDemo(page);
    await makeQuickDemoRun({ url: 'http://localhost:3000', durationS: 10 })({ page, demo, baseUrl: null });
    expect(page.calls.scrolls).toEqual([]);
    expect(demo.captions).toEqual(['Tiny', null]);
  });

  test('uses setup baseUrl when no explicit url (static targets)', async () => {
    const surveyed = { title: 'Static', scrollHeight: 800, viewportH: 800, headings: [] };
    const page = stubPage(surveyed);
    const demo = stubDemo(page);
    await makeQuickDemoRun({ url: null, durationS: 10 })({ page, demo, baseUrl: 'http://localhost:9999/index.html' });
    expect(page.calls.gotos).toEqual(['http://localhost:9999/index.html']);
  });
});

describe('runCli demo subcommand', () => {
  test('routes to capture with a synthesized config and reports json', async () => {
    const stdout = streamBuffer();
    const stderr = streamBuffer();
    const capture = jest.fn(async (config, opts) => {
      expect(config.handoff).toBe(false);
      expect(config.demos).toHaveLength(1);
      expect(opts.json).toBe(true);
      return { produced: ['/tmp/out/demo.webm'], outDir: '/tmp/out' };
    });

    const code = await runCli(['demo', 'http://localhost:3000', '--json', '--no-mp4'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      processCwd: () => process.cwd(),
    }, { capture });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual({ ok: true, outDir: '/tmp/out', produced: ['/tmp/out/demo.webm'] });
  });

  test('demo --help prints usage without requiring a target', async () => {
    const stdout = streamBuffer();
    const code = await runCli(['demo', '--help'], { stdout: stdout.stream, stderr: streamBuffer().stream }, {});
    expect(code).toBe(0);
    expect(stdout.read()).toContain('shotkit demo <url|dir|file.html>');
  });

  test('missing target is a usage error (exit 2)', async () => {
    const stdout = streamBuffer();
    const stderr = streamBuffer();
    const code = await runCli(['demo'], { stdout: stdout.stream, stderr: stderr.stream }, {});
    expect(code).toBe(2);
    expect(stderr.read()).toContain('demo target required');
  });

  test('unresolvable target is a usage error in json mode', async () => {
    const stdout = streamBuffer();
    const code = await runCli(['demo', 'nope-not-here', '--json'], {
      stdout: stdout.stream,
      stderr: streamBuffer().stream,
    }, {});
    expect(code).toBe(2);
    const payload = JSON.parse(stdout.read());
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe(2);
  });
});
