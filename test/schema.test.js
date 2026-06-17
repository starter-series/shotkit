const fs = require('fs');
const path = require('path');
const { HANDOFF_SCHEMA_IDS } = require('../src/handoff');

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'));
}

describe('packaged handoff schemas', () => {
  test('schema ids match runtime handoff constants', () => {
    expect(readSchema('shotkit-manifest.schema.json').$id).toBe(HANDOFF_SCHEMA_IDS.manifest);
    expect(readSchema('storyboard.schema.json').$id).toBe(HANDOFF_SCHEMA_IDS.storyboard);
    expect(readSchema('captions.schema.json').$id).toBe(HANDOFF_SCHEMA_IDS.captions);
  });

  test('schemas declare the expected document kinds', () => {
    expect(readSchema('shotkit-manifest.schema.json').properties.kind.const).toBe('shotkit.manifest');
    expect(readSchema('storyboard.schema.json').properties.kind.const).toBe('shotkit.storyboard');
    expect(readSchema('captions.schema.json').properties.kind.const).toBe('shotkit.captions');
  });
});
