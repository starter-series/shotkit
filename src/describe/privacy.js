const { asArray, asString, isObject } = require('./utils');

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

module.exports = {
  extractPrivacyDisclosure,
};
