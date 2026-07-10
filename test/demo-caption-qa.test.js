const { analyzeDemoCaptionMetrics, transformedRect } = require('../src/demo-caption-qa');

function sample(overrides = {}) {
  return {
    text: 'Translate now',
    sourceText: 'Translate now',
    mode: 'focus',
    appearance: 'outline',
    expectedAtMs: 500,
    actualAtMs: 520,
    rect: { left: 40, top: 700, right: 600, bottom: 780, width: 560, height: 80 },
    viewport: { width: 720, height: 1280 },
    overflowX: false,
    overflowY: false,
    lineCount: 1,
    strokeWidth: 2,
    ...overrides,
  };
}

describe('runtime caption QA', () => {
  test('accepts measured outline frames inside the viewport', () => {
    expect(analyzeDemoCaptionMetrics({
      expectedFrames: [{ atMs: 500, text: 'Translate now' }],
      samples: [sample()],
    })).toEqual([]);
  });

  test('reports rendering, timing, and missing-frame failures for agent retry', () => {
    const warnings = analyzeDemoCaptionMetrics({
      expectedFrames: [
        { atMs: 500, text: 'Translate now' },
        { atMs: 1000, text: 'Restore anytime' },
      ],
      samples: [sample({
        actualAtMs: 900,
        rect: { left: 40, top: 1220, right: 760, bottom: 1320, width: 720, height: 100 },
        overflowX: true,
        lineCount: 3,
        strokeWidth: 0,
      })],
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'caption-outside-viewport' }),
      expect.objectContaining({ code: 'caption-overflow' }),
      expect.objectContaining({ code: 'caption-too-many-lines' }),
      expect.objectContaining({ code: 'caption-outline-missing' }),
      expect.objectContaining({ code: 'caption-frame-missing' }),
      expect.objectContaining({
        code: 'caption-timing-drift',
        details: {
          maximumDriftMs: 400,
          limitMs: 240,
          frame: { expectedAtMs: 500, actualAtMs: 900, driftMs: 400, text: 'Translate now' },
        },
      }),
    ]));
  });

  test('checks post-zoom caption geometry against protected regions', () => {
    expect(transformedRect(
      { left: 100, top: 100, right: 300, bottom: 180, width: 200, height: 80 },
      { width: 720, height: 1280 },
      { scale: 1.2, focusX: 0, focusY: 0 },
    )).toEqual({ left: 120, top: 120, right: 360, bottom: 216, width: 240, height: 96 });

    const warnings = analyzeDemoCaptionMetrics({
      expectedFrames: [{ atMs: 500, text: 'Translate now' }],
      samples: [sample()],
    }, {
      viewport: { width: 720, height: 1280 },
      protectedRegions: [{ id: 'result', x: 500, y: 730, width: 180, height: 120 }],
      framing: { scale: 1.1, focusX: 0.5, focusY: 0.5 },
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'caption-protected-region-overlap' }),
    ]));
  });
});
