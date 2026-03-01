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

// Hotbar widget region in vanilla widgets.png (256x256 base)
const HOTBAR_REGION = { x: 0, y: 0, w: 182, h: 22 };
const HUD_ICON_REGIONS = {
  health_empty: { x: 16, y: 0, w: 9, h: 9 },
  health_full: { x: 52, y: 0, w: 9, h: 9 },
  hunger_empty: { x: 16, y: 27, w: 9, h: 9 },
  hunger_full: { x: 52, y: 27, w: 9, h: 9 },
  armor_empty: { x: 16, y: 9, w: 9, h: 9 },
  armor_full: { x: 34, y: 9, w: 9, h: 9 },
  xp_bar_bg: { x: 0, y: 64, w: 182, h: 5, fw: 64, fh: 16 },
  xp_bar_fill: { x: 0, y: 69, w: 182, h: 5, fw: 64, fh: 16 },
};

// dHash per RGB channel: 24 bytes (192 bits), color-aware
function computeDHash(pixels) {
  const bits = new Uint8Array(24);
  for (let ch = 0; ch < 3; ch++) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const li = (row * 9 + col) * 4 + ch;
        const ri = (row * 9 + col + 1) * 4 + ch;
        const bit = row * 8 + col;
        const byteIdx = ch * 8 + (bit >> 3);
        if (pixels[li] > pixels[ri])
          bits[byteIdx] |= (1 << (7 - (bit & 7)));
      }
    }
  }
  return Buffer.from(bits).toString('base64');
}

// Histogram: 48-bin RGB (16 per channel) + 24-bin hue (15° each) = 72 bins total
function computeHistogram(pixels, count) {
  const hist = new Float64Array(72);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    total++;
    hist[Math.min(r >> 4, 15)]++;
    hist[16 + Math.min(g >> 4, 15)]++;
    hist[32 + Math.min(b >> 4, 15)]++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d > 10) {
      let h;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      hist[48 + Math.min(Math.floor(h * 4), 23)]++;
    }
  }
  if (total > 0) for (let i = 0; i < 72; i++) hist[i] /= total;
  return Array.from(hist).map(v => Math.round(v * 10000) / 10000);
}

// Color moments: mean + std per channel (non-transparent pixels only)
function computeColorMoments(pixels, count) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    sr += pixels[i * 4]; sg += pixels[i * 4 + 1]; sb += pixels[i * 4 + 2];
    n++;
  }
  if (!n) return [0, 0, 0, 0, 0, 0];
  const mr = sr / n, mg = sg / n, mb = sb / n;
  let vr = 0, vg = 0, vb = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    vr += (pixels[i * 4] - mr) ** 2;
    vg += (pixels[i * 4 + 1] - mg) ** 2;
    vb += (pixels[i * 4 + 2] - mb) ** 2;
  }
  return [
    +(mr / 255).toFixed(5), +(mg / 255).toFixed(5), +(mb / 255).toFixed(5),
    +(Math.sqrt(vr / n) / 255).toFixed(5),
    +(Math.sqrt(vg / n) / 255).toFixed(5),
    +(Math.sqrt(vb / n) / 255).toFixed(5),
  ];
}

// Edge density: mean normalized gradient magnitude
function computeEdgeDensity(pixels, w, h) {
  let sum = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (pixels[i + 3] < 128) continue;
      if (x + 1 < w) {
        const ri = (y * w + x + 1) * 4;
        sum += Math.abs(pixels[i] - pixels[ri]) + Math.abs(pixels[i+1] - pixels[ri+1]) + Math.abs(pixels[i+2] - pixels[ri+2]);
        count++;
      }
      if (y + 1 < h) {
        const di = ((y+1) * w + x) * 4;
        sum += Math.abs(pixels[i] - pixels[di]) + Math.abs(pixels[i+1] - pixels[di+1]) + Math.abs(pixels[i+2] - pixels[di+2]);
        count++;
      }
    }
  }
  return count ? +(sum / (count * 3 * 255)).toFixed(5) : 0;
}

async function processTexture(filePath) {
  return processSharpImage(sharp(filePath), 16, 16);
}

function scaleRegion(meta, region) {
  const scale = meta.width / 256;
  const left = Math.max(0, Math.round(region.x * scale));
  const top = Math.max(0, Math.round(region.y * scale));
  const width = Math.max(1, Math.round(region.w * scale));
  const height = Math.max(1, Math.round(region.h * scale));
  const safeWidth = Math.min(width, Math.max(1, meta.width - left));
  const safeHeight = Math.min(height, Math.max(1, meta.height - top));
  return { left, top, width: safeWidth, height: safeHeight };
}

async function processSharpImage(img, featureW, featureH) {
  const hashBuf = await img.clone().resize(9, 8, { fit: 'fill', kernel: 'nearest' }).raw().ensureAlpha().toBuffer();
  const dhash = computeDHash(hashBuf);
  const featBuf = await img.clone().resize(featureW, featureH, { fit: 'fill', kernel: 'nearest' }).raw().ensureAlpha().toBuffer();
  const count = featureW * featureH;
  const hist = computeHistogram(featBuf, count);
  const moments = computeColorMoments(featBuf, count);
  const edge = computeEdgeDensity(featBuf, featureW, featureH);
  return { dhash, hist, moments, edge };
}

async function processHotbarWidget(widgetsPath) {
  const meta = await sharp(widgetsPath).metadata();
  const crop = scaleRegion(meta, HOTBAR_REGION);
  const cropped = sharp(widgetsPath).extract(crop);
  const feat = await processSharpImage(cropped, 16, 16);
  return { hist: feat.hist, moments: feat.moments, edge: feat.edge };
}

async function processHudIcons(iconsPath) {
  const meta = await sharp(iconsPath).metadata();
  const out = {};
  for (const [key, region] of Object.entries(HUD_ICON_REGIONS)) {
    const crop = scaleRegion(meta, region);
    const img = sharp(iconsPath).extract(crop);
    const fw = region.fw || 16;
    const fh = region.fh || 16;
    out[key] = await processSharpImage(img, fw, fh);
  }
  return out;
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
    // Process hotbar widget from widgets.png
    const widgetsPath = path.join(packDir, 'widgets.png');
    if (fs.existsSync(widgetsPath)) {
      try {
        packData.hotbar_widget = await processHotbarWidget(widgetsPath);
      } catch { /* skip broken */ }
    }
    const iconsPath = path.join(packDir, 'icons.png');
    if (fs.existsSync(iconsPath)) {
      try {
        Object.assign(packData, await processHudIcons(iconsPath));
      } catch { /* skip broken */ }
    }
    if (Object.keys(packData).length > 0) packs[dir] = packData;
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${dirs.length}`);
  }
  const result = { version: 6, packs };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result));
  console.log(`Done. ${Object.keys(packs).length} packs → ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
