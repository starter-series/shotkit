function normalizeDelayMs(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`shotkit: demo ${label} must be a non-negative number of milliseconds`);
  }
  return Math.round(value);
}

function parseTimeToMs(value, label = 'time') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) throw new Error(`shotkit: demo caption ${label} must be >= 0`);
    return Math.round(value * 1000);
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`shotkit: demo caption ${label} must be a number of seconds or a time string`);
  }

  const raw = value.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return parseTimeToMs(Number(raw), label);

  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  const [hours, minutes, seconds] = parts.length === 3 ? nums : [0, nums[0], nums[1]];
  if (minutes >= 60 || seconds >= 60) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

function normalizeDemoCaptions(captions = []) {
  if (!captions) return [];
  if (!Array.isArray(captions)) throw new Error('shotkit: demo.captions must be an array');
  return captions
    .map((caption, index) => {
      if (!caption || caption.at == null) {
        throw new Error(`shotkit: demo.captions[${index}] needs an at time`);
      }
      if (caption.text == null) {
        throw new Error(`shotkit: demo.captions[${index}] needs text`);
      }
      return {
        atMs: parseTimeToMs(caption.at, `at for captions[${index}]`),
        text: String(caption.text),
      };
    })
    .sort((a, b) => a.atMs - b.atMs);
}

module.exports = { normalizeDelayMs, normalizeDemoCaptions, parseTimeToMs };
