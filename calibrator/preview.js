import { clamp, formatClock } from './model.js';

export function createPreviewController({ elements, state, markDirty }) {
  let frameRequest = null;

  function setMedia(target) {
    const mediaLabel = `${target.name || `${target.story} ${target.target}`} capture`;
    elements.previewVideo.setAttribute('aria-label', `${mediaLabel} video`);
    elements.previewPoster.alt = `${mediaLabel} thumbnail`;
    const cacheKey = target.videoUrl ? `${target.videoUrl}${target.videoUrl.includes('?') ? '&' : '?'}v=${Date.now()}` : '';
    if (target.videoUrl) {
      if (elements.previewVideo.dataset.source !== target.videoUrl) {
        elements.previewCanvas.hidden = true;
        elements.previewVideo.src = cacheKey;
        elements.previewVideo.dataset.source = target.videoUrl;
        elements.previewVideo.poster = target.thumbnailUrl || '';
      }
      elements.previewVideo.hidden = false;
      elements.previewPoster.src = target.thumbnailUrl || '';
      elements.previewPoster.hidden = !target.thumbnailUrl;
      elements.mediaEmpty.hidden = true;
    } else if (target.thumbnailUrl) {
      elements.previewPoster.src = target.thumbnailUrl;
      elements.previewPoster.hidden = false;
      elements.previewVideo.hidden = true;
      elements.previewCanvas.hidden = true;
      elements.mediaEmpty.hidden = true;
    } else {
      elements.previewVideo.hidden = true;
      elements.previewPoster.hidden = true;
      elements.previewCanvas.hidden = true;
      elements.mediaEmpty.hidden = false;
    }
  }

  function fitCanvas() {
    if (!state.target) return;
    const surface = elements.canvasFrame.parentElement;
    const surfaceStyle = window.getComputedStyle(surface);
    const canvasStyle = window.getComputedStyle(elements.canvasFrame);
    const pixelLimit = (value) => value.endsWith('px') ? parseFloat(value) : Infinity;
    const availableWidth = surface.clientWidth
      - parseFloat(surfaceStyle.paddingLeft)
      - parseFloat(surfaceStyle.paddingRight);
    const availableHeight = surface.clientHeight
      - parseFloat(surfaceStyle.paddingTop)
      - parseFloat(surfaceStyle.paddingBottom);
    const boundedWidth = Math.min(availableWidth, pixelLimit(canvasStyle.maxWidth));
    const boundedHeight = Math.min(availableHeight, pixelLimit(canvasStyle.maxHeight));
    const ratio = state.target.viewport.width / state.target.viewport.height;
    const width = Math.max(1, Math.min(boundedWidth, boundedHeight * ratio));
    elements.canvasFrame.style.width = `${width}px`;
    elements.canvasFrame.style.height = `${width / ratio}px`;
  }

  function applyGeometry() {
    const { width, height } = state.target.viewport;
    const { scale, focusX, focusY } = state.profile.framing;
    elements.canvasFrame.style.setProperty('--canvas-ratio', `${width} / ${height}`);
    fitCanvas();
    for (const media of [elements.previewVideo, elements.previewPoster, elements.previewCanvas]) {
      media.style.transformOrigin = `${focusX * 100}% ${focusY * 100}%`;
      media.style.transform = `scale(${scale})`;
    }
    elements.focusPoint.style.left = `calc(${focusX * 100}% - 14px)`;
    elements.focusPoint.style.top = `calc(${focusY * 100}% - 14px)`;

    const safe = state.target.safeArea;
    const actionGuide = elements.canvasFrame.querySelector('.action-safe');
    actionGuide.style.left = `${safe.x / width * 100}%`;
    actionGuide.style.top = `${safe.y / height * 100}%`;
    actionGuide.style.width = `${safe.width / width * 100}%`;
    actionGuide.style.height = `${safe.height / height * 100}%`;

    const caption = state.profile.captionOptions;
    elements.captionLane.dataset.position = caption.position;
    elements.captionLane.dataset.appearance = caption.appearance;
    elements.captionLane.style.bottom = `${caption.bottomOffset / height * 100}%`;
  }

  function updateActiveBeat() {
    const current = elements.previewVideo.currentTime || 0;
    const buttons = Array.from(elements.beatList.querySelectorAll('.beat-item'));
    let active = null;
    for (const button of buttons) {
      if (Number(button.dataset.at) <= current) active = button;
      button.classList.remove('is-active');
    }
    if (active) active.classList.add('is-active');
    elements.timeReadout.textContent = `${formatClock(current)} / ${formatClock(elements.previewVideo.duration)}`;
  }

  function renderBeats() {
    const beats = state.target.beats || [];
    elements.beatSummary.textContent = `${beats.length} marker${beats.length === 1 ? '' : 's'}`;
    elements.beatList.replaceChildren(...beats.map((beat) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'beat-item';
      button.dataset.at = String(beat.at);
      const time = document.createElement('time');
      time.textContent = formatClock(beat.at);
      const label = document.createElement('span');
      label.textContent = beat.text;
      button.append(time, label);
      button.addEventListener('click', () => {
        elements.previewVideo.currentTime = beat.at;
        elements.previewVideo.pause();
        elements.captionPreview.textContent = beat.text;
        updateActiveBeat();
      });
      return button;
    }));
    elements.captionPreview.textContent = beats[0] ? beats[0].text : 'Caption lane';
  }

  function drawFrame() {
    const video = elements.previewVideo;
    if (video.hidden || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const canvas = elements.previewCanvas;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (_error) {
      return;
    }
    canvas.hidden = false;
  }

  function drawPlayingFrames() {
    drawFrame();
    if (!elements.previewVideo.paused && !elements.previewVideo.ended) {
      frameRequest = window.requestAnimationFrame(drawPlayingFrames);
    } else {
      frameRequest = null;
    }
  }

  function startFrames() {
    if (frameRequest != null) window.cancelAnimationFrame(frameRequest);
    frameRequest = window.requestAnimationFrame(drawPlayingFrames);
  }

  function primeFrame() {
    const firstBeat = state.target && state.target.beats && state.target.beats[0];
    if (elements.previewVideo.poster) {
      updateActiveBeat();
    } else if (elements.previewVideo.currentTime < .05 && firstBeat && Number.isFinite(firstBeat.at)) {
      elements.previewVideo.currentTime = clamp(firstBeat.at, 0, elements.previewVideo.duration || firstBeat.at);
    } else {
      drawFrame();
    }
    updateActiveBeat();
  }

  function startFocusDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const move = (next) => {
      const rect = elements.canvasFrame.getBoundingClientRect();
      state.profile.framing.focusX = clamp((next.clientX - rect.left) / rect.width, 0, 1);
      state.profile.framing.focusY = clamp((next.clientY - rect.top) / rect.height, 0, 1);
      elements.focusX.value = Math.round(state.profile.framing.focusX * 100);
      elements.focusY.value = Math.round(state.profile.framing.focusY * 100);
      markDirty();
      applyGeometry();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function bind() {
    elements.previewVideo.addEventListener('timeupdate', () => {
      updateActiveBeat();
      if (elements.previewVideo.paused) drawFrame();
    });
    elements.previewVideo.addEventListener('loadedmetadata', primeFrame);
    elements.previewVideo.addEventListener('loadeddata', drawFrame);
    elements.previewVideo.addEventListener('seeked', drawFrame);
    elements.previewVideo.addEventListener('seeking', () => { elements.previewPoster.hidden = true; });
    elements.previewVideo.addEventListener('play', () => {
      elements.previewPoster.hidden = true;
      startFrames();
    });
    elements.previewVideo.addEventListener('pause', drawFrame);
    elements.focusPoint.addEventListener('pointerdown', startFocusDrag);
    window.addEventListener('resize', fitCanvas);
  }

  return { applyGeometry, bind, fitCanvas, renderBeats, setMedia };
}
