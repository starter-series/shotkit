const DEFAULT_FOCUS_WORDS_PER_CHUNK = 3;
const DEFAULT_FOCUS_WORD_MS = 360;
const DEFAULT_FOCUS_ACTIVE_COLOR = '#facc15';
const MIN_FOCUS_FRAME_MS = 120;
const CAPTION_POSITIONS = new Set(['bottom-left', 'bottom']);

function captionOptionObject(options) {
  if (options == null) return {};
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('shotkit: demo captionOptions must be an object');
  }
  if (options.position != null && !CAPTION_POSITIONS.has(options.position)) {
    throw new Error('shotkit: demo captionOptions.position must be "bottom-left" or "bottom"');
  }
  if (options.bottomOffset != null && (!Number.isFinite(options.bottomOffset) || options.bottomOffset < 0)) {
    throw new Error('shotkit: demo captionOptions.bottomOffset must be a non-negative number');
  }
  if (options.appearance != null && options.appearance !== 'panel' && options.appearance !== 'outline') {
    throw new Error('shotkit: demo captionOptions.appearance must be "panel" or "outline"');
  }
  return options;
}

function captionMode(options = {}) {
  options = captionOptionObject(options);
  const mode = options.mode == null ? 'static' : options.mode;
  if (mode !== 'static' && mode !== 'focus') {
    throw new Error('shotkit: demo captionOptions.mode must be "static" or "focus"');
  }
  return mode;
}

function boundedInteger(value, fallback, name, min, max) {
  const resolved = value == null ? fallback : value;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`shotkit: demo captionOptions.${name} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function normalizeFocusOptions(options = {}) {
  options = captionOptionObject(options);
  const mode = captionMode(options);
  if (mode === 'static') return { mode };

  const activeColor = options.activeColor == null ? DEFAULT_FOCUS_ACTIVE_COLOR : options.activeColor;
  if (typeof activeColor !== 'string' || !activeColor.trim()) {
    throw new Error('shotkit: demo captionOptions.activeColor must be a non-empty CSS color');
  }

  return {
    mode,
    wordsPerChunk: boundedInteger(
      options.wordsPerChunk,
      DEFAULT_FOCUS_WORDS_PER_CHUNK,
      'wordsPerChunk',
      1,
      6,
    ),
    wordMs: boundedInteger(options.wordMs, DEFAULT_FOCUS_WORD_MS, 'wordMs', 120, 2000),
    activeColor: activeColor.trim(),
  };
}

function captionStyle(options = {}) {
  options = captionOptionObject(options);
  const focus = normalizeFocusOptions(options);
  const style = {
    mode: focus.mode,
    appearance: options.appearance || 'panel',
    position: options.position || 'bottom-left',
  };
  if (Number.isFinite(options.bottomOffset) && options.bottomOffset >= 0) {
    style.bottomOffset = Math.round(options.bottomOffset);
  }
  if (focus.mode === 'focus') {
    style.wordsPerChunk = focus.wordsPerChunk;
    style.wordMs = focus.wordMs;
    style.activeColor = focus.activeColor;
  }
  return style;
}

function splitCaptionWords(text) {
  const value = String(text).trim();
  if (!value) return [];
  if (/\s/u.test(value) || typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return value.split(/\s+/u).filter(Boolean);
  }

  const words = [];
  let prefix = '';
  for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)) {
    if (part.isWordLike) {
      words.push(`${prefix}${part.segment}`);
      prefix = '';
    } else if (words.length) {
      words[words.length - 1] += part.segment;
    } else {
      prefix += part.segment;
    }
  }
  if (prefix) words.push(prefix);
  return words.length ? words : [value];
}

function focusFrame(caption, atMs, focusWords, activeWordIndex, condensed = false) {
  return {
    atMs,
    text: focusWords.join(' '),
    sourceAtMs: caption.atMs,
    sourceText: caption.text,
    options: {
      focusWords,
      activeWordIndex,
      fullText: caption.text,
      condensed,
    },
  };
}

function captionChunks(words, wordsPerChunk) {
  const chunks = [];
  for (let index = 0; index < words.length; index += wordsPerChunk) {
    chunks.push(words.slice(index, index + wordsPerChunk));
  }
  return chunks;
}

function buildFocusCaptionFrames(caption, words, nextAtMs, focus) {
  const availableMs = nextAtMs - caption.atMs;
  const hasBoundary = Number.isFinite(availableMs);
  const desiredMs = words.length * focus.wordMs;
  let cadenceMs = focus.wordMs;

  if (hasBoundary && availableMs < desiredMs) {
    cadenceMs = Math.floor(availableMs / words.length);
  }
  if (!hasBoundary || cadenceMs >= MIN_FOCUS_FRAME_MS) {
    return words.map((_word, wordIndex) => {
      const chunkStart = Math.floor(wordIndex / focus.wordsPerChunk) * focus.wordsPerChunk;
      return focusFrame(
        caption,
        caption.atMs + (wordIndex * cadenceMs),
        words.slice(chunkStart, chunkStart + focus.wordsPerChunk),
        wordIndex - chunkStart,
      );
    });
  }

  const chunks = captionChunks(words, focus.wordsPerChunk);
  const chunkCadenceMs = Math.floor(availableMs / chunks.length);
  if (chunkCadenceMs >= MIN_FOCUS_FRAME_MS) {
    return chunks.map((chunk, index) => focusFrame(
      caption,
      caption.atMs + (index * chunkCadenceMs),
      chunk,
      0,
    ));
  }

  return [focusFrame(caption, caption.atMs, words, 0, true)];
}

function buildCaptionFrames(schedule = [], options = {}) {
  const focus = normalizeFocusOptions(options);
  if (focus.mode === 'static') {
    return schedule.map((caption) => ({
      ...caption,
      sourceAtMs: caption.atMs,
      sourceText: caption.text,
      options: {},
    }));
  }

  const frames = [];
  schedule.forEach((caption, captionIndex) => {
    const words = splitCaptionWords(caption.text);
    const nextAtMs = schedule[captionIndex + 1] ? schedule[captionIndex + 1].atMs : Number.POSITIVE_INFINITY;
    if (!words.length) {
      frames.push({
        ...caption,
        sourceAtMs: caption.atMs,
        sourceText: caption.text,
        options: {},
      });
      return;
    }
    frames.push(...buildFocusCaptionFrames(caption, words, nextAtMs, focus));
  });
  return frames;
}

function analyzeFocusCaptionDensity(schedule = [], options = {}) {
  const focus = normalizeFocusOptions(options);
  if (focus.mode !== 'focus') return [];

  return schedule.flatMap((caption, index) => {
    const next = schedule[index + 1];
    if (!next) return [];
    const wordCount = splitCaptionWords(caption.text).length;
    const availableMs = next.atMs - caption.atMs;
    const recommendedMs = wordCount * focus.wordMs;
    if (!wordCount || availableMs >= recommendedMs) return [];
    return [{ index, wordCount, availableMs, recommendedMs }];
  });
}

function buildCaptionTimeline(frames = [], { startMs = 0, endMs = null } = {}) {
  return frames.flatMap((frame, index) => {
    const nextFrameAtMs = frames[index + 1] ? frames[index + 1].atMs : null;
    const nextAtMs = nextFrameAtMs == null
      ? endMs
      : endMs == null ? nextFrameAtMs : Math.min(nextFrameAtMs, endMs);
    if (nextAtMs != null && nextAtMs <= startMs) return [];
    const atMs = Math.max(frame.atMs, startMs) - startMs;
    const frameEndMs = nextAtMs == null ? null : Math.max(nextAtMs, startMs) - startMs;
    if (frameEndMs != null && frameEndMs <= atMs) return [];
    const focusWords = Array.isArray(frame.options.focusWords) ? frame.options.focusWords : null;
    return [{
      at: atMs / 1000,
      atMs,
      ...(frameEndMs == null ? {} : { endAt: frameEndMs / 1000, endMs: frameEndMs }),
      text: frame.text,
      sourceText: frame.sourceText,
      words: focusWords || splitCaptionWords(frame.text),
      activeWordIndex: focusWords ? frame.options.activeWordIndex : null,
      condensed: !!frame.options.condensed,
    }];
  });
}

module.exports = {
  DEFAULT_FOCUS_ACTIVE_COLOR,
  DEFAULT_FOCUS_WORD_MS,
  DEFAULT_FOCUS_WORDS_PER_CHUNK,
  MIN_FOCUS_FRAME_MS,
  analyzeFocusCaptionDensity,
  buildCaptionFrames,
  buildCaptionTimeline,
  captionStyle,
  normalizeFocusOptions,
  splitCaptionWords,
};
