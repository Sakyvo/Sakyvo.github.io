(function() {
'use strict';

let fingerprints = null;
let clipWorker = null;
let clipWorkerReady = false;

function initClipWorker() {
  if (clipWorker) return;
  clipWorker = new Worker('/assets/js/sbi-worker.js', { type: 'module' });
  clipWorker.onmessage = ({ data }) => {
    const badge = document.getElementById('sbi-ai-badge');
    const popup = document.getElementById('sbi-ai-popup');
    const msg = document.getElementById('sbi-ai-msg');
    if (data.type === 'ready') {
      clipWorkerReady = true;
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
      const el = document.getElementById('sbi-clip-status');
      if (el) el.textContent = 'AI: ' + data.msg;
      if (badge) badge.dataset.state = 'error';
      if (msg) msg.textContent = 'Error: ' + data.msg;
      const dot = document.getElementById('sbi-ai-dot');
      if (dot) dot.style.background = '#ef4444';
    }
  };
  clipWorker.postMessage({ type: 'init' });
  const badge = document.getElementById('sbi-ai-badge');
  if (badge) badge.dataset.state = 'loading';
}

let _lastHashResults = [], _lastAllScores = {};

function handleClipResults(clipScores) {
  const statusEl = document.getElementById('sbi-clip-status');
  // Build lookup: packName → clipScore
  const clipMap = {};
  for (const s of clipScores) clipMap[s.name] = s.clipScore;

  // Combine: 40% hash + 60% CLIP
  const combined = [];
  const allNames = new Set([
    ..._lastHashResults.map(r => r.name),
    ...clipScores.slice(0, 30).map(s => s.name)
  ]);
  for (const name of allNames) {
    const hashScore = _lastAllScores[name] || 0;
    const clipScore = clipMap[name] || 0;
    combined.push({ name, score: 0.4 * hashScore + 0.6 * clipScore });
  }
  combined.sort((a, b) => b.score - a.score);
  const top10 = combined.slice(0, 10);
  renderResults(top10, 'AI Enhanced');
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
  const dhashB = base64ToBytes(packTex.dhash);
  const hammingSim = 1 - hammingDistance(dhashA, dhashB) / 192;
  const histSim = cosineSimilarity(extracted.hist, packTex.hist);
  const momentSim = colorMomentSim(extracted.moments, packTex.moments);
  const edgeSim = 1 - Math.abs(extracted.edge - packTex.edge);
  return 0.30 * hammingSim + 0.35 * histSim + 0.20 * momentSim + 0.15 * edgeSim;
}

function compareWidget(extracted, packWidget) {
  const histSim = cosineSimilarity(extracted.hist, packWidget.hist);
  const momentSim = colorMomentSim(extracted.moments, packWidget.moments);
  return 0.50 * histSim + 0.50 * momentSim;
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

function computeFeatures(imageData, w, h, isScreenshot) {
  const BG_THRESHOLD = isScreenshot ? 50 : 0;
  // Resize source to 9x8 for dHash
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').putImageData(imageData, 0, 0);
  const tmp = document.createElement('canvas');
  tmp.width = 9; tmp.height = 8;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(src, 0, 0, 9, 8);
  const dhash = computeDHash(tctx.getImageData(0, 0, 9, 8).data);
  const hist = computeHistogram(imageData.data, w * h, BG_THRESHOLD);
  const moments = computeColorMoments(imageData.data, w * h, BG_THRESHOLD);
  const edge = computeEdgeDensity(imageData.data, w, h);
  return { dhash, hist, moments, edge };
}

// --- Hotbar extraction ---
// Try multiple GUI scales (2x, 3x, 4x) and Y offsets, pick best confidence
function extractHotbarSlots(ctx, imgW, imgH) {
  const baseScale = imgH / 1080;
  const GUI_SCALES = [3, 2, 4];
  const Y_OFFSETS = [0, -3, 3, -6, 6];
  let bestSlots = [], bestConfidence = 0, bestWidgetFeatures = null;

  for (const guiScale of GUI_SCALES) {
    const scale = baseScale * guiScale / 3;
    const widgetW = 182 * 3 * scale;
    const widgetH = 22 * 3 * scale;
    const itemOffX = 3 * 3 * scale;
    const itemW = 16 * 3 * scale;
    const slotStep = 20 * 3 * scale;
    const widgetX = (imgW - widgetW) / 2;
    const baseItemY = imgH - (22 * 3 - 3 * 3) * scale;

    for (const yOff of Y_OFFSETS) {
      const itemY = baseItemY + yOff;
      const widgetY = imgH - widgetH + yOff;

      const slots = [];
      let totalVar = 0;
      for (let i = 0; i < 9; i++) {
        const x = Math.round(widgetX + itemOffX + i * slotStep);
        const y = Math.round(itemY);
        const sz = Math.round(itemW);
        if (x < 0 || y < 0 || x + sz > imgW || y + sz > imgH) continue;
        const region = extractRegion(ctx, x, y, sz, sz, 16, 16);
        // Use variance instead of brightness: items create varied pixels, empty slots are uniform
        let lumSum = 0, lumSqSum = 0;
        for (let p = 0; p < 256; p++) {
          const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
          lumSum += lum; lumSqSum += lum * lum;
        }
        const mean = lumSum / 256;
        const variance = lumSqSum / 256 - mean * mean;
        if (variance > 80) {
          slots.push({ index: i, features: computeFeatures(region, 16, 16, true), x, y, sz });
          totalVar += variance;
        }
      }
      const confidence = slots.length * 1000 + totalVar;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestSlots = slots;
        const wx = Math.round(widgetX), wy = Math.round(widgetY);
        const ww = Math.round(widgetW), wh = Math.round(widgetH);
        if (wx >= 0 && wy >= 0 && wx + ww <= imgW && wy + wh <= imgH) {
          const widgetRegion = extractRegion(ctx, wx, wy, ww, wh, 16, 16);
          bestWidgetFeatures = {
            hist: computeHistogram(widgetRegion.data, 256, 0),
            moments: computeColorMoments(widgetRegion.data, 256, 0)
          };
        }
      }
    }
  }
  return { slots: bestSlots, widgetFeatures: bestWidgetFeatures };
}

// --- Matching ---
function matchPacks(slots, widgetFeatures) {
  if (!slots.length) return [];
  const ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot', 'iron_sword'];
  const TYPE_WEIGHT = { diamond_sword: 1.5, ender_pearl: 1.3, splash_potion: 1.0, steak: 0.8, golden_carrot: 0.8, iron_sword: 1.2 };
  const results = [];

  for (const [packName, packData] of Object.entries(fingerprints.packs)) {
    let totalScore = 0, totalWeight = 0;

    for (const slot of slots) {
      let bestSim = 0, bestType = '';
      for (const type of ITEM_TYPES) {
        if (!packData[type]) continue;
        const sim = compare(slot.features, packData[type]);
        if (sim > bestSim) { bestSim = sim; bestType = type; }
      }
      if (bestSim > 0.50) {
        const w = TYPE_WEIGHT[bestType] || 1;
        totalScore += bestSim * w;
        totalWeight += w;
      }
    }

    // Widget similarity (reduced weight to prevent domination)
    if (widgetFeatures && packData.hotbar_widget) {
      const widgetSim = compareWidget(widgetFeatures, packData.hotbar_widget);
      const widgetW = 1.2;
      totalScore += widgetSim * widgetW;
      totalWeight += widgetW;
    }

    if (totalWeight === 0) continue;
    const finalScore = totalScore / totalWeight;
    if (finalScore > 0.55) {
      results.push({ name: packName, score: finalScore });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

function drawDetectionOverlay(ctx, slots) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff0';
  for (const slot of slots) {
    ctx.strokeRect(slot.x, slot.y, slot.sz, slot.sz);
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
  resultsEl.hidden = true;
  progress.hidden = false;
  preview.hidden = false;

  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

  const canvas = document.getElementById('sbi-canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  try {
    if (!fingerprints) {
      const resp = await fetch('/data/sbi-fingerprints.json?v=5');
      if (!resp.ok) throw new Error('Failed to load fingerprints: ' + resp.status);
      fingerprints = await resp.json();
    }

    const { slots, widgetFeatures } = extractHotbarSlots(ctx, img.width, img.height);
    drawDetectionOverlay(ctx, slots);

    // Stage 1: Hash-based instant results
    const results = matchPacks(slots, widgetFeatures);
    progress.hidden = true;
    renderResults(results);

    // Cache hash scores for later CLIP combination
    _lastHashResults = results;
    _lastAllScores = {};
    for (const r of results) _lastAllScores[r.name] = r.score;

    // Stage 2: CLIP refinement (async)
    if (widgetFeatures && slots.length > 0) {
      const statusEl = document.getElementById('sbi-clip-status');
      if (statusEl) { statusEl.textContent = 'Running AI analysis...'; statusEl.hidden = false; }

      // Extract hotbar region pixels for CLIP query
      const baseScale = img.height / 1080;
      const guiScale = 3, scale = baseScale * guiScale / 3;
      const widgetW = Math.round(182 * 3 * scale), widgetH = Math.round(22 * 3 * scale);
      const widgetX = Math.round((img.width - widgetW) / 2);
      const widgetY = Math.round(img.height - widgetH);
      if (widgetX >= 0 && widgetY >= 0 && widgetX + widgetW <= img.width && widgetY + widgetH <= img.height) {
        const clipRegion = extractRegion(ctx, widgetX, widgetY, widgetW, widgetH, 224, 224);
        const pixels = clipRegion.data.buffer.slice(0);
        const sendSearch = () => clipWorker.postMessage({ type: 'search', pixels, width: 224, height: 224 }, [pixels]);
        if (clipWorkerReady) sendSearch();
        else {
          const check = setInterval(() => { if (clipWorkerReady) { clearInterval(check); sendSearch(); } }, 200);
          setTimeout(() => clearInterval(check), 30000);
        }
      }
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 320; thumbCanvas.height = Math.round(320 * img.height / img.width);
    thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
    saveHistory(thumbCanvas.toDataURL('image/jpeg', 0.6), results);
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
