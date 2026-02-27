const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');
const OUT_FILE = path.join(__dirname, '..', 'data', 'sbi-fingerprints.json');

const TEXTURES = [
  { key: 'diamond_sword', file: 'diamond_sword.png', size: 16 },
  { key: 'ender_pearl', file: 'ender_pearl.png', size: 16 },
  { key: 'splash_potion', files: ['splash_potion_of_healing.png', 'potion_bottle_splash.png'], size: 16 },
  { key: 'steak', file: 'steak.png', size: 16 },
  { key: 'golden_carrot', file: 'golden_carrot.png', size: 16 },
  { key: 'crosshair', file: 'icons.png', size: 15, crop: true }
];

async function computeAHash(pixels, w, h) {
  // Resize to 8x8 grayscale conceptually from raw RGBA
  const gray = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const avg = sum / gray.length;
  const bits = new Uint8Array(Math.ceil(gray.length / 8));
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] >= avg) bits[i >> 3] |= (1 << (7 - (i & 7)));
  }
  return Buffer.from(bits).toString('base64');
}

function computeHistogram(pixels, count) {
  const hist = new Float64Array(24); // 8 bins per channel
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = pixels[i * 4 + 3];
    if (a < 128) continue; // skip transparent
    total++;
    hist[Math.min(pixels[i * 4] >> 5, 7)]++;
    hist[8 + Math.min(pixels[i * 4 + 1] >> 5, 7)]++;
    hist[16 + Math.min(pixels[i * 4 + 2] >> 5, 7)]++;
  }
  if (total > 0) for (let i = 0; i < 24; i++) hist[i] /= total;
  return Array.from(hist).map(v => Math.round(v * 10000) / 10000);
}

async function processTexture(filePath, texDef) {
  let img = sharp(filePath);
  if (texDef.crop) {
    // icons.png: crosshair is at top-left 15x15
    img = img.extract({ left: 0, top: 0, width: 15, height: 15 });
  }
  const targetSize = texDef.size || 16;
  // Resize to 8x8 for aHash
  const hashBuf = await img.clone().resize(8, 8, { fit: 'fill' }).raw().ensureAlpha().toBuffer();
  const ahash = await computeAHash(hashBuf, 8, 8);
  // Resize to target for histogram
  const histBuf = await img.clone().resize(targetSize, targetSize, { fit: 'fill' }).raw().ensureAlpha().toBuffer();
  const hist = computeHistogram(histBuf, targetSize * targetSize);
  return { ahash, hist };
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
        packData[tex.key] = await processTexture(filePath, tex);
      } catch (e) {
        // skip broken images
      }
    }
    if (Object.keys(packData).length > 0) packs[dir] = packData;
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${dirs.length}`);
  }
  const result = { version: 1, packs };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result));
  console.log(`Done. ${Object.keys(packs).length} packs written to ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
