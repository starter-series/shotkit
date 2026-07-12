function normalizeSetup(result) {
  if (!result) return { env: {}, teardown: async () => {} };
  if (typeof result.teardown === 'function') {
    return { env: result.env || {}, teardown: result.teardown };
  }
  return { env: result.env || result, teardown: async () => {} };
}

module.exports = { normalizeSetup };
