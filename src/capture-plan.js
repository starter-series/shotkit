const path = require('path');

const { DEFAULT_BAND_HEIGHT } = require('./caption');
const { hasJsonExtension } = require('./describe');
const { resolveSize } = require('./presets');

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

function wantsAny(only, names) {
  if (only.size === 0) return names.length > 0;
  return names.some((name) => only.has(name));
}

function visualOutputNames(config) {
  return [
    ...(config.scenes || []).map((scene) => scene.name),
    ...(config.promoTiles || []).map((tile) => tile.name),
  ].filter(Boolean);
}

function textOutputNames(config, cwd) {
  if (!config.description || !config.description.from) return [];
  const sourcePath = path.resolve(cwd, config.description.from);
  return hasJsonExtension(sourcePath) ? ['description', 'privacy'] : ['description'];
}

function outputNames(config, cwd, demoConfigs) {
  return [
    ...visualOutputNames(config),
    ...textOutputNames(config, cwd),
    ...demoConfigs.flatMap((demo) => [demo.name, demo.story]).filter(Boolean),
  ];
}

function createCapturePlan({ config, opts = {}, cwd, demoConfigs }) {
  const only = new Set(opts.scenes || []);
  const targetOnly = new Set(opts.targets || []);
  const wants = (name) => only.size === 0 || only.has(name);
  const wantsDemo = (demo) => wants(demo.name) || (demo.story && only.has(demo.story));
  const wantsTarget = (demo) => targetOnly.size === 0 || targetOnly.has(demo.target);
  const requestedDemoConfigs = demoConfigs.filter((demo) => wantsDemo(demo) && wantsTarget(demo));

  if (only.size > 0) {
    const knownNames = new Set(outputNames(config, cwd, demoConfigs));
    const unknownNames = [...only].filter((name) => !knownNames.has(name));
    if (unknownNames.length) {
      throw usageError(`unknown scene: ${unknownNames.join(', ')}. Known: ${[...knownNames].join(', ') || '(none)'}`);
    }
  }
  if (targetOnly.size > 0) {
    const configuredTargets = new Set(demoConfigs.map((demo) => demo.target).filter(Boolean));
    const unknownTargets = [...targetOnly].filter((target) => !configuredTargets.has(target));
    if (unknownTargets.length) {
      throw usageError(`target not configured: ${unknownTargets.join(', ')}. Configured: ${[...configuredTargets].join(', ') || '(none)'}`);
    }
    if (!requestedDemoConfigs.length) {
      throw usageError('no configured demo matches the requested scene and target filters');
    }
  }

  const shouldRunVisualPass = targetOnly.size === 0 && wantsAny(only, visualOutputNames(config));
  const shouldRunTextPass = targetOnly.size === 0 && wantsAny(only, textOutputNames(config, cwd));
  const selectedDemoConfigs = opts.noVideo ? [] : requestedDemoConfigs;
  return {
    cwd,
    only,
    targetOnly,
    wants,
    outDir: path.resolve(cwd, config.outDir || 'store-assets'),
    defaultViewport: resolveSize(config.viewport, DEFAULT_VIEWPORT),
    bandHeight: config.bandHeight || DEFAULT_BAND_HEIGHT,
    passFlags: { liveGt: !!opts.liveGt, freeze: !!opts.freeze },
    demoConfigs,
    requestedDemoConfigs,
    selectedDemoConfigs,
    shouldRunVisualPass,
    shouldRunTextPass,
    needsBrowser: shouldRunVisualPass || selectedDemoConfigs.length > 0,
    partial: only.size > 0 || targetOnly.size > 0 || !!opts.noVideo,
  };
}

module.exports = {
  DEFAULT_VIEWPORT,
  createCapturePlan,
};
