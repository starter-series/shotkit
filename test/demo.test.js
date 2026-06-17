const EventEmitter = require('events');
const {
  DEFAULT_CLICK_HOLD_MS,
  DEFAULT_STEP_HOLD_MS,
  analyzeDemoStoryboard,
  createDemoController,
  installDemoCaptionOverlay,
  lintDemoStoryboard,
  normalizeDelayMs,
  normalizeDemoConfigs,
  normalizeDemoCaptions,
  parseTimeToMs,
  targetCenter,
} = require('../src/demo');

class FakePage extends EventEmitter {
  constructor() {
    super();
    this.captions = [];
    this.clicks = [];
    this.waits = [];
    this.inits = [];
    this.pointerMoves = [];
    this.pointerPulses = 0;
    this.box = null;
    this.mouseClicks = [];
    this.mouse = {
      click: async (x, y, options) => {
        this.mouseClicks.push({ x, y, options });
      },
    };
  }

  async evaluate(fn, arg) {
    if (fn.name === 'demoCaptionInitScript') this.inits.push(arg);
    if (arg && Object.prototype.hasOwnProperty.call(arg, 'captionText')) {
      this.captions.push(arg.captionText);
    }
    if (arg && Object.prototype.hasOwnProperty.call(arg, 'pointerPoint')) {
      this.pointerMoves.push({ point: arg.pointerPoint, options: arg.pointerOptions });
    }
    if (String(fn).includes('__shotkitDemoPointer.pulse')) this.pointerPulses += 1;
  }

  async waitForTimeout(ms) {
    this.waits.push(ms);
  }

  async click(selector, options) {
    this.clicks.push({ selector, options });
  }

  locator() {
    return {
      boundingBox: async () => this.box,
    };
  }
}

afterEach(() => {
  jest.useRealTimers();
});

describe('demo time parsing', () => {
  test('parses seconds and clock strings to milliseconds', () => {
    expect(parseTimeToMs(0.5)).toBe(500);
    expect(parseTimeToMs('4')).toBe(4000);
    expect(parseTimeToMs('00:35')).toBe(35000);
    expect(parseTimeToMs('1:02.5')).toBe(62500);
    expect(parseTimeToMs('00:01:02')).toBe(62000);
  });

  test('rejects invalid or negative times', () => {
    expect(() => parseTimeToMs(-1)).toThrow(/must be >= 0/);
    expect(() => parseTimeToMs('1:65')).toThrow(/invalid time string/);
    expect(() => parseTimeToMs('soon')).toThrow(/invalid time string/);
  });

  test('normalizes and sorts caption schedules', () => {
    expect(normalizeDemoCaptions([
      { at: 4, text: 'B' },
      { at: 0.5, text: 'A' },
    ])).toEqual([
      { atMs: 500, text: 'A' },
      { atMs: 4000, text: 'B' },
    ]);
  });
});

describe('demo delay validation', () => {
  test('normalizes helper delays as milliseconds', () => {
    expect(normalizeDelayMs(12.6, 'wait ms')).toBe(13);
    expect(() => normalizeDelayMs(-1, 'wait ms')).toThrow(/non-negative/);
    expect(() => normalizeDelayMs(Number.NaN, 'wait ms')).toThrow(/non-negative/);
  });
});

describe('normalizeDemoConfigs', () => {
  const run = async () => {};

  test('supports legacy demo and campaign demos together', () => {
    const legacy = { name: 'demo', run };
    const feature = { name: 'demo-feature', run };
    const restore = { name: 'demo-restore', run };

    expect(normalizeDemoConfigs({ demo: legacy, demos: [feature, restore] })).toEqual([legacy, feature, restore]);
  });

  test('returns an empty list when no demos are configured', () => {
    expect(normalizeDemoConfigs({})).toEqual([]);
  });

  test('rejects invalid demos arrays and duplicate names', () => {
    expect(() => normalizeDemoConfigs({ demos: { name: 'demo' } })).toThrow(/config\.demos must be an array/);
    expect(() => normalizeDemoConfigs({ demos: [{ name: 'a', run }, { name: 'a', run }] })).toThrow(/duplicate demo name "a"/);
  });

  test('requires name and run on each entry', () => {
    expect(() => normalizeDemoConfigs({ demos: [{ run }] })).toThrow(/needs a name/);
    expect(() => normalizeDemoConfigs({ demos: [{ name: 'demo' }] })).toThrow(/needs run/);
  });
});

describe('lintDemoStoryboard', () => {
  test('returns structured lint for agents and string lint for logs', () => {
    const demoConfig = {
      name: 'demo',
      captions: [{ at: 5, text: 'Do the thing' }],
    };

    expect(analyzeDemoStoryboard(demoConfig, { viewport: { width: 1200, height: 675 }, mp4Requested: false }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'late-first-caption',
          severity: 'warning',
          fix: 'show the result sooner',
        }),
        expect.objectContaining({
          code: 'missing-safety-restore',
        }),
      ]));
    expect(lintDemoStoryboard(demoConfig, { viewport: { width: 1200, height: 675 }, mp4Requested: false })[0])
      .toEqual(expect.any(String));
  });

  test('accepts a compact mp4 story with early result and restore beat', () => {
    expect(lintDemoStoryboard({
      name: 'demo',
      mp4: { crf: 18 },
      trim: { duration: '00:30' },
      captions: [
        { at: 0.5, text: 'Translate the lesson in place' },
        { at: 8, text: 'Restore the original anytime' },
      ],
    }, { viewport: { width: 1280, height: 720 }, mp4Requested: true })).toEqual([]);
  });

  test('warns about weak story shape and odd video dimensions', () => {
    const warnings = lintDemoStoryboard({
      name: 'demo',
      trim: { duration: '00:12' },
      captions: [{ at: 4, text: 'This caption is intentionally long enough to trigger the short-caption guidance for social clips' }],
    }, { viewport: { width: 1200, height: 675 }, mp4Requested: false });

    expect(warnings.join('\n')).toMatch(/only one caption/);
    expect(warnings.join('\n')).toMatch(/first caption starts after 3s/);
    expect(warnings.join('\n')).toMatch(/caption is/);
    expect(warnings.join('\n')).toMatch(/no visible safety\/restore/);
    expect(warnings.join('\n')).toMatch(/should emit mp4/);
    expect(warnings.join('\n')).toMatch(/not even/);
    expect(warnings.join('\n')).toMatch(/under 20s/);
  });
});

describe('createDemoController', () => {
  test('caption renders through the DOM overlay helper', async () => {
    const page = new FakePage();
    const demo = createDemoController({ page, captionOptions: { position: 'bottom' } });
    await demo.caption('Open the course page');
    demo.stop();

    expect(page.inits).toEqual([{ position: 'bottom' }]);
    expect(page.captions).toEqual(['Open the course page']);
  });

  test('step, click, and wait keep config walkthroughs compact', async () => {
    const page = new FakePage();
    const demo = createDemoController({ page });
    const action = jest.fn(async () => 'ok');

    await expect(demo.step('Translate visible text', action)).resolves.toBe('ok');
    await demo.click('.slider');
    await demo.wait(250);
    demo.stop();

    expect(page.captions).toEqual(['Translate visible text']);
    expect(action).toHaveBeenCalledTimes(1);
    expect(page.clicks).toEqual([{ selector: '.slider', options: {} }]);
    expect(page.waits).toEqual([DEFAULT_STEP_HOLD_MS, DEFAULT_CLICK_HOLD_MS, 250]);
  });

  test('click shows a paced pointer highlight when the selector has a box', async () => {
    const page = new FakePage();
    page.box = { x: 10, y: 20, width: 100, height: 40 };
    const demo = createDemoController({ page });

    await demo.click('.primary', { holdMs: 25, moveMs: 30, beforeMs: 5 });
    demo.stop();

    expect(page.pointerMoves).toEqual([{ point: { x: 60, y: 40 }, options: { durationMs: 30 } }]);
    expect(page.pointerPulses).toBe(1);
    expect(page.clicks).toEqual([{ selector: '.primary', options: {} }]);
    expect(page.waits).toEqual([35, 25]);
  });

  test('click supports locator-like targets and coordinate points', async () => {
    const page = new FakePage();
    const locator = {
      boundingBox: async () => ({ x: 2, y: 4, width: 10, height: 12 }),
      click: jest.fn(async () => {}),
    };
    const demo = createDemoController({ page });

    await demo.click(locator, { holdMs: 0, moveMs: 0, beforeMs: 0 });
    await demo.click({ x: 24, y: 36 }, { holdMs: 0, moveMs: 0, beforeMs: 0, button: 'left' });
    demo.stop();

    expect(locator.click).toHaveBeenCalledWith({});
    expect(page.mouseClicks).toEqual([{ x: 24, y: 36, options: { button: 'left' } }]);
    expect(page.pointerMoves).toEqual([
      { point: { x: 7, y: 10 }, options: { durationMs: 0 } },
      { point: { x: 24, y: 36 }, options: { durationMs: 0 } },
    ]);
  });

  test('wait and click reject invalid delays', async () => {
    const page = new FakePage();
    const demo = createDemoController({ page });

    expect(() => demo.wait(-1)).toThrow(/wait ms/);
    await expect(demo.click('.primary', { holdMs: -1 })).rejects.toThrow(/click holdMs/);
    demo.stop();
  });

  test('scheduled captions fire relative to demo start and stop cleanly', async () => {
    jest.useFakeTimers();
    const page = new FakePage();
    const demo = createDemoController({
      page,
      captions: [{ at: 0.2, text: 'Protected terms stay intact' }],
    });

    await jest.advanceTimersByTimeAsync(199);
    expect(page.captions).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.captions).toEqual(['Protected terms stay intact']);

    demo.stop();
    expect(page.listenerCount('domcontentloaded')).toBe(0);
  });

  test('replays the active caption after navigation', async () => {
    jest.useFakeTimers();
    const page = new FakePage();
    const demo = createDemoController({ page });
    await demo.caption('Restore the original anytime');
    page.captions = [];

    page.emit('domcontentloaded');
    await jest.advanceTimersByTimeAsync(0);
    demo.stop();

    expect(page.captions).toEqual(['Restore the original anytime']);
  });
});

describe('targetCenter', () => {
  test('uses point targets as-is', async () => {
    await expect(targetCenter(new FakePage(), { x: 1.4, y: 2.6 })).resolves.toEqual({ x: 1, y: 3 });
  });
});

describe('installDemoCaptionOverlay', () => {
  test('registers the browser init script', async () => {
    const context = { addInitScript: jest.fn() };
    await installDemoCaptionOverlay(context, { position: 'bottom-left' });
    expect(context.addInitScript).toHaveBeenCalledWith(expect.any(Function), { position: 'bottom-left' });
  });
});
