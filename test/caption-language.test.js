const {
  canonicalLocale,
  captionWords,
  chunkCaptionSegments,
  composeCaptionSegments,
  segmentCaptionText,
  textDirection,
} = require('../src/caption-language');

describe('caption language model', () => {
  test('canonicalizes locales and infers script direction', () => {
    expect(canonicalLocale('ko-kr')).toBe('ko-KR');
    expect(textDirection('en-US')).toBe('ltr');
    expect(textDirection('ar-SA')).toBe('rtl');
    expect(textDirection('ar-SA', 'ltr')).toBe('ltr');
    expect(() => canonicalLocale('not_a_locale')).toThrow(/invalid/);
    expect(() => textDirection('en', 'sideways')).toThrow(/direction/);
  });

  test('preserves authored punctuation and separators across focus chunks', () => {
    const segments = segmentCaptionText('Translate AI lessons, now!', 'en-US');
    expect(captionWords('Translate AI lessons, now!', 'en-US')).toEqual([
      'Translate', 'AI', 'lessons,', 'now!',
    ]);
    expect(composeCaptionSegments(chunkCaptionSegments(segments, 0, 2))).toBe('Translate AI');
    expect(composeCaptionSegments(chunkCaptionSegments(segments, 2, 2))).toBe('lessons, now!');
  });

  test('does not inject spaces into Japanese or Korean copy', () => {
    const japanese = segmentCaptionText('AIレッスンを翻訳します。', 'ja-JP');
    const korean = segmentCaptionText('AI 강의를 바로 번역합니다.', 'ko-KR');
    expect(composeCaptionSegments(japanese)).toBe('AIレッスンを翻訳します。');
    expect(composeCaptionSegments(korean)).toBe('AI 강의를 바로 번역합니다.');
    expect(japanese.length).toBeGreaterThan(2);
    expect(korean.length).toBeGreaterThan(2);
  });
});
