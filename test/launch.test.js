const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: jest.fn(),
  },
}));

const { chromium } = require('playwright');
const { launchWithExtension } = require('../src/launch');

function tmpExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-launch-ext-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
  return dir;
}

describe('launchWithExtension', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('removes the temp profile when Chromium fails before returning a context', async () => {
    let userDataDir;
    chromium.launchPersistentContext.mockImplementation(async (dir) => {
      userDataDir = dir;
      throw new Error('missing chromium');
    });

    await expect(launchWithExtension({ extensionDir: tmpExtension() })).rejects.toThrow(/missing chromium/);

    expect(userDataDir).toContain(`${path.sep}store-profile-`);
    expect(fs.existsSync(userDataDir)).toBe(false);
  });
});
