const {
  analyzeFocusCaptionDensity,
  buildCaptionFrames,
  buildCaptionTimeline,
  captionStyle,
  normalizeFocusOptions,
  splitCaptionWords,
} = require('../src/demo-caption-focus');

describe('focused demo captions', () => {
  test('keeps static caption schedules backward compatible', () => {
    expect(buildCaptionFrames([{ atMs: 500, text: 'Show the result' }])).toEqual([
      {
        atMs: 500,
        text: 'Show the result',
        sourceAtMs: 500,
        sourceText: 'Show the result',
        options: {},
      },
    ]);
  });

  test('builds timed word highlights in compact chunks', () => {
    const frames = buildCaptionFrames([
      { atMs: 500, text: 'Translate the whole lesson now' },
    ], {
      mode: 'focus',
      wordsPerChunk: 2,
      wordMs: 200,
    });
    expect(frames.map(({ atMs, text, options }) => ({
      atMs,
      text,
      focusWords: options.focusWords,
      activeWordIndex: options.activeWordIndex,
    }))).toEqual([
      {
        atMs: 500,
        text: 'Translate the',
        focusWords: ['Translate', 'the'],
        activeWordIndex: 0,
      },
      {
        atMs: 700,
        text: 'Translate the',
        focusWords: ['Translate', 'the'],
        activeWordIndex: 1,
      },
      {
        atMs: 900,
        text: 'whole lesson',
        focusWords: ['whole', 'lesson'],
        activeWordIndex: 0,
      },
      {
        atMs: 1100,
        text: 'whole lesson',
        focusWords: ['whole', 'lesson'],
        activeWordIndex: 1,
      },
      {
        atMs: 1300,
        text: 'now',
        focusWords: ['now'],
        activeWordIndex: 0,
      },
    ]);
    expect(frames.every((frame) => frame.sourceText === 'Translate the whole lesson now')).toBe(true);
  });

  test('compresses pacing so every word appears before the next beat', () => {
    const frames = buildCaptionFrames([
      { atMs: 0, text: 'One two three four' },
      { atMs: 500, text: 'Next beat' },
    ], { mode: 'focus', wordMs: 300 });

    const firstCaption = frames.filter((frame) => frame.sourceText === 'One two three four');
    expect(firstCaption.map((frame) => frame.atMs)).toEqual([0, 125, 250, 375]);
    expect(firstCaption.at(-1).text).toBe('four');
    expect(frames.find((frame) => frame.atMs === 500).text).toBe('Next beat');
    expect(analyzeFocusCaptionDensity([
      { atMs: 0, text: 'One two three four' },
      { atMs: 500, text: 'Next beat' },
    ], { mode: 'focus', wordMs: 300 })).toEqual([
      { index: 0, wordCount: 4, availableMs: 500, recommendedMs: 1200 },
    ]);
  });

  test('preserves the full phrase when even chunk pacing is too dense', () => {
    const [frame] = buildCaptionFrames([
      { atMs: 0, text: 'One two three four five six seven' },
      { atMs: 100, text: 'Next beat' },
    ], { mode: 'focus' });

    expect(frame).toMatchObject({
      atMs: 0,
      text: 'One two three four five six seven',
      options: {
        focusWords: ['One', 'two', 'three', 'four', 'five', 'six', 'seven'],
        condensed: true,
      },
    });
  });

  test('emits a portable frame timeline with trim-relative boundaries', () => {
    const frames = buildCaptionFrames([
      { atMs: 0, text: 'One two' },
    ], { mode: 'focus', wordMs: 200 });

    expect(buildCaptionTimeline(frames, { startMs: 100, endMs: 700 })).toEqual([
      {
        at: 0,
        atMs: 0,
        endAt: 0.1,
        endMs: 100,
        text: 'One two',
        sourceText: 'One two',
        words: ['One', 'two'],
        activeWordIndex: 0,
        condensed: false,
      },
      {
        at: 0.1,
        atMs: 100,
        endAt: 0.6,
        endMs: 600,
        text: 'One two',
        sourceText: 'One two',
        words: ['One', 'two'],
        activeWordIndex: 1,
        condensed: false,
      },
    ]);
  });

  test('clamps every timeline frame to the delivered clip end', () => {
    const frames = buildCaptionFrames([
      { atMs: 0, text: 'One two three' },
    ], { mode: 'focus', wordMs: 200 });

    expect(buildCaptionTimeline(frames, { endMs: 350 }).map((frame) => ({
      atMs: frame.atMs,
      endMs: frame.endMs,
      activeWordIndex: frame.activeWordIndex,
    }))).toEqual([
      { atMs: 0, endMs: 200, activeWordIndex: 0 },
      { atMs: 200, endMs: 350, activeWordIndex: 1 },
    ]);
  });

  test('normalizes style metadata and validates controls', () => {
    expect(captionStyle({
      position: 'bottom',
      mode: 'focus',
      bottomOffset: 119.7,
    })).toEqual({
      mode: 'focus',
      position: 'bottom',
      bottomOffset: 120,
      wordsPerChunk: 3,
      wordMs: 360,
      activeColor: '#facc15',
    });
    expect(splitCaptionWords('  번역 결과를   바로 확인하세요 ')).toEqual(['번역', '결과를', '바로', '확인하세요']);
    const japanese = splitCaptionWords('翻訳結果を確認します。');
    expect(japanese.length).toBeGreaterThan(1);
    expect(japanese.join('')).toBe('翻訳結果を確認します。');
    expect(normalizeFocusOptions(null)).toEqual({ mode: 'static' });
    expect(() => normalizeFocusOptions({ mode: 'karaoke' })).toThrow(/must be "static" or "focus"/);
    expect(() => normalizeFocusOptions({ mode: 'focus', wordsPerChunk: 0 })).toThrow(/wordsPerChunk/);
    expect(() => normalizeFocusOptions({ mode: 'focus', wordMs: 20 })).toThrow(/wordMs/);
    expect(() => normalizeFocusOptions({ mode: 'focus', bottomOffset: -1 })).toThrow(/bottomOffset/);
    expect(() => normalizeFocusOptions('focus')).toThrow(/must be an object/);
  });
});
