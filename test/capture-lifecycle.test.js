const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/launch', () => {
  const launchBrowser = jest.fn(async () => ({
    extensionId: 'test-extension',
    context: {
      addInitScript: jest.fn(async () => {}),
      newPage: jest.fn(async () => {
        throw new Error('newPage should not be called');
      }),
    },
  }));
  return {
    launchBrowser,
    launchWithExtension: launchBrowser,
    closeContext: jest.fn(async () => {}),
  };
});

const { launchBrowser: launchWithExtension, closeContext } = require('../src/launch');
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

  test('closes the demo context and prepared extension then fails when demo setup throws', async () => {
    const cleanup = jest.fn();
    const cwd = tempCwd();
    const logs = [];

    await expect(capture({
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
    })).rejects.toThrow(/demo capture failed for: demo/);

    expect(launchWithExtension).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('demo "demo" failed: demo setup failed');
  });

  test('fails when a requested demo does not produce a video recording', async () => {
    const cleanup = jest.fn();
    const cwd = tempCwd();
    const logs = [];
    let closed = false;
    const page = {
      setViewportSize: jest.fn(async () => {}),
      on: jest.fn(),
      off: jest.fn(),
      video: jest.fn(() => null),
      close: jest.fn(async () => { closed = true; }),
      isClosed: jest.fn(() => closed),
    };
    launchWithExtension.mockResolvedValueOnce({
      extensionId: 'test-extension',
      context: {
        addInitScript: jest.fn(async () => {}),
        newPage: jest.fn(async () => page),
      },
    });

    await expect(capture({
      handoff: false,
      prepareExtension: async () => preparedExtension(cleanup),
      demos: [{ name: 'demo', run: async () => {} }],
    }, {
      cwd,
      scenes: ['demo'],
      noBuild: true,
      log: (msg) => logs.push(msg),
    })).rejects.toThrow(/demo capture failed for: demo/);

    expect(page.video).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('demo "demo" failed: demo "demo" did not produce a video recording');
    expect(fs.existsSync(path.join(cwd, 'store-assets', 'demo.webm'))).toBe(false);
  });

  test('rejects unknown scene names before launching Chromium or preparing an extension', async () => {
    const cleanup = jest.fn();
    const prepareExtension = jest.fn(async () => preparedExtension(cleanup));
    const cwd = tempCwd();

    await expect(capture({
      handoff: false,
      prepareExtension,
      scenes: [{ name: 'known-scene', run: async () => {} }],
      demos: [{ name: 'known-demo', run: async () => {} }],
    }, {
      cwd,
      scenes: ['missing-scene'],
      noBuild: true,
      log: () => {},
    })).rejects.toMatchObject({
      message: 'unknown scene: missing-scene. Known: known-scene, known-demo',
      exitCode: 2,
    });

    expect(prepareExtension).not.toHaveBeenCalled();
    expect(launchWithExtension).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, 'store-assets'))).toBe(false);
  });

  test('rejects unconfigured channel targets before capture work', async () => {
    const prepareExtension = jest.fn(async () => preparedExtension(jest.fn()));
    const cwd = tempCwd();

    await expect(capture({
      handoff: false,
      prepareExtension,
      demo: { name: 'skillbridge', targets: ['x'], run: async () => {} },
    }, {
      cwd,
      targets: ['youtube-shorts'],
      noBuild: true,
      log: () => {},
    })).rejects.toMatchObject({
      message: 'target not configured: youtube-shorts. Configured: x',
      exitCode: 2,
    });

    expect(prepareExtension).not.toHaveBeenCalled();
    expect(launchWithExtension).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, 'store-assets'))).toBe(false);
  });

  test('rejects scene and target filters whose intersection is empty', async () => {
    const prepareExtension = jest.fn(async () => preparedExtension(jest.fn()));
    const cwd = tempCwd();

    await expect(capture({
      handoff: false,
      prepareExtension,
      demos: [
        { name: 'translate', targets: ['x'], run: async () => {} },
        { name: 'restore', targets: ['youtube-shorts'], run: async () => {} },
      ],
    }, {
      cwd,
      scenes: ['translate'],
      targets: ['youtube-shorts'],
      noBuild: true,
      log: () => {},
    })).rejects.toMatchObject({
      message: 'no configured demo matches the requested scene and target filters',
      exitCode: 2,
    });

    expect(prepareExtension).not.toHaveBeenCalled();
    expect(launchWithExtension).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, 'store-assets'))).toBe(false);
  });
});
