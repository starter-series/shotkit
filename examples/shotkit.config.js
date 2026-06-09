/*
 * Example shotkit.config.js — reference only (not executed in CI).
 *
 * A minimal config that screenshots an extension's popup and a content-script
 * state on a local fixture. Real consumers: see browser-extension-starter
 * (dummy scenes) and skillBridge (5 scenes) for working setups.
 */

const path = require('path');
const { stageExtension, patchManifestForLocalhost, serveDirectory } = require('@starter-series/shotkit');

const FIXTURES = path.join(__dirname, 'fixtures');

module.exports = {
  // Run before capture → doubles as a real-bundle smoke test (optional).
  build: 'npm run build',
  outDir: 'store-assets',
  disclaimer: 'Unofficial · sample store assets',
  description: { from: 'store-assets/STORE_LISTING.md' },

  // Stage the extension's files to a temp dir and widen the manifest so its
  // content scripts also run against the localhost fixture server.
  prepareExtension() {
    const dir = stageExtension(path.join(__dirname, '..'), ['manifest.json', 'src', 'assets']);
    patchManifestForLocalhost(dir);
    return dir;
  },

  async setup() {
    const server = await serveDirectory(FIXTURES, { fallback: 'demo.html' });
    return { env: { baseUrl: server.baseUrl }, teardown: () => server.close() };
  },

  scenes: [
    {
      name: '01-popup',
      preset: 'cws-screenshot',
      caption: 'One-click toggle from the popup',
      async run({ page, extensionId }) {
        await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, { waitUntil: 'load' });
        await page.waitForSelector('#status');
      },
    },
    {
      // Same scene, a social size — the engine is size-agnostic.
      name: '01-popup-twitter',
      preset: 'sns-twitter',
      caption: 'Toggle it on, anywhere',
      async run({ page, extensionId }) {
        await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, { waitUntil: 'load' });
        await page.waitForSelector('#status');
      },
    },
  ],

  promoTiles: [
    {
      name: 'promo-tile',
      template: path.join(__dirname, 'templates', 'promo.html'),
      preset: 'cws-promo-small',
      replacements: { NAME: 'My Extension', TAGLINE: 'Does one useful thing well.' },
    },
  ],
};
