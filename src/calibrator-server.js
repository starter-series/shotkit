const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile, spawn } = require('child_process');

const {
  applyCalibrationProfiles,
  calibrationProfileHash,
  loadCalibration,
  updateCalibrationProfile,
} = require('./calibration');
const {
  loadApproval,
  syncManifestApproval,
  updateApprovalDecision,
  updateApprovalDecisions,
} = require('./approval');
const {
  resolveCampaignRecipes,
  saveCampaignSelection,
} = require('./campaign');
const {
  createCampaignRunController,
  createCampaignStateReader,
  nextAttempt,
} = require('./campaign-dashboard');
const {
  captureProfileSnapshot,
  hasCalibration,
  updateProfileVerification,
} = require('./calibration-verification');
const { normalizeDemoConfigs } = require('./demo');
const { writeJson } = require('./handoff-files');

const STATIC_DIR = path.join(__dirname, '..', 'calibrator');
const CAMPAIGN_STATIC_DIR = path.join(__dirname, '..', 'campaign');
const MAX_BODY_BYTES = 256 * 1024;
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function securityHeaders() {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function json(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

function safeStaticPathIn(staticDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (_error) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = urlPath === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(staticDir, normalized);
  return resolved.startsWith(`${path.resolve(staticDir)}${path.sep}`) ? resolved : null;
}

function safeStaticPath(urlPath) {
  return safeStaticPathIn(STATIC_DIR, urlPath);
}

function safeCampaignStaticPath(urlPath) {
  const relative = urlPath === '/campaign/'
    ? '/'
    : urlPath.slice('/campaign'.length) || '/';
  return safeStaticPathIn(CAMPAIGN_STATIC_DIR, relative);
}

function serveFile(req, res, filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, securityHeaders()).end('Not found');
    return;
  }
  const size = fs.statSync(filePath).size;
  const range = req.headers.range && /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (!Number.isInteger(start) || start < 0 || start > end || start >= size) {
      res.writeHead(416, { ...securityHeaders(), 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
      ...securityHeaders(),
      'Content-Type': contentType(filePath),
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': contentType(filePath),
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function requestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_error) {
    throw new HttpError(400, 'request body must be valid JSON');
  }
}

function isLoopbackHost(value) {
  return typeof value === 'string' && /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(value);
}

function validateRequestHost(req) {
  if (!isLoopbackHost(req.headers.host)) throw new HttpError(403, 'request host must be local');
}

function validateWriteRequest(req) {
  const contentTypeHeader = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentTypeHeader !== 'application/json') {
    throw new HttpError(415, 'write requests require application/json');
  }
  if (!req.headers.origin) return;
  let origin;
  try {
    origin = new URL(req.headers.origin);
  } catch (_error) {
    throw new HttpError(403, 'request origin must match the local dashboard');
  }
  if (origin.protocol !== 'http:' || origin.host.toLowerCase() !== String(req.headers.host).toLowerCase()) {
    throw new HttpError(403, 'request origin must match the local dashboard');
  }
}

function safeMediaPath(outDir, name) {
  const candidate = path.join(outDir, name);
  try {
    const root = fs.realpathSync(outDir);
    const resolved = fs.realpathSync(candidate);
    return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
  } catch (_error) {
    return null;
  }
}

function safeArea(target, viewport) {
  if (target === 'youtube-shorts') {
    return { x: 40, y: 96, width: Math.max(0, viewport.width - 160), height: Math.max(0, viewport.height - 416) };
  }
  return { x: 48, y: 40, width: Math.max(0, viewport.width - 96), height: Math.max(0, viewport.height - 88) };
}

function assetFor(assets, demoName, role) {
  return assets.find((asset) => asset.role === role && asset.source && asset.source.name === demoName);
}

function profileFor(document, story, target) {
  return document.profiles && document.profiles[story] && document.profiles[story][target]
    ? document.profiles[story][target]
    : {};
}

function applyCalibrationHashes(manifest, calibrationDocument) {
  const targets = manifest.handoff && manifest.handoff.automation
    ? manifest.handoff.automation.targets || []
    : [];
  for (const target of targets) {
    const profile = profileFor(calibrationDocument, target.story, target.target);
    if (!target.profileHash && profile.verification) {
      const profileHash = calibrationProfileHash(profile);
      if (profile.verification.status === 'publish-ready' && profile.verification.profileHash === profileHash) {
        target.profileHash = profileHash;
      }
    }
  }
}

function calibrationApprovalOptions(calibrationDocument) {
  return {
    targetContext(target) {
      const profile = profileFor(calibrationDocument, target.story, target.target);
      const saved = hasProfile(calibrationDocument, target.story, target.target);
      const profileHash = saved ? calibrationProfileHash(profile) : null;
      const verified = !!(saved && profile.verification
        && profile.verification.status === 'publish-ready'
        && profile.verification.profileHash === profileHash
        && (!target.profileHash || target.profileHash === profileHash));
      return { ready: verified, profileHash };
    },
  };
}

function syncApprovalManifest(outDir, approvalDocument, calibrationDocument) {
  const manifestPath = path.join(outDir, 'shotkit-manifest.json');
  const manifest = readJson(manifestPath);
  if (!manifest || !manifest.handoff || !manifest.handoff.automation) return null;
  if (calibrationDocument) applyCalibrationHashes(manifest, calibrationDocument);
  const gate = syncManifestApproval(
    manifest,
    approvalDocument,
    calibrationDocument ? calibrationApprovalOptions(calibrationDocument) : {},
  );
  writeJson(manifestPath, manifest);
  return gate;
}

function hasProfile(document, story, target) {
  return !!(document.profiles && document.profiles[story]
    && Object.prototype.hasOwnProperty.call(document.profiles[story], target));
}

function createStateReader({ cwd, config }) {
  const outDir = path.resolve(cwd, config.outDir || 'store-assets');
  const calibrationEnabled = hasCalibration(config);
  return function state(selected = {}) {
    const calibration = loadCalibration(config, cwd);
    const approval = loadApproval(outDir);
    const demos = applyCalibrationProfiles(normalizeDemoConfigs(config), calibration.document)
      .filter((demo) => demo.target);
    const manifest = readJson(path.join(outDir, 'shotkit-manifest.json'), {});
    if (calibrationEnabled) applyCalibrationHashes(manifest, calibration.document);
    const storyboard = readJson(path.join(outDir, 'storyboard.json'), {});
    const captions = readJson(path.join(outDir, 'captions.json'), {});
    const assets = manifest.assets || [];
    const automationTargets = manifest.handoff && manifest.handoff.automation
      ? manifest.handoff.automation.targets || []
      : [];
    const approvalGate = syncManifestApproval(
      manifest,
      approval.document,
      calibrationEnabled ? calibrationApprovalOptions(calibration.document) : {},
    );
    const approvalByKey = new Map((approvalGate.targets || []).map((item) => [`${item.story}::${item.target}`, item]));
    const storyboardByName = new Map((storyboard.demos || []).map((demo) => [demo.name, demo]));
    const captionByName = new Map((captions.demos || []).map((demo) => [demo.name, demo]));
    const lintByName = new Map((storyboard.storyboardLint || []).map((item) => [item.name, item.warnings || []]));
    const layouts = config.calibration && Array.isArray(config.calibration.layouts)
      ? config.calibration.layouts
      : ['default'];
    const targets = demos.map((demo) => {
      const story = demo.story || demo.name;
      const board = storyboardByName.get(demo.name) || {};
      const caption = captionByName.get(demo.name) || {};
      const viewport = board.viewport || (demo.targetProfile && demo.targetProfile.viewport) || { width: 1280, height: 720 };
      const mp4 = assetFor(assets, demo.name, 'sns-demo-mp4');
      const thumbnail = assetFor(assets, demo.name, 'thumbnail');
      const directVideo = path.join(outDir, `${demo.name}.mp4`);
      const directThumbnail = path.join(outDir, `${demo.name}-thumbnail.png`);
      const publish = automationTargets.find((item) => item.demo === demo.name && item.target === demo.target);
      const approvalTarget = approvalByKey.get(`${story}::${demo.target}`) || {
        status: 'not-ready',
        assetDigest: null,
        stale: false,
      };
      const profile = profileFor(calibration.document, story, demo.target);
      const savedProfile = hasProfile(calibration.document, story, demo.target);
      const profileHash = calibrationEnabled
        ? savedProfile ? calibrationProfileHash(profile) : null
        : approvalTarget.profileHash || (publish && publish.profileHash) || null;
      const verified = !calibrationEnabled || !!(savedProfile && profile.verification
          && publish && publish.status === 'publish-ready'
          && profile.verification.status === 'publish-ready'
          && profile.verification.profileHash === profileHash);
      const publishStatus = publish ? publish.status : 'not-requested';
      const reviewable = publishStatus === 'publish-ready' && verified && !!approvalTarget.assetDigest;
      const reviewStatus = reviewable ? approvalTarget.status : 'not-ready';
      const status = publishStatus === 'publish-ready'
        ? reviewable ? reviewStatus : 'needs-fix'
        : publishStatus;
      const videoName = mp4 && mp4.outPath ? path.basename(mp4.outPath) : path.basename(directVideo);
      const thumbnailName = thumbnail && thumbnail.outPath ? path.basename(thumbnail.outPath) : path.basename(directThumbnail);
      return {
        story,
        target: demo.target,
        name: demo.name,
        status,
        machineStatus: publishStatus,
        viewport,
        safeArea: safeArea(demo.target, viewport),
        videoUrl: fs.existsSync(path.join(outDir, videoName)) ? `/media/${encodeURIComponent(videoName)}` : null,
        thumbnailUrl: fs.existsSync(path.join(outDir, thumbnailName)) ? `/media/${encodeURIComponent(thumbnailName)}` : null,
        beats: board.beats || caption.captions || [],
        captionStyle: caption.style || board.captionStyle || {},
        warnings: lintByName.get(demo.name) || [],
        layouts,
        profile,
        hasProfile: savedProfile,
        profileHash,
        verified,
        reviewable,
        publishable: reviewable && reviewStatus === 'approved',
        review: {
          status: reviewStatus,
          stale: !!approvalTarget.stale,
          ...(approvalTarget.decision ? { decision: approvalTarget.decision } : {}),
        },
        assetDigest: approvalTarget.assetDigest,
      };
    });
    const active = targets.find((item) => item.story === selected.story && item.target === selected.target) || targets[0] || null;
    return {
      project: path.basename(cwd),
      calibratorAvailable: calibrationEnabled,
      calibrationPath: calibration.path ? path.relative(cwd, calibration.path) : null,
      targets,
      selected: active ? { story: active.story, target: active.target } : null,
      approvalStatus: approvalGate.status,
    };
  };
}

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
    attempt: nextAttempt(outDir),
  });
  updateProfileVerification(config, cwd, story, target, result.machineStatus, snapshot);
  return result;
}

function runRecapture({ cwd, configPath, story, target, targets, attempt }) {
  const cliPath = path.join(__dirname, '..', 'bin', 'shotkit.js');
  const targetList = targets || [target];
  const args = [cliPath, cwd, '--json', '--scene', story, '--target', targetList.join(','), '--mp4', '--no-build', '--attempt', String(attempt)];
  const defaultConfigNames = new Set(['shotkit.config.js', 'store.config.js']);
  if (!defaultConfigNames.has(path.basename(configPath))) {
    args.push('--config', path.relative(cwd, configPath));
  }
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, {
      cwd,
      env: { ...process.env, HEADED: '0' },
      timeout: 240_000,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      let payload = null;
      try {
        payload = JSON.parse(String(stdout).trim().split(/\r?\n/).filter(Boolean).at(-1));
      } catch (_parseError) {
        /* handled below */
      }
      if (error || !payload) {
        reject(new Error(payload && payload.error ? payload.error : String(stderr || error || 'recapture failed').trim()));
        return;
      }
      resolve(payload);
    });
  });
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.once('error', () => {});
  child.unref();
}

async function startCalibrator({
  cwd,
  config,
  configPath,
  port = 0,
  open = true,
  view = 'calibrator',
  captureTarget = runRecapture,
}) {
  const calibrationEnabled = hasCalibration(config);
  if (view === 'calibrator' && !calibrationEnabled) {
    throw new Error('shotkit: calibrator requires config.calibration = { from, layouts? }');
  }
  if (!['calibrator', 'campaign'].includes(view)) {
    throw new Error('shotkit: dashboard view must be calibrator or campaign');
  }
  const state = createStateReader({ cwd, config });
  let recapturing = false;
  const outDir = path.resolve(cwd, config.outDir || 'store-assets');
  const calibrationDocument = () => (calibrationEnabled ? loadCalibration(config, cwd).document : null);
  const recipes = resolveCampaignRecipes(config);
  const campaignRuns = createCampaignRunController({
    cwd,
    config,
    configPath,
    outDir,
    recipes,
    runner: captureTarget,
    onRunningChange(value) { recapturing = value; },
  });
  const campaignState = createCampaignStateReader({
    cwd,
    config,
    outDir,
    state,
    recipes,
    getRun: campaignRuns.snapshot,
  });

  syncApprovalManifest(outDir, loadApproval(outDir).document, calibrationDocument());
  const server = http.createServer(async (req, res) => {
    try {
      validateRequestHost(req);
      if (req.method === 'POST') validateWriteRequest(req);
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, state({ story: url.searchParams.get('story'), target: url.searchParams.get('target') }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/campaign') {
        json(res, 200, campaignState());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/campaign/select') {
        if (recapturing) {
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
        if (recapturing) {
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
        if (recapturing) {
          json(res, 409, { ok: false, error: 'review is unavailable while capture is running' });
          return;
        }
        const body = await requestBody(req);
        if (!['approved', 'changes-requested'].includes(body.status)) {
          json(res, 400, { ok: false, error: 'review status must be approved or changes-requested' });
          return;
        }
        if (body.status === 'changes-requested' && (typeof body.note !== 'string' || !body.note.trim())) {
          json(res, 400, { ok: false, error: 'review feedback is required when changes are requested' });
          return;
        }
        if (typeof body.note === 'string' && body.note.trim().length > 2000) {
          json(res, 400, { ok: false, error: 'review feedback must be at most 2000 characters' });
          return;
        }
        const recipe = recipes.find((item) => item.id === body.recipeId);
        if (!recipe) {
          json(res, 400, { ok: false, error: 'shotkit: campaign recipe was not found' });
          return;
        }
        if (!Array.isArray(body.candidates) || !body.candidates.length) {
          json(res, 400, { ok: false, error: 'review candidates must be a non-empty array' });
          return;
        }
        const availableTargets = new Set(recipe.targets.map((target) => target.id));
        const candidateTargets = body.candidates.map((candidate) => candidate && candidate.target);
        if (candidateTargets.some((target) => typeof target !== 'string' || !availableTargets.has(target))
          || new Set(candidateTargets).size !== candidateTargets.length) {
          json(res, 400, { ok: false, error: 'review candidates contain an unavailable or duplicate target' });
          return;
        }
        const current = state();
        const selected = candidateTargets.map((target) => current.targets.find((item) => (
          item.story === recipe.story && item.target === target
        )));
        if (selected.some((target) => !target)) {
          json(res, 404, { ok: false, error: 'configured story/target was not found' });
          return;
        }
        if (selected.some((target) => !target.reviewable)) {
          json(res, 409, { ok: false, error: 'every selected target must be ready for user review' });
          return;
        }
        const stale = selected.some((target, index) => {
          const candidate = body.candidates[index];
          return candidate.assetDigest !== target.assetDigest
            || (candidate.profileHash || null) !== (target.profileHash || null);
        });
        if (stale) {
          json(res, 409, { ok: false, error: 'review candidate is stale; reload the final media before deciding' });
          return;
        }
        const approval = updateApprovalDecisions(outDir, selected.map((target) => ({
          story: recipe.story,
          target: target.target,
          decision: {
            status: body.status,
            assetDigest: target.assetDigest,
            ...(target.profileHash ? { profileHash: target.profileHash } : {}),
            note: body.note,
          },
        })));
        syncApprovalManifest(outDir, approval.document, calibrationDocument());
        json(res, 200, { ok: true, campaign: campaignState() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        if (!calibrationEnabled) {
          json(res, 409, { ok: false, error: 'calibration is not configured for this project' });
          return;
        }
        if (recapturing) {
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
        if (recapturing) {
          json(res, 409, { ok: false, error: 'a recapture is already running' });
          return;
        }
        const body = await requestBody(req);
        if (!configuredTarget(config, body.story, body.target)) {
          json(res, 404, { ok: false, error: 'configured story/target was not found' });
          return;
        }
        recapturing = true;
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
          recapturing = false;
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        if (recapturing) {
          json(res, 409, { ok: false, error: 'review is unavailable while capture is running' });
          return;
        }
        const body = await requestBody(req);
        if (!['approved', 'changes-requested'].includes(body.status)) {
          json(res, 400, { ok: false, error: 'review status must be approved or changes-requested' });
          return;
        }
        if (body.status === 'changes-requested' && (typeof body.note !== 'string' || !body.note.trim())) {
          json(res, 400, { ok: false, error: 'review feedback is required when changes are requested' });
          return;
        }
        if (typeof body.note === 'string' && body.note.trim().length > 2000) {
          json(res, 400, { ok: false, error: 'review feedback must be at most 2000 characters' });
          return;
        }
        const current = state({ story: body.story, target: body.target });
        const selected = current.targets.find((item) => item.story === body.story && item.target === body.target);
        if (!selected) {
          json(res, 404, { ok: false, error: 'configured story/target was not found' });
          return;
        }
        if (!selected.reviewable) {
          json(res, 409, { ok: false, error: 'target must pass machine QA and recapture verification before user review' });
          return;
        }
        if (body.assetDigest !== selected.assetDigest
          || (body.profileHash || null) !== (selected.profileHash || null)) {
          json(res, 409, { ok: false, error: 'review candidate is stale; reload the final media before deciding' });
          return;
        }
        const updated = updateApprovalDecision(outDir, body.story, body.target, {
          status: body.status,
          assetDigest: selected.assetDigest,
          ...(selected.profileHash ? { profileHash: selected.profileHash } : {}),
          note: body.note,
        });
        syncApprovalManifest(outDir, updated.document, calibrationDocument());
        const refreshed = state({ story: body.story, target: body.target });
        json(res, 200, {
          ok: true,
          review: refreshed.targets.find((item) => item.story === body.story && item.target === body.target).review,
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
      json(res, Number.isInteger(error.status) ? error.status : 500, { ok: false, error: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const campaignUrl = `${url}/campaign/`;
  if (open) openBrowser(view === 'campaign' ? campaignUrl : url);
  return {
    server,
    url,
    campaignUrl,
    calibratorUrl: url,
    close: async () => {
      await campaignRuns.wait();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = {
  createCampaignStateReader,
  createStateReader,
  safeCampaignStaticPath,
  safeStaticPath,
  startCalibrator,
};
