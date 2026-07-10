const fs = require('fs');
const os = require('os');
const path = require('path');

const { safeStaticPath, startCalibrator } = require('../src/calibrator-server');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function projectFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shotkit-calibrator-'));
  const outDir = path.join(cwd, 'store-assets');
  const name = 'demo-youtube-shorts';
  fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir, `${name}.mp4`), Buffer.from('0123456789'));
  writeJson(path.join(outDir, 'shotkit-manifest.json'), {
    assets: [{
      role: 'sns-demo-mp4',
      type: 'video',
      outPath: `${name}.mp4`,
      source: { kind: 'demo', name, story: 'demo', target: 'youtube-shorts' },
    }],
    handoff: {
      automation: {
        attempt: 1,
        targets: [{ demo: name, target: 'youtube-shorts', status: 'publish-ready' }],
      },
    },
  });
  writeJson(path.join(outDir, 'storyboard.json'), {
    demos: [{
      name,
      viewport: { width: 720, height: 1280 },
      beats: [{ at: 1.2, text: 'Show the result' }],
    }],
    storyboardLint: [{ name, warnings: [] }],
  });
  writeJson(path.join(outDir, 'captions.json'), { demos: [] });
  const config = {
    outDir: 'store-assets',
    calibration: { from: 'shotkit.calibration.json', layouts: ['focus-column', 'compact-column'] },
    demos: [{ name: 'demo', targets: ['youtube-shorts'], run: async () => {} }],
  };
  return { cwd, config, name };
}

describe('calibrator server', () => {
  test('confines static paths and rejects malformed encodings', () => {
    const staticRoot = path.dirname(safeStaticPath('/'));
    const traversal = safeStaticPath('/%2e%2e/%2e%2e/package.json');
    expect(traversal.startsWith(`${staticRoot}${path.sep}`)).toBe(true);
    expect(safeStaticPath('/%E0%A4%A')).toBeNull();
    expect(safeStaticPath('/%00')).toBeNull();
  });

  test('reads capture state, serves media ranges, and persists an unverified profile', async () => {
    const { cwd, config, name } = projectFixture();
    const calibrator = await startCalibrator({
      cwd,
      config,
      configPath: path.join(cwd, 'shotkit.config.js'),
      port: 0,
      open: false,
    });

    try {
      const initial = await fetch(`${calibrator.url}/api/state`).then((response) => response.json());
      expect(initial.targets).toEqual([expect.objectContaining({
        story: 'demo',
        target: 'youtube-shorts',
        name,
        status: 'publish-ready',
        hasProfile: false,
        verified: false,
        videoUrl: `/media/${name}.mp4`,
      })]);

      const range = await fetch(`${calibrator.url}/media/${name}.mp4`, {
        headers: { Range: 'bytes=2-5' },
      });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(Buffer.from(await range.arrayBuffer()).toString()).toBe('2345');

      const saved = await fetch(`${calibrator.url}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story: 'demo',
          target: 'youtube-shorts',
          profile: {
            layoutPreset: 'focus-column',
            framing: { scale: 1.04, focusX: 0.5, focusY: 0.45 },
            captionOptions: { position: 'bottom-left', appearance: 'outline', bottomOffset: 410 },
            protectedRegions: [{ id: 'result', x: 40, y: 120, width: 640, height: 480 }],
          },
        }),
      }).then((response) => response.json());
      expect(saved).toMatchObject({ ok: true, profileHash: expect.any(String) });

      const updated = await fetch(`${calibrator.url}/api/state`).then((response) => response.json());
      expect(updated.targets[0]).toMatchObject({
        status: 'needs-fix',
        hasProfile: true,
        verified: false,
        profileHash: saved.profileHash,
      });
      expect(readProfile(cwd).layoutPreset).toBe('focus-column');

      const calibrationPath = path.join(cwd, 'shotkit.calibration.json');
      const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
      calibration.profiles.demo['youtube-shorts'].verification = {
        profileHash: saved.profileHash,
        status: 'publish-ready',
        verifiedAt: '2026-07-10T00:00:00.000Z',
      };
      writeJson(calibrationPath, calibration);
      const manifestPath = path.join(cwd, 'store-assets', 'shotkit-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.handoff.automation.targets[0].status = 'needs-fix';
      writeJson(manifestPath, manifest);

      const failedRecapture = await fetch(`${calibrator.url}/api/state`).then((response) => response.json());
      expect(failedRecapture.targets[0]).toMatchObject({ status: 'needs-fix', verified: false });
    } finally {
      await calibrator.close();
    }
  });
});

function readProfile(cwd) {
  const document = JSON.parse(fs.readFileSync(path.join(cwd, 'shotkit.calibration.json'), 'utf8'));
  return document.profiles.demo['youtube-shorts'];
}
