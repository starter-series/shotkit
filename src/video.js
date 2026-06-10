/*
 * shotkit — demo video post-processing (mp4 conversion + trim).
 *
 * X/Twitter and most SNS uploaders want H.264 MP4, not the vp8 webm that
 * Playwright records. Conversion needs a REAL ffmpeg: Playwright's bundled
 * ffmpeg is a minimal vp8-only build (no libx264 — verified empirically), so
 * we resolve, in order:
 *   1. SHOTKIT_FFMPEG (explicit binary path)
 *   2. `ffmpeg` on PATH (GitHub ubuntu runners ship one; macOS: `brew install ffmpeg`)
 * If mp4/trim was requested and no ffmpeg is found we fail loudly with the
 * install hint — a requested output is never silently skipped.
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
 * @param {boolean} [o.copy=false]  stream-copy (no re-encode) — for webm-only trims
 */
function buildFfmpegArgs({ input, output, trim, crf = 23, copy = false }) {
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
      // libx264 + yuv420p require even dimensions; presets are even already,
      // this scale filter is insurance for custom viewports.
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      // Screencasts are silent; skipping the audio track avoids any AAC
      // encoder dependency and SNS uploaders accept silent H.264 fine.
      '-an',
    );
  }
  args.push(output);
  return args;
}

/**
 * Post-process a recorded demo webm per config:
 *   - mp4 requested → write `<name>.mp4` next to the webm (trim applied there)
 *   - trim only     → stream-copy trim the webm in place
 *
 * @param {object} o
 * @param {string} o.webmPath  the recorded demo .webm
 * @param {boolean|{crf?: number}} [o.mp4]
 * @param {{start?: string|number, duration?: string|number}} [o.trim]
 * @param {(msg: string) => void} o.log
 * @param {NodeJS.ProcessEnv} [o.env]
 * @returns {string[]} extra produced file paths (the mp4, when written)
 */
function postProcessDemo({ webmPath, mp4, trim, log, env = process.env }) {
  if (!mp4 && !trim) return [];
  const bin = findFfmpeg(env);
  if (!bin) throw new Error(`demo mp4/trim requested but ${INSTALL_HINT}`);

  const produced = [];
  if (mp4) {
    const crf = typeof mp4 === 'object' && mp4.crf != null ? mp4.crf : undefined;
    const mp4Path = webmPath.replace(/\.webm$/, '.mp4');
    execFileSync(bin, buildFfmpegArgs({ input: webmPath, output: mp4Path, trim, crf }), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    produced.push(mp4Path);
    log(`✓ ${path.basename(mp4Path)} (H.264${trim ? ', trimmed' : ''})`);
  } else {
    // Trim-only: stream-copy to a sibling temp file, then swap in place.
    const tmp = `${webmPath}.trim.webm`;
    execFileSync(bin, buildFfmpegArgs({ input: webmPath, output: tmp, trim, copy: true }), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    fs.renameSync(tmp, webmPath);
    log(`✓ ${path.basename(webmPath)} trimmed in place`);
  }
  return produced;
}

module.exports = { findFfmpeg, buildFfmpegArgs, postProcessDemo, INSTALL_HINT };
