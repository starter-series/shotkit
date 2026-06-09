const fs = require('fs');
const os = require('os');
const path = require('path');
const { stageExtension, patchManifestForLocalhost, LOCALHOST_MATCHES } = require('../src/extension');

function makeExt() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ext-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'c.js'), '// content');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'x',
      version: '1.0.0',
      content_scripts: [{ matches: ['https://example.com/*'], js: ['src/c.js'] }],
      web_accessible_resources: [{ resources: ['src/c.js'], matches: ['https://example.com/*'] }],
    }),
  );
  return dir;
}

describe('extension staging', () => {
  test('stageExtension copies the listed paths', () => {
    const staged = stageExtension(makeExt(), ['manifest.json', 'src']);
    expect(fs.existsSync(path.join(staged, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(staged, 'src', 'c.js'))).toBe(true);
  });

  test('stageExtension errors on a missing include', () => {
    expect(() => stageExtension(makeExt(), ['nope'])).toThrow(/not found/);
  });

  test('patchManifestForLocalhost adds localhost matches + scripting', () => {
    const dir = makeExt();
    patchManifestForLocalhost(dir);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const match of LOCALHOST_MATCHES) {
      expect(m.content_scripts[0].matches).toContain(match);
      expect(m.host_permissions).toContain(match);
      expect(m.web_accessible_resources[0].matches).toContain(match);
    }
    expect(m.permissions).toContain('scripting');
  });

  test('patchManifestForLocalhost is idempotent', () => {
    const dir = makeExt();
    patchManifestForLocalhost(dir);
    patchManifestForLocalhost(dir);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(m.content_scripts[0].matches.filter((x) => x === LOCALHOST_MATCHES[0])).toHaveLength(1);
  });
});
