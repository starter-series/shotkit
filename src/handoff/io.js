const fs = require('fs');

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch (_e) {
    return null;
  }
}

// Union by key, with the current run's entries winning — preserves prior
// entries this run did not touch, so a partial re-run does not clobber them.
function mergeByKey(prev, next, keyOf) {
  if (!Array.isArray(prev) || !prev.length) return next;
  const nextKeys = new Set(next.map(keyOf));
  const kept = prev.filter((item) => item && !nextKeys.has(keyOf(item)));
  return [...kept, ...next];
}

module.exports = {
  mergeByKey,
  readJsonIfExists,
  writeJson,
};
