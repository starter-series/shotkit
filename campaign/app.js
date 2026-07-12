import {
  activeTarget,
  createCampaignState,
  initializeSelection,
  selectRecipeInState,
  selectedRecipe,
  selectedTargets,
  setCampaignView,
  shouldPoll,
} from './model.js';
import {
  buildReviewPayload,
  loadCampaign,
  startCampaign,
  submitCampaignReview,
} from './api.js';
import { createCampaignRenderer } from './render.js';

const state = createCampaignState();
const renderer = createCampaignRenderer({
  state,
  onSelectRecipe: selectRecipe,
  onSelectTarget: selectTarget,
});
const { elements } = renderer;

function setBusy(busy, label) {
  state.busy = busy;
  renderer.renderBusy();
  if (label) renderer.setConnection(label, busy ? 'busy' : 'ready');
}

function selectRecipe(recipeId) {
  if (!selectRecipeInState(state, recipeId)) return;
  renderer.renderPlan();
  renderer.renderNavigation();
}

function selectTarget(targetId) {
  state.activeTargetId = targetId;
  renderer.renderReview();
}

function setView(view) {
  if (!setCampaignView(state, view)) return;
  renderer.renderView();
  schedulePoll();
}

async function loadState({ followPhase = true } = {}) {
  try {
    state.document = await loadCampaign();
    renderer.renderDocumentChrome();
    initializeSelection(state);
    if (followPhase) {
      setCampaignView(state, state.document.phase === 'complete' ? 'review' : state.document.phase);
    }
    renderer.render();
    const running = state.document.run.status === 'running';
    renderer.setConnection(running ? 'Producing' : 'Local', running ? 'busy' : 'ready');
  } catch (error) {
    renderer.setConnection('Offline', 'error');
    renderer.showNotice('Could not load campaign', error.message);
  } finally {
    renderer.markLoaded();
    schedulePoll();
  }
}

function schedulePoll() {
  if (state.pollTimer) window.clearTimeout(state.pollTimer);
  state.pollTimer = null;
  if (!shouldPoll(state)) return;
  state.pollTimer = window.setTimeout(() => loadState({ followPhase: true }), 1500);
}

async function startProduction() {
  const recipe = selectedRecipe(state);
  if (!recipe || state.busy) return;
  setBusy(true, 'Starting');
  try {
    await startCampaign(recipe.id);
    state.view = 'production';
    await loadState({ followPhase: true });
  } catch (error) {
    renderer.showNotice('Production did not start', error.message);
  } finally {
    setBusy(false, 'Local');
    renderer.renderNavigation();
  }
}

async function review(status, targetIds) {
  const recipe = selectedRecipe(state);
  if (!recipe || state.busy) return;
  const note = renderer.reviewNote();
  if (status === 'changes-requested' && !note) {
    renderer.focusReviewNote();
    renderer.showNotice('Feedback required', 'Describe what the agent should change.');
    return;
  }
  setBusy(true, status === 'approved' ? 'Approving' : 'Submitting');
  try {
    const targets = targetIds.map((targetId) => (
      selectedTargets(state).find((target) => target.id === targetId)
    ));
    const response = await submitCampaignReview(buildReviewPayload({
      recipeId: recipe.id,
      targets,
      status,
      note,
    }));
    state.document = response.campaign;
    if (status === 'changes-requested') state.view = 'production';
    renderer.render();
    schedulePoll();
  } catch (error) {
    renderer.showNotice('Review was not saved', error.message);
  } finally {
    setBusy(false, 'Local');
    if (state.view === 'review') renderer.renderReview();
  }
}

for (const tab of elements.tabs) {
  tab.addEventListener('click', () => {
    if (!tab.disabled) setView(tab.dataset.view);
  });
}
elements.startButton.addEventListener('click', startProduction);
elements.openReviewButton.addEventListener('click', () => setView('review'));
elements.retryButton.addEventListener('click', startProduction);
elements.requestChangesButton.addEventListener('click', () => {
  const target = activeTarget(state);
  if (target) review('changes-requested', [target.id]);
});
elements.approveButton.addEventListener('click', () => review('approved', [...state.targets]));
elements.noticeClose.addEventListener('click', renderer.dismissNotice);

loadState();
