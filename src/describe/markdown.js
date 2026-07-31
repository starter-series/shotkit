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

module.exports = {
  findSection,
  splitSections,
};
