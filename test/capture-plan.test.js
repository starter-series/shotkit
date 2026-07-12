const path = require('path');

const { createCapturePlan, DEFAULT_VIEWPORT } = require('../src/capture-plan');

const cwd = path.join(path.sep, 'workspace', 'project');
const run = async () => {};

test('plans filtered story targets and browser work without side effects', () => {
  const x = { name: 'demo-x', story: 'demo', target: 'x', run };
  const shorts = { name: 'demo-youtube-shorts', story: 'demo', target: 'youtube-shorts', run };
  const plan = createCapturePlan({
    cwd,
    config: {
      outDir: 'artifacts',
      viewport: { width: 900, height: 700 },
      scenes: [{ name: 'store' }],
      promoTiles: [{ name: 'promo' }],
      description: { from: 'product.manifest.json' },
    },
    opts: { scenes: ['demo'], targets: ['x'], liveGt: true },
    demoConfigs: [x, shorts],
  });

  expect(plan).toMatchObject({
    cwd,
    outDir: path.join(cwd, 'artifacts'),
    defaultViewport: { width: 900, height: 700 },
    passFlags: { liveGt: true, freeze: false },
    shouldRunVisualPass: false,
    shouldRunTextPass: false,
    needsBrowser: true,
    partial: true,
    requestedDemoConfigs: [x],
    selectedDemoConfigs: [x],
  });
  expect(plan.wants('demo')).toBe(true);
  expect(plan.wants('store')).toBe(false);
});

test('plans text-only and no-video runs without Chromium', () => {
  const demo = { name: 'demo', run };
  const plan = createCapturePlan({
    cwd,
    config: { description: { from: 'STORE_LISTING.md' } },
    opts: { noVideo: true },
    demoConfigs: [demo],
  });

  expect(plan.defaultViewport).toEqual(DEFAULT_VIEWPORT);
  expect(plan.shouldRunTextPass).toBe(true);
  expect(plan.requestedDemoConfigs).toEqual([demo]);
  expect(plan.selectedDemoConfigs).toEqual([]);
  expect(plan.needsBrowser).toBe(false);
  expect(plan.partial).toBe(true);
});

test('preserves usage errors for unknown scenes, targets, and empty intersections', () => {
  const demos = [
    { name: 'translate', target: 'x', run },
    { name: 'restore', target: 'youtube-shorts', run },
  ];
  const plan = (opts) => createCapturePlan({ cwd, config: {}, opts, demoConfigs: demos });

  for (const [opts, message] of [
    [{ scenes: ['missing'] }, 'unknown scene: missing. Known: translate, restore'],
    [{ targets: ['missing'] }, 'target not configured: missing. Configured: x, youtube-shorts'],
    [{ scenes: ['translate'], targets: ['youtube-shorts'] }, 'no configured demo matches the requested scene and target filters'],
  ]) {
    try {
      plan(opts);
      throw new Error('expected createCapturePlan to reject invalid filters');
    } catch (error) {
      expect(error).toMatchObject({ message, exitCode: 2 });
    }
  }
});
