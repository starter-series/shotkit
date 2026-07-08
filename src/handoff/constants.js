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

module.exports = {
  HANDOFF_KINDS,
  HANDOFF_SCHEMA_IDS,
  HANDOFF_VERSION,
};
