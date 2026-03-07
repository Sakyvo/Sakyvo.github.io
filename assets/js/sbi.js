(function() {
'use strict';

let fingerprints = null;
let clipWorker = null;
let clipWorkerReady = false;
let clipWorkerError = null;
const ENABLE_CLIP = false;

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
  if (!ENABLE_CLIP) return;
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
      if (popup) popup.hidden = true;
    } else if (data.type === 'status') {
      const el = document.getElementById('sbi-clip-status');
      if (el) el.textContent = data.msg;
      if (badge) badge.dataset.state = clipWorkerReady ? 'ready' : 'loading';
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
// AI (CLIP) is used as a rerank signal. We normalize CLIP scores per-query and
// apply it as a multiplicative factor on top of the hash score, so a weak CLIP
// match won't incorrectly drag down a strong hash match when the crop is correct.
const CLIP_RERANK_BASE = 0.35;
const CLIP_RERANK_WEIGHT = 0.65;
const CLIP_ONLY_SCALE = 0.72;
let _lastMatchDetails = {};
let _lastClipScores = {};
let _lastForcedCombined = {};
let _lastDetectionMeta = null;
const SLOT_COLOR_MAP = {
  diamond_sword: '#3b82f6',
  iron_sword: '#3b82f6',
  ender_pearl: '#4c1d95',
  splash_potion: '#7f1d1d',
  steak: '#fde68a',
  golden_carrot: '#fde68a',
  apple_golden: '#fde68a',
  none: '#94a3b8',
};
const STRICT_WIDGET_WIDTH_RATIOS = [0.21, 0.235, 0.26, 0.285, 0.31, 0.335];
const STRICT_WIDGET_HEIGHT_RATIOS = [0.044, 0.052, 0.06, 0.068, 0.076];
const STRICT_BOTTOM_OFFSET_UNIT_STEPS = [0, 1, 2, 3, 4, 6, 8];
const SLOT_ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot', 'apple_golden', 'iron_sword'];
const FORCE_PACKS = ['Eum3_Blue_Revamp', 'Eum3Blue_Revamp'];
const SBI_SCORE_WEIGHTS = {
  // Emphasize HUD + hotbar widget for higher discriminative power; items are still used but less dominant.
  type: { diamond_sword: 2.5, ender_pearl: 2.5, splash_potion: 1.0, steak: 0.5, golden_carrot: 0.5, apple_golden: 0.0, iron_sword: 0.0 },
  hud: { health: 3.4, hunger: 0.35, armor: 0.8 },
  mix: { slot: 0.16, hud: 0.38, widget: 0.46, slotNoHud: 0.35, widgetNoHud: 0.65 },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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
    splash_potion: 'HL',
    steak: 'SK',
    golden_carrot: 'GC',
    apple_golden: 'AG',
    none: 'NN',
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
  const s = d.searchInfo || null;
  const search = s
    ? `unit=${s.unit.toFixed(3)}, off=${s.bottomOffset === undefined ? '-' : s.bottomOffset}, mode=${s.mode || 'strict'}, by=${s.bottomRatio === undefined ? '-' : s.bottomRatio.toFixed(3)}, g=${s.gridScore === undefined ? '-' : s.gridScore.toFixed(2)}, bp=${s.bottomPref === undefined ? '-' : s.bottomPref.toFixed(2)}, up=${s.unitPref === undefined ? '-' : s.unitPref.toFixed(2)}, wb=${s.widgetBoost === undefined ? '-' : s.widgetBoost.toFixed(3)}, hb=${s.hudBoost === undefined ? '-' : s.hudBoost.toFixed(3)}, sb=${s.slotBoost === undefined ? '-' : s.slotBoost.toFixed(3)}, conf=${Math.round(s.confidence)}`
    : 'none';
  meta.textContent =
    `phase=${phase} | slots=${d.slotCount || 0} | hud(heart/hunger/armor)=${d.heartCount || 0}/${d.hungerCount || 0}/${d.armorCount || 0} | widget=${rect} | search=${search}` +
    (s && s.preTop ? `\npre=${s.preTop}` : '');

  body.innerHTML = (results || []).slice(0, 10).map((r, i) => {
    const info = _lastMatchDetails[r.name] || {};
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.name}</td>
      <td>${fmtPct(r.score)}</td>
      <td>${fmtPct(info.slotScore)}</td>
      <td>${fmtPct(info.widgetScore)}</td>
      <td>${fmtPct(info.healthScore)}</td>
      <td>${fmtPct(info.hungerScore)}</td>
      <td>${fmtPct(info.armorScore)}</td>
      <td>${summarizeSlotTypes(info.slotTypes)}</td>
    </tr>`;
  }).join('');
}

function renderScoreBreakdown() {
  const el = document.getElementById('sbi-breakdown-body');
  if (!el) return;

  const typeRows = Object.entries(SBI_SCORE_WEIGHTS.type).map(([k, v]) => {
    const label = summarizeSlotTypes([k]);
    return `<tr><td>${label}</td><td>${k}</td><td>${v.toFixed(2)}</td></tr>`;
  }).join('');
  el.innerHTML = `
    <div>XP is ignored. Final score mixes Slot/HUD/Widget.</div>
    <table class="sbi-weight-table">
      <thead><tr><th>Item</th><th>Key</th><th>Weight</th></tr></thead>
      <tbody>${typeRows}</tbody>
    </table>
    <table class="sbi-weight-table">
      <thead><tr><th>HUD</th><th>Weight</th></tr></thead>
      <tbody>
        <tr><td>Health</td><td>${SBI_SCORE_WEIGHTS.hud.health.toFixed(2)}</td></tr>
        <tr><td>Hunger</td><td>${SBI_SCORE_WEIGHTS.hud.hunger.toFixed(2)}</td></tr>
        <tr><td>Armor</td><td>${SBI_SCORE_WEIGHTS.hud.armor.toFixed(2)}</td></tr>
      </tbody>
    </table>
    <div>Mix (with HUD): Slot ${SBI_SCORE_WEIGHTS.mix.slot.toFixed(2)}, HUD ${SBI_SCORE_WEIGHTS.mix.hud.toFixed(2)}, Widget ${SBI_SCORE_WEIGHTS.mix.widget.toFixed(2)}</div>
    <div>Mix (no HUD): Slot ${SBI_SCORE_WEIGHTS.mix.slotNoHud.toFixed(2)}, Widget ${SBI_SCORE_WEIGHTS.mix.widgetNoHud.toFixed(2)}</div>
  `;
}

function renderForcedPacks() {
  const el = document.getElementById('sbi-forced');
  if (!el) return;
  const toggle = document.getElementById('sbi-force-toggle');
  if (toggle && !toggle.checked) { el.hidden = true; return; }

  const rows = FORCE_PACKS.map(name => {
    const info = _lastMatchDetails[name] || {};
    const hashScore = isFinite(info.finalScore) ? info.finalScore : (_lastAllScores[name] || 0);
    const total = hashScore;
    const disp = name.replace(/_/g, ' ');
    return `<tr>
      <td><a href="/p/${encodeURIComponent(name)}/">${disp}</a></td>
      <td>${fmtPct(total)}</td>
      <td>${fmtPct(hashScore)}</td>
      <td>${fmtPct(info.slotScore)}</td>
      <td>${fmtPct(info.widgetScore)}</td>
      <td>${fmtPct(info.healthScore)}</td>
      <td>${fmtPct(info.hungerScore)}</td>
      <td>${fmtPct(info.armorScore)}</td>
    </tr>`;
  }).join('');

  el.hidden = false;
  el.innerHTML = `
    <div class="sbi-forced-title">Forced Packs</div>
    <table class="sbi-forced-table">
      <thead>
        <tr><th>Pack</th><th>Total</th><th>Hash</th><th>Slot</th><th>Widget</th><th>HP</th><th>Hun</th><th>Arm</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function handleClipResults(clipScores) {
  if (!ENABLE_CLIP) return;
  const statusEl = document.getElementById('sbi-clip-status');
  const sortedClip = [...clipScores].sort((a, b) => b.clipScore - a.clipScore);
  // Build lookup: packName → normalized clip score (per-query range over returned top-K)
  const clipMap = {};
  const maxRaw = sortedClip.length ? sortedClip[0].clipScore : 0;
  const minRaw = sortedClip.length ? sortedClip[sortedClip.length - 1].clipScore : maxRaw;
  const denom = maxRaw - minRaw;
  for (const s of sortedClip) {
    const v = denom > 1e-6 ? (s.clipScore - minRaw) / denom : 0.5;
    clipMap[s.name] = clamp01(v);
  }
  _lastClipScores = clipMap;

  // Combine: hash with CLIP rerank (never let CLIP drag a strong hash match below zero-confidence floor)
  const combined = [];
  const allNames = new Set([
    ..._lastHashResults.map(r => r.name),
    ...sortedClip.slice(0, 40).map(s => s.name)
  ]);
  for (const name of FORCE_PACKS) allNames.add(name);
  for (const name of allNames) {
    const hashScore = _lastAllScores[name] || 0;
    const hasClip = Object.prototype.hasOwnProperty.call(clipMap, name);
    const clipScore = hasClip ? clipMap[name] : 0;
    const hasHash = hashScore > 0;
    let score;
    if (hasHash && hasClip) score = hashScore * (CLIP_RERANK_BASE + CLIP_RERANK_WEIGHT * clipScore);
    else if (hasHash) score = hashScore;
    else if (hasClip) score = clipScore * CLIP_ONLY_SCALE;
    else score = 0;
    combined.push({ name, score });
  }
  _lastForcedCombined = {};
  for (const name of FORCE_PACKS) {
    const hashScore = _lastAllScores[name] || 0;
    const hasClip = Object.prototype.hasOwnProperty.call(clipMap, name);
    const clipScore = hasClip ? clipMap[name] : 0;
    const hasHash = hashScore > 0;
    let score;
    if (hasHash && hasClip) score = hashScore * (CLIP_RERANK_BASE + CLIP_RERANK_WEIGHT * clipScore);
    else if (hasHash) score = hashScore;
    else if (hasClip) score = clipScore * CLIP_ONLY_SCALE;
    else score = 0;
    _lastForcedCombined[name] = score;
  }
  combined.sort((a, b) => b.score - a.score);
  const top10 = combined.slice(0, 10);
  renderResults(top10, 'AI Enhanced');
  renderDebugPanel(top10, 'ai');
  renderForcedPacks();
  if (statusEl) { statusEl.hidden = true; statusEl.textContent = ''; statusEl.dataset.state = 'ready'; }

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

function meanRgbDirSim(momA, momB) {
  if (!momA || !momB) return 0;
  const ar = momA[0], ag = momA[1], ab = momA[2];
  const br = momB[0], bg = momB[1], bb = momB[2];
  const dot = ar * br + ag * bg + ab * bb;
  const na = Math.sqrt(ar * ar + ag * ag + ab * ab);
  const nb = Math.sqrt(br * br + bg * bg + bb * bb);
  return (na && nb) ? dot / (na * nb) : 0;
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
  const dirSim = clamp01(meanRgbDirSim(extracted.moments, packWidget.moments));
  const chromaA = extracted && extracted.moments ? Math.max(extracted.moments[0], extracted.moments[1], extracted.moments[2]) - Math.min(extracted.moments[0], extracted.moments[1], extracted.moments[2]) : 0;
  const chromaB = packWidget && packWidget.moments ? Math.max(packWidget.moments[0], packWidget.moments[1], packWidget.moments[2]) - Math.min(packWidget.moments[0], packWidget.moments[1], packWidget.moments[2]) : 0;
  const chromaSim = clamp01(1 - Math.abs(chromaA - chromaB) / (Math.max(chromaA, chromaB) + 0.08));
  const base = 0.34 * histSim + 0.24 * momentSim + 0.14 * edgeSim + 0.18 * dirSim + 0.10 * chromaSim;
  const colorGate = 0.70 + 0.30 * Math.min(dirSim, chromaSim);
  return base * colorGate;
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

function resizeImageDataNearest(imageData, srcW, srcH, dstW, dstH) {
  const src = document.createElement('canvas');
  src.width = srcW; src.height = srcH;
  src.getContext('2d').putImageData(imageData, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = dstW; dst.height = dstH;
  const dctx = dst.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(src, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
  return dctx.getImageData(0, 0, dstW, dstH);
}

function maskWidgetItems(data, w, h) {
  const out = new Uint8ClampedArray(data);
  if (w < 40 || h < 12) return out;

  // Normalize to vanilla widget strip (182x22): item squares live at x=3+i*20, y=3, size=16.
  // Keep slot-frame/background color signal by masking only center icon area.
  const sx = w / 182;
  const sy = h / 22;
  const itemSize = Math.max(1, Math.round(16 * Math.min(sx, sy)));
  const itemY = Math.round(3 * sy);
  const maskSize = Math.max(6, Math.min(itemSize - 2, Math.round(itemSize * 0.5)));
  const inset = Math.max(0, Math.floor((itemSize - maskSize) / 2));

  for (let i = 0; i < 9; i++) {
    const itemX = Math.round((3 + i * 20) * sx);
    const x1 = Math.max(0, itemX + inset), x2 = Math.min(w, itemX + inset + maskSize);
    const y1 = Math.max(0, itemY + inset), y2 = Math.min(h, itemY + inset + maskSize);
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) out[(y * w + x) * 4 + 3] = 0;
    }
  }
  return out;
}

function suppressWidgetHighlights(data, w, h) {
  const out = new Uint8ClampedArray(data);
  const lum = [];
  for (let i = 0; i < w * h; i++) {
    const a = out[i * 4 + 3];
    if (a < 128) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    lum.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  if (lum.length < 32) return out;
  lum.sort((a, b) => a - b);
  const thr = lum[Math.min(lum.length - 1, Math.floor(lum.length * 0.985))];
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (out[p + 3] < 128) continue;
    const L = 0.299 * out[p] + 0.587 * out[p + 1] + 0.114 * out[p + 2];
    if (L > thr) out[p + 3] = 0;
  }
  return out;
}

function computeWidgetGridScore(data, w, h) {
  if (!data || w < 80 || h < 10) return 0;
  const edgeX = new Float64Array(Math.max(1, w - 1));
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x + 1 < w; x++) {
      const i = row + x * 4;
      if (data[i + 3] < 128 || data[i + 7] < 128) continue;
      const l1 = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const l2 = 0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6];
      edgeX[x] += Math.abs(l1 - l2);
    }
  }

  const boundaryMask = new Uint8Array(edgeX.length);
  const scale = w / 182;
  let bSum = 0, bCount = 0;
  const bVals = [];
  for (let k = 0; k <= 9; k++) {
    const b = Math.round(k * 20 * scale);
    let m = 0;
    for (let dx = -1; dx <= 1; dx++) {
      const x = b + dx;
      if (x < 0 || x >= edgeX.length) continue;
      boundaryMask[x] = 1;
      m = Math.max(m, edgeX[x]);
    }
    bSum += m;
    bCount++;
    bVals.push(m);
  }
  let iSum = 0, iCount = 0;
  for (let x = 0; x < edgeX.length; x++) {
    if (boundaryMask[x]) continue;
    iSum += edgeX[x];
    iCount++;
  }
  const bAvg = bCount ? (bSum / bCount) : 0;
  const iAvg = iCount ? (iSum / iCount) : 0;
  const iBase = iAvg + 1e-6;
  bVals.sort((a, b) => a - b);
  const bP30 = bVals[Math.min(bVals.length - 1, Math.floor(bVals.length * 0.3))] || 0;
  let strong = 0;
  const thr = iAvg * 1.3;
  for (const v of bVals) if (v > thr) strong++;
  const coverage = clamp01((strong - 4) / 6);
  const ratio = bP30 / iBase;
  return clamp01((ratio - 1) / 2) * (0.65 + 0.35 * coverage);
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

function zeroRgbForTransparent(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
  }
  return data;
}

function suppressSlotBackground(data, w, h) {
  if (w * h > 24 * 24) return data;

  const out = new Uint8ClampedArray(data);
  const cornerSize = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) / 4)));
  let sr = 0, sg = 0, sb = 0, n = 0;
  const corners = [
    [0, 0],
    [w - cornerSize, 0],
    [0, h - cornerSize],
    [w - cornerSize, h - cornerSize],
  ];
  for (const [cx, cy] of corners) {
    for (let yy = 0; yy < cornerSize; yy++) {
      for (let xx = 0; xx < cornerSize; xx++) {
        const x = cx + xx, y = cy + yy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        const a = out[i + 3];
        if (a < 128) continue;
        sr += out[i]; sg += out[i + 1]; sb += out[i + 2]; n++;
      }
    }
  }
  if (!n) return out;
  const br = sr / n, bg = sg / n, bb = sb / n;
  const thr2 = 5200;

  const seen = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (out[i + 3] < 128) return;
    const dr = out[i] - br;
    const dg = out[i + 1] - bg;
    const db = out[i + 2] - bb;
    if (dr * dr + dg * dg + db * db > thr2) return;
    seen[idx] = 1;
    q.push(idx);
  };
  push(0, 0);
  push(w - 1, 0);
  push(0, h - 1);
  push(w - 1, h - 1);

  while (q.length) {
    const idx = q.pop();
    const x = idx % w;
    const y = Math.floor(idx / w);
    if (x > 0) push(x - 1, y);
    if (x + 1 < w) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < h) push(x, y + 1);
  }

  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    const p = i * 4;
    out[p] = 0; out[p + 1] = 0; out[p + 2] = 0; out[p + 3] = 0;
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
    [0, -0.24],
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
  let effectiveData = (isScreenshot && mode === 'slot')
    ? maskSlotNoise(imageData.data, w, h)
    : imageData.data;
  if (isScreenshot && mode === 'slot') {
    effectiveData = suppressSlotBackground(effectiveData, w, h);
    effectiveData = zeroRgbForTransparent(effectiveData);
  }

  // Lightweight slot signature for robust item-type inference (computed on alpha-only pixels; no BG_THRESHOLD).
  let sig = null;
  if (mode === 'slot') {
    let n = 0, lumSum = 0, rSum = 0, gSum = 0, bSum = 0, red = 0, yellow = 0;
    for (let p = 0; p < w * h; p++) {
      const a = effectiveData[p * 4 + 3];
      if (a < 128) continue;
      const r = effectiveData[p * 4], g = effectiveData[p * 4 + 1], b = effectiveData[p * 4 + 2];
      n++;
      rSum += r; gSum += g; bSum += b;
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
      if (r > g + 30 && r > b + 30) red++;
      if (r > 160 && g > 140 && b < 140) yellow++;
    }
    sig = n
      ? { n, meanLum: lumSum / n, meanR: rSum / n, meanG: gSum / n, meanB: bSum / n, redFrac: red / n, yellowFrac: yellow / n }
      : { n: 0, meanLum: 0, meanR: 0, meanG: 0, meanB: 0, redFrac: 0, yellowFrac: 0 };
  }
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
  return { dhash, hist, moments, edge, sig };
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
  let heartsY = widgetRect.y - 17 * unit;
  let armorY = heartsY - 10 * unit;
  const yShift = armorY < 0 ? -armorY : (heartsY < 0 ? -heartsY : 0);
  heartsY += yShift;
  armorY += yShift;

  const hearts = [];
  const hunger = [];
  const armor = [];
  const heartBoxes = [];
  const hungerBoxes = [];
  const armorBoxes = [];
  const leftHudShift = 0.32 * unit;
  const rightHudShift = -0.32 * unit;

  for (let i = 0; i < 10; i++) {
    const heartX = widgetRect.x + (1 + i * 8) * unit + leftHudShift;
    const hungerX = widgetRect.x + (182 - 10 - i * 8) * unit + rightHudShift;

    const heartFeat = tryExtractFeature(ctx, heartX, heartsY, iconSize, iconSize, imgW, imgH, 16, 16);
    const hungerFeat = tryExtractFeature(ctx, hungerX, heartsY, iconSize, iconSize, imgW, imgH, 16, 16);
    const armorFeat = tryExtractFeature(ctx, heartX, armorY, iconSize, iconSize, imgW, imgH, 16, 16);

    if (heartFeat) { hearts.push(heartFeat); heartBoxes.push({ x: heartX, y: heartsY, w: iconSize, h: iconSize }); }
    if (hungerFeat) { hunger.push(hungerFeat); hungerBoxes.push({ x: hungerX, y: heartsY, w: iconSize, h: iconSize }); }
    if (armorFeat) { armor.push(armorFeat); armorBoxes.push({ x: heartX, y: armorY, w: iconSize, h: iconSize }); }
  }

  return { hearts, hunger, armor, heartBoxes, hungerBoxes, armorBoxes };
}

function estimateWidgetCandidates(widgetFeatures, topK) {
  if (!widgetFeatures || !fingerprints || !fingerprints.packs) return { best: 0, bestName: '', top: [] };
  const top = [];
  let best = 0, bestName = '';
  for (const [name, packData] of Object.entries(fingerprints.packs)) {
    if (!packData.hotbar_widget) continue;
    const sim = compareWidget(widgetFeatures, packData.hotbar_widget);
    if (sim > best) { best = sim; bestName = name; }
    if (topK > 0) {
      top.push({ name, sim });
      top.sort((a, b) => b.sim - a.sim);
      if (top.length > topK) top.length = topK;
    }
  }
  return { best, bestName, top };
}

function estimateHudConfidence(hudFeatures, packNames) {
  if (!hudFeatures || !fingerprints || !fingerprints.packs) return { best: 0, bestName: '' };
  const names = (packNames && packNames.length) ? packNames : Object.keys(fingerprints.packs);
  let best = 0, bestName = '';
  for (const name of names) {
    const p = fingerprints.packs[name];
    if (!p) continue;
    const healthSim = compareHudCells(hudFeatures.hearts, [p.health_empty, p.health_half, p.health_full]);
    const hungerSim = compareHudCells(hudFeatures.hunger, [p.hunger_empty, p.hunger_half, p.hunger_full]);
    const armorSim = compareHudCells(hudFeatures.armor, [p.armor_empty, p.armor_half, p.armor_full]);

    let hudWeighted = 0, hudWeights = 0;
    if (healthSim > 0) { hudWeighted += healthSim * SBI_SCORE_WEIGHTS.hud.health; hudWeights += SBI_SCORE_WEIGHTS.hud.health; }
    if (hungerSim > 0) { hudWeighted += hungerSim * SBI_SCORE_WEIGHTS.hud.hunger; hudWeights += SBI_SCORE_WEIGHTS.hud.hunger; }
    if (armorSim > 0) { hudWeighted += armorSim * SBI_SCORE_WEIGHTS.hud.armor; hudWeights += SBI_SCORE_WEIGHTS.hud.armor; }
    const hudComposite = hudWeights ? (hudWeighted / hudWeights) : 0;

    if (hudComposite > best) { best = hudComposite; bestName = name; }
  }
  return { best, bestName };
}

function estimateSlotConfidence(slots, packNames) {
  if (!slots || !slots.length || !fingerprints || !fingerprints.packs) return { best: 0, bestName: '' };
  const names = (packNames && packNames.length) ? packNames : Object.keys(fingerprints.packs);
  const slotTypes = inferDisplaySlotTypes(slots);
  const swordSlot = pickSlotForClip(slots, slotTypes, 'diamond_sword', 0);
  const pearlSlot = pickSlotForClip(slots, slotTypes, 'ender_pearl', 1);
  const potionSlot = pickSlotForClip(slots, slotTypes, 'splash_potion', 5);

  let best = 0, bestName = '';
  for (const name of names) {
    const p = fingerprints.packs[name];
    if (!p) continue;
    let sum = 0, wSum = 0;
    if (swordSlot && (swordSlot.activity || 0) >= 0.28 && p.diamond_sword) {
      sum += compareSlotToType(swordSlot, p.diamond_sword, 'diamond_sword') * 1.0;
      wSum += 1.0;
    }
    if (pearlSlot && (pearlSlot.activity || 0) >= 0.28 && p.ender_pearl) {
      sum += compareSlotToType(pearlSlot, p.ender_pearl, 'ender_pearl') * 1.0;
      wSum += 1.0;
    }
    if (potionSlot && (potionSlot.activity || 0) >= 0.28 && p.splash_potion) {
      sum += compareSlotToType(potionSlot, p.splash_potion, 'splash_potion') * 0.6;
      wSum += 0.6;
    }
    const score = wSum ? (sum / wSum) : 0;
    if (score > best) { best = score; bestName = name; }
  }
  return { best, bestName };
}

function buildStrictCropCandidates(imgW, imgH) {
  const unitSet = new Set();
  const aspect = imgH / Math.max(1, imgW);
  const isHudCrop = aspect < 0.35;
  const maxWidgetW = imgW * (isHudCrop ? 1.02 : 0.92);
  const maxWidgetH = imgH * (isHudCrop ? 0.78 : 0.2);

  // Prefer Minecraft-like GUI scale factors (integer), plus ratio-consistent fallbacks for rescaled screenshots.
  const maxScale = Math.max(1, Math.min(6, Math.floor(Math.min(imgW / 320, imgH / 240))));
  for (let u = 1; u <= maxScale; u++) unitSet.add(u.toFixed(3));
  const denseMax = Math.min(6, maxScale + 0.75);
  for (let u = 1.0; u <= denseMax + 1e-6; u += 0.05) unitSet.add(u.toFixed(3));

  // Hotbar-only crops: the widget can span (almost) the full image width.
  // These units are harmless for full screenshots (filtered out by range).
  const uFullW = imgW / 182;
  if (isFinite(uFullW)) {
    if (uFullW >= 0.8 && uFullW <= 6) unitSet.add(uFullW.toFixed(3));
    const ur = Math.round(uFullW);
    if (ur >= 1 && ur <= 6) unitSet.add(ur.toFixed(3));
  }
  const uFullH = imgH / 22;
  if (isFinite(uFullH)) {
    if (uFullH >= 0.8 && uFullH <= 6) unitSet.add(uFullH.toFixed(3));
    const ur = Math.round(uFullH);
    if (ur >= 1 && ur <= 6) unitSet.add(ur.toFixed(3));
  }

  for (const rw of STRICT_WIDGET_WIDTH_RATIOS) {
    const unitW = imgW * rw / 182;
    for (const rh of STRICT_WIDGET_HEIGHT_RATIOS) {
      const unitH = imgH * rh / 22;
      if (Math.abs(unitW - unitH) > 0.24) continue;
      unitSet.add(((unitW + unitH) * 0.5).toFixed(3));
    }
  }

  // Legacy union fallback (keeps behavior for unusual crops/aspects).
  if (unitSet.size < 6) {
    for (const ratio of STRICT_WIDGET_WIDTH_RATIOS) unitSet.add((imgW * ratio / 182).toFixed(3));
    for (const ratio of STRICT_WIDGET_HEIGHT_RATIOS) unitSet.add((imgH * ratio / 22).toFixed(3));
  }
  const units = Array.from(unitSet).map(Number).filter(u => u >= 1.0 && u <= 6).sort((a, b) => a - b);
  const out = [];
  for (const unit of units) {
    const widgetW = 182 * unit;
    const widgetH = 22 * unit;
    if (widgetW > maxWidgetW || widgetH > maxWidgetH) continue;
    const cx = (imgW - widgetW) / 2;
    const xSet = new Set([cx.toFixed(3)]);
    if (isHudCrop) {
      xSet.add('0.000');
      xSet.add((imgW - widgetW).toFixed(3));
    }
    const xCandidates = Array.from(xSet).map(Number).filter(x => isFinite(x) && x >= 0 && x + widgetW <= imgW + 1e-3);
    const bottomOffsets = new Set(STRICT_BOTTOM_OFFSET_UNIT_STEPS.map(s => Math.round(s * unit)));
    for (const bottomOffset of bottomOffsets) {
      const bottomRatio = bottomOffset / imgH;
      const widgetY = imgH - widgetH - bottomOffset;
      if (widgetY < 0 || widgetY + widgetH > imgH) continue;
      for (const widgetX of xCandidates) {
        if (widgetX < 0 || widgetX + widgetW > imgW) continue;
        out.push({ unit, bottomRatio, bottomOffset, widgetX, widgetY, widgetW, widgetH });
      }
    }
  }
  return out;
}

function extractSlotFeatures(ctx, x, y, sz, imgW, imgH, index) {
  const sx = Math.round(x);
  const sy = Math.round(y);
  const ss = Math.round(sz);
  if (sx < 0 || sy < 0 || sx + ss > imgW || sy + ss > imgH) return null;

  const inset = Math.max(1, Math.round(ss * 0.12));
  const iw = Math.max(4, ss - inset * 2);
  const ih = Math.max(4, ss - inset * 2);
  if (sx + inset < 0 || sy + inset < 0 || sx + inset + iw > imgW || sy + inset + ih > imgH) return null;

  const region = extractRegion(ctx, sx + inset, sy + inset, iw, ih, 16, 16);
  let lumSum = 0, lumSqSum = 0;
  for (let p = 0; p < 256; p++) {
    const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
    lumSum += lum;
    lumSqSum += lum * lum;
  }
  const mean = lumSum / 256;
  const variance = lumSqSum / 256 - mean * mean;
  const features = computeFeatures(region, 16, 16, true, 'slot');
  const variants = buildSlotVariants(ctx, sx, sy, ss, imgW, imgH);
  if (!variants.length) variants.push(features);

  // Variance on empty slots can be deceptively high due to gradients; gate against that.
  const varScore = clamp01((variance - 220) / 1500);
  const edgeScore = clamp01((features.edge - 0.02) / 0.08);
  const activity = 0.62 * varScore + 0.38 * edgeScore;
  const quality = Math.sqrt(Math.max(0, variance)) * (0.55 + features.edge) * (0.45 + activity);

  const pad = Math.max(1, Math.round(ss * 0.125));
  const fullSz = Math.max(ss + 2, Math.round(ss * 1.25));
  const displayRect = { x: sx - pad, y: sy - pad, sz: fullSz };
  return { index, features, variants, x: sx, y: sy, sz: ss, displayRect, quality, activity, variance };
}

function pickSlotForClip(slots, slotTypes, wantedType, fallbackIndex) {
  if (Array.isArray(slotTypes) && slotTypes.length === 9) {
    const idx = slotTypes.indexOf(wantedType);
    if (idx >= 0) {
      const byIndex = slots.find(s => s && s.index === idx);
      if (byIndex) return byIndex;
      if (slots[idx]) return slots[idx];
    }
  }
  const fb = slots.find(s => s && s.index === fallbackIndex) || slots[fallbackIndex];
  return fb || slots[0] || null;
}

function bboxOfBoxes(boxes) {
  if (!boxes || !boxes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function getSlotDisplayRect(slot, imgW, imgH) {
  if (!slot) return null;
  const src = slot.displayRect || slot;
  const sx = Math.round(src.x);
  const sy = Math.round(src.y);
  const ss = Math.max(2, Math.round(src.sz));
  let left = sx;
  let top = sy;
  let right = sx + ss;
  let bottom = sy + ss;
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (right > imgW) right = imgW;
  if (bottom > imgH) bottom = imgH;
  const side = Math.min(right - left, bottom - top);
  if (side < 2) return null;
  return { x: left, y: top, sz: side };
}


function renderCropCanvas(id, imageData) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (!imageData) { canvas.classList.add('sbi-crop-hidden'); return; }
  canvas.classList.remove('sbi-crop-hidden');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
}

function renderItemCropCanvas(id, ctx, imgW, imgH, slot, outSize) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (!slot) { canvas.classList.add('sbi-crop-hidden'); return; }
  const sx = Math.round(slot.x);
  const sy = Math.round(slot.y);
  const sw = Math.max(2, Math.round(slot.sz));
  const sh = sw;
  if (sx < 0 || sy < 0 || sx + sw > imgW || sy + sh > imgH) { canvas.classList.add('sbi-crop-hidden'); return; }

  const size = outSize || Math.max(96, sw * 2);
  canvas.classList.remove('sbi-crop-hidden');
  canvas.width = size;
  canvas.height = size;
  const cctx = canvas.getContext('2d');
  cctx.imageSmoothingEnabled = false;
  cctx.fillStyle = '#141414';
  cctx.fillRect(0, 0, size, size);
  cctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, size, size);
}


function renderCrops(ctx, imgW, imgH, widgetRect, hudFeatures, slots, slotTypes) {
  const wrap = document.getElementById('sbi-crops');
  if (!wrap) return;
  if (!widgetRect) { wrap.hidden = true; return; }

  renderCropCanvas(
    'sbi-crop-hotbar',
    extractRegion(ctx, widgetRect.x, widgetRect.y, widgetRect.w, widgetRect.h, 256, Math.max(1, Math.round(256 * widgetRect.h / widgetRect.w)))
  );

  const armorBox = hudFeatures ? bboxOfBoxes(hudFeatures.armorBoxes) : null;
  const heartBox = hudFeatures ? bboxOfBoxes(hudFeatures.heartBoxes) : null;
  const hungerBox = hudFeatures ? bboxOfBoxes(hudFeatures.hungerBoxes) : null;
  const renderHudBar = (id, box) => {
    if (!box) { renderCropCanvas(id, null); return; }
    const w = 256;
    const h = Math.max(1, Math.round(w * box.h / box.w));
    renderCropCanvas(id, extractRegion(ctx, box.x, box.y, box.w, box.h, w, h));
  };
  renderHudBar('sbi-crop-armor', armorBox);
  renderHudBar('sbi-crop-health', heartBox);
  renderHudBar('sbi-crop-hunger', hungerBox);

  const ds = pickSlotForClip(slots, slotTypes, 'diamond_sword', 0);
  const ep = pickSlotForClip(slots, slotTypes, 'ender_pearl', 1);
  const hl = pickSlotForClip(slots, slotTypes, 'splash_potion', 5);
  const food = pickSlotForClip(slots, slotTypes, 'golden_carrot', 8) || pickSlotForClip(slots, slotTypes, 'steak', 8);
  renderItemCropCanvas('sbi-crop-ds', ctx, imgW, imgH, ds, 96);
  renderItemCropCanvas('sbi-crop-ep', ctx, imgW, imgH, ep, 96);
  renderItemCropCanvas('sbi-crop-hl', ctx, imgW, imgH, hl, 96);
  renderItemCropCanvas('sbi-crop-food', ctx, imgW, imgH, food, 96);

  wrap.hidden = false;
}

function buildClipCompositePixels(ctx, imgW, imgH, widgetRect, slots, slotTypes) {
  if (!widgetRect || !slots || !slots.length) return null;

  const W = 224, H = 224, HALF = 112;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.imageSmoothingEnabled = false;
  cctx.fillStyle = 'rgb(20,20,20)';
  cctx.fillRect(0, 0, W, H);

  // Top: hotbar widget strip
  cctx.drawImage(ctx.canvas, widgetRect.x, widgetRect.y, widgetRect.w, widgetRect.h, 0, 0, W, HALF);

  const swordSlot = pickSlotForClip(slots, slotTypes, 'diamond_sword', 0);
  const pearlSlot = pickSlotForClip(slots, slotTypes, 'ender_pearl', 1);

  const itemCanvas = document.createElement('canvas');
  itemCanvas.width = 16; itemCanvas.height = 16;
  const ictx = itemCanvas.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingEnabled = false;

  const drawItem = (slot, dx, dy) => {
    if (!slot) return;
    const inset = Math.max(1, Math.round(slot.sz * 0.12));
    const sx = Math.round(slot.x + inset);
    const sy = Math.round(slot.y + inset);
    const sw = Math.max(2, Math.round(slot.sz - inset * 2));
    const sh = Math.max(2, Math.round(slot.sz - inset * 2));
    if (sx < 0 || sy < 0 || sx + sw > imgW || sy + sh > imgH) return;

    // Remove slot BG + HUD-like overlays to better match thumbnail composites (transparent texture over dark bg).
    const region = extractRegion(ctx, sx, sy, sw, sh, 16, 16);
    let eff = maskSlotNoise(region.data, 16, 16);
    eff = suppressSlotBackground(eff, 16, 16);
    eff = zeroRgbForTransparent(eff);
    ictx.putImageData(new ImageData(eff, 16, 16), 0, 0);
    cctx.drawImage(itemCanvas, 0, 0, 16, 16, dx, dy, HALF, HALF);
  };

  // Bottom: sword (left) + pearl (right), matching the embedding composite layout.
  drawItem(swordSlot, 0, HALF);
  drawItem(pearlSlot, HALF, HALF);

  const img = cctx.getImageData(0, 0, W, H);
  return img.data.buffer.slice(0);
}

// --- Hotbar extraction ---
// Strict proportional crop only: centered hotbar + fixed bottom ratio candidates
function extractHotbarSlots(ctx, imgW, imgH) {
  const candidates = buildStrictCropCandidates(imgW, imgH);
  const aspect = imgH / Math.max(1, imgW);
  const isHudCrop = aspect < 0.35;
  const PRE_K = 80;
  const PER_UNIT_K = 14;
  const preByUnit = new Map();
  const mustByUnit = new Map();
  const all = [];
  let bestSlots = [];
  let bestConfidence = -Infinity;
  let bestBoost = -Infinity;
  let bestWidgetFeatures = null;
  let bestWidgetRect = null;
  let bestHudFeatures = null;
  let bestSearchInfo = null;

  for (const c of candidates) {
    const wx = Math.round(c.widgetX);
    const wy = Math.round(c.widgetY);
    const ww = Math.round(c.widgetW);
    const wh = Math.round(c.widgetH);
    if (wx < 0 || wy < 0 || wx + ww > imgW || wy + wh > imgH) continue;

    const widgetStrip = extractRegion(ctx, wx, wy, ww, wh, 182, 22);
    const maskedStrip = maskWidgetItems(widgetStrip.data, 182, 22);
    const gridScore = computeWidgetGridScore(maskedStrip, 182, 22);
    const bottomPref = clamp01(1 - (c.bottomOffset || 0) / (c.unit * 4 + 1e-6));
    const unitRounded = Math.max(1, Math.min(6, Math.round(c.unit)));
    const unitPref = clamp01(1 - Math.abs(c.unit - unitRounded) / 0.18);
    const score = (0.70 * gridScore + 0.30 * bottomPref) * (0.90 + 0.10 * unitPref);
    const entry = { c, wx, wy, ww, wh, widgetStrip, gridScore, bottomPref, unitPref, score, unitRounded };
    all.push(entry);

    const list = preByUnit.get(unitRounded) || [];
    if (list.length < PER_UNIT_K || score > list[list.length - 1].score) {
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      if (list.length > PER_UNIT_K) list.length = PER_UNIT_K;
      preByUnit.set(unitRounded, list);
    }

    if ((c.bottomOffset || 0) === 0) {
      const prev = mustByUnit.get(unitRounded);
      if (!prev) {
        mustByUnit.set(unitRounded, entry);
      } else {
        const d1 = Math.abs(c.unit - unitRounded);
        const d0 = Math.abs(prev.c.unit - unitRounded);
        if (d1 + 1e-6 < d0 || (Math.abs(d1 - d0) <= 1e-6 && score > prev.score)) mustByUnit.set(unitRounded, entry);
      }
    }
  }

  const pre = [];
  const seen = new Set();
  const keyOf = (cand) => `${cand.wx},${cand.wy},${cand.ww},${cand.wh}`;
  const add = (cand) => {
    if (!cand) return;
    const k = keyOf(cand);
    if (seen.has(k)) return;
    seen.add(k);
    pre.push(cand);
  };

  const must = Array.from(mustByUnit.values()).sort((a, b) => b.score - a.score);
  for (const cand of must) add(cand);
  const merged = [];
  for (const list of preByUnit.values()) merged.push(...list);
  merged.sort((a, b) => b.score - a.score);
  for (const cand of merged) { if (pre.length >= PRE_K) break; add(cand); }
  if (pre.length < PRE_K) {
    all.sort((a, b) => b.score - a.score);
    for (const cand of all) { if (pre.length >= PRE_K) break; add(cand); }
  }

  const preTop = [...pre].sort((a, b) => b.score - a.score).slice(0, 8).map(p =>
    `u=${p.c.unit.toFixed(2)} off=${p.c.bottomOffset || 0} g=${p.gridScore.toFixed(2)} b=${p.bottomPref.toFixed(2)} s=${p.score.toFixed(2)}`
  ).join(' | ');

  for (const cand of pre) {
    const c = cand.c;
    const unit = c.unit;
    const itemOffX = 3 * unit;
    const itemW = 16 * unit;
    const slotStep = 20 * unit;
    const itemY = cand.wy + 3 * unit;

    const slots = [];
    let activeCount = 0;
    let totalActivity = 0;
    let totalQuality = 0;
    for (let i = 0; i < 9; i++) {
      const x = cand.wx + itemOffX + i * slotStep;
      const slot = extractSlotFeatures(ctx, x, itemY, itemW, imgW, imgH, i);
      if (!slot) continue;
      slot.displayRect = {
        x: cand.wx + (1 + i * 20) * unit,
        y: cand.wy + unit,
        sz: 20 * unit,
      };
      slots.push(slot);
      totalActivity += slot.activity;
      totalQuality += slot.quality;
      if (slot.activity >= 0.28) activeCount++;
    }
    if (slots.length !== 9) continue;

    const widgetMasked = new ImageData(maskWidgetItems(cand.widgetStrip.data, 182, 22), 182, 22);
    const widgetRegion = resizeImageDataNearest(widgetMasked, 182, 22, 16, 16);
    const widgetClean = suppressWidgetHighlights(widgetRegion.data, 16, 16);
    const widgetFeatures = {
      hist: computeHistogram(widgetClean, 256, 0),
      moments: computeColorMoments(widgetClean, 256, 0),
      edge: computeEdgeDensity(widgetClean, 16, 16)
    };
    const widgetRect = { x: cand.wx, y: cand.wy, w: cand.ww, h: cand.wh };
    const hudFeatures = extractHudFeatures(ctx, widgetRect, imgW, imgH);

    const widgetCand = estimateWidgetCandidates(widgetFeatures, 8);
    const widgetBoost = widgetCand.best;
    const hudCand = hudFeatures
      ? estimateHudConfidence(hudFeatures, widgetCand.top.map(t => t.name))
      : { best: 0, bestName: '' };
    const hudBoost = hudCand.best;
    const slotCand = estimateSlotConfidence(slots, widgetCand.top.map(t => t.name));
    const slotBoost = slotCand.best;

    // For full screenshots, HUD icon alignment is a stronger geometric anchor than
    // widget-strip color/texture, which can overfit to a too-small centered crop.
    const baseBoost = hudFeatures
      ? (0.25 * widgetBoost + 0.65 * hudBoost + 0.10 * slotBoost)
      : (0.70 * widgetBoost + 0.30 * slotBoost);
    // Full screenshots use integer GUI scale; strongly prefer near-integer units
    // to prevent HUD-driven selection of fractional units that shift the crop.
    const unitPrefW = isHudCrop ? 0.08 : 0.50;
    const combinedBoost = baseBoost
      * (0.78 + 0.22 * cand.gridScore)
      * (0.86 + 0.14 * cand.bottomPref)
      * ((1 - unitPrefW) + unitPrefW * (cand.unitPref || 0));
    const hudCoverage = hudFeatures
      ? ((hudFeatures.hearts.length + hudFeatures.hunger.length + hudFeatures.armor.length) / 30)
      : 0;
    const geomBoost = hudFeatures ? (0.82 + 0.18 * clamp01(hudCoverage)) : 1;
    const boostedCombined = combinedBoost * geomBoost;
    const confidence = activeCount * 220 + totalActivity * 160 + totalQuality * 6 + hudCoverage * 700;

    const boostDelta = boostedCombined - bestBoost;
    if (boostDelta > 0.001 || (Math.abs(boostDelta) <= 0.001 && confidence > bestConfidence)) {
      bestConfidence = confidence;
      bestBoost = boostedCombined;
      bestSlots = slots;
      bestWidgetFeatures = widgetFeatures;
      bestWidgetRect = widgetRect;
      bestHudFeatures = hudFeatures;
      bestSearchInfo = {
        mode: 'strict-ratio',
        unit: c.unit,
        bottomRatio: c.bottomRatio,
        bottomOffset: c.bottomOffset || 0,
        confidence,
        combinedBoost: boostedCombined,
        widgetBoost,
        hudBoost,
        slotBoost,
        gridScore: cand.gridScore,
        bottomPref: cand.bottomPref,
        unitPref: cand.unitPref,
        preTop,
        widgetBest: widgetCand.bestName,
        hudBest: hudCand.bestName,
        slotBest: slotCand.bestName,
      };
    }
  }

  // For full screenshots, determine the correct integer GUI scale by
  // testing each candidate at the centered, bottom-aligned position and
  // picking the one whose widget strip has the strongest grid pattern.
  if (!isHudCrop && bestWidgetRect) {
    const maxScale = Math.max(1, Math.min(6, Math.floor(Math.min(imgW / 320, imgH / 240))));
    const bOff = Math.round((bestSearchInfo && bestSearchInfo.bottomOffset) || 0);
    let bestGU = Math.round(bestWidgetRect.w / 182);
    let bestGS = -1;
    for (let u = 1; u <= maxScale; u++) {
      const w = 182 * u, h = 22 * u;
      const x = Math.round((imgW - w) / 2);
      const y = imgH - h - bOff;
      if (x < 0 || y < 0 || x + w > imgW || y + h > imgH) continue;
      const strip = extractRegion(ctx, x, y, w, h, 182, 22);
      const masked = maskWidgetItems(strip.data, 182, 22);
      const gs = computeWidgetGridScore(masked, 182, 22);
      if (gs > bestGS) { bestGS = gs; bestGU = u; }
    }
    const fixedW = 182 * bestGU;
    const fixedH = 22 * bestGU;
    const fixedX = Math.round((imgW - fixedW) / 2);
    const fixedY = imgH - fixedH - bOff;
    if (fixedX >= 0 && fixedY >= 0 && fixedX + fixedW <= imgW && fixedY + fixedH <= imgH) {
      bestWidgetRect = { x: fixedX, y: fixedY, w: fixedW, h: fixedH };
      bestHudFeatures = extractHudFeatures(ctx, bestWidgetRect, imgW, imgH);
      for (let i = 0; i < bestSlots.length; i++) {
        bestSlots[i].displayRect = {
          x: fixedX + (1 + i * 20) * bestGU,
          y: fixedY + bestGU,
          sz: 20 * bestGU,
        };
      }
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

function compareSlotVariant(extracted, packTex, targetType) {
  let sim = compare(extracted, packTex);
  if (targetType === 'diamond_sword') {
    const dir = meanRgbDirSim(extracted.moments, packTex.moments);
    sim *= (0.30 + 0.70 * clamp01(dir));
  }
  return sim;
}

function compareSlotToType(slot, packTex, targetType) {
  if (!slot) return 0;
  const variants = slot.variants && slot.variants.length ? slot.variants : (slot.features ? [slot.features] : []);
  let best = 0;
  for (const v of variants) {
    const sim = compareSlotVariant(v, packTex, targetType);
    if (sim > best) best = sim;
  }
  return best;
}

function sharpenSimilarityScore(v) {
  const x = clamp01(v);
  return clamp01(1 / (1 + Math.exp(-12 * (x - 0.58))));
}

function inferDisplaySlotTypes(slots) {
  const out = new Array(9).fill('none');
  if (!slots || !slots.length) return out;

  const ordered = [...slots].sort((a, b) => a.index - b.index);
  for (const slot of ordered) {
    if (!slot || slot.index < 0 || slot.index > 8) continue;

    const activity = clamp01(slot.activity || 0);
    const variance = slot.variance || 0;
    if (activity < 0.26 || variance < 220) {
      out[slot.index] = 'none';
      continue;
    }

    const sig = slot.features && slot.features.sig;
    if (!sig || sig.n <= 0 || !isFinite(sig.meanLum) || !isFinite(sig.meanR) || !isFinite(sig.meanB)) {
      out[slot.index] = 'none';
      continue;
    }

    // Food (GC / gapple both render as GC in the UI summary).
    if (sig.yellowFrac >= 0.12) {
      out[slot.index] = 'golden_carrot';
      continue;
    }

    // Health potions: red-heavy.
    if (sig.redFrac >= 0.075) {
      out[slot.index] = 'splash_potion';
      continue;
    }

    // Ender pearl: typically dark + low warm colors.
    if (sig.meanLum < 80 && sig.redFrac < 0.05 && sig.yellowFrac < 0.08) {
      out[slot.index] = 'ender_pearl';
      continue;
    }

    const blueStrong = (sig.meanB > sig.meanR + 35) && (sig.meanB > sig.meanG + 25);
    if (sig.n < 70) {
      out[slot.index] = blueStrong ? 'diamond_sword' : 'iron_sword';
      continue;
    }

    // Fallback: for larger silhouettes, prefer pearls over swords.
    out[slot.index] = blueStrong ? 'ender_pearl' : 'none';
  }

  return out;
}

// --- Matching ---
function matchPacks(slots, widgetFeatures, hudFeatures) {
  if (!slots.length) return { results: [], slotTypes: [], details: {} };
  const displaySlotTypes = inferDisplaySlotTypes(slots);
  const ITEM_TYPES = SLOT_ITEM_TYPES;
  const TYPE_WEIGHT = SBI_SCORE_WEIGHTS.type;
  const results = [];
  const details = {};
  let bestScore = -Infinity;

  for (const [packName, packData] of Object.entries(fingerprints.packs)) {
    const isForced = FORCE_PACKS.includes(packName);
    let slotWeighted = 0, slotWeights = 0;
    let slotPenalty = 0, certaintySum = 0;
    let activeSlots = 0, strongSlots = 0;
    let widgetSim = 0, healthSim = 0, hungerSim = 0, armorSim = 0;

    for (const slot of slots) {
      const activity = clamp01(slot.activity || 0);
      if (activity < 0.18) continue;

      const targetType = displaySlotTypes[slot.index] || 'none';
      if (targetType === 'none') continue;
      const typeW = TYPE_WEIGHT[targetType] || 0;
      if (typeW <= 0) continue;
      const targetTex = packData[targetType];
      if (!targetTex) continue;

      const sim = compareSlotToType(slot, targetTex, targetType);
      let altBest = 0;
      for (const type of ITEM_TYPES) {
        if (type === targetType) continue;
        if ((TYPE_WEIGHT[type] || 0) <= 0) continue;
        if (!packData[type]) continue;
        altBest = Math.max(altBest, compareSlotToType(slot, packData[type], type));
      }

      activeSlots++;
      const certainty = Math.max(0, sim - altBest);
      const qualityNorm = clamp01((slot.quality || 0) / 13);
      const w = typeW * (0.45 + 0.9 * activity) * (0.6 + 0.6 * qualityNorm);
      slotWeighted += sim * w;
      slotWeights += w;
      certaintySum += certainty;
      if (sim >= 0.54) strongSlots++;
      else slotPenalty += (0.54 - sim) * (0.8 + activity * 0.7);
    }
    if (!slotWeights || activeSlots < 3) {
      if (!isForced) continue;
    }

    const slotScore = slotWeights ? (slotWeighted / slotWeights) : 0;
    const slotCoverage = activeSlots ? (strongSlots / activeSlots) : 0;
    const slotPenaltyNorm = activeSlots ? (slotPenalty / activeSlots) : 0;
    const slotCertainty = activeSlots ? (certaintySum / activeSlots) : 0;
    let slotComposite = slotScore * (0.78 + 0.22 * slotCoverage) + Math.min(0.10, slotCertainty * 0.55);
    slotComposite -= slotPenaltyNorm * 0.35;
    slotComposite = clamp01(slotComposite);

    if (widgetFeatures && packData.hotbar_widget) {
      widgetSim = compareWidget(widgetFeatures, packData.hotbar_widget);
    }

    let hudWeighted = 0, hudWeights = 0;
    if (hudFeatures) {
      healthSim = compareHudCells(hudFeatures.hearts, [packData.health_empty, packData.health_half, packData.health_full]);
      hungerSim = compareHudCells(hudFeatures.hunger, [packData.hunger_empty, packData.hunger_half, packData.hunger_full]);
      armorSim = compareHudCells(hudFeatures.armor, [packData.armor_empty, packData.armor_half, packData.armor_full]);

      if (healthSim > 0) { hudWeighted += healthSim * SBI_SCORE_WEIGHTS.hud.health; hudWeights += SBI_SCORE_WEIGHTS.hud.health; }
      if (hungerSim > 0) { hudWeighted += hungerSim * SBI_SCORE_WEIGHTS.hud.hunger; hudWeights += SBI_SCORE_WEIGHTS.hud.hunger; }
      if (armorSim > 0) { hudWeighted += armorSim * SBI_SCORE_WEIGHTS.hud.armor; hudWeights += SBI_SCORE_WEIGHTS.hud.armor; }
    }

    const hudComposite = hudWeights ? (hudWeighted / hudWeights) : 0;
    let rawScore;
    if (hudWeights > 0) rawScore = slotComposite * SBI_SCORE_WEIGHTS.mix.slot + hudComposite * SBI_SCORE_WEIGHTS.mix.hud + widgetSim * SBI_SCORE_WEIGHTS.mix.widget;
    else rawScore = slotComposite * SBI_SCORE_WEIGHTS.mix.slotNoHud + widgetSim * SBI_SCORE_WEIGHTS.mix.widgetNoHud;

    rawScore += (slotCoverage - 0.5) * 0.1;
    rawScore -= slotPenaltyNorm * 0.22;
    rawScore = clamp01(rawScore);

    const finalScore = sharpenSimilarityScore(rawScore);
    if (finalScore > 0.28 || isForced) {
      details[packName] = {
        finalScore,
        slotScore: slotComposite,
        widgetScore: widgetSim,
        healthScore: healthSim,
        hungerScore: hungerSim,
        armorScore: armorSim,
        slotCoverage,
        slotCertainty,
        slotTypes: displaySlotTypes,
      };
    }
    if (finalScore > 0.28) {
      results.push({ name: packName, score: finalScore });
      if (finalScore > bestScore) bestScore = finalScore;
    }
  }

  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, 80), slotTypes: displaySlotTypes, details };
}

function drawDetectionOverlay(ctx, slots, hudFeatures, slotTypes) {
  ctx.lineWidth = 2.5;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const slotType = slotTypes && slotTypes[i] ? slotTypes[i] : '';
    ctx.strokeStyle = SLOT_COLOR_MAP[slotType] || '#ff0';
    const rect = getSlotDisplayRect(slot, ctx.canvas.width, ctx.canvas.height);
    if (!rect) continue;
    ctx.strokeRect(rect.x, rect.y, rect.sz, rect.sz);
  }
  if (!hudFeatures) return;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fca5a5';
  for (const b of hudFeatures.heartBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#fbbf24';
  for (const b of hudFeatures.hungerBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#9ca3af';
  for (const b of hudFeatures.armorBoxes || []) ctx.strokeRect(b.x, b.y, b.w, b.h);
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
  const cropsEl = document.getElementById('sbi-crops');
  const debugPanel = document.getElementById('sbi-debug');
  const debugBody = document.getElementById('sbi-debug-body');
  const debugMeta = document.getElementById('sbi-debug-meta');
  resultsEl.hidden = true;
  progress.hidden = false;
  preview.hidden = false;
  if (cropsEl) cropsEl.hidden = true;
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

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = img.width;
  rawCanvas.height = img.height;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  rawCtx.drawImage(img, 0, 0);

  try {
    if (!fingerprints) {
      const resp = await fetch('/data/sbi-fingerprints.json?v=' + SBI_FINGERPRINT_VERSION);
      if (!resp.ok) throw new Error('Failed to load fingerprints: ' + resp.status);
      fingerprints = await resp.json();
    }

    const { slots, widgetFeatures, widgetRect, hudFeatures, searchInfo } = extractHotbarSlots(rawCtx, img.width, img.height);

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
    };
    renderCrops(rawCtx, img.width, img.height, widgetRect, hudFeatures, slots, slotTypes);
    drawDetectionOverlay(ctx, slots, hudFeatures, slotTypes);
    progress.hidden = true;
    renderResults(stage1Top10);
    renderDebugPanel(stage1Top10, 'hash');
    _lastForcedCombined = {};
    renderForcedPacks();

    // Cache hash scores for later CLIP combination
    _lastHashResults = results.slice(0, 40);
    _lastAllScores = {};
    for (const r of results) _lastAllScores[r.name] = r.score;
    for (const name of FORCE_PACKS) {
      const info = details && details[name];
      if (info && isFinite(info.finalScore)) _lastAllScores[name] = info.finalScore;
    }

    // Stage 2: CLIP refinement (async)
    if (ENABLE_CLIP && widgetRect && slots.length > 0) {
      const statusEl = document.getElementById('sbi-clip-status');
      if (statusEl) { statusEl.hidden = true; statusEl.textContent = ''; }
      if (clipWorkerError) {
        if (statusEl) { statusEl.hidden = false; statusEl.textContent = 'AI unavailable: ' + clipWorkerError; statusEl.dataset.state = 'error'; }
      }

      if (!clipWorkerError && widgetRect.x >= 0 && widgetRect.y >= 0 && widgetRect.x + widgetRect.w <= img.width && widgetRect.y + widgetRect.h <= img.height) {
        const pixels = buildClipCompositePixels(rawCtx, img.width, img.height, widgetRect, slots, slotTypes);
        if (pixels) {
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
                if (statusEl) { statusEl.hidden = false; statusEl.textContent = 'AI unavailable: ' + clipWorkerError; statusEl.dataset.state = 'error'; }
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

  const forceToggle = document.getElementById('sbi-force-toggle');
  if (forceToggle) forceToggle.addEventListener('change', () => renderForcedPacks());
  renderScoreBreakdown();
  if (ENABLE_CLIP) initClipWorker();
}

init();
})();

