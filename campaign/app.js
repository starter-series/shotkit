(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const elements = {
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

  const state = {
    document: null,
    recipeId: null,
    targets: new Set(),
    activeTargetId: null,
    view: 'plan',
    busy: false,
    pollTimer: null,
  };

  function showNotice(title, message) {
    elements.noticeTitle.textContent = title;
    elements.noticeMessage.textContent = message;
    elements.notice.hidden = false;
  }

  function setConnection(label, tone = 'ready') {
    elements.connectionState.className = `connection is-${tone}`;
    elements.connectionState.querySelector('span').textContent = label;
  }

  function setBusy(busy, label) {
    state.busy = busy;
    elements.startButton.disabled = busy || !state.recipeId || state.targets.size === 0;
    elements.requestChangesButton.disabled = busy || !activeTarget() || !activeTarget().reviewable;
    elements.approveButton.disabled = busy || !selectedTargets().length
      || !selectedTargets().every((target) => target.reviewable);
    if (label) setConnection(label, busy ? 'busy' : 'ready');
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: options.body
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options.headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  function selectedRecipe() {
    return state.document && state.document.recipes.find((recipe) => recipe.id === state.recipeId);
  }

  function selectedTargets() {
    const recipe = selectedRecipe();
    return recipe ? recipe.targets.filter((target) => state.targets.has(target.id)) : [];
  }

  function activeTarget() {
    const targets = selectedTargets();
    return targets.find((target) => target.id === state.activeTargetId) || targets[0] || null;
  }

  function setView(view) {
    if (!['plan', 'production', 'review'].includes(view)) return;
    state.view = view;
    for (const tab of elements.tabs) {
      tab.setAttribute('aria-selected', tab.dataset.view === view ? 'true' : 'false');
    }
    for (const panel of elements.views) panel.hidden = panel.dataset.view !== view;
    if (view === 'review') renderReview();
    schedulePoll();
  }

  function formatViewport(viewport) {
    return viewport ? `${viewport.width} x ${viewport.height}` : 'Configured output';
  }

  function statusLabel(status) {
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

  function recipeCard(recipe) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recipe-card';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', recipe.id === state.recipeId ? 'true' : 'false');

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
    button.addEventListener('click', () => selectRecipe(recipe.id));
    return button;
  }

  function selectRecipe(recipeId) {
    const recipe = state.document.recipes.find((item) => item.id === recipeId);
    if (!recipe || state.busy) return;
    state.recipeId = recipe.id;
    state.targets = new Set(recipe.targets.map((target) => target.id));
    state.activeTargetId = recipe.targets[0] ? recipe.targets[0].id : null;
    renderPlan();
    renderNavigation();
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
    elements.recipeCount.textContent = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;
    elements.recipeGrid.replaceChildren(...recipes.map(recipeCard));
    const recipe = selectedRecipe();
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

  function productionStatus(target) {
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

  function progressRow(target) {
    const status = productionStatus(target);
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
    const recipe = selectedRecipe();
    if (!recipe) return;
    const targets = selectedTargets();
    const run = state.document.run;
    const ready = targets.filter((target) => target.machineStatus === 'publish-ready').length;
    const reviewable = targets.filter((target) => target.reviewable).length;
    const completed = targets.filter((target) => ['publish-ready', 'approved'].includes(productionStatus(target))).length;
    const hasChangesRequested = targets.some((target) => target.review.status === 'changes-requested');
    elements.productionTitle.textContent = recipe.name;
    elements.targetProgressList.replaceChildren(...targets.map(progressRow));
    elements.progressBar.style.width = `${targets.length ? Math.round((completed / targets.length) * 100) : 0}%`;
    elements.productionOutputCount.textContent = String(targets.length);
    elements.readyOutputCount.textContent = String(ready);
    elements.reviewOutputCount.textContent = String(reviewable);
    const ownerRunStatus = hasChangesRequested ? 'needs-fix' : run.status;
    elements.runState.textContent = statusLabel(ownerRunStatus);
    elements.runState.className = `run-state ${ownerRunStatus === 'running' || ownerRunStatus === 'needs-fix' ? 'is-running' : ownerRunStatus === 'completed' ? 'is-complete' : ownerRunStatus === 'failed' ? 'is-error' : ''}`;
    const allReviewable = !hasChangesRequested && targets.length > 0 && targets.every((target) => target.reviewable);
    if (allReviewable) elements.runMessage.textContent = 'Final media is ready for your decision.';
    else if (hasChangesRequested) elements.runMessage.textContent = 'The agent is applying your requested changes.';
    else if (run.status === 'failed') elements.runMessage.textContent = 'The agent needs to resolve a production blocker.';
    else elements.runMessage.textContent = 'The agent is producing and validating each channel output.';
    elements.retryButton.hidden = true;
    elements.openReviewButton.hidden = !allReviewable;
  }

  function targetTab(target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', target.id === activeTarget().id ? 'true' : 'false');
    button.dataset.status = target.review.status;
    button.textContent = target.id;
    button.addEventListener('click', () => {
      state.activeTargetId = target.id;
      renderReview();
    });
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
    const recipe = selectedRecipe();
    const targets = selectedTargets();
    if (!recipe || !targets.length) return;
    if (!targets.some((target) => target.id === state.activeTargetId)) state.activeTargetId = targets[0].id;
    const target = activeTarget();
    if (state.document.calibratorAvailable) {
      elements.advancedLink.href = `/?story=${encodeURIComponent(recipe.story)}&target=${encodeURIComponent(target.id)}`;
    }
    elements.reviewTitle.textContent = recipe.name;
    elements.reviewTargetTabs.replaceChildren(...targets.map(targetTab));
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
    const recipe = selectedRecipe();
    const persisted = !!(state.document.selection && state.document.selection.persisted);
    const targets = selectedTargets();
    const reviewReady = targets.length > 0 && targets.every((target) => target.reviewable);
    elements.productionTab.disabled = !persisted;
    elements.reviewTab.disabled = !reviewReady;
    elements.startButton.disabled = state.busy || !recipe || !targets.length;
  }

  function render() {
    const hasRecipes = state.document.recipes.length > 0;
    elements.emptyView.hidden = hasRecipes;
    for (const tab of elements.tabs) {
      tab.setAttribute('aria-selected', tab.dataset.view === state.view ? 'true' : 'false');
    }
    for (const view of elements.views) view.hidden = !hasRecipes || view.dataset.view !== state.view;
    if (!hasRecipes) return;
    renderPlan();
    renderProduction();
    renderNavigation();
    if (state.view === 'review') renderReview();
  }

  function initializeSelection() {
    const selected = state.document.selection;
    const recipe = state.document.recipes.find((item) => item.id === (selected && selected.recipeId))
      || state.document.recipes[0];
    if (!recipe) return;
    const recipeChanged = state.recipeId !== recipe.id;
    state.recipeId = recipe.id;
    state.targets = new Set(recipe.targets.map((target) => target.id));
    if (recipeChanged || !state.activeTargetId) state.activeTargetId = recipe.targets[0] ? recipe.targets[0].id : null;
  }

  async function loadState({ followPhase = true } = {}) {
    try {
      state.document = await api('/api/campaign');
      elements.projectName.textContent = state.document.project || 'Project';
      elements.advancedLink.hidden = !state.document.calibratorAvailable;
      initializeSelection();
      if (followPhase) state.view = state.document.phase === 'complete' ? 'review' : state.document.phase;
      render();
      setConnection(state.document.run.status === 'running' ? 'Producing' : 'Local', state.document.run.status === 'running' ? 'busy' : 'ready');
    } catch (error) {
      setConnection('Offline', 'error');
      showNotice('Could not load campaign', error.message);
    } finally {
      elements.app.setAttribute('aria-busy', 'false');
      schedulePoll();
    }
  }

  function schedulePoll() {
    if (state.pollTimer) window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
    if (!state.document) return;
    const shouldPoll = state.document.run.status === 'running'
      || (state.view === 'production' && state.document.phase === 'production');
    if (!shouldPoll) return;
    state.pollTimer = window.setTimeout(() => loadState({ followPhase: true }), 1500);
  }

  async function startProduction() {
    const recipe = selectedRecipe();
    if (!recipe || state.busy) return;
    setBusy(true, 'Starting');
    try {
      await api('/api/campaign/run', {
        method: 'POST',
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      state.view = 'production';
      await loadState({ followPhase: true });
    } catch (error) {
      showNotice('Production did not start', error.message);
    } finally {
      setBusy(false, 'Local');
      renderNavigation();
    }
  }

  async function review(status, targets) {
    const recipe = selectedRecipe();
    if (!recipe || state.busy) return;
    const note = elements.reviewNote.value.trim();
    if (status === 'changes-requested' && !note) {
      elements.reviewNote.focus();
      showNotice('Feedback required', 'Describe what the agent should change.');
      return;
    }
    setBusy(true, status === 'approved' ? 'Approving' : 'Submitting');
    try {
      const candidates = targets.map((targetId) => selectedTargets().find((target) => target.id === targetId));
      const response = await api('/api/campaign/review', {
        method: 'POST',
        body: JSON.stringify({
          recipeId: recipe.id,
          candidates: candidates.map((target) => ({
            target: target.id,
            assetDigest: target.assetDigest,
            ...(target.profileHash ? { profileHash: target.profileHash } : {}),
          })),
          status,
          ...(status === 'changes-requested' ? { note } : {}),
        }),
      });
      state.document = response.campaign;
      if (status === 'changes-requested') state.view = 'production';
      render();
      schedulePoll();
    } catch (error) {
      showNotice('Review was not saved', error.message);
    } finally {
      setBusy(false, 'Local');
      if (state.view === 'review') renderReview();
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
    const target = activeTarget();
    if (target) review('changes-requested', [target.id]);
  });
  elements.approveButton.addEventListener('click', () => review('approved', [...state.targets]));
  elements.noticeClose.addEventListener('click', () => { elements.notice.hidden = true; });

  loadState();
})();
