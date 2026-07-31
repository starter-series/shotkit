const fs = require('fs');
const path = require('path');
const { findSection, splitSections } = require('./markdown');
const { extractPrivacyDisclosure } = require('./privacy');
const { asString, isObject } = require('./utils');

// CWS dashboard limits (chars). Summary == "short description".
const LIMITS = { title: 75, summary: 132 };

function loadJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) throw new Error(`extractProductManifest: ${jsonPath} not found`);
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!isObject(parsed)) throw new Error('top-level value must be an object');
    return parsed;
  } catch (err) {
    throw new Error(`extractProductManifest: ${jsonPath} is not valid JSON (${err.message})`, { cause: err });
  }
}

function hasJsonExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.json';
}

function listingWarnings(fields) {
  const warnings = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    const firstLine = (fields[k] || '').split('\n')[0].trim();
    if (firstLine.length > max) {
      warnings.push(`${k} is ${firstLine.length} chars (CWS max ${max})`);
    }
  }
  return warnings;
}

function pickStore(manifest, channel) {
  const stores = isObject(manifest.stores) ? manifest.stores : {};
  const listing = isObject(manifest.listing) ? manifest.listing : {};
  return (
    (isObject(stores[channel]) && stores[channel]) ||
    (isObject(stores.chromeWebStore) && stores.chromeWebStore) ||
    (isObject(listing[channel]) && listing[channel]) ||
    (isObject(listing.chromeWebStore) && listing.chromeWebStore) ||
    (isObject(listing) && listing) ||
    {}
  );
}

/**
 * @param {string} mdPath
 * @returns {{title:string, summary:string, description:string, whatsNew:string, category:string, warnings:string[]}}
 */
function extractListing(mdPath) {
  if (!fs.existsSync(mdPath)) throw new Error(`extractListing: ${mdPath} not found`);
  const sections = splitSections(fs.readFileSync(mdPath, 'utf8'));

  const fields = {
    title: findSection(sections, 'title'),
    summary: findSection(sections, 'summary'),
    description: findSection(sections, 'description'),
    whatsNew: findSection(sections, "what's new") || findSection(sections, 'whats new'),
    category: findSection(sections, 'category'),
  };

  return { ...fields, source: 'STORE_LISTING.md', warnings: listingWarnings(fields) };
}

function extractProductListing(manifest, opts = {}) {
  const channel = opts.channel || 'chromeWebStore';
  const product = isObject(manifest.product) ? manifest.product : manifest;
  const store = pickStore(manifest, channel);
  const release = isObject(manifest.release) ? manifest.release : {};

  const fields = {
    title: asString(store.title || product.title || product.name),
    summary: asString(store.summary || store.shortDescription || product.summary || product.tagline),
    description: asString(store.description || product.description),
    whatsNew: asString(store.whatsNew || store.whats_new || release.whatsNew || release.notes),
    category: asString(store.category || product.category),
  };

  return { ...fields, source: `product.manifest.json:${channel}`, warnings: listingWarnings(fields) };
}

function extractProductManifest(manifestPath, opts = {}) {
  const manifest = loadJson(manifestPath);
  return {
    listing: extractProductListing(manifest, opts),
    privacy: extractPrivacyDisclosure(manifest),
  };
}

module.exports = {
  extractListing,
  extractProductListing,
  extractProductManifest,
  hasJsonExtension,
};
