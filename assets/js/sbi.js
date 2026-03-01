(function() {
'use strict';

let fingerprints = null;
let clipWorker = null;
let clipWorkerReady = false;
let clipWorkerError = null;

function setClipWorkerError(errorMsg) {
  clipWorkerReady = false;
  clipWorkerError = errorMsg || 'Unknown worker error';
  const badge = document.getElementById('sbi-ai-badge');
  const msg = document.getElementById('sbi-ai-msg');
  const dot = document.getElementById('sbi-ai-dot');
  const el = document.getElementById('sbi-clip-status');
  if (el) { el.hidden = false; el.textContent = 'AI: ' + clipWorkerError; el.dataset.state = 'error'; }
  if (badge) badge.dataset.state = 'error';
  if (msg) msg.textContent = 'Error: ' + clipWorkerError;
  if (dot) dot.style.background = '#ef4444';
}

function initClipWorker() {
  if (clipWorker) return;
  clipWorker = new Worker('/assets/js/sbi-worker.js', { type: 'module' });
  clipWorker.onmessage = ({ data }) => {
    const badge = document.getElementById('sbi-ai-badge');
    const popup = document.getElementById('sbi-ai-popup');
    const msg = document.getElementById('sbi-ai-msg');
    if (data.type === 'ready') {
      clipWorkerReady = true;
      clipWorkerError = null;
      if (badge) { badge.dataset.state = 'ready'; badge.title = 'AI Ready'; }
      if (msg) msg.textContent = 'AI model loaded and ready.';
      const dot = document.getElementById('sbi-ai-dot');
      if (dot) dot.style.background = '#22c55e';
    } else if (data.type === 'status') {
      const el = document.getElementById('sbi-clip-status');
      if (el) el.textContent = data.msg;
      if (badge) badge.dataset.state = 'loading';
      if (msg) msg.textContent = data.msg;
    } else if (data.type === 'results') {
      handleClipResults(data.scores);
    } else if (data.type === 'error') {
      setClipWorkerError(data.msg);
    }
  };
  clipWorker.onerror = e => setClipWorkerError(e.message || 'Worker runtime error');
  clipWorker.onmessageerror = () => setClipWorkerError('Worker message error');
  clipWorker.postMessage({ type: 'init' });
  const badge = document.getElementById('sbi-ai-badge');
  if (badge) badge.dataset.state = 'loading';
}

let _lastHashResults = [], _lastAllScores = {};
const SBI_FINGERPRINT_VERSION = 7;
const CLIP_HASH_WEIGHT = 0.9;
const CLIP_WEIGHT = 0.1;
let _lastMatchDetails = {};
let _lastClipScores = {};
let _lastDetectionMeta = null;
const SLOT_COLOR_MAP = {
  diamond_sword: '#3b82f6',
  iron_sword: '#3b82f6',
  ender_pearl: '#4c1d95',
  splash_potion: '#7f1d1d',
  steak: '#fde68a',
  golden_carrot: '#fde68a',
  apple_golden: '#fde68a',
};

function normalizeClipScore(v) {
  const n = (Math.max(-1, Math.min(1, v)) + 1) * 0.5;
  return Math.max(0, Math.min(1, n));
}

function fmtPct(v) {
  if (!isFinite(v)) return '-';
  return (Math.max(0, Math.min(1, v)) * 100).toFixed(1) + '%';
}

function summarizeSlotTypes(types) {
  if (!types || !types.length) return '-';
  const map = {
    diamond_sword: 'DS',
    iron_sword: 'IS',
    ender_pearl: 'EP',
    splash_potion: 'POT',
    steak: 'STK',
    golden_carrot: 'GC',
    apple_golden: 'GAP',
  };
  return types.map(t => map[t] || '?').join(' ');
}

function renderDebugPanel(results, phase) {
  const panel = document.getElementById('sbi-debug');
  const meta = document.getElementById('sbi-debug-meta');
  const body = document.getElementById('sbi-debug-body');
  if (!panel || !meta || !body) return;

  panel.hidden = false;
  const d = _lastDetectionMeta || {};
  const rect = d.widgetRect ? `x=${d.widgetRect.x}, y=${d.widgetRect.y}, w=${d.widgetRect.w}, h=${d.widgetRect.h}` : 'none';
  const search = d.searchInfo
    ? `unit=${d.searchInfo.unit.toFixed(3)}, dx=${d.searchInfo.xShift}, dy=${d.searchInfo.yShift}, conf=${Math.round(d.searchInfo.confidence)}`
    : 'none';
  meta.textContent =
    `phase=${phase} | slots=${d.slotCount || 0} | hud(heart/hunger/armor/xp)=${d.heartCount || 0}/${d.hungerCount || 0}/${d.armorCount || 0}/${d.hasXp ? 1 : 0} | widget=${rect} | search=${search}`;

  body.innerHTML = (results || []).slice(0, 10).map((r, i) => {
    const info = _lastMatchDetails[r.name] || {};
    const clip = _lastClipScores[r.name];
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.name}</td>
      <td>${fmtPct(r.score)}</td>
      <td>${fmtPct(info.slotScore)}</td>
      <td>${fmtPct(info.widgetScore)}</td>
      <td>${fmtPct(info.healthScore)}</td>
      <td>${fmtPct(info.hungerScore)}</td>
      <td>${fmtPct(info.armorScore)}</td>
      <td>${fmtPct(info.xpScore)}</td>
      <td>${clip === undefined ? '-' : fmtPct(clip)}</td>
      <td>${summarizeSlotTypes(info.slotTypes)}</td>
    </tr>`;
  }).join('');
}

function handleClipResults(clipScores) {
  const statusEl = document.getElementById('sbi-clip-status');
  const sortedClip = [...clipScores].sort((a, b) => b.clipScore - a.clipScore);
  // Build lookup: packName → clipScore
  const clipMap = {};
  for (const s of sortedClip) clipMap[s.name] = normalizeClipScore(s.clipScore);
  _lastClipScores = clipMap;

  // Combine: hash-dominant with light CLIP rerank
  const combined = [];
  const allNames = new Set([
    ..._lastHashResults.map(r => r.name),
    ...sortedClip.slice(0, 40).map(s => s.name)
  ]);
  for (const name of allNames) {
    const hashScore = _lastAllScores[name] || 0;
    const hasClip = Object.prototype.hasOwnProperty.call(clipMap, name);
    const clipScore = hasClip ? clipMap[name] : hashScore;
    let score = hasClip ? (CLIP_HASH_WEIGHT * hashScore + CLIP_WEIGHT * clipScore) : hashScore;
    if (!hashScore && hasClip) score *= 0.85;
    combined.push({ name, score });
  }
  combined.sort((a, b) => b.score - a.score);
  const top10 = combined.slice(0, 10);
  renderResults(top10, 'AI Enhanced');
  renderDebugPanel(top10, 'ai');
  if (statusEl) { statusEl.textContent = '✓ AI analysis complete'; statusEl.dataset.state = 'ready'; }

  const thumbCanvas = document.createElement('canvas');
  const origCanvas = document.getElementById('sbi-canvas');
  thumbCanvas.width = 320; thumbCanvas.height = Math.round(320 * origCanvas.height / origCanvas.width);
  thumbCanvas.getContext('2d').drawImage(origCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  saveHistory(thumbCanvas.toDataURL('image/jpeg', 0.6), top10);
}

// --- Feature computation ---

// dHash per RGB channel: 192 bits (64 per channel), color-aware
function computeDHash(imageData) {
  // imageData is from a 9x8 canvas
  const bits = new Uint8Array(24);
  for (let ch = 0; ch < 3; ch++) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const li = (row * 9 + col) * 4 + ch;
        const ri = (row * 9 + (col + 1)) * 4 + ch;
        const bit = row * 8 + col;
        const byteIdx = ch * 8 + (bit >> 3);
        if (imageData[li] > imageData[ri])
          bits[byteIdx] |= (1 << (7 - (bit & 7)));
      }
    }
  }
  return bits;
}

// Histogram: 48-bin RGB (16 per channel) + 24-bin hue (15° each) = 72 bins total
function computeHistogram(imageData, count, bgThreshold) {
  const hist = new Float64Array(72);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2];
    const a = imageData[i * 4 + 3];
    if (a < 128) continue;
    if (bgThreshold && (0.299 * r + 0.587 * g + 0.114 * b) < bgThreshold) continue;
    total++;
    hist[Math.min(r >> 4, 15)]++;
    hist[16 + Math.min(g >> 4, 15)]++;
    hist[32 + Math.min(b >> 4, 15)]++;
    // Hue bin (24 bins = 15° each)
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
  return hist;
}

// Color moments: mean + std per RGB channel
function computeColorMoments(imageData, count, bgThreshold) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < count; i++) {
    const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2];
    const a = imageData[i * 4 + 3];
    if (a < 128) continue;
    if (bgThreshold && (0.299 * r + 0.587 * g + 0.114 * b) < bgThreshold) continue;
    sr += r; sg += g; sb += b; n++;
  }
  if (!n) return [0, 0, 0, 0, 0, 0];
  const mr = sr / n, mg = sg / n, mb = sb / n;
  let vr = 0, vg = 0, vb = 0;
  for (let i = 0; i < count; i++) {
    const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2];
    const a = imageData[i * 4 + 3];
    if (a < 128) continue;
    if (bgThreshold && (0.299 * r + 0.587 * g + 0.114 * b) < bgThreshold) continue;
    vr += (r - mr) ** 2; vg += (g - mg) ** 2; vb += (b - mb) ** 2;
  }
  return [mr / 255, mg / 255, mb / 255,
          Math.sqrt(vr / n) / 255, Math.sqrt(vg / n) / 255, Math.sqrt(vb / n) / 255];
}

// Edge density: mean normalized gradient magnitude
function computeEdgeDensity(imageData, w, h) {
  let sum = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (imageData[i + 3] < 128) continue;
      if (x + 1 < w) {
        const ri = (y * w + x + 1) * 4;
        sum += Math.abs(imageData[i] - imageData[ri]) + Math.abs(imageData[i+1] - imageData[ri+1]) + Math.abs(imageData[i+2] - imageData[ri+2]);
        count++;
      }
      if (y + 1 < h) {
        const di = ((y+1) * w + x) * 4;
        sum += Math.abs(imageData[i] - imageData[di]) + Math.abs(imageData[i+1] - imageData[di+1]) + Math.abs(imageData[i+2] - imageData[di+2]);
        count++;
      }
    }
  }
  return count ? sum / (count * 3 * 255) : 0;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hammingDistance(a, b) {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    let xor = a[i] ^ b[i];
    while (xor) { dist += xor & 1; xor >>= 1; }
  }
  return dist;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function colorMomentSim(a, b) {
  // Distance between two 6-dim [meanR,meanG,meanB,stdR,stdG,stdB] vectors
  let d = 0;
  for (let i = 0; i < 6; i++) d += (a[i] - b[i]) ** 2;
  return 1 - Math.sqrt(d / 6);
}

function compare(extracted, packTex) {
  const dhashA = extracted.dhash;
  const dhashB = packTex.__dhashBytes || (packTex.__dhashBytes = base64ToBytes(packTex.dhash));
  const hammingSim = 1 - hammingDistance(dhashA, dhashB) / 192;
  const histSim = cosineSimilarity(extracted.hist, packTex.hist);
  const momentSim = colorMomentSim(extracted.moments, packTex.moments);
  const edgeSim = 1 - Math.abs(extracted.edge - packTex.edge);
  return 0.30 * hammingSim + 0.35 * histSim + 0.20 * momentSim + 0.15 * edgeSim;
}

function compareWidget(extracted, packWidget) {
  const histSim = cosineSimilarity(extracted.hist, packWidget.hist);
  const momentSim = colorMomentSim(extracted.moments, packWidget.moments);
  const edgeA = typeof extracted.edge === 'number' ? extracted.edge : 0;
  const edgeB = typeof packWidget.edge === 'number' ? packWidget.edge : 0;
  const edgeSim = 1 - Math.abs(edgeA - edgeB);
  return 0.45 * histSim + 0.35 * momentSim + 0.20 * edgeSim;
}

// --- Region extraction helpers ---
function extractRegion(ctx, x, y, w, h, targetW, targetH) {
  const tmp = document.createElement('canvas');
  tmp.width = targetW; tmp.height = targetH;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, targetW, targetH);
  return tctx.getImageData(0, 0, targetW, targetH);
}

function maskSlotNoise(data, w, h) {
  const out = new Uint8ClampedArray(data);
  const durabilityY = Math.floor(h * 0.78);
  const countX = Math.floor(w * 0.58);
  const countY = Math.floor(h * 0.58);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (y >= durabilityY || (x >= countX && y >= countY)) out[i + 3] = 0;
    }
  }
  return out;
}

function buildSlotVariants(ctx, x, y, sz, imgW, imgH) {
  const variants = [];
  const offsets = [
    [0, 0],
    [-0.12, 0],
    [0.12, 0],
    [0, -0.12],
    [0, 0.12],
  ];
  const inset = Math.max(1, Math.round(sz * 0.12));
  const iw = Math.max(4, sz - inset * 2);
  const ih = Math.max(4, sz - inset * 2);
  const shiftPx = Math.max(1, Math.round(sz * 0.1));
  for (const [ox, oy] of offsets) {
    const sx = x + inset + Math.round(ox * shiftPx);
    const sy = y + inset + Math.round(oy * shiftPx);
    if (sx < 0 || sy < 0 || sx + iw > imgW || sy + ih > imgH) continue;
    const region = extractRegion(ctx, sx, sy, iw, ih, 16, 16);
    variants.push(computeFeatures(region, 16, 16, true, 'slot'));
  }
  return variants;
}

function computeFeatures(imageData, w, h, isScreenshot, mode) {
  const BG_THRESHOLD = isScreenshot ? 50 : 0;
  const effectiveData = (isScreenshot && mode === 'slot')
    ? maskSlotNoise(imageData.data, w, h)
    : imageData.data;
  const effectiveImage = (effectiveData === imageData.data)
    ? imageData
    : new ImageData(effectiveData, w, h);

  // Resize source to 9x8 for dHash
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').putImageData(effectiveImage, 0, 0);
  const tmp = document.createElement('canvas');
  tmp.width = 9; tmp.height = 8;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(src, 0, 0, 9, 8);
  const dhash = computeDHash(tctx.getImageData(0, 0, 9, 8).data);
  const hist = computeHistogram(effectiveData, w * h, BG_THRESHOLD);
  const moments = computeColorMoments(effectiveData, w * h, BG_THRESHOLD);
  const edge = computeEdgeDensity(effectiveData, w, h);
  return { dhash, hist, moments, edge };
}

function tryExtractFeature(ctx, x, y, w, h, imgW, imgH, targetW, targetH) {
  const ix = Math.round(x), iy = Math.round(y), iw = Math.round(w), ih = Math.round(h);
  if (iw <= 1 || ih <= 1) return null;
  if (ix < 0 || iy < 0 || ix + iw > imgW || iy + ih > imgH) return null;
  const region = extractRegion(ctx, ix, iy, iw, ih, targetW, targetH);
  return computeFeatures(region, targetW, targetH, true, 'hud');
}

function extractHudFeatures(ctx, widgetRect, imgW, imgH) {
  if (!widgetRect) return null;
  const unit = widgetRect.w / 182;
  if (!isFinite(unit) || unit <= 0) return null;

  const iconSize = Math.max(4, 9 * unit);
  const heartsY = widgetRect.y - 17 * unit;
  const armorY = heartsY - 10 * unit;

  const hearts = [];
  const hunger = [];
  const armor = [];
  const heartBoxes = [];
  const hungerBoxes = [];
  const armorBoxes = [];

  for (let i = 0; i < 10; i++) {
    const heartX = widgetRect.x + (1 + i * 8) * unit;
    const hungerX = widgetRect.x + (182 - 10 - i * 8) * unit;

    const heartFeat = tryExtractFeature(ctx, heartX, heartsY, iconSize, iconSize, imgW, imgH, 16, 16);
    const hungerFeat = tryExtractFeature(ctx, hungerX, heartsY, iconSize, iconSize, imgW, imgH, 16, 16);
    const armorFeat = tryExtractFeature(ctx, heartX, armorY, iconSize, iconSize, imgW, imgH, 16, 16);

    if (heartFeat) { hearts.push(heartFeat); heartBoxes.push({ x: heartX, y: heartsY, w: iconSize, h: iconSize }); }
    if (hungerFeat) { hunger.push(hungerFeat); hungerBoxes.push({ x: hungerX, y: heartsY, w: iconSize, h: iconSize }); }
    if (armorFeat) { armor.push(armorFeat); armorBoxes.push({ x: heartX, y: armorY, w: iconSize, h: iconSize }); }
  }

  const xpBox = {
    x: widgetRect.x,
    y: widgetRect.y - 7 * unit,
    w: 182 * unit,
    h: 5 * unit
  };
  const xpBar = tryExtractFeature(
    ctx,
    xpBox.x,
    xpBox.y,
    xpBox.w,
    xpBox.h,
    imgW,
    imgH,
    64,
    16
  );

  return { hearts, hunger, armor, xpBar, heartBoxes, hungerBoxes, armorBoxes, xpBox };
}

function estimateWidgetConfidence(widgetFeatures) {
  if (!widgetFeatures || !fingerprints || !fingerprints.packs) return 0;
  let best = 0;
  for (const packData of Object.values(fingerprints.packs)) {
    if (!packData.hotbar_widget) continue;
    const sim = compareWidget(widgetFeatures, packData.hotbar_widget);
    if (sim > best) best = sim;
  }
  return best;
}

function buildUnitCandidates(imgW, imgH) {
  const units = new Set();
  const guiUnits = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 4];
  for (const u of guiUnits) units.add(u.toFixed(3));
  for (let ratio = 0.24; ratio <= 0.44; ratio += 0.02) units.add((imgW * ratio / 182).toFixed(3));
  for (let ratio = 0.035; ratio <= 0.09; ratio += 0.01) units.add((imgH * ratio / 22).toFixed(3));
  return Array.from(units).map(Number).filter(u => u >= 0.8 && u <= 5).sort((a, b) => a - b);
}

function quickSlotVariance(ctx, x, y, sz, imgW, imgH) {
  const inset = Math.max(1, Math.round(sz * 0.18));
  const iw = Math.max(4, sz - inset * 2);
  const ih = Math.max(4, sz - inset * 2);
  const sx = Math.round(x + inset);
  const sy = Math.round(y + inset);
  if (sx < 0 || sy < 0 || sx + iw > imgW || sy + ih > imgH) return -1;
  const region = extractRegion(ctx, sx, sy, iw, ih, 12, 12);
  let lumSum = 0, lumSqSum = 0;
  for (let p = 0; p < 144; p++) {
    const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
    lumSum += lum;
    lumSqSum += lum * lum;
  }
  const mean = lumSum / 144;
  return lumSqSum / 144 - mean * mean;
}

// --- Hotbar extraction ---
// Multi-scale pixel-space search, then refine with full features
function extractHotbarSlots(ctx, imgW, imgH) {
  const UNIT_CANDIDATES = buildUnitCandidates(imgW, imgH);
  const X_SHIFTS = [-24, -16, -8, 0, 8, 16, 24];
  const Y_SHIFTS = [-32, -24, -16, -8, 0, 8, 16, 24];
  const coarse = [];

  for (const unit of UNIT_CANDIDATES) {
    const widgetW = 182 * unit;
    const itemOffX = 3 * unit;
    const itemW = 16 * unit;
    const slotStep = 20 * unit;
    for (const xShift of X_SHIFTS) {
      for (const yShift of Y_SHIFTS) {
        const widgetX = (imgW - widgetW) / 2 + xShift;
        const itemY = imgH - 19 * unit + yShift;
        let score = 0, count = 0;
        for (const i of [0, 2, 4, 6, 8]) {
          const x = widgetX + itemOffX + i * slotStep;
          const v = quickSlotVariance(ctx, x, itemY, itemW, imgW, imgH);
          if (v > 20) { score += v; count++; }
        }
        if (count >= 2) coarse.push({ unit, xShift, yShift, score: count * 500 + score });
      }
    }
  }

  coarse.sort((a, b) => b.score - a.score);
  const detailedCandidates = coarse.slice(0, 48);
  let bestSlots = [], bestConfidence = -Infinity, bestWidgetFeatures = null, bestWidgetRect = null, bestHudFeatures = null;
  let bestSearchInfo = null;

  for (const c of detailedCandidates) {
    const unit = c.unit;
    const widgetW = 182 * unit;
    const widgetH = 22 * unit;
    const itemOffX = 3 * unit;
    const itemW = 16 * unit;
    const slotStep = 20 * unit;
    const widgetX = (imgW - widgetW) / 2 + c.xShift;
    const itemY = imgH - 19 * unit + c.yShift;
    const widgetY = imgH - widgetH + c.yShift;

    const slots = [];
    let totalVar = 0, totalEdge = 0, totalQuality = 0;
    for (let i = 0; i < 9; i++) {
      const x = Math.round(widgetX + itemOffX + i * slotStep);
      const y = Math.round(itemY);
      const sz = Math.round(itemW);
      if (x < 0 || y < 0 || x + sz > imgW || y + sz > imgH) continue;

      const inset = Math.max(1, Math.round(sz * 0.12));
      const iw = Math.max(4, sz - inset * 2);
      const ih = Math.max(4, sz - inset * 2);
      const region = extractRegion(ctx, x + inset, y + inset, iw, ih, 16, 16);

      let lumSum = 0, lumSqSum = 0;
      for (let p = 0; p < 256; p++) {
        const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
        lumSum += lum;
        lumSqSum += lum * lum;
      }
      const mean = lumSum / 256;
      const variance = lumSqSum / 256 - mean * mean;
      const features = computeFeatures(region, 16, 16, true, 'slot');
      const variants = buildSlotVariants(ctx, x, y, sz, imgW, imgH);
      const quality = Math.sqrt(Math.max(0, variance)) * (0.6 + features.edge);
      if (variance > 40 && features.edge > 0.035 && variants.length > 0) {
        slots.push({ index: i, features, variants, x, y, sz, quality });
        totalVar += variance;
        totalEdge += features.edge;
        totalQuality += quality;
      }
    }
    slots.sort((a, b) => b.quality - a.quality);
    const usedSlots = slots.slice(0, Math.min(7, slots.length));

    const wx = Math.round(widgetX);
    const wy = Math.round(widgetY);
    const ww = Math.round(widgetW);
    const wh = Math.round(widgetH);
    let widgetFeatures = null, widgetRect = null, hudFeatures = null;
    if (wx >= 0 && wy >= 0 && wx + ww <= imgW && wy + wh <= imgH) {
      const widgetRegion = extractRegion(ctx, wx, wy, ww, wh, 16, 16);
      widgetFeatures = {
        hist: computeHistogram(widgetRegion.data, 256, 0),
        moments: computeColorMoments(widgetRegion.data, 256, 0),
        edge: computeEdgeDensity(widgetRegion.data, 16, 16)
      };
      widgetRect = { x: wx, y: wy, w: ww, h: wh };
      hudFeatures = extractHudFeatures(ctx, widgetRect, imgW, imgH);
    }

    const widgetBoost = estimateWidgetConfidence(widgetFeatures);
    const hudBoost = hudFeatures ? (
      (hudFeatures.hearts.length >= 6 ? 1 : 0) +
      (hudFeatures.hunger.length >= 6 ? 1 : 0) +
      (hudFeatures.armor.length >= 6 ? 1 : 0) +
      (hudFeatures.xpBar ? 1 : 0)
    ) : 0;
    const centerPenalty = Math.abs(c.xShift) * 5 + Math.abs(c.yShift) * 4;
    const confidence = usedSlots.length * 1600 + totalVar * 0.85 + totalEdge * 900 + totalQuality * 45 + widgetBoost * 2600 + hudBoost * 1000 - centerPenalty;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestSlots = usedSlots;
      bestWidgetFeatures = widgetFeatures;
      bestWidgetRect = widgetRect;
      bestHudFeatures = hudFeatures;
      bestSearchInfo = { unit: c.unit, xShift: c.xShift, yShift: c.yShift, confidence };
    }
  }
  return {
    slots: bestSlots,
    widgetFeatures: bestWidgetFeatures,
    widgetRect: bestWidgetRect,
    hudFeatures: bestHudFeatures,
    searchInfo: bestSearchInfo,
  };
}

function compareHudCells(cells, variants) {
  if (!cells || cells.length === 0) return 0;
  const texList = (variants || []).filter(Boolean);
  if (!texList.length) return 0;
  const sims = [];
  for (const cell of cells) {
    let best = 0;
    for (const tex of texList) best = Math.max(best, compare(cell, tex));
    sims.push(best);
  }
  sims.sort((a, b) => b - a);
  const take = Math.max(4, Math.min(sims.length, Math.ceil(sims.length * 0.7)));
  let sum = 0;
  for (let i = 0; i < take; i++) sum += sims[i];
  return take ? sum / take : 0;
}

function compareHudXp(xpBar, bgTex, fillTex) {
  if (!xpBar) return 0;
  const sims = [];
  if (bgTex) sims.push(compare(xpBar, bgTex));
  if (fillTex) sims.push(compare(xpBar, fillTex));
  if (!sims.length) return 0;
  let max = -Infinity, sum = 0;
  for (const s of sims) {
    if (s > max) max = s;
    sum += s;
  }
  return 0.7 * max + 0.3 * (sum / sims.length);
}

function compareSlotToType(slot, packTex) {
  if (!slot) return 0;
  const variants = slot.variants && slot.variants.length ? slot.variants : (slot.features ? [slot.features] : []);
  let best = 0;
  for (const v of variants) {
    const sim = compare(v, packTex);
    if (sim > best) best = sim;
  }
  return best;
}

// --- Matching ---
function matchPacks(slots, widgetFeatures, hudFeatures) {
  if (!slots.length) return { results: [], slotTypes: [], details: {} };
  const ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot', 'apple_golden', 'iron_sword'];
  const TYPE_WEIGHT = { diamond_sword: 1.5, ender_pearl: 1.3, splash_potion: 1.0, steak: 0.8, golden_carrot: 0.8, apple_golden: 0.9, iron_sword: 1.2 };
  const results = [];
  const details = {};
  let bestScore = -Infinity;
  let bestSlotTypes = [];

  for (const [packName, packData] of Object.entries(fingerprints.packs)) {
    let totalScore = 0, totalWeight = 0;
    let slotScore = 0, slotWeight = 0;
    const packSlotTypes = [];
    let widgetSim = 0, healthSim = 0, hungerSim = 0, armorSim = 0, xpSim = 0;

    for (const slot of slots) {
      let bestSim = 0, bestType = '';
      for (const type of ITEM_TYPES) {
        if (!packData[type]) continue;
        const sim = compareSlotToType(slot, packData[type]);
        if (sim > bestSim) { bestSim = sim; bestType = type; }
      }
      packSlotTypes.push(bestType);
      if (bestSim > 0.46) {
        const qualityW = 0.7 + 0.6 * Math.min(1, (slot.quality || 0) / 12);
        const w = (TYPE_WEIGHT[bestType] || 1) * qualityW;
        totalScore += bestSim * w;
        totalWeight += w;
        slotScore += bestSim * w;
        slotWeight += w;
      }
    }

    if (widgetFeatures && packData.hotbar_widget) {
      widgetSim = compareWidget(widgetFeatures, packData.hotbar_widget);
      const widgetW = 1.1;
      totalScore += widgetSim * widgetW;
      totalWeight += widgetW;
    }

    if (hudFeatures) {
      healthSim = compareHudCells(hudFeatures.hearts, [packData.health_empty, packData.health_half, packData.health_full]);
      hungerSim = compareHudCells(hudFeatures.hunger, [packData.hunger_empty, packData.hunger_half, packData.hunger_full]);
      armorSim = compareHudCells(hudFeatures.armor, [packData.armor_empty, packData.armor_half, packData.armor_full]);
      xpSim = compareHudXp(hudFeatures.xpBar, packData.xp_bar_bg, packData.xp_bar_fill);

      if (healthSim > 0) { totalScore += healthSim * 1.1; totalWeight += 1.1; }
      if (hungerSim > 0) { totalScore += hungerSim * 1.0; totalWeight += 1.0; }
      if (armorSim > 0) { totalScore += armorSim * 0.9; totalWeight += 0.9; }
      if (xpSim > 0) { totalScore += xpSim * 0.8; totalWeight += 0.8; }
    }

    if (totalWeight === 0) continue;
    const finalScore = totalScore / totalWeight;
    if (finalScore > 0.50) {
      results.push({ name: packName, score: finalScore });
      details[packName] = {
        finalScore,
        slotScore: slotWeight ? slotScore / slotWeight : 0,
        widgetScore: widgetSim,
        healthScore: healthSim,
        hungerScore: hungerSim,
        armorScore: armorSim,
        xpScore: xpSim,
        slotTypes: packSlotTypes,
      };
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestSlotTypes = packSlotTypes;
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, 80), slotTypes: bestSlotTypes, details };
}

function drawDetectionOverlay(ctx, slots, hudFeatures, slotTypes) {
  ctx.lineWidth = 2.5;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const slotType = slotTypes && slotTypes[i] ? slotTypes[i] : '';
    ctx.strokeStyle = SLOT_COLOR_MAP[slotType] || '#ff0';
    ctx.strokeRect(slot.x, slot.y, slot.sz, slot.sz);
  }
  if (!hudFeatures) return;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fca5a5';
  for (const b of hudFeatures.heartBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#fbbf24';
  for (const b of hudFeatures.hungerBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#9ca3af';
  for (const b of hudFeatures.armorBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
  if (hudFeatures.xpBox) {
    ctx.strokeStyle = '#86efac';
    ctx.strokeRect(hudFeatures.xpBox.x, hudFeatures.xpBox.y, hudFeatures.xpBox.w, hudFeatures.xpBox.h);
  }
}

function scoreColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 65) return '#f59e0b';
  return '#ef4444';
}

function renderResults(results, label) {
  const container = document.getElementById('sbi-results');
  if (results.length === 0) {
    container.innerHTML = '<p class="sbi-no-results">No matching packs found</p>';
    container.hidden = false;
    return;
  }
  const header = label ? `<div class="sbi-results-label">${label}</div>` : '';
  container.innerHTML = header + results.map((r, i) => {
    const pct = Math.min(100, Math.round(r.score * 100));
    const color = scoreColor(pct);
    const coverUrl = '/thumbnails/' + encodeURIComponent(r.name) + '/cover.png';
    const packPng = '/thumbnails/' + encodeURIComponent(r.name) + '/pack.png';
    const displayName = r.name.replace(/_/g, ' ');
    return `<a class="sbi-result-card" href="/p/${encodeURIComponent(r.name)}/">
      <span class="sbi-rank">${i + 1}</span>
      <span class="sbi-divider"></span>
      <span class="sbi-score" style="color:${color}">${pct}%</span>
      <span class="sbi-divider"></span>
      <img class="sbi-pack-icon" src="${packPng}" onerror="this.style.display='none'">
      <span class="sbi-result-name">${displayName}</span>
      <span class="sbi-divider"></span>
      <img class="sbi-result-cover" src="${coverUrl}" onerror="this.src='${packPng}'">
    </a>`;
  }).join('');
  container.hidden = false;
}

function saveHistory(imageDataUrl, results) {
  const KEY = 'vale-sbi-history';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
  history.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    imageDataUrl,
    results: results.map(r => ({
      name: r.name, score: r.score,
      cover: '/thumbnails/' + r.name + '/cover.png',
      packPng: '/thumbnails/' + r.name + '/pack.png'
    }))
  });
  if (history.length > 5) history.length = 5;
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {}
}

async function processImage(file) {
  const preview = document.getElementById('sbi-preview');
  const progress = document.getElementById('sbi-progress');
  const resultsEl = document.getElementById('sbi-results');
  const debugPanel = document.getElementById('sbi-debug');
  const debugBody = document.getElementById('sbi-debug-body');
  const debugMeta = document.getElementById('sbi-debug-meta');
  resultsEl.hidden = true;
  progress.hidden = false;
  preview.hidden = false;
  if (debugPanel) debugPanel.hidden = true;
  if (debugBody) debugBody.innerHTML = '';
  if (debugMeta) debugMeta.textContent = '';

  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

  const canvas = document.getElementById('sbi-canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  try {
    if (!fingerprints) {
      const resp = await fetch('/data/sbi-fingerprints.json?v=' + SBI_FINGERPRINT_VERSION);
      if (!resp.ok) throw new Error('Failed to load fingerprints: ' + resp.status);
      fingerprints = await resp.json();
    }

    const { slots, widgetFeatures, widgetRect, hudFeatures, searchInfo } = extractHotbarSlots(ctx, img.width, img.height);

    // Stage 1: Hash-based instant results
    const { results, slotTypes, details } = matchPacks(slots, widgetFeatures, hudFeatures);
    const stage1Top10 = results.slice(0, 10);
    _lastMatchDetails = details || {};
    _lastClipScores = {};
    _lastDetectionMeta = {
      widgetRect,
      searchInfo,
      slotCount: slots.length,
      heartCount: hudFeatures && hudFeatures.hearts ? hudFeatures.hearts.length : 0,
      hungerCount: hudFeatures && hudFeatures.hunger ? hudFeatures.hunger.length : 0,
      armorCount: hudFeatures && hudFeatures.armor ? hudFeatures.armor.length : 0,
      hasXp: Boolean(hudFeatures && hudFeatures.xpBar),
    };
    drawDetectionOverlay(ctx, slots, hudFeatures, slotTypes);
    progress.hidden = true;
    renderResults(stage1Top10);
    renderDebugPanel(stage1Top10, 'hash');

    // Cache hash scores for later CLIP combination
    _lastHashResults = results.slice(0, 40);
    _lastAllScores = {};
    for (const r of results) _lastAllScores[r.name] = r.score;

    // Stage 2: CLIP refinement (async)
    if (widgetRect && slots.length > 0) {
      const statusEl = document.getElementById('sbi-clip-status');
      if (statusEl) statusEl.hidden = false;
      if (clipWorkerError) {
        if (statusEl) { statusEl.textContent = 'AI unavailable: ' + clipWorkerError; statusEl.dataset.state = 'error'; }
      } else if (statusEl) {
        statusEl.textContent = 'Running AI analysis...';
      }

      if (!clipWorkerError && widgetRect.x >= 0 && widgetRect.y >= 0 && widgetRect.x + widgetRect.w <= img.width && widgetRect.y + widgetRect.h <= img.height) {
        const clipRegion = extractRegion(ctx, widgetRect.x, widgetRect.y, widgetRect.w, widgetRect.h, 224, 224);
        const pixels = clipRegion.data.buffer.slice(0);
        const sendSearch = () => clipWorker.postMessage({ type: 'search', pixels, width: 224, height: 224 }, [pixels]);
        if (clipWorkerReady) sendSearch();
        else {
          const check = setInterval(() => {
            if (clipWorkerReady) {
              clearInterval(check);
              clearTimeout(waitTimeout);
              sendSearch();
            } else if (clipWorkerError) {
              clearInterval(check);
              clearTimeout(waitTimeout);
              if (statusEl) { statusEl.textContent = 'AI unavailable: ' + clipWorkerError; statusEl.dataset.state = 'error'; }
            }
          }, 200);
          const waitTimeout = setTimeout(() => {
            clearInterval(check);
            if (!clipWorkerReady && statusEl) {
              statusEl.textContent = 'AI model still loading, showing hash results only.';
              statusEl.dataset.state = 'error';
            }
          }, 30000);
        }
      }
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 320; thumbCanvas.height = Math.round(320 * img.height / img.width);
    thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
    saveHistory(thumbCanvas.toDataURL('image/jpeg', 0.6), stage1Top10);
  } catch (e) {
    progress.hidden = true;
    const container = document.getElementById('sbi-results');
    container.innerHTML = '<p class="sbi-no-results">Error: ' + e.message + '</p>';
    container.hidden = false;
    console.error('SBI error:', e);
  }

  URL.revokeObjectURL(url);
}

function init() {
  const uploadEl = document.getElementById('sbi-upload');
  const fileInput = document.getElementById('sbi-file');

  uploadEl.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) processImage(e.target.files[0]); });
  uploadEl.addEventListener('dragover', e => { e.preventDefault(); uploadEl.classList.add('dragover'); });
  uploadEl.addEventListener('dragleave', () => uploadEl.classList.remove('dragover'));
  uploadEl.addEventListener('drop', e => {
    e.preventDefault(); uploadEl.classList.remove('dragover');
    if (e.dataTransfer.files[0]) processImage(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) { processImage(item.getAsFile()); break; }
    }
  });

  // AI badge toggle
  const badge = document.getElementById('sbi-ai-badge');
  const popup = document.getElementById('sbi-ai-popup');
  if (badge && popup) {
    badge.addEventListener('click', () => popup.hidden = !popup.hidden);
    document.addEventListener('click', e => {
      if (!badge.contains(e.target) && !popup.contains(e.target)) popup.hidden = true;
    });
    // Show popup on first load
    popup.hidden = false;
    setTimeout(() => { popup.hidden = true; }, 4000);
  }

  // Pre-load worker in background
  initClipWorker();
}

init();
})();
