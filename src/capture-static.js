const path = require('path');

const { compositeCaption } = require('./caption');
const { renderPromoTile } = require('./promo');
const { resolveSize } = require('./presets');

async function captureStaticAssets({
  config,
  context,
  extensionId,
  setup,
  passFlags,
  wants,
  defaultViewport,
  bandHeight,
  outDir,
  writeAsset,
}) {
  for (const scene of config.scenes || []) {
    if (!wants(scene.name)) continue;
    const viewport = resolveSize(scene.preset || scene.viewport, defaultViewport);
    const captioned = !!(config.disclaimer || scene.caption);
    const captureHeight = captioned ? viewport.height - bandHeight : viewport.height;
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: viewport.width, height: captureHeight });
      await scene.run({
        page,
        context,
        extensionId,
        env: setup.env,
        baseUrl: setup.env.baseUrl,
        flags: passFlags,
      });
      let buffer = await page.screenshot({
        clip: { x: 0, y: 0, width: viewport.width, height: captureHeight },
      });
      if (captioned) {
        buffer = await compositeCaption({
          context,
          imageBuffer: buffer,
          width: viewport.width,
          height: viewport.height,
          bandHeight,
          caption: scene.caption,
          disclaimer: config.disclaimer,
        });
      }
      writeAsset(
        path.join(outDir, `${scene.name}.png`),
        buffer,
        {
          name: scene.name,
          type: 'image',
          role: 'store-screenshot',
          width: viewport.width,
          height: viewport.height,
          source: { kind: 'scene', name: scene.name },
        },
        `✓ ${scene.name}.png (${viewport.width}×${viewport.height})`,
      );
    } finally {
      await page.close();
    }
  }

  for (const tile of config.promoTiles || []) {
    if (!wants(tile.name)) continue;
    const { width, height } = resolveSize(
      tile.preset || { width: tile.width, height: tile.height },
      defaultViewport,
    );
    const buffer = await renderPromoTile({
      context,
      template: tile.template,
      width,
      height,
      replacements: tile.replacements,
    });
    writeAsset(
      path.join(outDir, `${tile.name}.png`),
      buffer,
      {
        name: tile.name,
        type: 'image',
        role: 'promo-tile',
        width,
        height,
        source: { kind: 'promoTile', name: tile.name },
      },
      `✓ ${tile.name}.png (${width}×${height})`,
    );
  }
}

module.exports = { captureStaticAssets };
