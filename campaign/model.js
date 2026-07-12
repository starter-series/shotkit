export const CAMPAIGN_VIEWS = Object.freeze(['plan', 'production', 'review']);

export function createCampaignState() {
  return {
    document: null,
    recipeId: null,
    targets: new Set(),
    activeTargetId: null,
    view: 'plan',
    busy: false,
    pollTimer: null,
  };
}

export function selectedRecipe(state) {
  return state.document
    ? state.document.recipes.find((recipe) => recipe.id === state.recipeId) || null
    : null;
}

export function selectedTargets(state) {
  const recipe = selectedRecipe(state);
  return recipe ? recipe.targets.filter((target) => state.targets.has(target.id)) : [];
}

export function activeTarget(state) {
  const targets = selectedTargets(state);
  return targets.find((target) => target.id === state.activeTargetId) || targets[0] || null;
}

export function selectRecipeInState(state, recipeId) {
  if (!state.document || state.busy) return false;
  const recipe = state.document.recipes.find((item) => item.id === recipeId);
  if (!recipe) return false;
  state.recipeId = recipe.id;
  state.targets = new Set(recipe.targets.map((target) => target.id));
  state.activeTargetId = recipe.targets[0] ? recipe.targets[0].id : null;
  return true;
}

export function initializeSelection(state) {
  if (!state.document) return null;
  const selected = state.document.selection;
  const recipe = state.document.recipes.find((item) => item.id === (selected && selected.recipeId))
    || state.document.recipes[0];
  if (!recipe) return null;
  const recipeChanged = state.recipeId !== recipe.id;
  state.recipeId = recipe.id;
  state.targets = new Set(recipe.targets.map((target) => target.id));
  if (recipeChanged || !state.activeTargetId) {
    state.activeTargetId = recipe.targets[0] ? recipe.targets[0].id : null;
  }
  return recipe;
}

export function setCampaignView(state, view) {
  if (!CAMPAIGN_VIEWS.includes(view)) return false;
  state.view = view;
  return true;
}

export function formatViewport(viewport) {
  return viewport ? `${viewport.width} x ${viewport.height}` : 'Configured output';
}

export function statusLabel(status) {
  const labels = {
    idle: 'Ready',
    queued: 'Queued',
    running: 'Agent working',
    'publish-ready': 'Ready',
    completed: 'Ready to review',
    'needs-fix': 'Agent working',
    failed: 'Needs attention',
    blocked: 'Needs attention',
    approved: 'Approved',
    'awaiting-approval': 'Ready to review',
    'changes-requested': 'Agent working',
    'not-requested': 'Queued',
    'not-ready': 'Preparing',
  };
  return labels[status] || 'Preparing';
}

export function productionStatus(state, target) {
  if (target.publishable) return 'approved';
  if (target.review.status === 'changes-requested') return 'changes-requested';
  const run = state.document.run;
  const current = run.recipeId === state.recipeId
    ? run.targets.find((item) => item.target === target.id)
    : null;
  if (current) return current.status;
  if (target.reviewable) return 'publish-ready';
  return target.machineStatus;
}

export function shouldPoll(state) {
  return !!state.document && (
    state.document.run.status === 'running'
    || (state.view === 'production' && state.document.phase === 'production')
  );
}
