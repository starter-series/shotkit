/*
 * shotkit — demo video post-processing (mp4 conversion + trim + framing).
 *
 * X/Twitter and most SNS uploaders want H.264 MP4, not the vp8 webm that
 * Playwright records. Conversion needs a REAL ffmpeg: Playwright's bundled
 * ffmpeg is a minimal vp8-only build (no libx264 — verified empirically), so
 * we resolve, in order:
 *   1. SHOTKIT_FFMPEG (explicit binary path)
 *   2. `ffmpeg` on PATH (GitHub ubuntu runners ship one; macOS: `brew install ffmpeg`)
 * If mp4/trim/crop/zoom/thumbnail was requested and no ffmpeg is found we fail
 * loudly with the install hint — a requested output is never silently skipped.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const INSTALL_HINT =
  'no ffmpeg found — install one (macOS: `brew install ffmpeg`; Debian/Ubuntu: ' +
  '`apt-get install -y ffmpeg`; GitHub ubuntu runners already have it) or set ' +
  "SHOTKIT_FFMPEG to a binary. Playwright's bundled ffmpeg cannot encode H.264.";

/**
 * Locate a usable ffmpeg. Returns the binary path/name, or null.
 * @param {NodeJS.ProcessEnv} [env]
 */
function findFfmpeg(env = process.env) {
  for (const bin of [env.SHOTKIT_FFMPEG, 'ffmpeg']) {
    if (!bin) continue;
    try {
      const r = spawnSync(bin, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', env });
      if (r.status === 0 && /ffmpeg version/i.test(r.stdout || '')) return bin;
    } catch (_e) {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * Build the ffmpeg argv. Pure (unit-tested).
 *
 * @param {object} o
 * @param {string} o.input
 * @param {string} o.output
 * @param {{start?: string|number, duration?: string|number}} [o.trim]
 * @param {number} [o.crf=23]  H.264 quality (lower = better/larger)
 * @param {{x:number,y:number,width:number,height:number}} [o.crop]
 * @param {number|{scale?: number, x?: string|number, y?: string|number}} [o.zoom]
 * @param {boolean} [o.copy=false]  stream-copy (no re-encode) — for webm-only trims
 */
function buildFfmpegArgs({ input, output, trim, crf = 23, crop, zoom, copy = false }) {
  if (!copy && (!Number.isFinite(Number(crf)) || Number(crf) < 0 || Number(crf) > 63)) {
    throw new Error('shotkit: demo.mp4.crf must be a number between 0 and 63');
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  // -ss before -i = fast keyframe seek; with re-encode it is frame-accurate.
  if (trim && trim.start != null) args.push('-ss', String(trim.start));
  args.push('-i', input);
  if (trim && trim.duration != null) args.push('-t', String(trim.duration));
  if (copy) {
    args.push('-c', 'copy');
  } else {
    args.push(
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-vf', buildVideoFilter({ crop, zoom }),
      '-movflags', '+faststart',
      // Screencasts are silent; skipping the audio track avoids any AAC
      // encoder dependency and SNS uploaders accept silent H.264 fine.
      '-an',
    );
  }
  args.push(output);
  return args;
}

function buildVideoFilter({ crop, zoom } = {}) {
  const filters = [];
  if (crop) {
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(crop[key])) throw new Error(`shotkit: demo.crop.${key} must be a finite number`);
    }
    if (crop.width <= 0 || crop.height <= 0) {
      throw new Error('shotkit: demo.crop.width and demo.crop.height must be greater than 0');
    }
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }
  if (zoom) {
    const scale = typeof zoom === 'number' ? zoom : zoom.scale;
    if (!Number.isFinite(scale) || scale <= 1) throw new Error('shotkit: demo.zoom scale must be > 1');
    for (const key of ['x', 'y']) {
      if (typeof zoom === 'object' && typeof zoom[key] === 'number' && !Number.isFinite(zoom[key])) {
        throw new Error(`shotkit: demo.zoom.${key} must be a finite number`);
      }
    }
    const x = typeof zoom === 'object' && zoom.x != null ? zoom.x : `(iw-iw/${scale})/2`;
    const y = typeof zoom === 'object' && zoom.y != null ? zoom.y : `(ih-ih/${scale})/2`;
    filters.push(`crop=iw/${scale}:ih/${scale}:${x}:${y}`);
    filters.push(`scale=ceil(iw*${scale}/2)*2:ceil(ih*${scale}/2)*2`);
  }
  // libx264 + yuv420p require even dimensions; presets are even already, this
  // final scale filter is insurance for custom viewports/crops.
  filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  return filters.join(',');
}

function buildThumbnailArgs({ input, output, at = 1 }) {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', input, '-frames:v', '1', output];
}

/**
 * Post-process a recorded demo webm per config:
 *   - mp4 requested → write `<name>.mp4` next to the webm (trim applied there)
 *   - trim only     → stream-copy trim the webm in place
 *   - thumbnail     → write `<name>-thumbnail.png` from the final clip
 *
 * @param {object} o
 * @param {string} o.webmPath  the recorded demo .webm
 * @param {boolean|{crf?: number}} [o.mp4]
 * @param {{start?: string|number, duration?: string|number}} [o.trim]
 * @param {{x:number,y:number,width:number,height:number}} [o.crop]
 * @param {number|{scale?: number, x?: string|number, y?: string|number}} [o.zoom]
 * @param {boolean|{at?: string|number, name?: string}} [o.thumbnail]
 * @param {(msg: string) => void} o.log
 * @param {NodeJS.ProcessEnv} [o.env]
 * @returns {string[]} extra produced file paths
 */
function postProcessDemo({ webmPath, mp4, trim, crop, zoom, thumbnail, log, env = process.env }) {
  if (!mp4 && !trim && !crop && !zoom && !thumbnail) return [];
  const bin = findFfmpeg(env);
  if (!bin) throw new Error(`demo mp4/trim/crop/zoom/thumbnail requested but ${INSTALL_HINT}`);

  const produced = [];
  let finalVideoPath = webmPath;
  if (mp4 || crop || zoom) {
    const crf = typeof mp4 === 'object' && mp4.crf != null ? mp4.crf : undefined;
    const mp4Path = webmPath.replace(/\.webm$/, '.mp4');
    execFileSync(bin, buildFfmpegArgs({ input: webmPath, output: mp4Path, trim, crf, crop, zoom }), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    produced.push(mp4Path);
    finalVideoPath = mp4Path;
    const notes = ['H.264'];
    if (trim) notes.push('trimmed');
    if (crop) notes.push('cropped');
    if (zoom) notes.push('zoomed');
    log(`✓ ${path.basename(mp4Path)} (${notes.join(', ')})`);
  } else {
    // Trim-only: stream-copy to a sibling temp file, then swap in place.
    const tmp = `${webmPath}.trim.webm`;
    execFileSync(bin, buildFfmpegArgs({ input: webmPath, output: tmp, trim, copy: true }), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    fs.renameSync(tmp, webmPath);
    log(`✓ ${path.basename(webmPath)} trimmed in place`);
  }
  if (thumbnail) {
    const at = typeof thumbnail === 'object' && thumbnail.at != null ? thumbnail.at : 1;
    const thumbPath = typeof thumbnail === 'object' && thumbnail.name
      ? path.join(path.dirname(webmPath), thumbnail.name)
      : webmPath.replace(/\.webm$/, '-thumbnail.png');
    execFileSync(bin, buildThumbnailArgs({ input: finalVideoPath, output: thumbPath, at }), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    // ffmpeg exits 0 even when `at` seeks past the end of a (trimmed) clip,
    // writing no file. Only record the thumbnail when it was actually produced,
    // so the manifest never references a phantom asset.
    if (fs.existsSync(thumbPath)) {
      produced.push(thumbPath);
      log(`✓ ${path.basename(thumbPath)} (thumbnail @ ${at}s)`);
    } else {
      log(`⚠️  thumbnail @ ${at}s not written (seek past end of clip?) — skipped`);
    }
  }
  return produced;
}

module.exports = { findFfmpeg, buildFfmpegArgs, buildThumbnailArgs, buildVideoFilter, postProcessDemo, INSTALL_HINT };
