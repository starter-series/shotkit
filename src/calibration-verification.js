const {
  calibrationProfileHash,
  loadCalibration,
  updateCalibrationProfile,
} = require('./calibration');

function hasCalibration(config) {
  return !!(config.calibration && config.calibration !== false);
}

function profileFor(document, story, target) {
  return document.profiles && document.profiles[story] && document.profiles[story][target]
    ? document.profiles[story][target]
    : {};
}

function captureProfileSnapshot(config, cwd, story, target) {
  if (!hasCalibration(config)) return null;
  const calibration = loadCalibration(config, cwd);
  const profile = profileFor(calibration.document, story, target);
  return { profileHash: calibrationProfileHash(profile) };
}

function updateProfileVerification(config, cwd, story, target, machineStatus, snapshot) {
  if (!snapshot) return { verified: machineStatus === 'publish-ready', profileHash: null };
  const calibration = loadCalibration(config, cwd);
  const profile = profileFor(calibration.document, story, target);
  const profileHash = calibrationProfileHash(profile);
  if (profileHash !== snapshot.profileHash) return { verified: false, profileHash };
  if (machineStatus === 'publish-ready') {
    updateCalibrationProfile(config, cwd, story, target, {
      ...profile,
      verification: {
        profileHash,
        status: machineStatus,
        verifiedAt: new Date().toISOString(),
      },
    });
    return { verified: true, profileHash };
  }
  if (profile.verification) {
    const { verification: _verification, ...unverifiedProfile } = profile;
    updateCalibrationProfile(config, cwd, story, target, unverifiedProfile);
  }
  return { verified: false, profileHash };
}

module.exports = {
  captureProfileSnapshot,
  hasCalibration,
  updateProfileVerification,
};
