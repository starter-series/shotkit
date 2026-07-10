import { clamp, clone, keyFor, profileDefaults, round } from './model.js';
import { createPreviewController } from './preview.js';
import { createRegionEditor } from './regions.js';

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const elements = {
    app: $('app'),
    projectName: $('projectName'),
    statusDot: $('statusDot'),
    targetStatus: $('targetStatus'),
    operationState: $('operationState'),
    recaptureButton: $('recaptureButton'),
    saveButton: $('saveButton'),
    targetCount: $('targetCount'),
    targetList: $('targetList'),
    layoutCount: $('layoutCount'),
    layoutList: $('layoutList'),
    captureName: $('captureName'),
    captureIdentity: $('captureIdentity'),
    warningSummary: $('warningSummary'),
    warningCount: $('warningCount'),
    viewportLabel: $('viewportLabel'),
    canvasFrame: $('canvasFrame'),
    previewVideo: $('previewVideo'),
    previewCanvas: $('previewCanvas'),
    previewPoster: $('previewPoster'),
    mediaEmpty: $('mediaEmpty'),
    captionLane: $('captionLane'),
    captionPreview: $('captionPreview'),
    regionLayer: $('regionLayer'),
    focusPoint: $('focusPoint'),
    profileName: $('profileName'),
    profileState: $('profileState'),
    profileForm: $('profileForm'),
    bottomOffsetRange: $('bottomOffsetRange'),
    bottomOffsetNumber: $('bottomOffsetNumber'),
    zoomRange: $('zoomRange'),
    zoomNumber: $('zoomNumber'),
    focusX: $('focusX'),
    focusY: $('focusY'),
    regionTabs: $('regionTabs'),
    deleteRegionButton: $('deleteRegionButton'),
    addRegionButton: $('addRegionButton'),
    regionEmpty: $('regionEmpty'),
    regionFields: $('regionFields'),
    regionX: $('regionX'),
    regionY: $('regionY'),
    regionWidth: $('regionWidth'),
    regionHeight: $('regionHeight'),
    warningsBadge: $('warningsBadge'),
    warningsList: $('warningsList'),
    beatSummary: $('beatSummary'),
    timeReadout: $('timeReadout'),
    beatList: $('beatList'),
    notice: $('notice'),
    noticeTitle: $('noticeTitle'),
    noticeMessage: $('noticeMessage'),
    noticeClose: $('noticeClose'),
  };

  const state = {
    document: null,
    selectedKey: null,
    target: null,
    profile: null,
    selectedRegionId: null,
    dirty: false,
    busy: false,
  };

  function showNotice(title, message) {
    elements.noticeTitle.textContent = title;
    elements.noticeMessage.textContent = message;
    elements.notice.hidden = false;
  }

  function setOperation(label) {
    elements.operationState.textContent = label;
  }

  function setBusy(busy, label) {
    state.busy = busy;
    elements.saveButton.disabled = busy || !state.target || !state.dirty;
    elements.recaptureButton.disabled = busy || !state.target;
    elements.profileForm.toggleAttribute('inert', busy);
    if (label) setOperation(label);
  }

  function markDirty() {
    if (!state.profile || state.busy) return;
    state.dirty = true;
    delete state.profile.verification;
    elements.profileState.textContent = 'Unsaved';
    elements.profileState.className = 'profile-state is-dirty';
    elements.saveButton.disabled = false;
  }

  const preview = createPreviewController({ elements, state, markDirty });
  const regions = createRegionEditor({ elements, state, markDirty });

  function setProfileState() {
    if (!state.profile) {
      elements.profileState.textContent = 'Read only';
      elements.profileState.className = 'profile-state';
      return;
    }
    const verified = state.target && state.target.verified;
    const persisted = state.target && state.target.hasProfile;
    elements.profileState.textContent = verified ? 'Verified' : persisted ? 'Saved' : 'Draft';
    elements.profileState.className = verified ? 'profile-state is-verified' : 'profile-state';
  }

  function renderTargetStatus() {
    const status = state.target.status;
    elements.targetStatus.textContent = status.replaceAll('-', ' ');
    elements.statusDot.className = `status-dot ${status === 'publish-ready' ? 'is-ready' : status === 'not-requested' ? 'is-neutral' : 'is-warning'}`;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  async function loadState(preferredKey = state.selectedKey) {
    setBusy(true, 'Loading');
    try {
      state.document = await api('/api/state');
      elements.projectName.textContent = state.document.project || 'Project';
      elements.targetCount.textContent = String(state.document.targets.length);
      const preferred = state.document.targets.find((target) => keyFor(target) === preferredKey);
      const selected = preferred || state.document.targets.find((target) => (
        state.document.selected && target.story === state.document.selected.story && target.target === state.document.selected.target
      )) || state.document.targets[0];
      if (selected) selectTarget(selected, { force: true });
      else renderEmpty();
      setOperation('Ready');
    } catch (error) {
      showNotice('Could not load project', error.message);
      setOperation('Connection failed');
    } finally {
      elements.app.setAttribute('aria-busy', 'false');
      setBusy(false);
    }
  }

  function renderEmpty() {
    state.target = null;
    state.profile = null;
    elements.targetList.replaceChildren();
    elements.layoutList.replaceChildren();
    elements.captureName.textContent = 'No calibrated target';
    elements.captureIdentity.textContent = 'Add a channel target to shotkit.config.js';
    elements.mediaEmpty.hidden = false;
    elements.previewVideo.hidden = true;
    elements.recaptureButton.disabled = true;
    elements.saveButton.disabled = true;
  }

  function selectTarget(target, { force = false } = {}) {
    if (!force && state.dirty && !window.confirm('Discard unsaved calibration changes?')) return;
    state.target = target;
    state.selectedKey = keyFor(target);
    state.profile = profileDefaults(target);
    state.selectedRegionId = state.profile.protectedRegions[0] && state.profile.protectedRegions[0].id;
    state.dirty = false;
    renderAll();
  }

  function createTargetButton(target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-item';
    button.dataset.status = target.status;
    button.setAttribute('aria-current', keyFor(target) === state.selectedKey ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = target.story;
    const subtitle = document.createElement('span');
    subtitle.textContent = target.target;
    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    button.append(title, subtitle, dot);
    button.addEventListener('click', () => selectTarget(target));
    return button;
  }

  function renderTargets() {
    elements.targetList.replaceChildren(...state.document.targets.map(createTargetButton));
  }

  function renderLayouts() {
    const layouts = state.target.layouts.length ? state.target.layouts : ['default'];
    elements.layoutCount.textContent = String(layouts.length);
    const buttons = layouts.map((layout) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layout-item';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', state.profile.layoutPreset === layout ? 'true' : 'false');
      button.textContent = layout.replaceAll('-', ' ');
      button.addEventListener('click', () => {
        state.profile.layoutPreset = layout;
        markDirty();
        renderLayouts();
      });
      return button;
    });
    elements.layoutList.replaceChildren(...buttons);
  }

  function renderWarnings() {
    const warnings = state.target.warnings || [];
    elements.warningCount.textContent = String(warnings.length);
    elements.warningSummary.hidden = warnings.length === 0;
    elements.warningsBadge.textContent = String(warnings.length);
    if (!warnings.length) {
      const item = document.createElement('li');
      item.className = 'no-warnings';
      item.textContent = 'No warnings';
      elements.warningsList.replaceChildren(item);
      return;
    }
    elements.warningsList.replaceChildren(...warnings.map((warning) => {
      const item = document.createElement('li');
      item.textContent = `${warning.message}${warning.fix ? ` - ${warning.fix}` : ''}`;
      return item;
    }));
  }

  function syncControls() {
    const { captionOptions, framing } = state.profile;
    const position = document.querySelector(`input[name="captionPosition"][value="${captionOptions.position}"]`);
    const appearance = document.querySelector(`input[name="captionAppearance"][value="${captionOptions.appearance}"]`);
    if (position) position.checked = true;
    if (appearance) appearance.checked = true;
    const maxOffset = Math.max(0, state.target.viewport.height - 96);
    elements.bottomOffsetRange.max = String(maxOffset);
    elements.bottomOffsetNumber.max = String(maxOffset);
    elements.bottomOffsetRange.value = String(clamp(captionOptions.bottomOffset, 0, maxOffset));
    elements.bottomOffsetNumber.value = elements.bottomOffsetRange.value;
    elements.zoomRange.value = String(framing.scale);
    elements.zoomNumber.value = String(framing.scale);
    elements.focusX.value = String(Math.round(framing.focusX * 100));
    elements.focusY.value = String(Math.round(framing.focusY * 100));
  }

  function renderAll() {
    const target = state.target;
    renderTargets();
    renderLayouts();
    preview.setMedia(target);
    elements.captureName.textContent = target.name;
    elements.captureIdentity.textContent = `${target.story} / ${target.target}`;
    elements.viewportLabel.textContent = `${target.viewport.width} x ${target.viewport.height}`;
    elements.profileName.textContent = `${target.story} / ${target.target}`;
    renderTargetStatus();
    setProfileState();
    syncControls();
    preview.applyGeometry();
    regions.render();
    renderWarnings();
    preview.renderBeats();
    elements.saveButton.disabled = true;
    elements.recaptureButton.disabled = false;
  }

  function profilePayload() {
    return clone(state.profile);
  }

  async function saveProfile() {
    if (!state.target || !state.dirty) return;
    setBusy(true, 'Saving profile');
    try {
      const result = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          story: state.target.story,
          target: state.target.target,
          profile: profilePayload(),
        }),
      });
      state.profile = profileDefaults({ ...state.target, profile: result.profile });
      state.target.profile = clone(result.profile);
      state.target.hasProfile = true;
      state.target.verified = false;
      state.target.status = 'needs-fix';
      state.dirty = false;
      setProfileState();
      renderTargetStatus();
      renderTargets();
      setOperation('Saved');
    } catch (error) {
      showNotice('Profile was not saved', error.message);
      setOperation('Save failed');
    } finally {
      setBusy(false);
      elements.saveButton.disabled = !state.dirty;
    }
  }

  async function recapture() {
    if (!state.target) return;
    if (state.dirty || !state.target.hasProfile) {
      if (!state.dirty) state.dirty = true;
      await saveProfile();
    }
    if (state.dirty) return;
    const selectedKey = state.selectedKey;
    setBusy(true, 'Recapturing with Chromium');
    try {
      const result = await api('/api/recapture', {
        method: 'POST',
        body: JSON.stringify({ story: state.target.story, target: state.target.target }),
      });
      setOperation(result.status === 'publish-ready' ? 'Verified' : result.status || 'Finished');
      elements.previewVideo.dataset.source = '';
      await loadState(selectedKey);
    } catch (error) {
      showNotice('Recapture failed', error.message);
      setOperation('Recapture failed');
    } finally {
      setBusy(false);
    }
  }

  function bindNumberPair(range, number, apply) {
    const update = (source) => {
      if (source.value === '' || !Number.isFinite(Number(source.value))) return;
      const value = clamp(Number(source.value), Number(source.min), Number(source.max));
      range.value = String(value);
      number.value = String(value);
      apply(value);
      markDirty();
      preview.applyGeometry();
    };
    range.addEventListener('input', () => update(range));
    number.addEventListener('input', () => update(number));
  }

  function bindEvents() {
    elements.saveButton.addEventListener('click', saveProfile);
    elements.recaptureButton.addEventListener('click', recapture);
    elements.noticeClose.addEventListener('click', () => { elements.notice.hidden = true; });
    elements.warningSummary.addEventListener('click', () => $('warningsSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    preview.bind();
    regions.bind();

    document.querySelectorAll('input[name="captionPosition"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.profile.captionOptions.position = input.value;
        markDirty();
        preview.applyGeometry();
      });
    });
    document.querySelectorAll('input[name="captionAppearance"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.profile.captionOptions.appearance = input.value;
        markDirty();
        preview.applyGeometry();
      });
    });
    bindNumberPair(elements.bottomOffsetRange, elements.bottomOffsetNumber, (value) => {
      state.profile.captionOptions.bottomOffset = Math.round(value);
    });
    bindNumberPair(elements.zoomRange, elements.zoomNumber, (value) => {
      state.profile.framing.scale = round(value, 2);
    });
    elements.focusX.addEventListener('input', () => {
      if (elements.focusX.value === '' || !Number.isFinite(Number(elements.focusX.value))) return;
      state.profile.framing.focusX = clamp(Number(elements.focusX.value) / 100, 0, 1);
      markDirty();
      preview.applyGeometry();
    });
    elements.focusY.addEventListener('input', () => {
      if (elements.focusY.value === '' || !Number.isFinite(Number(elements.focusY.value))) return;
      state.profile.framing.focusY = clamp(Number(elements.focusY.value) / 100, 0, 1);
      markDirty();
      preview.applyGeometry();
    });
  }

  bindEvents();
  loadState();
})();
