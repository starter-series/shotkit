/*
 * shotkit — handoff contract exports.
 *
 * These JSON files are the "starter pack" layer: not a video editor, but a
 * clean bundle of captured assets, captions, story intent, and next-tool hints
 * that Screen Studio / Canva / Supademo / future MCP adapters can consume.
 */

const fs = require('fs');
const path = require('path');
const { normalizeDemoCaptions } = require('./demo');
const { buildHandoffRecommendations } = require('./integrations');

const HANDOFF_VERSION = 1;
const HANDOFF_KINDS = Object.freeze({
  manifest: 'shotkit.manifest',
  storyboard: 'shotkit.storyboard',
  captions: 'shotkit.captions',
});
const HANDOFF_SCHEMA_IDS = Object.freeze({
  manifest: 'urn:starter-series:shotkit:schema:shotkit-manifest:v1',
  storyboard: 'urn:starter-series:shotkit:schema:storyboard:v1',
  captions: 'urn:starter-series:shotkit:schema:captions:v1',
});

function readProjectInfo(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private,
    };
  } catch (_e) {
    return {};
  }
}

function rel(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}

function ext(filePath) {
  return path.extname(filePath).replace(/^\./, '').toLowerCase();
}

function stableIdPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function assetRecord({ cwd, outDir, filePath, name, type, role, width, height, source }) {
  const assetName = name || path.basename(filePath, path.extname(filePath));
  return {
    id: `${stableIdPart(role)}:${stableIdPart(assetName)}`,
    name: assetName,
    type,
    role,
    format: ext(filePath),
    path: rel(cwd, filePath),
    outPath: rel(outDir, filePath),
    width,
    height,
    source,
  };
}

function demoAudience(demoConfig) {
  return demoConfig.audience || demoConfig.channel || 'sns';
}

function demoNextTool(demoConfig) {
  if (demoConfig.nextTool) return demoConfig.nextTool;
  if (demoConfig.handoff && demoConfig.handoff.nextTool) return demoConfig.handoff.nextTool;
  return 'manual-editor';
}

function demoStoryboard(demoConfig, viewport) {
  const captions = normalizeDemoCaptions(demoConfig.captions || []);
  return {
    name: demoConfig.name,
    audience: demoAudience(demoConfig),
    preset: demoConfig.preset,
    viewport,
    recommendedNextTool: demoNextTool(demoConfig),
    trim: demoConfig.trim || null,
    framing: {
      crop: demoConfig.crop || null,
      zoom: demoConfig.zoom || null,
    },
    thumbnail: demoConfig.thumbnail || null,
    recommendedStory: {
      durationSeconds: { min: 20, max: 40 },
      shape: ['result-first', 'action', 'proof', 'safety-restore'],
    },
    beats: captions.map((caption) => ({
      at: caption.atMs / 1000,
      atMs: caption.atMs,
      text: caption.text,
    })),
    guidance: demoConfig.guidance || null,
  };
}

function demoCaptions(demoConfig) {
  return {
    name: demoConfig.name,
    captions: normalizeDemoCaptions(demoConfig.captions || []).map((caption) => ({
      at: caption.atMs / 1000,
      atMs: caption.atMs,
      text: caption.text,
    })),
  };
}

function storyboardLintSummary(warnings) {
  return Object.entries(warnings || {}).map(([name, items]) => ({
    name,
    ok: !items.length,
    warnings: items,
  }));
}

function buildHandoffDocs({ cwd, outDir, config, assets, demoConfigs, demoViewports, demoWarnings, flags }) {
  const generatedAt = new Date().toISOString();
  const project = readProjectInfo(cwd);
  const adapterHints = buildHandoffRecommendations({ assets, config });
  const storyboard = {
    $schema: HANDOFF_SCHEMA_IDS.storyboard,
    kind: HANDOFF_KINDS.storyboard,
    version: HANDOFF_VERSION,
    generatedAt,
    project,
    purpose: 'browser-extension-demo-starter-pack',
    demos: demoConfigs.map((demoConfig) => demoStoryboard(demoConfig, demoViewports[demoConfig.name])),
    storyboardLint: storyboardLintSummary(demoWarnings),
  };
  const captions = {
    $schema: HANDOFF_SCHEMA_IDS.captions,
    kind: HANDOFF_KINDS.captions,
    version: HANDOFF_VERSION,
    generatedAt,
    project,
    demos: demoConfigs.map((demoConfig) => demoCaptions(demoConfig)),
  };
  const manifest = {
    $schema: HANDOFF_SCHEMA_IDS.manifest,
    kind: HANDOFF_KINDS.manifest,
    version: HANDOFF_VERSION,
    generatedAt,
    tool: '@starter-series/shotkit',
    project,
    outDir: rel(cwd, outDir),
    flags,
    positioning: 'capture-and-handoff-kit',
    handoff: {
      contractVersion: HANDOFF_VERSION,
      schemas: HANDOFF_SCHEMA_IDS,
      storyboards: 'storyboard.json',
      captions: 'captions.json',
      recommendedFlow: [
        'use shotkit outputs as source evidence',
        'polish in Screen Studio, Canva, Supademo, or another editor',
        'keep repo fixtures and storyboard as the repeatable source of truth',
      ],
      adapterHints,
    },
    assets,
    config: {
      disclaimer: config.disclaimer || null,
      description: config.description || null,
    },
  };
  return { storyboard, captions, manifest };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeHandoffDocs({ cwd, outDir, config, assets, demoConfigs, demoViewports, demoWarnings, flags }) {
  const storyboardPath = path.join(outDir, 'storyboard.json');
  const captionsPath = path.join(outDir, 'captions.json');
  const manifestPath = path.join(outDir, 'shotkit-manifest.json');
  const contractAssets = [
    assetRecord({
      cwd, outDir, filePath: storyboardPath,
      name: 'storyboard', type: 'json', role: 'storyboard-contract',
      source: { kind: 'handoff' },
    }),
    assetRecord({
      cwd, outDir, filePath: captionsPath,
      name: 'captions', type: 'json', role: 'captions-contract',
      source: { kind: 'handoff' },
    }),
    assetRecord({
      cwd, outDir, filePath: manifestPath,
      name: 'shotkit-manifest', type: 'json', role: 'handoff-manifest',
      source: { kind: 'handoff' },
    }),
  ];
  const docs = buildHandoffDocs({
    cwd,
    outDir,
    config,
    assets: [...assets, ...contractAssets],
    demoConfigs,
    demoViewports,
    demoWarnings,
    flags,
  });
  writeJson(storyboardPath, docs.storyboard);
  writeJson(captionsPath, docs.captions);
  writeJson(manifestPath, docs.manifest);
  return [storyboardPath, captionsPath, manifestPath];
}

module.exports = {
  HANDOFF_KINDS,
  HANDOFF_SCHEMA_IDS,
  HANDOFF_VERSION,
  assetRecord,
  buildHandoffDocs,
  demoStoryboard,
  writeHandoffDocs,
};
