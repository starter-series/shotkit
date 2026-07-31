/*
 * Store-asset harness — listing copy extractor.
 *
 * Store listing copy can live in either:
 *   - a human-edited STORE_LISTING.md, or
 *   - product.manifest.json shared with other launch tooling.
 *
 * Both paths produce a copy-paste-ready description.md, and the manifest path
 * can also produce a privacy-disclosure.md worksheet. The worksheet is evidence
 * for store review, not legal policy text.
 */

const { extractListing, extractProductListing, extractProductManifest, hasJsonExtension } = require('./describe/listing');
const { splitSections } = require('./describe/markdown');
const { extractPrivacyDisclosure } = require('./describe/privacy');
const { renderDescriptionDoc, renderPrivacyDisclosureDoc } = require('./describe/render');

module.exports = {
  extractListing,
  extractPrivacyDisclosure,
  extractProductListing,
  extractProductManifest,
  hasJsonExtension,
  renderDescriptionDoc,
  renderPrivacyDisclosureDoc,
  splitSections,
};
