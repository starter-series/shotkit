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

const fs = require('fs');
const path = require('path');

// CWS dashboard limits (chars). Summary == "short description".
const LIMITS = { title: 75, summary: 132 };

/**
 * Split a markdown doc into `## Heading` → body sections.
 * @param {string} md
 * @returns {Array<{heading: string, body: string}>}
 */
function splitSections(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      cur = { heading: m[1].trim(), body: '' };
      out.push(cur);
    } else if (cur) {
      cur.body += line + '\n';
    }
  }
  return out.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

/** Find the first section whose heading contains `kw` (case-insensitive). */
function findSection(sections, kw) {
  const lc = kw.toLowerCase();
  const hit = sections.find((s) => s.heading.toLowerCase().includes(lc));
  return hit ? hit.body : '';
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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

function normalizePermission(entry) {
  if (typeof entry === 'string') {
    return { name: entry, purpose: '', disclosure: '', optional: false };
  }
  if (!isObject(entry)) return { name: '', purpose: '', disclosure: '', optional: false };
  return {
    name: asString(entry.name || entry.permission || entry.id),
    purpose: asString(entry.purpose || entry.reason),
    disclosure: asString(entry.disclosure || entry.userFacingReason || entry.reviewNote),
    optional: entry.optional === true,
  };
}

function normalizeDataFlow(entry) {
  if (!isObject(entry)) {
    return { data: '', source: '', destination: '', purpose: '', retention: '' };
  }
  return {
    data: asString(entry.data || entry.type),
    source: asString(entry.source),
    destination: asString(entry.destination || entry.recipient),
    purpose: asString(entry.purpose),
    retention: asString(entry.retention),
  };
}

function escapeTable(value) {
  return asString(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function renderTable(headers, rows, emptyLabel) {
  if (!rows.length) return `${emptyLabel}\n`;
  const headerLine = `| ${headers.join(' |')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeTable).join(' | ')} |`);
  return [headerLine, divider, ...body].join('\n') + '\n';
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

function extractPrivacyDisclosure(manifest) {
  const privacy = isObject(manifest.privacy) ? manifest.privacy : {};
  const permissions = [
    ...asArray(privacy.permissions),
    ...asArray(privacy.hostPermissions).map((entry) => (
      isObject(entry) ? { ...entry, name: entry.name || entry.host || entry.pattern } : entry
    )),
  ].map(normalizePermission).filter((entry) => entry.name);

  const dataFlows = asArray(privacy.dataFlows || privacy.data_flows)
    .map(normalizeDataFlow)
    .filter((entry) => entry.data || entry.destination || entry.purpose);

  const warnings = [];
  for (const p of permissions) {
    if (!p.purpose && !p.disclosure) warnings.push(`permission "${p.name}" has no purpose/disclosure`);
  }
  for (const flow of dataFlows) {
    if (!flow.purpose) warnings.push(`data flow "${flow.data || flow.destination}" has no purpose`);
  }

  return {
    dataCollection: asString(privacy.dataCollection || privacy.data_collection || privacy.collectsData),
    dataUse: asString(privacy.dataUse || privacy.data_use || privacy.use),
    permissions,
    dataFlows,
    notes: asArray(privacy.notes).map(asString).filter(Boolean),
    warnings,
  };
}

function extractProductManifest(manifestPath, opts = {}) {
  const manifest = loadJson(manifestPath);
  return {
    listing: extractProductListing(manifest, opts),
    privacy: extractPrivacyDisclosure(manifest),
  };
}

/**
 * Render the extracted fields into a single copy-paste doc.
 * @param {ReturnType<typeof extractListing>} listing
 * @returns {string}
 */
function renderDescriptionDoc(listing) {
  const block = (label, body) => `## ${label}\n\n${body || '(missing)'}\n`;
  return [
    '# Store listing — copy/paste fields',
    '',
    `> Generated from ${listing.source || 'STORE_LISTING.md'} by shotkit. Edit the`,
    '> source file, not this file.',
    '',
    block('Title', listing.title),
    block('Summary (short description)', listing.summary),
    block('Description', listing.description),
    block("What's new", listing.whatsNew),
    block('Category', listing.category),
    listing.warnings.length ? `> ⚠️ ${listing.warnings.join('; ')}\n` : '',
  ].join('\n');
}

function renderPrivacyDisclosureDoc(privacy) {
  const permissionRows = privacy.permissions.map((p) => [
    p.name,
    p.purpose || '(missing)',
    p.disclosure || '(missing)',
    p.optional ? 'yes' : 'no',
  ]);
  const dataRows = privacy.dataFlows.map((flow) => [
    flow.data || '(unspecified)',
    flow.source || '(unspecified)',
    flow.destination || '(unspecified)',
    flow.purpose || '(missing)',
    flow.retention || '(unspecified)',
  ]);
  const notes = privacy.notes.length ? privacy.notes.map((note) => `- ${note}`).join('\n') : '(none declared)';
  return [
    '# Privacy disclosure worksheet',
    '',
    '> Generated from product.manifest.json by shotkit. This is a review',
    '> worksheet for store disclosures and README permission tables, not a',
    '> privacy policy or legal text.',
    '',
    `## Data collection`,
    '',
    privacy.dataCollection || '(not declared)',
    '',
    `## Data use`,
    '',
    privacy.dataUse || '(not declared)',
    '',
    '## Permissions',
    '',
    renderTable(['Permission', 'Purpose', 'User-facing disclosure', 'Optional'], permissionRows, '(none declared)'),
    '## Data flows',
    '',
    renderTable(['Data', 'Source', 'Destination', 'Purpose', 'Retention'], dataRows, '(none declared)'),
    '## Notes',
    '',
    notes,
    '',
    privacy.warnings.length ? `> ⚠️ ${privacy.warnings.join('; ')}\n` : '',
  ].join('\n');
}

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
