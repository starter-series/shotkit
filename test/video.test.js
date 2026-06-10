const fs = require('fs');
const os = require('os');
const path = require('path');
const { findFfmpeg, buildFfmpegArgs, INSTALL_HINT } = require('../src/video');

describe('buildFfmpegArgs', () => {
  test('mp4 conversion defaults: libx264, yuv420p, faststart, silent, even-dims', () => {
    const args = buildFfmpegArgs({ input: 'in.webm', output: 'out.mp4' });
    expect(args).toEqual([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'in.webm',
      '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart', '-an',
      'out.mp4',
    ]);
  });

  test('trim places -ss before -i (fast seek) and -t after', () => {
    const args = buildFfmpegArgs({ input: 'in.webm', output: 'out.mp4', trim: { start: 2, duration: '00:10' } });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('2');
    expect(args[args.indexOf('-t') + 1]).toBe('00:10');
  });

  test('custom crf is honored', () => {
    const args = buildFfmpegArgs({ input: 'a', output: 'b', crf: 18 });
    expect(args[args.indexOf('-crf') + 1]).toBe('18');
  });

  test('copy mode stream-copies without encoder flags', () => {
    const args = buildFfmpegArgs({ input: 'a.webm', output: 'b.webm', trim: { duration: 5 }, copy: true });
    expect(args).toContain('-c');
    expect(args).not.toContain('libx264');
    expect(args).not.toContain('-movflags');
  });
});

describe('findFfmpeg', () => {
  test('honors SHOTKIT_FFMPEG when it looks like a real ffmpeg', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ff-'));
    const fake = path.join(dir, 'fake-ffmpeg');
    fs.writeFileSync(fake, '#!/bin/sh\necho "ffmpeg version 7.0-test"\n');
    fs.chmodSync(fake, 0o755);
    expect(findFfmpeg({ SHOTKIT_FFMPEG: fake, PATH: '' })).toBe(fake);
  });

  test('returns null when nothing usable exists', () => {
    expect(findFfmpeg({ SHOTKIT_FFMPEG: '/nonexistent/ffmpeg', PATH: '/nonexistent' })).toBeNull();
  });

  test('install hint names the env override', () => {
    expect(INSTALL_HINT).toMatch(/SHOTKIT_FFMPEG/);
  });
});
