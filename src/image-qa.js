const fs = require('fs');
const { PNG } = require('pngjs');

function analyzePng(filePath) {
  try {
    const png = PNG.sync.read(fs.readFileSync(filePath));
    const pixelCount = png.width * png.height;
    const stride = Math.max(1, Math.floor(pixelCount / 100_000));
    const colors = new Set();
    let samples = 0;
    let opaque = 0;
    let mean = 0;
    let sumSquares = 0;

    for (let pixel = 0; pixel < pixelCount; pixel += stride) {
      const offset = pixel * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];
      samples += 1;
      if (a > 16) opaque += 1;
      const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
      const delta = luminance - mean;
      mean += delta / samples;
      sumSquares += delta * (luminance - mean);
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}:${a >> 4}`);
    }

    const luminanceStdDev = samples > 1 ? Math.sqrt(sumSquares / (samples - 1)) : 0;
    const opaqueRatio = samples ? opaque / samples : 0;
    const colorBuckets = colors.size;
    return {
      ok: true,
      width: png.width,
      height: png.height,
      opaqueRatio: Number(opaqueRatio.toFixed(4)),
      luminanceStdDev: Number(luminanceStdDev.toFixed(2)),
      colorBuckets,
      nonBlank: opaqueRatio > 0.5 && (luminanceStdDev >= 3 || colorBuckets >= 8),
    };
  } catch (err) {
    return { ok: false, nonBlank: false, error: err.message };
  }
}

module.exports = { analyzePng };
