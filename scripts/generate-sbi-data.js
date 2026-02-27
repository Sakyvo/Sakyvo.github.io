const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');
const OUT_FILE = path.join(__dirname, '..', 'data', 'sbi-fingerprints.json');

// Note: crosshair removed — MC renders it via XOR blending, making screenshot comparison meaningless
const TEXTURES = [
  { key: 'diamond_sword', file: 'diamond_sword.png' },
  { key: 'ender_pearl', file: 'ender_pearl.png' },
  { key: 'splash_potion', files: ['splash_potion_of_healing.png', 'potion_bottle_splash.png'] },
  { key: 'steak', file: 'steak.png' },
  { key: 'golden_carrot', file: 'golden_carrot.png' },
  { key: 'iron_sword', file: 'iron_sword.png' },
];

// dHash: resize to 9x8, compare each pixel to its right neighbor → 64 bits
function computeDHash(pixels) {
  const bits = new Uint8Array(8);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const li = (row * 9 + col) * 4;
      const ri = (row * 9 + col + 1) * 4;
      const l = 0.299 * pixels[li] + 0.587 * pixels[li + 1] + 0.114 * pixels[li + 2];
      const r = 0.299 * pixels[ri] + 0.587 * pixels[ri + 1] + 0.114 * pixels[ri + 2];
      const bit = row * 8 + col;
      if (l > r) bits[bit >> 3] |= (1 << (7 - (bit & 7)));
    }
  }
  return Buffer.from(bits).toString('base64');
}

function computeHistogram(pixels, count) {
  const hist = new Float64Array(24);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3] < 128) continue; // skip transparent
    total++;
    hist[Math.min(pixels[i * 4] >> 5, 7)]++;
    hist[8 + Math.min(pixels[i * 4 + 1] >> 5, 7)]++;
    hist[16 + Math.min(pixels[i * 4 + 2] >> 5, 7)]++;
  }
  if (total > 0) for (let i = 0; i < 24; i++) hist[i] /= total;
  return Array.from(hist).map(v => Math.round(v * 10000) / 10000);
}

// Color moments: mean per channel (non-transparent pixels only)
function computeColorMoments(pixels, count) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    sr += pixels[i * 4]; sg += pixels[i * 4 + 1]; sb += pixels[i * 4 + 2];
    n++;
  }
  if (!n) return [0, 0, 0];
  return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
}

async function processTexture(filePath) {
  const img = sharp(filePath);
  const hashBuf = await img.clone().resize(9, 8, { fit: 'fill', kernel: 'nearest' }).raw().ensureAlpha().toBuffer();
  const dhash = computeDHash(hashBuf);
  const histBuf = await img.clone().resize(16, 16, { fit: 'fill', kernel: 'nearest' }).raw().ensureAlpha().toBuffer();
  const hist = computeHistogram(histBuf, 256);
  const moments = computeColorMoments(histBuf, 256);
  return { dhash, hist, moments };
}

async function main() {
  const dirs = fs.readdirSync(THUMB_DIR).filter(d =>
    fs.statSync(path.join(THUMB_DIR, d)).isDirectory()
  );
  console.log(`Processing ${dirs.length} packs...`);
  const packs = {};
  let done = 0;
  for (const dir of dirs) {
    const packDir = path.join(THUMB_DIR, dir);
    const packData = {};
    for (const tex of TEXTURES) {
      const candidates = tex.files || [tex.file];
      let filePath = null;
      for (const f of candidates) {
        const p = path.join(packDir, f);
        if (fs.existsSync(p)) { filePath = p; break; }
      }
      if (!filePath) continue;
      try {
        packData[tex.key] = await processTexture(filePath);
      } catch { /* skip broken */ }
    }
    if (Object.keys(packData).length > 0) packs[dir] = packData;
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${dirs.length}`);
  }
  const result = { version: 2, packs };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result));
  console.log(`Done. ${Object.keys(packs).length} packs → ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
