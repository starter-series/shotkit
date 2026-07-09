const pkg = require('../package.json');
const publicApi = require('../src');

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

  test('exports the root API and schema subpath contract', () => {
    expect(pkg.exports).toEqual({
      '.': './src/index.js',
      './schemas/*': './schemas/*',
    });
  });

  test('locks the public root API names', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'DEFAULT_BAND_HEIGHT',
      'DEFAULT_TARGETS',
      'DEFAULT_VIEWPORT',
      'FIXTURE_CSP',
      'HANDOFF_KINDS',
      'HANDOFF_SCHEMA_IDS',
      'HANDOFF_VERSION',
      'LOCALHOST_MATCHES',
      'PRESETS',
      'analyzeDemoStoryboard',
      'assetRecord',
      'buildFfmpegArgs',
      'buildHandoffDocs',
      'buildHandoffRecommendations',
      'buildThumbnailArgs',
      'buildVideoFilter',
      'capture',
      'closeContext',
      'compositeCaption',
      'createDemoController',
      'demoCaptionInitScript',
      'demoStoryboard',
      'ensureDemoCaptionOverlay',
      'extractListing',
      'extractPrivacyDisclosure',
      'extractProductListing',
      'extractProductManifest',
      'findFfmpeg',
      'formatStoryboardLint',
      'hideDemoCaption',
      'hideDemoPointer',
      'installDemoCaptionOverlay',
      'launchWithExtension',
      'lintDemoStoryboard',
      'moveDemoPointer',
      'normalizeDelayMs',
      'normalizeDemoCaptions',
      'normalizeDemoConfigs',
      'parseTimeToMs',
      'patchManifestForLocalhost',
      'postProcessDemo',
      'pulseDemoPointer',
      'renderDescriptionDoc',
      'renderPrivacyDisclosureDoc',
      'renderPromoTile',
      'resolveSize',
      'serveDirectory',
      'setDemoCaption',
      'splitSections',
      'stageExtension',
      'writeHandoffDocs',
    ]);
  });
});
