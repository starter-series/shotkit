import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeTarget,
  createCampaignState,
  initializeSelection,
  productionStatus,
  selectRecipeInState,
  selectedTargets,
  setCampaignView,
  shouldPoll,
  statusLabel,
} from '../campaign/model.js';
import {
  buildReviewPayload,
  buildRunPayload,
  requestJson,
} from '../campaign/api.js';

function target(id, overrides = {}) {
  return {
    id,
    machineStatus: 'not-ready',
    publishable: false,
    reviewable: false,
    review: { status: 'not-requested', decision: null },
    ...overrides,
  };
}

function campaignDocument() {
  return {
    phase: 'plan',
    selection: { recipeId: 'launch', persisted: true },
    recipes: [
      { id: 'other', targets: [target('cws')] },
      { id: 'launch', targets: [target('x'), target('youtube-shorts')] },
    ],
    run: { status: 'idle', recipeId: null, targets: [] },
  };
}

test('campaign selection preserves the active target until the recipe changes', () => {
  const state = createCampaignState();
  state.document = campaignDocument();

  assert.equal(initializeSelection(state).id, 'launch');
  assert.deepEqual(selectedTargets(state).map((item) => item.id), ['x', 'youtube-shorts']);
  assert.equal(activeTarget(state).id, 'x');

  state.activeTargetId = 'youtube-shorts';
  initializeSelection(state);
  assert.equal(activeTarget(state).id, 'youtube-shorts');

  assert.equal(selectRecipeInState(state, 'other'), true);
  assert.equal(activeTarget(state).id, 'cws');
  state.busy = true;
  assert.equal(selectRecipeInState(state, 'launch'), false);
  assert.equal(state.recipeId, 'other');
});

test('production status honors approval, feedback, current run, and machine fallback order', () => {
  const state = createCampaignState();
  state.document = campaignDocument();
  initializeSelection(state);
  const output = selectedTargets(state)[0];

  assert.equal(productionStatus(state, output), 'not-ready');
  output.reviewable = true;
  assert.equal(productionStatus(state, output), 'publish-ready');
  state.document.run = {
    status: 'running',
    recipeId: 'launch',
    targets: [{ target: 'x', status: 'running' }],
  };
  assert.equal(productionStatus(state, output), 'running');
  output.review.status = 'changes-requested';
  assert.equal(productionStatus(state, output), 'changes-requested');
  output.publishable = true;
  assert.equal(productionStatus(state, output), 'approved');
});

test('campaign view and polling rules stay constrained to known workflow phases', () => {
  const state = createCampaignState();
  assert.equal(setCampaignView(state, 'timeline'), false);
  assert.equal(state.view, 'plan');
  state.document = campaignDocument();
  assert.equal(shouldPoll(state), false);
  state.document.run.status = 'running';
  assert.equal(shouldPoll(state), true);
  state.document.run.status = 'idle';
  state.document.phase = 'production';
  setCampaignView(state, 'production');
  assert.equal(shouldPoll(state), true);
  assert.equal(statusLabel('changes-requested'), 'Agent working');
  assert.equal(statusLabel('unknown'), 'Preparing');
});

test('review payload binds each decision to the current asset and profile digests', () => {
  const targets = [
    { id: 'x', assetDigest: 'asset-x', profileHash: 'profile-x' },
    { id: 'youtube-shorts', assetDigest: 'asset-shorts' },
  ];
  assert.deepEqual(buildRunPayload('launch'), { recipeId: 'launch' });
  assert.deepEqual(buildReviewPayload({
    recipeId: 'launch',
    targets,
    status: 'changes-requested',
    note: 'Move the caption up.',
  }), {
    recipeId: 'launch',
    candidates: [
      { target: 'x', assetDigest: 'asset-x', profileHash: 'profile-x' },
      { target: 'youtube-shorts', assetDigest: 'asset-shorts' },
    ],
    status: 'changes-requested',
    note: 'Move the caption up.',
  });
  assert.equal('note' in buildReviewPayload({
    recipeId: 'launch',
    targets,
    status: 'approved',
    note: 'ignored',
  }), false);
});

test('API requests serialize JSON and surface server errors', async () => {
  let request;
  const payload = await requestJson('/api/example', {
    method: 'POST',
    body: { ready: true },
  }, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, value: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(payload, { ok: true, value: 3 });
  assert.equal(request.url, '/api/example');
  assert.equal(request.options.body, JSON.stringify({ ready: true }));
  assert.equal(request.options.headers['Content-Type'], 'application/json');

  await assert.rejects(() => requestJson('/api/example', {}, async () => (
    new Response(JSON.stringify({ ok: false, error: 'stale candidate' }), { status: 409 })
  )), /stale candidate/);
});
