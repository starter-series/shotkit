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
} = require('./approval');
const { normalizeDemoConfigs } = require('./demo');
const { writeJson } = require('./handoff-files');

const STATIC_DIR = path.join(__dirname, '..', 'calibrator');
const MAX_BODY_BYTES = 256 * 1024;

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

function safeStaticPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (_error) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = urlPath === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(STATIC_DIR, normalized);
  return resolved.startsWith(`${path.resolve(STATIC_DIR)}${path.sep}`) ? resolved : null;
}

function serveFile(req, res, filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  const size = fs.statSync(filePath).size;
  const range = req.headers.range && /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (!Number.isInteger(start) || start < 0 || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
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
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  return function state(selected = {}) {
    const calibration = loadCalibration(config, cwd);
    const approval = loadApproval(outDir);
    const demos = applyCalibrationProfiles(normalizeDemoConfigs(config), calibration.document)
      .filter((demo) => demo.target);
    const manifest = readJson(path.join(outDir, 'shotkit-manifest.json'), {});
    applyCalibrationHashes(manifest, calibration.document);
    const storyboard = readJson(path.join(outDir, 'storyboard.json'), {});
    const captions = readJson(path.join(outDir, 'captions.json'), {});
    const assets = manifest.assets || [];
    const automationTargets = manifest.handoff && manifest.handoff.automation
      ? manifest.handoff.automation.targets || []
      : [];
    const approvalGate = syncManifestApproval(
      manifest,
      approval.document,
      calibrationApprovalOptions(calibration.document),
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
      const profileHash = savedProfile ? calibrationProfileHash(profile) : null;
      const verified = !!(savedProfile && profile.verification
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

function runRecapture({ cwd, configPath, story, target, attempt }) {
  const cliPath = path.join(__dirname, '..', 'bin', 'shotkit.js');
  const args = [cliPath, cwd, '--json', '--scene', story, '--target', target, '--mp4', '--no-build', '--attempt', String(attempt)];
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

async function startCalibrator({ cwd, config, configPath, port = 0, open = true }) {
  if (!config.calibration || config.calibration === false) {
    throw new Error('shotkit: calibrator requires config.calibration = { from, layouts? }');
  }
  const state = createStateReader({ cwd, config });
  let recapturing = false;
  const outDir = path.resolve(cwd, config.outDir || 'store-assets');
  syncApprovalManifest(outDir, loadApproval(outDir).document, loadCalibration(config, cwd).document);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, state({ story: url.searchParams.get('story'), target: url.searchParams.get('target') }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
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
          const manifest = readJson(path.join(outDir, 'shotkit-manifest.json'), {});
          const currentAttempt = manifest.handoff && manifest.handoff.automation
            ? Number(manifest.handoff.automation.attempt) || 0
            : 0;
          const result = await runRecapture({
            cwd,
            configPath,
            story: body.story,
            target: body.target,
            attempt: Math.max(1, currentAttempt + 1),
          });
          if (result.machineStatus === 'publish-ready') {
            const calibration = loadCalibration(config, cwd);
            const profile = profileFor(calibration.document, body.story, body.target);
            const profileHash = calibrationProfileHash(profile);
            updateCalibrationProfile(config, cwd, body.story, body.target, {
              ...profile,
              verification: {
                profileHash,
                status: result.machineStatus,
                verifiedAt: new Date().toISOString(),
              },
            });
          } else {
            const calibration = loadCalibration(config, cwd);
            const profile = profileFor(calibration.document, body.story, body.target);
            if (profile.verification) {
              const { verification: _verification, ...unverifiedProfile } = profile;
              updateCalibrationProfile(config, cwd, body.story, body.target, unverifiedProfile);
            }
          }
          json(res, 200, result);
        } finally {
          recapturing = false;
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        const body = await requestBody(req);
        if (!['approved', 'changes-requested'].includes(body.status)) {
          json(res, 400, { ok: false, error: 'review status must be approved or changes-requested' });
          return;
        }
        if (body.status === 'changes-requested' && (typeof body.note !== 'string' || !body.note.trim())) {
          json(res, 400, { ok: false, error: 'review feedback is required when changes are requested' });
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
        const updated = updateApprovalDecision(outDir, body.story, body.target, {
          status: body.status,
          assetDigest: selected.assetDigest,
          ...(selected.profileHash ? { profileHash: selected.profileHash } : {}),
          note: body.note,
        });
        syncApprovalManifest(outDir, updated.document, loadCalibration(config, cwd).document);
        const refreshed = state({ story: body.story, target: body.target });
        json(res, 200, {
          ok: true,
          review: refreshed.targets.find((item) => item.story === body.story && item.target === body.target).review,
          approvalStatus: refreshed.approvalStatus,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const name = decodeURIComponent(url.pathname.slice('/media/'.length));
        if (!name || path.basename(name) !== name || !/\.(mp4|webm|png|jpe?g)$/i.test(name)) {
          res.writeHead(400).end('Invalid media path');
          return;
        }
        serveFile(req, res, path.join(outDir, name));
        return;
      }
      if (req.method === 'GET') {
        serveFile(req, res, safeStaticPath(url.pathname));
        return;
      }
      res.writeHead(405, { Allow: 'GET, POST' }).end('Method not allowed');
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  if (open) openBrowser(url);
  return { server, url, close: () => new Promise((resolve) => server.close(resolve)) };
}

module.exports = {
  createStateReader,
  safeStaticPath,
  startCalibrator,
};
