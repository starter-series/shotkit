const { PRESETS, resolveSize } = require('../src/presets');

describe('presets', () => {
  test('known presets resolve to sizes', () => {
    expect(resolveSize('cws-screenshot')).toEqual({ width: 1280, height: 800 });
    expect(resolveSize('cws-promo-small')).toEqual({ width: 440, height: 280 });
    expect(resolveSize('sns-twitter')).toEqual({ width: 1200, height: 675 });
    expect(resolveSize('sns-video')).toEqual({ width: 1280, height: 720 });
    expect(resolveSize('sns-og')).toEqual({ width: 1200, height: 630 });
  });

  test('explicit size passes through', () => {
    expect(resolveSize({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
  });

  test('undefined returns the fallback', () => {
    const fb = { width: 1280, height: 800 };
    expect(resolveSize(undefined, fb)).toBe(fb);
  });

  test('unknown preset throws with a helpful message', () => {
    expect(() => resolveSize('nope')).toThrow(/unknown size preset "nope"/);
  });

  test('PRESETS is frozen and covers both audiences', () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
    expect(PRESETS).toHaveProperty('cws-screenshot');
    expect(PRESETS).toHaveProperty('sns-video', { width: 1280, height: 720 });
    expect(PRESETS).toHaveProperty('sns-square', { width: 1080, height: 1080 });
  });
});
