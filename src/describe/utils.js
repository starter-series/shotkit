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

module.exports = {
  asArray,
  asString,
  isObject,
  renderTable,
};
