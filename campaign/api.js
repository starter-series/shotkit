export async function requestJson(url, options = {}, fetchImpl = globalThis.fetch) {
  const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');
  const body = hasBody && typeof options.body !== 'string'
    ? JSON.stringify(options.body)
    : options.body;
  const response = await fetchImpl(url, {
    ...options,
    ...(hasBody ? { body } : {}),
    headers: hasBody
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function buildRunPayload(recipeId) {
  return { recipeId };
}

export function buildReviewPayload({ recipeId, targets, status, note = '' }) {
  return {
    recipeId,
    candidates: targets.map((target) => ({
      target: target.id,
      assetDigest: target.assetDigest,
      ...(target.profileHash ? { profileHash: target.profileHash } : {}),
    })),
    status,
    ...(status === 'changes-requested' ? { note } : {}),
  };
}

export function loadCampaign() {
  return requestJson('/api/campaign');
}

export function startCampaign(recipeId) {
  return requestJson('/api/campaign/run', {
    method: 'POST',
    body: buildRunPayload(recipeId),
  });
}

export function submitCampaignReview(payload) {
  return requestJson('/api/campaign/review', {
    method: 'POST',
    body: payload,
  });
}
