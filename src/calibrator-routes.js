const path = require('path');

const {
  loadApproval,
  updateApprovalDecision,
  updateApprovalDecisions,
} = require('./approval');
const { calibrationProfileHash, updateCalibrationProfile } = require('./calibration');
const {
  captureProfileSnapshot,
  updateProfileVerification,
} = require('./calibration-verification');
const {
  HttpError,
  json,
  requestBody,
  safeCampaignStaticPath,
  safeMediaPath,
  safeStaticPath,
  securityHeaders,
  serveFile,
  validateRequestHost,
  validateWriteRequest,
} = require('./calibrator-http');
const { saveCampaignSelection } = require('./campaign');
const { nextAttempt } = require('./campaign-dashboard');
const { normalizeDemoConfigs } = require('./demo');
const { validateCampaignReview, validateSingleReview } = require('./review-request');

function configuredTarget(config, story, target) {
  return normalizeDemoConfigs(config).find((demo) => (
    demo.target === target && (demo.story === story || demo.name === story)
  ));
}

async function recaptureTarget({ cwd, config, configPath, outDir, story, target, runner }) {
  const snapshot = captureProfileSnapshot(config, cwd, story, target);
  const result = await runner({
    cwd,
    configPath,
    story,
    target,
    noBuild: true,
    attempt: nextAttempt(outDir),
  });
  updateProfileVerification(config, cwd, story, target, result.machineStatus, snapshot);
  return result;
}

function createCalibratorRequestHandler({
  cwd,
  config,
  configPath,
  outDir,
  calibrationEnabled,
  state,
  campaignState,
  campaignRuns,
  recipes,
  captureTarget,
  isRecapturing,
  setRecapturing,
  calibrationDocument,
  syncApprovalManifest,
  profileFor,
}) {
  return async function handleCalibratorRequest(req, res) {
    try {
      validateRequestHost(req);
      if (req.method === 'POST') validateWriteRequest(req);
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, state({
          story: url.searchParams.get('story'),
          target: url.searchParams.get('target'),
        }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/campaign') {
        json(res, 200, campaignState());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/campaign/select') {
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'campaign selection cannot change while capture is running' });
          return;
        }
        const body = await requestBody(req);
        try {
          const selection = saveCampaignSelection(outDir, recipes, body);
          campaignRuns.reset();
          json(res, 200, { ok: true, selection, campaign: campaignState() });
        } catch (error) {
          json(res, 400, { ok: false, error: error.message });
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/campaign/run') {
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'a capture is already running' });
          return;
        }
        const body = await requestBody(req);
        try {
          const selection = saveCampaignSelection(outDir, recipes, body);
          const run = campaignRuns.start(selection);
          json(res, 202, { ok: true, run });
        } catch (error) {
          json(res, 400, { ok: false, error: error.message });
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/campaign/review') {
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'review is unavailable while capture is running' });
          return;
        }
        const body = await requestBody(req);
        const review = validateCampaignReview({ body, recipes, current: state() });
        const approval = updateApprovalDecisions(outDir, review.decisions);
        syncApprovalManifest(outDir, approval.document, calibrationDocument());
        json(res, 200, { ok: true, campaign: campaignState() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        if (!calibrationEnabled) {
          json(res, 409, { ok: false, error: 'calibration is not configured for this project' });
          return;
        }
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'profile changes are unavailable while capture is running' });
          return;
        }
        const body = await requestBody(req);
        if (!configuredTarget(config, body.story, body.target)) {
          json(res, 404, { ok: false, error: 'configured story/target was not found' });
          return;
        }
        const updated = updateCalibrationProfile(config, cwd, body.story, body.target, body.profile);
        syncApprovalManifest(outDir, loadApproval(outDir).document, updated.document);
        json(res, 200, {
          ok: true,
          profile: profileFor(updated.document, body.story, body.target),
          profileHash: calibrationProfileHash(body.profile),
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/recapture') {
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'a recapture is already running' });
          return;
        }
        const body = await requestBody(req);
        if (!configuredTarget(config, body.story, body.target)) {
          json(res, 404, { ok: false, error: 'configured story/target was not found' });
          return;
        }
        setRecapturing(true);
        try {
          const result = await recaptureTarget({
            cwd,
            config,
            configPath,
            outDir,
            story: body.story,
            target: body.target,
            runner: captureTarget,
          });
          json(res, 200, result);
        } finally {
          setRecapturing(false);
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        if (isRecapturing()) {
          json(res, 409, { ok: false, error: 'review is unavailable while capture is running' });
          return;
        }
        const body = await requestBody(req);
        const current = state({ story: body.story, target: body.target });
        const { decision } = validateSingleReview({ body, current });
        const updated = updateApprovalDecision(outDir, body.story, body.target, decision);
        syncApprovalManifest(outDir, updated.document, calibrationDocument());
        const refreshed = state({ story: body.story, target: body.target });
        json(res, 200, {
          ok: true,
          review: refreshed.targets.find((item) => (
            item.story === body.story && item.target === body.target
          )).review,
          approvalStatus: refreshed.approvalStatus,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        let name;
        try {
          name = decodeURIComponent(url.pathname.slice('/media/'.length));
        } catch (_error) {
          throw new HttpError(400, 'invalid media path encoding');
        }
        if (!name || path.basename(name) !== name || !/\.(mp4|webm|png|jpe?g)$/i.test(name)) {
          res.writeHead(400, securityHeaders()).end('Invalid media path');
          return;
        }
        const mediaPath = safeMediaPath(outDir, name);
        if (!mediaPath) {
          res.writeHead(404, securityHeaders()).end('Not found');
          return;
        }
        serveFile(req, res, mediaPath);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/campaign') {
        res.writeHead(302, { ...securityHeaders(), Location: '/campaign/' }).end();
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/campaign/')) {
        serveFile(req, res, safeCampaignStaticPath(url.pathname));
        return;
      }
      if (req.method === 'GET') {
        serveFile(req, res, safeStaticPath(url.pathname));
        return;
      }
      res.writeHead(405, { ...securityHeaders(), Allow: 'GET, POST' }).end('Method not allowed');
    } catch (error) {
      json(res, Number.isInteger(error.status) ? error.status : 500, {
        ok: false,
        error: error.message,
      });
    }
  };
}

module.exports = { createCalibratorRequestHandler };
