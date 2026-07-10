import { clamp, round } from './model.js';

export function createRegionEditor({ elements, state, markDirty }) {
  function current() {
    return state.profile.protectedRegions.find((region) => region.id === state.selectedRegionId) || null;
  }

  function select(id) {
    state.selectedRegionId = id;
    render();
  }

  function renderInspector() {
    const { width, height } = state.target.viewport;
    const tabs = state.profile.protectedRegions.map((region, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'region-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', region.id === state.selectedRegionId ? 'true' : 'false');
      button.title = region.label || region.id;
      button.textContent = String(index + 1);
      button.addEventListener('click', () => select(region.id));
      return button;
    });
    elements.regionTabs.replaceChildren(...tabs);
    const region = current();
    elements.regionEmpty.hidden = !!region;
    elements.regionFields.hidden = !region;
    elements.deleteRegionButton.disabled = !region;
    elements.addRegionButton.disabled = state.profile.protectedRegions.length >= 3;
    if (!region) return;
    elements.regionX.value = round(region.x / width * 100, 1);
    elements.regionY.value = round(region.y / height * 100, 1);
    elements.regionWidth.value = round(region.width / width * 100, 1);
    elements.regionHeight.value = round(region.height / height * 100, 1);
  }

  function startDrag(event, id, resize) {
    if (event.button !== 0) return;
    event.preventDefault();
    select(id);
    const region = current();
    const start = { x: event.clientX, y: event.clientY, region: { ...region } };
    const rect = elements.canvasFrame.getBoundingClientRect();
    const viewport = state.target.viewport;
    const move = (next) => {
      const dx = (next.clientX - start.x) / rect.width * viewport.width;
      const dy = (next.clientY - start.y) / rect.height * viewport.height;
      if (resize) {
        region.width = clamp(start.region.width + dx, 16, viewport.width - region.x);
        region.height = clamp(start.region.height + dy, 16, viewport.height - region.y);
      } else {
        region.x = clamp(start.region.x + dx, 0, viewport.width - region.width);
        region.y = clamp(start.region.y + dy, 0, viewport.height - region.height);
      }
      markDirty();
      render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function render() {
    const { width, height } = state.target.viewport;
    const nodes = state.profile.protectedRegions.map((region) => {
      const node = document.createElement('div');
      node.className = `protected-region${region.id === state.selectedRegionId ? ' is-selected' : ''}`;
      node.dataset.id = region.id;
      node.style.left = `${region.x / width * 100}%`;
      node.style.top = `${region.y / height * 100}%`;
      node.style.width = `${region.width / width * 100}%`;
      node.style.height = `${region.height / height * 100}%`;
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `Protected region ${region.label || region.id}`);
      const label = document.createElement('span');
      label.className = 'protected-region-label';
      label.textContent = region.label || region.id;
      const handle = document.createElement('span');
      handle.className = 'resize-handle';
      handle.setAttribute('aria-hidden', 'true');
      node.append(label, handle);
      node.addEventListener('pointerdown', (event) => startDrag(event, region.id, event.target === handle));
      node.addEventListener('focus', () => select(region.id));
      return node;
    });
    elements.regionLayer.replaceChildren(...nodes);
    renderInspector();
  }

  function updateFromFields() {
    const region = current();
    if (!region) return;
    const inputs = [elements.regionX, elements.regionY, elements.regionWidth, elements.regionHeight];
    if (inputs.some((input) => input.value === '' || !Number.isFinite(Number(input.value)))) return;
    const { width, height } = state.target.viewport;
    region.x = clamp(Number(elements.regionX.value) / 100 * width, 0, width - region.width);
    region.y = clamp(Number(elements.regionY.value) / 100 * height, 0, height - region.height);
    region.width = clamp(Number(elements.regionWidth.value) / 100 * width, 16, width - region.x);
    region.height = clamp(Number(elements.regionHeight.value) / 100 * height, 16, height - region.y);
    markDirty();
    render();
  }

  function bind() {
    [elements.regionX, elements.regionY, elements.regionWidth, elements.regionHeight]
      .forEach((input) => input.addEventListener('input', updateFromFields));
    elements.addRegionButton.addEventListener('click', () => {
      if (state.profile.protectedRegions.length >= 3) return;
      const { width, height } = state.target.viewport;
      const id = `region-${Date.now().toString(36)}`;
      state.profile.protectedRegions.push({
        id,
        label: `Protected ${state.profile.protectedRegions.length + 1}`,
        x: width * .2,
        y: height * .2,
        width: width * .45,
        height: height * .25,
      });
      state.selectedRegionId = id;
      markDirty();
      render();
    });
    elements.deleteRegionButton.addEventListener('click', () => {
      state.profile.protectedRegions = state.profile.protectedRegions.filter((region) => region.id !== state.selectedRegionId);
      state.selectedRegionId = state.profile.protectedRegions[0] && state.profile.protectedRegions[0].id;
      markDirty();
      render();
    });
  }

  return { bind, render };
}
