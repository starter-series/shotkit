const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  splitSections,
  extractListing,
  extractProductManifest,
  renderDescriptionDoc,
  renderPrivacyDisclosureDoc,
} = require('../src/describe');

const MD = `# Listing

## Title
My Ext — short pitch

## Summary (max 132 chars)
The one-line pitch.

## Description
Body paragraph here.

## What's New
- a
- b

## Category
Productivity
`;

function tmpMd(content) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-md-')), 'LISTING.md');
  fs.writeFileSync(p, content);
  return p;
}

function tmpJson(value) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-json-')), 'product.manifest.json');
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
  return p;
}

describe('describe', () => {
  test('splitSections returns each ## section', () => {
    expect(splitSections(MD).map((s) => s.heading)).toEqual([
      'Title',
      'Summary (max 132 chars)',
      'Description',
      "What's New",
      'Category',
    ]);
  });

  test('extractListing maps fields by keyword', () => {
    const l = extractListing(tmpMd(MD));
    expect(l.title).toBe('My Ext — short pitch');
    expect(l.summary).toBe('The one-line pitch.');
    expect(l.description).toContain('Body paragraph');
    expect(l.whatsNew).toContain('- a');
    expect(l.category).toBe('Productivity');
    expect(l.warnings).toEqual([]);
  });

  test('flags an over-length summary', () => {
    const l = extractListing(tmpMd(MD.replace('The one-line pitch.', 'x'.repeat(140))));
    expect(l.warnings.join(' ')).toMatch(/summary is 140 chars/);
  });

  test('missing file throws', () => {
    expect(() => extractListing('/no/such/listing.md')).toThrow(/not found/);
  });

  test('renderDescriptionDoc embeds the fields', () => {
    const doc = renderDescriptionDoc(extractListing(tmpMd(MD)));
    expect(doc).toContain('## Title');
    expect(doc).toContain('My Ext — short pitch');
    expect(doc).toContain('Productivity');
  });

  test('extractProductManifest maps listing and privacy disclosure fields', () => {
    const product = extractProductManifest(tmpJson({
      product: {
        name: 'SkillBridge',
        summary: 'Translate selected text safely.',
        description: 'A browser extension for protected-term translation.',
      },
      stores: {
        chromeWebStore: {
          title: 'SkillBridge Translator',
          category: 'Productivity',
          whatsNew: '- Rebuilt privacy disclosures',
        },
      },
      privacy: {
        dataCollection: 'No sale of personal data.',
        dataUse: 'Selected text is sent only when the user requests translation.',
        permissions: [
          {
            name: 'storage',
            purpose: 'Save local preferences',
            disclosure: 'Stores settings on this device.',
          },
        ],
        hostPermissions: [
          {
            host: 'https://translation.example/*',
            purpose: 'Send translation requests',
            disclosure: 'Only selected text is sent after user action.',
            optional: true,
          },
        ],
        dataFlows: [
          {
            data: 'Selected text',
            source: 'Active page',
            destination: 'Translation API',
            purpose: 'Return translated text',
            retention: 'Not retained by the extension',
          },
        ],
        notes: ['Review this worksheet before store submission.'],
      },
    }));
    expect(product.listing.title).toBe('SkillBridge Translator');
    expect(product.listing.summary).toBe('Translate selected text safely.');
    expect(product.listing.description).toContain('protected-term');
    expect(product.listing.category).toBe('Productivity');
    expect(product.privacy.permissions.map((p) => p.name)).toEqual(['storage', 'https://translation.example/*']);
    expect(product.privacy.dataFlows[0].purpose).toBe('Return translated text');
    expect(product.privacy.warnings).toEqual([]);
  });

  test('renderPrivacyDisclosureDoc is a worksheet, not legal policy text', () => {
    const { privacy } = extractProductManifest(tmpJson({
      privacy: {
        permissions: [{ name: 'tabs', purpose: 'Detect current tab', disclosure: 'Used to capture the active page.' }],
        dataFlows: [{ data: 'URL', destination: 'Local log', purpose: 'Debug capture fixtures' }],
      },
    }));
    const doc = renderPrivacyDisclosureDoc(privacy);
    expect(doc).toContain('# Privacy disclosure worksheet');
    expect(doc).toContain('not a');
    expect(doc).toContain('| tabs | Detect current tab | Used to capture the active page. | no |');
    expect(doc).toContain('| URL | (unspecified) | Local log | Debug capture fixtures | (unspecified) |');
  });
});
