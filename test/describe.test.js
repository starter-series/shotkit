const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitSections, extractListing, renderDescriptionDoc } = require('../src/describe');

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
});
