export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function keyFor(target) {
  return `${target.story}::${target.target}`;
}

export function profileDefaults(target) {
  const style = target.captionStyle || {};
  const source = clone(target.profile || {});
  return {
    layoutPreset: source.layoutPreset || target.layouts[0] || 'default',
    framing: {
      scale: source.framing && Number.isFinite(source.framing.scale) ? source.framing.scale : 1,
      focusX: source.framing && Number.isFinite(source.framing.focusX) ? source.framing.focusX : 0.5,
      focusY: source.framing && Number.isFinite(source.framing.focusY) ? source.framing.focusY : 0.5,
    },
    captionOptions: {
      position: source.captionOptions && source.captionOptions.position || style.position || 'bottom-left',
      appearance: source.captionOptions && source.captionOptions.appearance || style.appearance || 'panel',
      bottomOffset: source.captionOptions && Number.isInteger(source.captionOptions.bottomOffset)
        ? source.captionOptions.bottomOffset
        : Number.isInteger(style.bottomOffset) ? style.bottomOffset : 80,
    },
    protectedRegions: Array.isArray(source.protectedRegions) ? source.protectedRegions : [],
    ...(source.verification ? { verification: source.verification } : {}),
  };
}

export function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
