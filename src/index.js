/*
 * shotkit — public API.
 *
 * shotkit drives a BUILT browser extension (or any HTML) with Playwright and
 * captures store/social assets: screenshots, promo images, and a demo
 * screencast. One engine, used via the CLI (`shotkit`), programmatically
 * (`capture()`), or (planned) an MCP server.
 *
 * Config authors typically use `capture` indirectly (via the CLI) and import
 * the helpers below inside their `shotkit.config.js` to set up scenes:
 *   - serveDirectory          — tiny localhost fixture server (path-traversal safe)
 *   - stageExtension          — copy an extension's files to a temp dir
 *   - patchManifestForLocalhost — widen a manifest so content scripts hit localhost
 *   - PRESETS / resolveSize    — named output sizes (CWS + SNS)
 */

const { capture, DEFAULT_VIEWPORT } = require('./capture');
const { launchWithExtension, closeContext } = require('./launch');
const { serveDirectory, FIXTURE_CSP } = require('./serve');
const { stageExtension, patchManifestForLocalhost, LOCALHOST_MATCHES } = require('./extension');
const { compositeCaption, DEFAULT_BAND_HEIGHT } = require('./caption');
const { renderPromoTile } = require('./promo');
const { extractListing, renderDescriptionDoc, splitSections } = require('./describe');
const { PRESETS, resolveSize } = require('./presets');
const { findFfmpeg, buildFfmpegArgs, postProcessDemo } = require('./video');

module.exports = {
  capture,
  DEFAULT_VIEWPORT,
  // launch
  launchWithExtension,
  closeContext,
  // fixtures
  serveDirectory,
  FIXTURE_CSP,
  // extension staging
  stageExtension,
  patchManifestForLocalhost,
  LOCALHOST_MATCHES,
  // rendering
  compositeCaption,
  DEFAULT_BAND_HEIGHT,
  renderPromoTile,
  // listing copy
  extractListing,
  renderDescriptionDoc,
  splitSections,
  // sizes
  PRESETS,
  resolveSize,
  // demo video post-processing
  findFfmpeg,
  buildFfmpegArgs,
  postProcessDemo,
};
