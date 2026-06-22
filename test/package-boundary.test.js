const pkg = require('../package.json');

describe('npm package boundary', () => {
  test('ships the public capture and handoff surface only', () => {
    expect(pkg.files).toEqual([
      'src',
      'bin',
      'skills/capture',
      'docs/handoff-conventions.md',
      'schemas',
    ]);
  });

  test('keeps repo-internal research and application planning out of the tarball', () => {
    expect(pkg.files).not.toContain('skills/research-to-product-fit');
    expect(pkg.files).not.toContain('research-runs');
    expect(pkg.files).not.toContain('examples');
    expect(pkg.files).not.toContain('docs');
  });
});
