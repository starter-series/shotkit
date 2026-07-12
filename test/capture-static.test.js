jest.mock('../src/caption', () => ({
  compositeCaption: jest.fn(async () => Buffer.from('captioned')),
}));
jest.mock('../src/promo', () => ({
  renderPromoTile: jest.fn(async () => Buffer.from('promo')),
}));

const { compositeCaption } = require('../src/caption');
const { captureStaticAssets } = require('../src/capture-static');
const { renderPromoTile } = require('../src/promo');

test('captures selected screenshots and promo tiles while closing every scene page', async () => {
  let closed = false;
  const page = {
    setViewportSize: jest.fn(async () => {}),
    screenshot: jest.fn(async () => Buffer.from('shot')),
    close: jest.fn(async () => { closed = true; }),
  };
  const context = { newPage: jest.fn(async () => page) };
  const sceneRun = jest.fn(async () => {});
  const writeAsset = jest.fn();
  const config = {
    disclaimer: 'Unofficial',
    scenes: [
      { name: 'selected', viewport: { width: 640, height: 480 }, caption: 'Proof', run: sceneRun },
      { name: 'skipped', run: async () => {} },
    ],
    promoTiles: [{ name: 'promo', width: 320, height: 180, template: '<main />' }],
  };

  await captureStaticAssets({
    config,
    context,
    extensionId: 'extension-id',
    setup: { env: { baseUrl: 'http://127.0.0.1:4321' } },
    passFlags: { freeze: true, liveGt: false },
    wants: (name) => name !== 'skipped',
    defaultViewport: { width: 1280, height: 800 },
    bandHeight: 56,
    outDir: '/tmp/store-assets',
    writeAsset,
  });

  expect(sceneRun).toHaveBeenCalledWith(expect.objectContaining({
    context,
    extensionId: 'extension-id',
    baseUrl: 'http://127.0.0.1:4321',
    flags: { freeze: true, liveGt: false },
  }));
  expect(page.setViewportSize).toHaveBeenCalledWith({ width: 640, height: 424 });
  expect(compositeCaption).toHaveBeenCalledWith(expect.objectContaining({
    width: 640,
    height: 480,
    bandHeight: 56,
  }));
  expect(renderPromoTile).toHaveBeenCalledWith(expect.objectContaining({ width: 320, height: 180 }));
  expect(writeAsset).toHaveBeenCalledTimes(2);
  expect(closed).toBe(true);
});
