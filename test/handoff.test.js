const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  HANDOFF_KINDS,
  HANDOFF_SCHEMA_IDS,
  HANDOFF_VERSION,
  assetRecord,
  buildHandoffDocs,
  demoStoryboard,
  writeHandoffDocs,
} = require('../src/handoff');

function tmpProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-handoff-'));
  const outDir = path.join(cwd, 'store-assets');
  fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'demo-ext', version: '1.0.0', private: true }));
  return { cwd, outDir };
}

describe('handoff contract', () => {
  test('assetRecord stores repo-relative and outDir-relative paths', () => {
    const { cwd, outDir } = tmpProject();
    const filePath = path.join(outDir, 'demo.mp4');
    expect(assetRecord({
      cwd,
      outDir,
      filePath,
      name: 'demo',
      type: 'video',
      role: 'sns-demo-mp4',
    })).toMatchObject({
      id: 'sns-demo-mp4:demo',
      name: 'demo',
      type: 'video',
      role: 'sns-demo-mp4',
      format: 'mp4',
      path: 'store-assets/demo.mp4',
      outPath: 'demo.mp4',
    });
  });

  test('demoStoryboard converts captions into portable beats', () => {
    expect(demoStoryboard({
      name: 'demo-translate',
      preset: 'sns-video',
      mp4: { crf: 18 },
      trim: { duration: '00:30' },
      nextTool: 'screen-studio',
      captions: [
        { at: 0.5, text: 'Translate in place' },
        { at: '00:08', text: 'Restore original text' },
      ],
    }, { width: 1280, height: 720 })).toMatchObject({
      name: 'demo-translate',
      audience: 'sns',
      recommendedNextTool: 'screen-studio',
      viewport: { width: 1280, height: 720 },
      beats: [
        { at: 0.5, atMs: 500, text: 'Translate in place' },
        { at: 8, atMs: 8000, text: 'Restore original text' },
      ],
    });
  });

  test('buildHandoffDocs links manifest, captions, storyboards, and assets', () => {
    const { cwd, outDir } = tmpProject();
    const assets = [
      assetRecord({
        cwd,
        outDir,
        filePath: path.join(outDir, 'demo.mp4'),
        name: 'demo',
        type: 'video',
        role: 'sns-demo-mp4',
      }),
    ];
    const docs = buildHandoffDocs({
      cwd,
      outDir,
      config: { disclaimer: 'Demo only' },
      assets,
      demoConfigs: [{ name: 'demo', run: async () => {}, captions: [{ at: 1, text: 'Restore anytime' }] }],
      demoViewports: { demo: { width: 1280, height: 720 } },
      demoWarnings: {
        demo: [{
          code: 'demo-warning',
          severity: 'warning',
          message: 'demo warning',
          fix: 'fix the demo',
        }],
      },
      flags: { freeze: true, liveGt: false },
    });

    expect(docs.manifest).toMatchObject({
      $schema: HANDOFF_SCHEMA_IDS.manifest,
      kind: HANDOFF_KINDS.manifest,
      version: HANDOFF_VERSION,
      tool: '@starter-series/shotkit',
      project: { name: 'demo-ext', version: '1.0.0', private: true },
      handoff: {
        contractVersion: HANDOFF_VERSION,
        storyboards: 'storyboard.json',
        captions: 'captions.json',
      },
    });
    expect(docs.manifest.handoff.adapterHints.map((item) => item.id)).toContain('screen-studio');
    expect(docs.storyboard.kind).toBe(HANDOFF_KINDS.storyboard);
    expect(docs.captions.kind).toBe(HANDOFF_KINDS.captions);
    expect(docs.storyboard.demos[0].beats[0].text).toBe('Restore anytime');
    expect(docs.captions.demos[0].captions[0].atMs).toBe(1000);
    expect(docs.storyboard.storyboardLint).toEqual([{
      name: 'demo',
      ok: false,
      warnings: [{
        code: 'demo-warning',
        severity: 'warning',
        message: 'demo warning',
        fix: 'fix the demo',
      }],
    }]);
  });

  test('writeHandoffDocs writes all contract files and includes them in the manifest assets', () => {
    const { cwd, outDir } = tmpProject();
    const paths = writeHandoffDocs({
      cwd,
      outDir,
      config: {},
      assets: [],
      demoConfigs: [],
      demoViewports: {},
      demoWarnings: {},
      flags: {},
    });

    expect(paths.map((p) => path.basename(p))).toEqual(['storyboard.json', 'captions.json', 'shotkit-manifest.json']);
    for (const filePath of paths) expect(fs.existsSync(filePath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'shotkit-manifest.json'), 'utf8'));
    expect(manifest.assets.map((asset) => asset.role)).toEqual([
      'storyboard-contract',
      'captions-contract',
      'handoff-manifest',
    ]);
  });
});
