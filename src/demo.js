/*
 * shotkit — demo story helpers.
 *
 * Demo videos are recorded from the real page, so captions are rendered as a
 * lightweight DOM overlay during Playwright recording. The helper object passed
 * to config.demo.run keeps configs small: caption → action → short hold.
 */

const DEFAULT_CLICK_HOLD_MS = 500;
const DEFAULT_CLICK_MOVE_MS = 360;
const DEFAULT_CLICK_BEFORE_MS = 120;
const DEFAULT_STEP_HOLD_MS = 800;

function normalizeDelayMs(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`shotkit: demo ${label} must be a non-negative number of milliseconds`);
  }
  return Math.round(value);
}

function parseTimeToMs(value, label = 'time') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) throw new Error(`shotkit: demo caption ${label} must be >= 0`);
    return Math.round(value * 1000);
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`shotkit: demo caption ${label} must be a number of seconds or a time string`);
  }

  const raw = value.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return parseTimeToMs(Number(raw), label);

  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  const [hours, minutes, seconds] = parts.length === 3 ? nums : [0, nums[0], nums[1]];
  if (minutes >= 60 || seconds >= 60) {
    throw new Error(`shotkit: demo caption ${label} has invalid time string "${value}"`);
  }
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

function normalizeDemoCaptions(captions = []) {
  if (!captions) return [];
  if (!Array.isArray(captions)) throw new Error('shotkit: demo.captions must be an array');
  return captions
    .map((caption, index) => {
      if (!caption || caption.at == null) {
        throw new Error(`shotkit: demo.captions[${index}] needs an at time`);
      }
      if (caption.text == null) {
        throw new Error(`shotkit: demo.captions[${index}] needs text`);
      }
      return {
        atMs: parseTimeToMs(caption.at, `at for captions[${index}]`),
        text: String(caption.text),
      };
    })
    .sort((a, b) => a.atMs - b.atMs);
}

function normalizeDemoConfigs(config = {}) {
  const demos = [];
  if (config.demo) demos.push(config.demo);
  if (config.demos != null) {
    if (!Array.isArray(config.demos)) throw new Error('shotkit: config.demos must be an array');
    demos.push(...config.demos);
  }

  const seen = new Set();
  return demos.map((demo, index) => {
    if (!demo || typeof demo !== 'object') {
      throw new Error(`shotkit: demo entry ${index} must be an object`);
    }
    if (!demo.name) throw new Error(`shotkit: demo entry ${index} needs a name`);
    if (typeof demo.run !== 'function') throw new Error(`shotkit: demo "${demo.name}" needs run({ page, demo })`);
    if (demo.captions != null && !Array.isArray(demo.captions)) {
      throw new Error(`shotkit: demo "${demo.name}".captions must be an array`);
    }
    if (seen.has(demo.name)) throw new Error(`shotkit: duplicate demo name "${demo.name}"`);
    seen.add(demo.name);
    return demo;
  });
}

function storyboardWarning(code, message, fix, details) {
  return {
    code,
    severity: 'warning',
    message,
    fix,
    ...(details ? { details } : {}),
  };
}

function formatStoryboardLint(item) {
  return item.fix ? `${item.message}; ${item.fix}` : item.message;
}

function analyzeDemoStoryboard(demoConfig, { viewport, mp4Requested } = {}) {
  if (demoConfig.storyboardLint === false) return [];
  const warnings = [];
  // Lint must never throw — a malformed caption time should surface AS a lint
  // warning, not crash the whole capture run (this runs before any try/catch).
  let captions = [];
  try {
    captions = Array.isArray(demoConfig.captions) ? normalizeDemoCaptions(demoConfig.captions) : [];
  } catch (e) {
    warnings.push(storyboardWarning('invalid-captions', e.message, 'fix the caption time/text so the storyboard can be linted'));
  }
  if (!captions.length) {
    warnings.push(storyboardWarning(
      'no-captions',
      'storyboard has no captions',
      'add short captions for SNS context',
    ));
  }
  if (captions.length === 1) {
    warnings.push(storyboardWarning(
      'single-caption',
      'storyboard has only one caption',
      'aim for before -> action -> result',
    ));
  }
  if (captions[0] && captions[0].atMs > 3000) {
    warnings.push(storyboardWarning(
      'late-first-caption',
      'first caption starts after 3s',
      'show the result sooner',
      { atMs: captions[0].atMs },
    ));
  }
  for (const caption of captions) {
    if (caption.text.length > 70) {
      warnings.push(storyboardWarning(
        'long-caption',
        `caption is ${caption.text.length} chars`,
        'keep captions under 70 chars when possible',
        { text: caption.text, length: caption.text.length },
      ));
    }
  }

  const text = captions.map((caption) => caption.text).join(' ').toLowerCase();
  if (captions.length && !/(restore|original|safe|undo|revert|reset|복구|원문|되돌)/i.test(text)) {
    warnings.push(storyboardWarning(
      'missing-safety-restore',
      'storyboard has no visible safety/restore beat',
      'show restore, undo, original text, or another safety path',
    ));
  }

  // Honor an explicit mp4Requested (only the caller knows about the CLI --mp4
  // flag) but also infer it from the demo config, so public callers like
  // lintDemoStoryboard() don't emit a spurious warning when demo.mp4 is set.
  const wantsMp4 = mp4Requested || !!(demoConfig.mp4 || demoConfig.crop || demoConfig.zoom);
  if (!wantsMp4) {
    warnings.push(storyboardWarning(
      'missing-mp4',
      'X/SNS demo clips should emit mp4',
      'set demo.mp4 or run shotkit --mp4',
    ));
  }
  if ((demoConfig.crop || demoConfig.zoom) && captions.length) {
    warnings.push(storyboardWarning(
      'edge-framing',
      'crop/zoom can cut edge captions or badges',
      'verify a frame after capture',
    ));
  }
  if (viewport && (viewport.width % 2 || viewport.height % 2)) {
    warnings.push(storyboardWarning(
      'odd-viewport',
      `viewport ${viewport.width}x${viewport.height} is not even`,
      'use even dimensions for H.264',
      { viewport },
    ));
  }

  if (demoConfig.trim && demoConfig.trim.duration != null) {
    let durationMs = null;
    try {
      durationMs = parseTimeToMs(demoConfig.trim.duration, 'trim.duration');
    } catch (e) {
      warnings.push(storyboardWarning('invalid-duration', e.message, 'use a number of seconds or an "mm:ss" string'));
    }
    if (durationMs != null && durationMs < 20000) {
      warnings.push(storyboardWarning(
        'short-duration',
        'trim.duration is under 20s',
        'make sure the story has enough context',
        { durationMs },
      ));
    }
    if (durationMs != null && durationMs > 40000) {
      warnings.push(storyboardWarning(
        'long-duration',
        'trim.duration is over 40s',
        'X clips usually perform better shorter',
        { durationMs },
      ));
    }
  } else {
    warnings.push(storyboardWarning(
      'missing-duration',
      'no trim.duration set',
      'target 20-40s for SNS clips',
    ));
  }

  return warnings;
}

function lintDemoStoryboard(demoConfig, options = {}) {
  return analyzeDemoStoryboard(demoConfig, options).map(formatStoryboardLint);
}

function demoCaptionInitScript(options = {}) {
  const rootId = '__shotkit_demo_caption__';
  const pointerId = '__shotkit_demo_pointer__';
  const styleId = '__shotkit_demo_caption_style__';
  const baseOptions = {
    position: options.position || 'bottom-left',
  };

  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${rootId} {
        position: fixed;
        z-index: 2147483646;
        box-sizing: border-box;
        max-width: min(760px, calc(100vw - 56px));
        padding: 13px 17px 14px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 8px;
        background: rgba(13,17,23,.88);
        color: #fff;
        box-shadow: 0 16px 42px rgba(0,0,0,.28);
        font: 700 24px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        letter-spacing: 0;
        text-wrap: balance;
        pointer-events: none;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 160ms ease, transform 160ms ease;
      }
      #${rootId}[data-visible="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      #${rootId}[data-position="bottom-left"] {
        left: max(28px, env(safe-area-inset-left));
        bottom: max(26px, env(safe-area-inset-bottom));
      }
      #${rootId}[data-position="bottom"] {
        left: 50%;
        bottom: max(26px, env(safe-area-inset-bottom));
        transform: translate(-50%, 8px);
        text-align: center;
      }
      #${rootId}[data-position="bottom"][data-visible="true"] {
        transform: translate(-50%, 0);
      }
      @media (max-width: 720px) {
        #${rootId} {
          max-width: calc(100vw - 36px);
          padding: 11px 14px 12px;
          font-size: 20px;
        }
        #${rootId}[data-position="bottom-left"] {
          left: max(18px, env(safe-area-inset-left));
          bottom: max(18px, env(safe-area-inset-bottom));
        }
        #${rootId}[data-position="bottom"] {
          bottom: max(18px, env(safe-area-inset-bottom));
        }
      }
      #${pointerId} {
        position: fixed;
        left: 0;
        top: 0;
        z-index: 2147483646;
        width: 24px;
        height: 24px;
        margin: -12px 0 0 -12px;
        border: 3px solid rgba(37,99,235,.96);
        border-radius: 999px;
        background: rgba(255,255,255,.94);
        box-shadow: 0 8px 22px rgba(0,0,0,.32), 0 0 0 3px rgba(255,255,255,.82);
        pointer-events: none;
        opacity: 0;
        transform: translate(-120px, -120px);
        transition-property: transform, opacity;
        transition-duration: 360ms, 120ms;
        transition-timing-function: cubic-bezier(.2,.8,.2,1), ease;
      }
      #${pointerId}[data-visible="true"] {
        opacity: 1;
      }
      #${pointerId}::after {
        content: "";
        position: absolute;
        inset: -16px;
        border: 3px solid rgba(37,99,235,.42);
        border-radius: 999px;
        opacity: 0;
        transform: scale(.6);
      }
      #${pointerId}[data-clicking="true"]::after {
        animation: shotkit-click-ripple 520ms ease-out;
      }
      @keyframes shotkit-click-ripple {
        0% { opacity: .95; transform: scale(.6); }
        100% { opacity: 0; transform: scale(1.9); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    if (!document.body) return null;
    ensureStyle();
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement('div');
      root.id = rootId;
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.dataset.position = baseOptions.position;
      document.body.appendChild(root);
    }
    return root;
  }

  function ensurePointer() {
    if (!document.body) return null;
    ensureStyle();
    let pointer = document.getElementById(pointerId);
    if (!pointer) {
      pointer = document.createElement('div');
      pointer.id = pointerId;
      document.body.appendChild(pointer);
    }
    return pointer;
  }

  function show(text, nextOptions = {}) {
    const root = ensureRoot();
    if (!root) return;
    const position = nextOptions.position || baseOptions.position;
    root.dataset.position = position;
    root.textContent = String(text);
    root.dataset.visible = text ? 'true' : 'false';
  }

  function hide() {
    const root = ensureRoot();
    if (root) root.dataset.visible = 'false';
  }

  function movePointer(point, nextOptions = {}) {
    const pointer = ensurePointer();
    if (!pointer) return;
    const durationMs = nextOptions.durationMs == null ? 360 : nextOptions.durationMs;
    pointer.style.transitionDuration = `${durationMs}ms, 120ms`;
    pointer.style.transform = `translate(${point.x}px, ${point.y}px)`;
    pointer.dataset.visible = 'true';
  }

  function pulsePointer() {
    const pointer = ensurePointer();
    if (!pointer) return;
    pointer.dataset.clicking = 'false';
    void pointer.offsetWidth;
    pointer.dataset.clicking = 'true';
    window.setTimeout(() => {
      if (pointer.dataset.clicking === 'true') pointer.dataset.clicking = 'false';
    }, 560);
  }

  function hidePointer() {
    const pointer = ensurePointer();
    if (pointer) pointer.dataset.visible = 'false';
  }

  window.__shotkitDemoCaption = { show, hide };
  window.__shotkitDemoPointer = { move: movePointer, pulse: pulsePointer, hide: hidePointer };
  const install = () => ensureRoot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

async function installDemoCaptionOverlay(context, options = {}) {
  await context.addInitScript(demoCaptionInitScript, options);
}

async function ensureDemoCaptionOverlay(page, options = {}) {
  await page.evaluate(demoCaptionInitScript, options);
}

async function setDemoCaption(page, text, options = {}) {
  await ensureDemoCaptionOverlay(page, options);
  await page.evaluate(
    ({ captionText, captionOptions }) => {
      window.__shotkitDemoCaption.show(captionText, captionOptions);
    },
    {
      captionText: String(text),
      captionOptions: options,
    },
  );
}

async function hideDemoCaption(page) {
  await page.evaluate(() => {
    if (window.__shotkitDemoCaption) window.__shotkitDemoCaption.hide();
  });
}

async function moveDemoPointer(page, point, options = {}) {
  await ensureDemoCaptionOverlay(page, options);
  await page.evaluate(
    ({ pointerPoint, pointerOptions }) => {
      window.__shotkitDemoPointer.move(pointerPoint, pointerOptions);
    },
    { pointerPoint: point, pointerOptions: options },
  );
}

async function pulseDemoPointer(page) {
  await page.evaluate(() => {
    if (window.__shotkitDemoPointer) window.__shotkitDemoPointer.pulse();
  });
}

async function hideDemoPointer(page) {
  await page.evaluate(() => {
    if (window.__shotkitDemoPointer) window.__shotkitDemoPointer.hide();
  });
}

function isPoint(target) {
  return target && Number.isFinite(target.x) && Number.isFinite(target.y);
}

async function targetCenter(page, target) {
  if (isPoint(target)) return { x: Math.round(target.x), y: Math.round(target.y) };

  let box = null;
  if (target && typeof target.boundingBox === 'function') {
    box = await target.boundingBox().catch(() => null);
  } else if (typeof target === 'string' && typeof page.locator === 'function') {
    box = await page.locator(target).boundingBox().catch(() => null);
  }
  if (!box && typeof target === 'string' && typeof page.$eval === 'function') {
    box = await page.$eval(target, (el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }).catch(() => null);
  }
  if (!box) return null;
  return { x: Math.round(box.x + (box.width / 2)), y: Math.round(box.y + (box.height / 2)) };
}

async function clickTarget(page, target, clickOptions) {
  if (typeof target === 'string') return page.click(target, clickOptions);
  if (target && typeof target.click === 'function') return target.click(clickOptions);
  if (isPoint(target) && page.mouse && typeof page.mouse.click === 'function') {
    return page.mouse.click(target.x, target.y, clickOptions);
  }
  throw new Error('shotkit: demo.click target must be a selector string, Locator, or { x, y } point');
}

function createDemoController({ page, captions = [], captionOptions = {} }) {
  const schedule = normalizeDemoCaptions(captions);
  const timers = [];
  let activeText = '';
  let activeOptions = {};
  let stopped = false;

  async function render(text, options = {}) {
    if (stopped) return;
    activeText = String(text || '');
    activeOptions = options || {};
    try {
      const nextOptions = { ...captionOptions, ...activeOptions };
      if (activeText) await setDemoCaption(page, activeText, nextOptions);
      else await hideDemoCaption(page);
    } catch (_e) {
      // Navigations can briefly destroy the execution context. The next helper
      // call or DOMContentLoaded replay will render the latest caption.
    }
  }

  const replay = () => {
    if (!activeText || stopped) return;
    setTimeout(() => render(activeText, activeOptions), 0);
  };
  page.on('domcontentloaded', replay);

  for (const caption of schedule) {
    timers.push(setTimeout(() => render(caption.text), caption.atMs));
  }

  return {
    caption: (text, options = {}) => render(text, options),

    async step(text, action, options = {}) {
      // Caption display options may be passed explicitly (captionOptions) or flat
      // (e.g. step(text, fn, { position }) by analogy with caption()); honor both
      // so they are not silently dropped. holdMs is the only step-control key.
      const { holdMs, captionOptions, ...displayOptions } = options;
      await render(text, { ...displayOptions, ...(captionOptions || {}) });
      const result = typeof action === 'function' ? await action() : undefined;
      const hold = normalizeDelayMs(holdMs == null ? DEFAULT_STEP_HOLD_MS : holdMs, 'step holdMs');
      if (hold > 0) await page.waitForTimeout(hold);
      return result;
    },

    wait(ms) {
      return page.waitForTimeout(normalizeDelayMs(ms, 'wait ms'));
    },

    async click(target, options = {}) {
      const {
        holdMs = DEFAULT_CLICK_HOLD_MS,
        moveMs = DEFAULT_CLICK_MOVE_MS,
        beforeMs = DEFAULT_CLICK_BEFORE_MS,
        highlight = true,
        ...clickOptions
      } = options;
      const normalizedMoveMs = normalizeDelayMs(moveMs, 'click moveMs');
      const normalizedBeforeMs = normalizeDelayMs(beforeMs, 'click beforeMs');
      const normalizedHoldMs = normalizeDelayMs(holdMs, 'click holdMs');
      const point = highlight ? await targetCenter(page, target) : null;
      if (point) {
        await moveDemoPointer(page, point, { durationMs: normalizedMoveMs });
        if (normalizedMoveMs + normalizedBeforeMs > 0) {
          await page.waitForTimeout(normalizedMoveMs + normalizedBeforeMs);
        }
      }
      await clickTarget(page, target, clickOptions);
      if (point) await pulseDemoPointer(page);
      if (normalizedHoldMs > 0) await page.waitForTimeout(normalizedHoldMs);
    },

    async hide() {
      await render('');
      await hideDemoPointer(page).catch(() => {});
    },

    hidePointer() {
      return hideDemoPointer(page);
    },

    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      page.off('domcontentloaded', replay);
    },
  };
}

module.exports = {
  DEFAULT_CLICK_HOLD_MS,
  DEFAULT_CLICK_BEFORE_MS,
  DEFAULT_CLICK_MOVE_MS,
  DEFAULT_STEP_HOLD_MS,
  analyzeDemoStoryboard,
  createDemoController,
  demoCaptionInitScript,
  ensureDemoCaptionOverlay,
  formatStoryboardLint,
  hideDemoCaption,
  hideDemoPointer,
  installDemoCaptionOverlay,
  lintDemoStoryboard,
  moveDemoPointer,
  normalizeDelayMs,
  normalizeDemoConfigs,
  normalizeDemoCaptions,
  parseTimeToMs,
  pulseDemoPointer,
  setDemoCaption,
  targetCenter,
};
