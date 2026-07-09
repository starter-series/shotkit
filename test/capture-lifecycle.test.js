const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/launch', () => ({
  launchWithExtension: jest.fn(async () => ({
    extensionId: 'test-extension',
    context: {
      addInitScript: jest.fn(async () => {}),
      newPage: jest.fn(async () => {
        throw new Error('newPage should not be called');
      }),
    },
  })),
  closeContext: jest.fn(async () => {}),
}));

const { launchWithExtension, closeContext } = require('../src/launch');
const { capture } = require('../src/capture');

function tempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-capture-lifecycle-'));
}

function preparedExtension(cleanup) {
  return { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'sk-extension-')), cleanup };
}

describe('capture lifecycle cleanup', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('closes the static context and prepared extension when setup throws', async () => {
    const cleanup = jest.fn();
    const cwd = tempCwd();

    await expect(capture({
      handoff: false,
      prepareExtension: async () => preparedExtension(cleanup),
      setup: async () => {
        throw new Error('setup failed');
      },
      scenes: [{ name: 'scene', run: async () => {} }],
    }, {
      cwd,
      noBuild: true,
      noVideo: true,
      log: () => {},
    })).rejects.toThrow(/setup failed/);

    expect(launchWithExtension).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('closes the demo context and prepared extension when demo setup throws', async () => {
    const cleanup = jest.fn();
    const cwd = tempCwd();
    const logs = [];

    const result = await capture({
      handoff: false,
      prepareExtension: async () => preparedExtension(cleanup),
      setup: async () => {
        throw new Error('demo setup failed');
      },
      demos: [{ name: 'demo', run: async () => {} }],
    }, {
      cwd,
      scenes: ['demo'],
      noBuild: true,
      log: (msg) => logs.push(msg),
    });

    expect(result.produced).toEqual([]);
    expect(launchWithExtension).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('demo "demo" failed: demo setup failed');
  });
});
