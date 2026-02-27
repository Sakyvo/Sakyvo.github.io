(function() {
'use strict';

let fingerprints = null;

// --- Feature computation ---

// dHash: compare adjacent horizontal pixels → 64 bits, robust for texture edges
function computeDHash(imageData) {
  // imageData is from a 9x8 canvas
  const bits = new Uint8Array(8);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const li = (row * 9 + col) * 4;
      const ri = (row * 9 + col + 1) * 4;
      const l = 0.299 * imageData[li] + 0.587 * imageData[li + 1] + 0.114 * imageData[li + 2];
      const r = 0.299 * imageData[ri] + 0.587 * imageData[ri + 1] + 0.114 * imageData[ri + 2];
      const bit = row * 8 + col;
      if (l > r) bits[bit >> 3] |= (1 << (7 - (bit & 7)));
    }
  }
  return bits;
}

// Histogram: 48-bin RGB (16 per channel) + 12-bin hue = 60 bins total
function computeHistogram(imageData, count, bgThreshold) {
  const hist = new Float64Array(60);
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
    // Hue bin (12 bins = 30° each)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d > 10) {
      let h;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      hist[48 + Math.min(Math.floor(h * 2), 11)]++;
    }
  }
  if (total > 0) for (let i = 0; i < 60; i++) hist[i] /= total;
  return hist;
}

// Color moments: mean RGB of foreground pixels
function computeColorMoments(imageData, count, bgThreshold) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < count; i++) {
    const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2];
    const a = imageData[i * 4 + 3];
    if (a < 128) continue;
    if (bgThreshold && (0.299 * r + 0.587 * g + 0.114 * b) < bgThreshold) continue;
    sr += r; sg += g; sb += b; n++;
  }
  return n ? [sr / n / 255, sg / n / 255, sb / n / 255] : [0, 0, 0];
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
  // Distance between two [r,g,b] mean vectors, normalized to [0,1]
  let d = 0;
  for (let i = 0; i < 3; i++) d += (a[i] - b[i]) ** 2;
  return 1 - Math.sqrt(d / 3);
}

function compare(extracted, packTex) {
  const dhashA = extracted.dhash;
  const dhashB = base64ToBytes(packTex.dhash);
  const hammingSim = 1 - hammingDistance(dhashA, dhashB) / 64;
  const histSim = cosineSimilarity(extracted.hist, packTex.hist);
  const momentSim = colorMomentSim(extracted.moments, packTex.moments);
  // Weights: dHash 40% (structure, robust to compression), histogram 35% (color+hue), moments 25%
  return 0.40 * hammingSim + 0.35 * histSim + 0.25 * momentSim;
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
  return { dhash, hist, moments };
}

// --- Hotbar extraction ---
// Try multiple GUI scales (2x, 3x, 4x) and pick the one with most confident slots
function extractHotbarSlots(ctx, imgW, imgH) {
  const baseScale = imgH / 1080;
  const GUI_SCALES = [3, 2, 4];
  let bestSlots = [], bestConfidence = 0;

  for (const guiScale of GUI_SCALES) {
    const scale = baseScale * guiScale / 3;
    const widgetW = 182 * 3 * scale;
    const itemOffX = 3 * 3 * scale;
    const itemW = 16 * 3 * scale;
    const slotStep = 20 * 3 * scale;
    const startX = (imgW - widgetW) / 2 + itemOffX;
    const itemY = imgH - (22 * 3 - 3 * 3) * scale;

    const slots = [];
    let totalBright = 0;
    for (let i = 0; i < 9; i++) {
      const x = Math.round(startX + i * slotStep);
      const y = Math.round(itemY);
      const sz = Math.round(itemW);
      if (x < 0 || y < 0 || x + sz > imgW || y + sz > imgH) continue;
      const region = extractRegion(ctx, x, y, sz, sz, 16, 16);
      let bright = 0;
      for (let p = 0; p < 256; p++) {
        const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
        if (lum > 60) bright++;
      }
      if (bright > 12) {
        slots.push({ index: i, features: computeFeatures(region, 16, 16, true), x, y, sz });
        totalBright += bright;
      }
    }
    const confidence = slots.length * 1000 + totalBright;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestSlots = slots;
    }
  }
  return bestSlots;
}

// --- Matching ---
function matchPacks(slots) {
  if (!slots.length) return [];
  const ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot', 'iron_sword'];
  // Distinctive items get higher weight
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

    if (totalWeight === 0) continue;
    const finalScore = totalScore / totalWeight;
    if (finalScore > 0.58) {
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

function renderResults(results) {
  const container = document.getElementById('sbi-results');
  if (results.length === 0) {
    container.innerHTML = '<p class="sbi-no-results">No matching packs found</p>';
    container.hidden = false;
    return;
  }
  container.innerHTML = results.map(r => {
    const pct = Math.min(100, Math.round(r.score * 100));
    const coverUrl = '/thumbnails/' + encodeURIComponent(r.name) + '/cover.png';
    const packPng = '/thumbnails/' + encodeURIComponent(r.name) + '/pack.png';
    return '<a class="sbi-result-card" href="/p/' + encodeURIComponent(r.name) + '/">' +
      '<div class="sbi-score">' + pct + '%</div>' +
      '<div class="sbi-result-info">' +
        '<div class="sbi-result-name">' + r.name.replace(/_/g, ' ') + '</div>' +
      '</div>' +
      '<img class="sbi-result-cover" src="' + coverUrl + '" onerror="this.src=\'' + packPng + '\'">' +
    '</a>';
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
      // v3: 60-bin histogram + hue, multi-scale GUI, weighted item types
      const resp = await fetch('/data/sbi-fingerprints.json?v=3');
      if (!resp.ok) throw new Error('Failed to load fingerprints: ' + resp.status);
      fingerprints = await resp.json();
    }

    const slots = extractHotbarSlots(ctx, img.width, img.height);
    drawDetectionOverlay(ctx, slots);

    const results = matchPacks(slots);
    progress.hidden = true;
    renderResults(results);

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
}

init();
})();
