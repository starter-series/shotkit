/*
 * shotkit — handoff contract exports.
 *
 * These JSON files are the "starter pack" layer: not a video editor, but a
 * clean bundle of captured assets, captions, story intent, and next-tool hints
 * that Screen Studio / Canva / Supademo / future MCP adapters can consume.
 */

const path = require('path');
const { assetRecord, readProjectInfo, rel } = require('./handoff/assets');
const {
  HANDOFF_KINDS,
  HANDOFF_SCHEMA_IDS,
  HANDOFF_VERSION,
} = require('./handoff/constants');
const { readJsonIfExists, mergeByKey, writeJson } = require('./handoff/io');
const {
  demoCaptions,
  demoStoryboard,
  storyboardLintSummary,
} = require('./handoff/storyboard');
const { buildHandoffRecommendations } = require('./integrations');

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
    tool: 'shotkit',
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

function writeHandoffDocs({ cwd, outDir, config, assets, demoConfigs, demoViewports, demoWarnings, flags, partial = false }) {
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
  // A partial run (scene filter or --no-video) only re-captures a subset, so
  // merge into the existing contract instead of overwriting a prior full run's
  // storyboard/captions/manifest with just this run's subset.
  if (partial) {
    const prevStoryboard = readJsonIfExists(storyboardPath);
    const prevCaptions = readJsonIfExists(captionsPath);
    const prevManifest = readJsonIfExists(manifestPath);
    if (prevStoryboard) {
      docs.storyboard.demos = mergeByKey(prevStoryboard.demos, docs.storyboard.demos, (d) => d.name);
      docs.storyboard.storyboardLint = mergeByKey(prevStoryboard.storyboardLint, docs.storyboard.storyboardLint, (l) => l.name);
    }
    if (prevCaptions) {
      docs.captions.demos = mergeByKey(prevCaptions.demos, docs.captions.demos, (d) => d.name);
    }
    if (prevManifest) {
      docs.manifest.assets = mergeByKey(prevManifest.assets, docs.manifest.assets, (a) => a.id);
    }
  }
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
