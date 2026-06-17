/*
 * Validates the EMITTED handoff documents against the published JSON Schemas
 * with a real validator (ajv, draft 2020-12). The pre-existing schema.test.js
 * only checks $id/kind constants; this catches emitter<->schema drift — e.g. a
 * loosely-typed demo config (object preset, numeric thumbnail, string trim) that
 * the capture path accepts but that would violate the storyboard contract.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const { buildHandoffDocs, assetRecord } = require('../src/handoff');

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'));
}

function buildSampleDocs() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shotkit-schema-'));
  const outDir = path.join(cwd, 'store-assets');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({ name: 'demo-proj', version: '1.0.0', private: true }),
  );

  // Deliberately loosely-typed: object preset, numeric thumbnail, and a trim
  // start that should drop the first caption and offset the rest.
  const tricky = {
    name: 'tricky',
    preset: { width: 1280, height: 720 },
    trim: { start: 2, duration: '00:30' },
    thumbnail: 1.2,
    crop: { x: 120, y: 0, width: 1040, height: 720 },
    captions: [
      { at: 0.5, text: 'cut off by trim.start' },
      { at: 4, text: 'kept and offset' },
    ],
  };
  const simple = {
    name: 'simple',
    preset: 'sns-video',
    captions: [{ at: 1, text: 'hello' }, { at: 5, text: 'restore original text' }],
  };

  const assets = [
    assetRecord({ cwd, outDir, filePath: path.join(outDir, 'tricky.mp4'), name: 'tricky', type: 'video', role: 'sns-demo-mp4', source: { kind: 'demo', name: 'tricky' } }),
    assetRecord({ cwd, outDir, filePath: path.join(outDir, 'hero.png'), name: 'hero', type: 'image', role: 'screenshot', width: 1280, height: 800, source: { kind: 'scene', name: 'hero' } }),
  ];

  try {
    return buildHandoffDocs({
      cwd,
      outDir,
      config: { disclaimer: null, description: null },
      assets,
      demoConfigs: [tricky, simple],
      demoViewports: { tricky: { width: 1280, height: 720 }, simple: { width: 1280, height: 720 } },
      demoWarnings: { tricky: [], simple: [] },
      flags: { liveGt: false, freeze: false },
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe('handoff docs conform to the published JSON schemas', () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const docs = buildSampleDocs();

  const cases = [
    ['storyboard', 'storyboard.schema.json', docs.storyboard],
    ['captions', 'captions.schema.json', docs.captions],
    ['manifest', 'shotkit-manifest.schema.json', docs.manifest],
  ];

  for (const [label, schemaFile, doc] of cases) {
    it(`${label}.json validates against ${schemaFile}`, () => {
      const validate = ajv.compile(loadSchema(schemaFile));
      const ok = validate(doc);
      if (!ok) {
        throw new Error(`${label} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`);
      }
      expect(ok).toBe(true);
    });
  }

  it('coerces loose demo fields and offsets caption times to the deliverable', () => {
    const tb = docs.storyboard.demos.find((d) => d.name === 'tricky');
    expect(tb.preset).toBeUndefined();             // object preset omitted (schema requires string)
    expect(tb.trim).toEqual({ start: 2, duration: '00:30' });
    expect(tb.thumbnail).toEqual({ at: 1.2 });      // bare number -> { at }
    expect(tb.beats).toHaveLength(1);               // 0.5s caption dropped (before trim.start = 2s)
    expect(tb.beats[0].atMs).toBe(2000);            // 4s - 2s offset

    const tc = docs.captions.demos.find((d) => d.name === 'tricky');
    expect(tc.captions).toHaveLength(1);
    expect(tc.captions[0].atMs).toBe(2000);
  });
});
