import {
  activeTarget,
  formatViewport,
  productionStatus,
  selectedRecipe,
  selectedTargets,
  statusLabel,
} from './model.js';

const $ = (id) => document.getElementById(id);

function bindElements() {
  return {
    app: $('app'),
    projectName: $('projectName'),
    connectionState: $('connectionState'),
    advancedLink: $('advancedLink'),
    tabs: [...document.querySelectorAll('.step')],
    views: [...document.querySelectorAll('.view')],
    planTab: $('planTab'),
    productionTab: $('productionTab'),
    reviewTab: $('reviewTab'),
    recipeCount: $('recipeCount'),
    recipeGrid: $('recipeGrid'),
    selectedRecipeName: $('selectedRecipeName'),
    recipeDescription: $('recipeDescription'),
    channelCount: $('channelCount'),
    channelList: $('channelList'),
    planOutputCount: $('planOutputCount'),
    planFormatSummary: $('planFormatSummary'),
    startButton: $('startButton'),
    productionTitle: $('productionTitle'),
    runState: $('runState'),
    progressTrack: $('progressTrack'),
    progressBar: $('progressBar'),
    targetProgressList: $('targetProgressList'),
    productionOutputCount: $('productionOutputCount'),
    readyOutputCount: $('readyOutputCount'),
    reviewOutputCount: $('reviewOutputCount'),
    runMessage: $('runMessage'),
    retryButton: $('retryButton'),
    openReviewButton: $('openReviewButton'),
    reviewTitle: $('reviewTitle'),
    approvalState: $('approvalState'),
    reviewTargetTabs: $('reviewTargetTabs'),
    mediaStage: $('mediaStage'),
    reviewVideo: $('reviewVideo'),
    reviewImage: $('reviewImage'),
    mediaPlaceholder: $('mediaPlaceholder'),
    reviewTargetName: $('reviewTargetName'),
    targetReviewState: $('targetReviewState'),
    reviewPlatform: $('reviewPlatform'),
    reviewFormat: $('reviewFormat'),
    reviewQa: $('reviewQa'),
    reviewWarnings: $('reviewWarnings'),
    reviewNote: $('reviewNote'),
    requestChangesButton: $('requestChangesButton'),
    approveButton: $('approveButton'),
    emptyView: $('emptyView'),
    notice: $('notice'),
    noticeTitle: $('noticeTitle'),
    noticeMessage: $('noticeMessage'),
    noticeClose: $('noticeClose'),
  };
}

export function createCampaignRenderer({ state, onSelectRecipe, onSelectTarget }) {
  const elements = bindElements();
  let noticeReturnFocus = null;

  function showNotice(title, message) {
    if (elements.notice.hidden && document.activeElement instanceof HTMLElement) {
      noticeReturnFocus = document.activeElement;
    }
    elements.noticeTitle.textContent = title;
    elements.noticeMessage.textContent = message;
    elements.notice.hidden = false;
    elements.noticeClose.focus();
  }

  function dismissNotice() {
    elements.notice.hidden = true;
    if (noticeReturnFocus && noticeReturnFocus.isConnected) noticeReturnFocus.focus();
    noticeReturnFocus = null;
  }

  function setConnection(label, tone = 'ready') {
    elements.connectionState.className = `connection is-${tone}`;
    elements.connectionState.querySelector('span').textContent = label;
  }

  function renderBusy() {
    const target = activeTarget(state);
    const targets = selectedTargets(state);
    elements.startButton.disabled = state.busy || !state.recipeId || state.targets.size === 0;
    elements.requestChangesButton.disabled = state.busy || !target || !target.reviewable;
    elements.approveButton.disabled = state.busy || !targets.length
      || !targets.every((item) => item.reviewable);
  }

  function recipeCard(recipe) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recipe-card';
    button.setAttribute('aria-pressed', recipe.id === state.recipeId ? 'true' : 'false');

    const preview = document.createElement('div');
    preview.className = 'recipe-preview';
    if (recipe.previewUrl) {
      const image = document.createElement('img');
      image.src = recipe.previewUrl;
      image.alt = '';
      preview.appendChild(image);
    } else {
      const visual = document.createElement('span');
      visual.className = 'recipe-visual';
      visual.setAttribute('aria-hidden', 'true');
      preview.appendChild(visual);
    }

    const body = document.createElement('span');
    body.className = 'recipe-card-body';
    const name = document.createElement('strong');
    name.textContent = recipe.name;
    const story = document.createElement('span');
    story.className = 'recipe-story';
    story.textContent = recipe.story;
    const description = document.createElement('span');
    description.className = 'recipe-card-description';
    description.textContent = recipe.description || `${recipe.targets.length} channel outputs`;
    const targets = document.createElement('span');
    targets.className = 'recipe-targets';
    for (const target of recipe.targets) {
      const label = document.createElement('span');
      label.textContent = target.id;
      targets.appendChild(label);
    }
    body.append(name, story, description, targets);
    button.append(preview, body);
    button.addEventListener('click', () => onSelectRecipe(recipe.id));
    return button;
  }

  function channelOption(target) {
    const row = document.createElement('div');
    row.className = 'channel-option';
    const mark = document.createElement('span');
    mark.className = 'channel-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = target.label;
    const platform = document.createElement('small');
    platform.textContent = target.platform;
    copy.append(name, platform);
    const format = document.createElement('span');
    format.className = 'channel-format';
    format.textContent = formatViewport(target.viewport);
    row.append(mark, copy, format);
    return row;
  }

  function renderPlan() {
    const recipes = state.document.recipes;
    const restoreRecipeFocus = elements.recipeGrid.contains(document.activeElement);
    elements.recipeCount.textContent = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;
    elements.recipeGrid.replaceChildren(...recipes.map(recipeCard));
    if (restoreRecipeFocus) elements.recipeGrid.querySelector('[aria-pressed="true"]')?.focus();
    const recipe = selectedRecipe(state);
    if (!recipe) return;
    elements.selectedRecipeName.textContent = recipe.name;
    elements.recipeDescription.textContent = recipe.description || recipe.story;
    elements.channelCount.textContent = String(recipe.targets.length);
    const legend = elements.channelList.querySelector('legend');
    elements.channelList.replaceChildren(legend, ...recipe.targets.map(channelOption));
    elements.planOutputCount.textContent = `${recipe.targets.length} output${recipe.targets.length === 1 ? '' : 's'}`;
    elements.planFormatSummary.textContent = recipe.targets.map((target) => target.id).join(' · ');
    elements.startButton.disabled = state.busy || recipe.targets.length === 0;
  }

  function progressRow(target) {
    const status = productionStatus(state, target);
    const row = document.createElement('div');
    row.className = 'target-progress';
    row.dataset.status = status;
    const main = document.createElement('div');
    main.className = 'target-progress-main';
    const icon = document.createElement('span');
    icon.className = 'target-progress-icon';
    icon.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-film"></use></svg>';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = target.label;
    const format = document.createElement('small');
    format.textContent = formatViewport(target.viewport);
    copy.append(name, format);
    main.append(icon, copy);
    const statusNode = document.createElement('span');
    statusNode.className = 'target-progress-status';
    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = statusLabel(status);
    statusNode.append(dot, label);
    row.append(main, statusNode);
    return row;
  }

  function renderProduction() {
    const recipe = selectedRecipe(state);
    if (!recipe) return;
    const targets = selectedTargets(state);
    const run = state.document.run;
    const ready = targets.filter((target) => target.machineStatus === 'publish-ready').length;
    const reviewable = targets.filter((target) => target.reviewable).length;
    const completed = targets.filter((target) => ['publish-ready', 'approved'].includes(
      productionStatus(state, target),
    )).length;
    const hasChangesRequested = targets.some((target) => target.review.status === 'changes-requested');
    elements.productionTitle.textContent = recipe.name;
    elements.targetProgressList.replaceChildren(...targets.map(progressRow));
    const progress = targets.length ? Math.round((completed / targets.length) * 100) : 0;
    elements.progressBar.style.width = `${progress}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(progress));
    elements.productionOutputCount.textContent = String(targets.length);
    elements.readyOutputCount.textContent = String(ready);
    elements.reviewOutputCount.textContent = String(reviewable);
    const ownerRunStatus = hasChangesRequested ? 'needs-fix' : run.status;
    elements.runState.textContent = statusLabel(ownerRunStatus);
    elements.runState.className = `run-state ${ownerRunStatus === 'running' ? 'is-running' : ownerRunStatus === 'completed' ? 'is-complete' : ['failed', 'blocked'].includes(ownerRunStatus) ? 'is-error' : ''}`;
    const allReviewable = !hasChangesRequested && targets.length > 0
      && targets.every((target) => target.reviewable);
    if (allReviewable) elements.runMessage.textContent = 'Final media is ready for your decision.';
    else if (hasChangesRequested) elements.runMessage.textContent = 'Your feedback is saved. The agent must apply it before a revised capture can start.';
    else if (run.status === 'blocked') elements.runMessage.textContent = 'Automatic attempts are exhausted. The agent needs your input on the blocker.';
    else if (run.status === 'needs-fix') elements.runMessage.textContent = 'Technical fixes are waiting for the agent before production can continue.';
    else if (run.status === 'failed') {
      const failure = run.targets.find((target) => target.error);
      elements.runMessage.textContent = failure
        ? `Production failed: ${failure.error}`
        : 'Production failed before final media was ready.';
    }
    else elements.runMessage.textContent = 'The agent is producing and validating each channel output.';
    elements.retryButton.hidden = true;
    elements.openReviewButton.hidden = !allReviewable;
  }

  function targetTab(target) {
    const current = activeTarget(state);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-tab';
    button.setAttribute('aria-pressed', current && target.id === current.id ? 'true' : 'false');
    button.setAttribute('aria-label', `${target.label}, ${statusLabel(target.review.status)}`);
    button.dataset.status = target.review.status;
    button.textContent = target.id;
    button.addEventListener('click', () => onSelectTarget(target.id));
    return button;
  }

  function renderMedia(target) {
    const portrait = target.viewport && target.viewport.height > target.viewport.width;
    elements.mediaStage.dataset.orientation = portrait ? 'portrait' : 'landscape';
    if (target.viewport) {
      elements.mediaStage.style.setProperty('--media-ratio', `${target.viewport.width} / ${target.viewport.height}`);
    }
    elements.reviewVideo.pause();
    elements.reviewVideo.hidden = true;
    elements.reviewImage.hidden = true;
    elements.mediaPlaceholder.hidden = true;
    elements.reviewVideo.removeAttribute('src');
    elements.reviewImage.removeAttribute('src');
    elements.reviewVideo.setAttribute('aria-label', `${target.label} campaign output video`);
    elements.reviewImage.alt = `${target.label} campaign output preview`;
    if (target.videoUrl) {
      elements.reviewVideo.src = target.videoUrl;
      elements.reviewVideo.poster = target.thumbnailUrl || '';
      elements.reviewVideo.hidden = false;
      elements.reviewVideo.load();
    } else if (target.thumbnailUrl) {
      elements.reviewImage.src = target.thumbnailUrl;
      elements.reviewImage.hidden = false;
    } else {
      elements.mediaPlaceholder.hidden = false;
    }
  }

  function renderReview() {
    const recipe = selectedRecipe(state);
    const targets = selectedTargets(state);
    if (!recipe || !targets.length) return;
    if (!targets.some((target) => target.id === state.activeTargetId)) {
      state.activeTargetId = targets[0].id;
    }
    const target = activeTarget(state);
    if (state.document.calibratorAvailable) {
      elements.advancedLink.href = `/?story=${encodeURIComponent(recipe.story)}&target=${encodeURIComponent(target.id)}`;
    }
    elements.reviewTitle.textContent = recipe.name;
    const restoreTargetFocus = elements.reviewTargetTabs.contains(document.activeElement);
    elements.reviewTargetTabs.replaceChildren(...targets.map(targetTab));
    if (restoreTargetFocus) elements.reviewTargetTabs.querySelector('[aria-pressed="true"]')?.focus();
    renderMedia(target);
    elements.reviewTargetName.textContent = target.label;
    elements.reviewPlatform.textContent = target.platform;
    elements.reviewFormat.textContent = formatViewport(target.viewport);
    elements.reviewQa.textContent = target.reviewable ? 'Passed' : statusLabel(target.machineStatus);
    const reviewStatus = target.review.status;
    elements.targetReviewState.textContent = statusLabel(reviewStatus);
    elements.targetReviewState.className = `target-review-state ${reviewStatus === 'approved' ? 'is-approved' : reviewStatus === 'changes-requested' ? 'is-changes' : target.reviewable ? 'is-ready' : ''}`;
    const warnings = target.warnings || [];
    if (warnings.length) {
      elements.reviewWarnings.replaceChildren(...warnings.map((warning) => {
        const item = document.createElement('li');
        item.textContent = warning.message || String(warning);
        return item;
      }));
    } else {
      const clear = document.createElement('li');
      clear.className = 'is-clear';
      clear.textContent = 'Automated checks passed';
      elements.reviewWarnings.replaceChildren(clear);
    }
    elements.reviewNote.value = target.review.decision && target.review.decision.note
      ? target.review.decision.note
      : '';
    const allApproved = targets.every((item) => item.publishable);
    elements.approvalState.textContent = allApproved ? 'Approved' : 'Awaiting decision';
    elements.approvalState.className = `approval-state ${allApproved ? 'is-approved' : ''}`;
    elements.requestChangesButton.disabled = state.busy || !target.reviewable;
    elements.approveButton.disabled = state.busy || !targets.every((item) => item.reviewable) || allApproved;
  }

  function renderNavigation() {
    const recipe = selectedRecipe(state);
    const persisted = !!(state.document.selection && state.document.selection.persisted);
    const targets = selectedTargets(state);
    const reviewReady = targets.length > 0 && targets.every((target) => target.reviewable);
    elements.productionTab.disabled = !persisted;
    elements.reviewTab.disabled = !reviewReady;
    elements.startButton.disabled = state.busy || !recipe || !targets.length;
  }

  function renderView() {
    for (const tab of elements.tabs) {
      if (tab.dataset.view === state.view) tab.setAttribute('aria-current', 'step');
      else tab.removeAttribute('aria-current');
    }
    for (const panel of elements.views) panel.hidden = panel.dataset.view !== state.view;
    if (state.view === 'review') renderReview();
  }

  function render() {
    const hasRecipes = state.document.recipes.length > 0;
    elements.emptyView.hidden = hasRecipes;
    for (const tab of elements.tabs) {
      if (tab.dataset.view === state.view) tab.setAttribute('aria-current', 'step');
      else tab.removeAttribute('aria-current');
    }
    for (const view of elements.views) view.hidden = !hasRecipes || view.dataset.view !== state.view;
    if (!hasRecipes) return;
    renderPlan();
    renderProduction();
    renderNavigation();
    if (state.view === 'review') renderReview();
  }

  function renderDocumentChrome() {
    elements.projectName.textContent = state.document.project || 'Project';
    elements.advancedLink.hidden = !state.document.calibratorAvailable;
  }

  function markLoaded() {
    elements.app.setAttribute('aria-busy', state.busy ? 'true' : 'false');
  }

  function reviewNote() {
    return elements.reviewNote.value.trim();
  }

  function focusReviewNote() {
    elements.reviewNote.focus();
  }

  return {
    elements,
    dismissNotice,
    focusReviewNote,
    markLoaded,
    render,
    renderBusy,
    renderDocumentChrome,
    renderNavigation,
    renderPlan,
    renderReview,
    renderView,
    reviewNote,
    setConnection,
    showNotice,
  };
}
