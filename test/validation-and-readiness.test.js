/*
 * Locks the second-tier correctness fixes from the v1.3 code review:
 *   - ffmpeg arg/filter validation (clear errors instead of opaque ffmpeg ones)
 *   - demo config fails fast on a non-array captions value
 *   - handoff readiness reflects whether a captured clip actually exists, and
 *     the source webm is surfaced to video editors even without an mp4.
 */

const { buildVideoFilter, buildFfmpegArgs } = require('../src/video');
const { normalizeDemoConfigs, lintDemoStoryboard } = require('../src/demo');
const { buildHandoffRecommendations } = require('../src/integrations');
const { assetRecord } = require('../src/handoff');

describe('video arg validation gives clear errors', () => {
  it('rejects a zero/negative crop dimension', () => {
    expect(() => buildVideoFilter({ crop: { x: 0, y: 0, width: 0, height: 720 } })).toThrow(/greater than 0/);
  });

  it('rejects a non-finite crf (number or string)', () => {
    expect(() => buildFfmpegArgs({ input: 'a.webm', output: 'a.mp4', crf: NaN })).toThrow(/crf/);
    expect(() => buildFfmpegArgs({ input: 'a.webm', output: 'a.mp4', crf: 'high' })).toThrow(/crf/);
    // a sane crf still builds
    expect(() => buildFfmpegArgs({ input: 'a.webm', output: 'a.mp4', crf: 20 })).not.toThrow();
  });

  it('rejects a NaN zoom offset but allows string ffmpeg expressions', () => {
    expect(() => buildVideoFilter({ zoom: { scale: 2, x: NaN } })).toThrow(/zoom\.x/);
    expect(() => buildVideoFilter({ zoom: { scale: 2, x: '10', y: '20' } })).not.toThrow();
  });
});

describe('demo config fails fast', () => {
  it('rejects a non-array captions value at normalize time', () => {
    expect(() => normalizeDemoConfigs({ demo: { name: 'd', run: () => {}, captions: { at: 1, text: 'x' } } }))
      .toThrow(/captions must be an array/);
  });
});

describe('storyboard lint mp4 warning reflects the demo config', () => {
  const captions = [{ at: 1, text: 'before' }, { at: 4, text: 'restore original' }];

  it('no spurious missing-mp4 when demo.mp4 is set (public caller passes no mp4Requested)', () => {
    const lines = lintDemoStoryboard({ name: 'd', mp4: { crf: 18 }, trim: { duration: 25 }, captions });
    expect(lines.some((l) => /mp4/i.test(l))).toBe(false);
  });

  it('still warns when neither the config nor a flag requests mp4', () => {
    const lines = lintDemoStoryboard({ name: 'd', trim: { duration: 25 }, captions });
    expect(lines.some((l) => /mp4/i.test(l))).toBe(true);
  });
});

describe('handoff readiness reflects whether a clip exists', () => {
  const cwd = '/tmp';
  const outDir = '/tmp/store-assets';
  function rec(role, fmt) {
    const type = fmt === 'png' ? 'image' : fmt === 'json' ? 'json' : 'video';
    return assetRecord({ cwd, outDir, filePath: `${outDir}/x.${fmt}`, name: `x-${role}`, type, role, source: { kind: 'handoff' } });
  }

  it('a storyboard-only set is ready but only medium confidence (no captured clip)', () => {
    const recs = buildHandoffRecommendations({ assets: [rec('storyboard-contract', 'json')] });
    const supademo = recs.find((r) => r.id === 'supademo');
    expect(supademo.readiness).toBe('ready');
    expect(supademo.confidence).toBe('medium');
  });

  it('upgrades to high confidence once a clip is present', () => {
    const recs = buildHandoffRecommendations({ assets: [rec('storyboard-contract', 'json'), rec('source-demo-webm', 'webm')] });
    const supademo = recs.find((r) => r.id === 'supademo');
    expect(supademo.confidence).toBe('high');
  });

  it('surfaces the source webm to a video editor even without an mp4', () => {
    const recs = buildHandoffRecommendations({ assets: [rec('source-demo-webm', 'webm'), rec('storyboard-contract', 'json')] });
    const screen = recs.find((r) => r.id === 'screen-studio');
    expect(screen.useAssets.some((a) => a.role === 'source-demo-webm')).toBe(true);
  });
});
