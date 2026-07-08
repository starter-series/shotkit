const { normalizeDemoCaptions, parseTimeToMs } = require('../demo');

function demoAudience(demoConfig) {
  return demoConfig.audience || demoConfig.channel || 'sns';
}

function demoNextTool(demoConfig) {
  if (demoConfig.nextTool) return demoConfig.nextTool;
  if (demoConfig.handoff && demoConfig.handoff.nextTool) return demoConfig.handoff.nextTool;
  return 'manual-editor';
}

// The delivered mp4/webm has trim.start cut off its head, so caption/beat times
// in the handoff contract must be relative to the DELIVERABLE, not the raw
// recording. Returns 0 unless trim is an object with a parseable start.
function trimStartMs(demoConfig) {
  const trim = demoConfig.trim;
  if (!trim || typeof trim !== 'object' || trim.start == null) return 0;
  try {
    return parseTimeToMs(trim.start, 'trim.start');
  } catch (_e) {
    return 0;
  }
}

// Shift caption times by the trimmed-off prefix and drop captions that fall
// before the clip starts (they are not in the deliverable). Output conforms to
// the beat/caption schema: at >= 0 (number), atMs >= 0 (integer).
function deliverableBeats(captions, startMs) {
  return captions
    .map((caption) => ({ atMs: caption.atMs - startMs, text: caption.text }))
    .filter((beat) => beat.atMs >= 0)
    .map((beat) => ({ at: beat.atMs / 1000, atMs: beat.atMs, text: beat.text }));
}

// Coerce loosely-typed demo config into the storyboard schema's shape: preset
// must be a string (object presets are omitted), trim object|null, thumbnail
// object|boolean|null (a bare number becomes { at }).
function storyboardPreset(preset) {
  return typeof preset === 'string' ? preset : undefined;
}
function storyboardTrim(trim) {
  return trim && typeof trim === 'object' ? trim : null;
}
function storyboardThumbnail(thumbnail) {
  if (typeof thumbnail === 'number') return { at: thumbnail };
  return thumbnail || null;
}

function demoStoryboard(demoConfig, viewport) {
  const captions = normalizeDemoCaptions(demoConfig.captions || []);
  const startMs = trimStartMs(demoConfig);
  return {
    name: demoConfig.name,
    audience: demoAudience(demoConfig),
    preset: storyboardPreset(demoConfig.preset),
    viewport,
    recommendedNextTool: demoNextTool(demoConfig),
    trim: storyboardTrim(demoConfig.trim),
    framing: {
      crop: demoConfig.crop || null,
      zoom: demoConfig.zoom || null,
    },
    thumbnail: storyboardThumbnail(demoConfig.thumbnail),
    recommendedStory: {
      durationSeconds: { min: 20, max: 40 },
      shape: ['result-first', 'action', 'proof', 'safety-restore'],
    },
    beats: deliverableBeats(captions, startMs),
    guidance: demoConfig.guidance || null,
  };
}

function demoCaptions(demoConfig) {
  const startMs = trimStartMs(demoConfig);
  return {
    name: demoConfig.name,
    captions: deliverableBeats(normalizeDemoCaptions(demoConfig.captions || []), startMs),
  };
}

function storyboardLintSummary(warnings) {
  return Object.entries(warnings || {}).map(([name, items]) => ({
    name,
    ok: !items.length,
    warnings: items,
  }));
}

module.exports = {
  demoCaptions,
  demoStoryboard,
  storyboardLintSummary,
};
