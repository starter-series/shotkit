const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/launch', () => ({
  launchWithExtension: jest.fn(async () => ({
    extensionId: 'test-extension',
    context: { newPage: jest.fn() },
  })),
  closeContext: jest.fn(async () => {}),
}));

const { capture } = require('../src/capture');

function writeProductManifest(cwd) {
  fs.writeFileSync(path.join(cwd, 'product.manifest.json'), JSON.stringify({
    product: {
      name: 'Demo Extension',
      summary: 'A short store summary.',
      description: 'A longer listing description.',
      category: 'Productivity',
    },
    stores: {
      chromeWebStore: {
        title: 'Demo Extension',
        whatsNew: '- Added review worksheet',
      },
    },
    privacy: {
      dataCollection: 'No sale of personal data.',
      permissions: [
        {
          name: 'storage',
          purpose: 'Save preferences',
          disclosure: 'Stores settings locally.',
        },
      ],
      dataFlows: [
        {
          data: 'Selected text',
          destination: 'Example service',
          purpose: 'Return transformed text',
        },
      ],
    },
  }, null, 2));
}

test('capture writes listing and privacy worksheet from product manifest', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shotkit-capture-product-'));
  const extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotkit-extension-'));
  writeProductManifest(cwd);

  const result = await capture({
    outDir: 'store-assets',
    description: { from: 'product.manifest.json', channel: 'chromeWebStore' },
    prepareExtension: async () => extensionDir,
  }, {
    cwd,
    noBuild: true,
    noVideo: true,
    log: () => {},
  });

  const descriptionPath = path.join(cwd, 'store-assets', 'description.md');
  const privacyPath = path.join(cwd, 'store-assets', 'privacy-disclosure.md');
  const manifestPath = path.join(cwd, 'store-assets', 'shotkit-manifest.json');

  expect(result.produced).toContain(descriptionPath);
  expect(result.produced).toContain(privacyPath);
  expect(fs.readFileSync(descriptionPath, 'utf8')).toContain('Demo Extension');
  expect(fs.readFileSync(privacyPath, 'utf8')).toContain('Privacy disclosure worksheet');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  expect(manifest.assets.some((asset) => asset.role === 'store-listing-copy')).toBe(true);
  expect(manifest.assets.some((asset) => asset.role === 'privacy-disclosure')).toBe(true);
});
