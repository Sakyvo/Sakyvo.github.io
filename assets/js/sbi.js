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

// Histogram: skip dark pixels (background) and transparent pixels
function computeHistogram(imageData, count, bgThreshold) {
  const hist = new Float64Array(24);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2];
    const a = imageData[i * 4 + 3];
    if (a < 128) continue;
    // Skip dark background pixels from hotbar when threshold provided
    if (bgThreshold && (0.299 * r + 0.587 * g + 0.114 * b) < bgThreshold) continue;
    total++;
    hist[Math.min(r >> 5, 7)]++;
    hist[8 + Math.min(g >> 5, 7)]++;
    hist[16 + Math.min(b >> 5, 7)]++;
  }
  if (total > 0) for (let i = 0; i < 24; i++) hist[i] /= total;
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
  // Weights: dHash 30% (structure), histogram 40% (color dist), moments 30% (dominant color)
  return 0.30 * hammingSim + 0.40 * histSim + 0.30 * momentSim;
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
  const BG_THRESHOLD = isScreenshot ? 75 : 0;
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
// MC GUI Scale 3x @ any resolution, coordinates scaled by height/1080
function extractHotbarSlots(ctx, imgW, imgH) {
  const scale = imgH / 1080;
  // Widget is 182 MC pixels wide; items start at x+3 with 20px step, 16px item size
  const widgetW = 182 * 3 * scale;
  const itemOffX = 3 * 3 * scale;   // 3 MC-px border + 1 MC-px padding
  const itemW = 16 * 3 * scale;     // item render size
  const slotStep = 20 * 3 * scale;  // slot pitch
  const startX = (imgW - widgetW) / 2 + itemOffX;
  const itemY = imgH - (22 * 3 - 3 * 3) * scale; // bottom-anchored

  const slots = [];
  for (let i = 0; i < 9; i++) {
    const x = Math.round(startX + i * slotStep);
    const y = Math.round(itemY);
    const sz = Math.round(itemW);
    const region = extractRegion(ctx, x, y, sz, sz, 16, 16);
    // Detect non-empty: count bright (foreground) pixels
    let bright = 0;
    for (let p = 0; p < 256; p++) {
      const lum = 0.299 * region.data[p * 4] + 0.587 * region.data[p * 4 + 1] + 0.114 * region.data[p * 4 + 2];
      if (lum > 75) bright++;
    }
    if (bright > 15) {
      slots.push({ index: i, features: computeFeatures(region, 16, 16, true), x, y, sz });
    }
  }
  return slots;
}

// --- Matching ---
function matchPacks(slots) {
  if (!slots.length) return [];
  const ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot', 'iron_sword'];
  const results = [];

  for (const [packName, packData] of Object.entries(fingerprints.packs)) {
    let totalScore = 0, totalWeight = 0;

    for (const slot of slots) {
      let bestSim = 0;
      for (const type of ITEM_TYPES) {
        if (!packData[type]) continue;
        const sim = compare(slot.features, packData[type]);
        if (sim > bestSim) bestSim = sim;
      }
      // Only count slot if it confidently matches a known item
      if (bestSim > 0.55) {
        totalScore += bestSim;
        totalWeight += 1;
      }
    }

    if (totalWeight === 0) continue;
    const finalScore = totalScore / totalWeight; // proper weighted average, always [0,1]
    if (finalScore > 0.62) {
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

  if (!fingerprints) {
    const resp = await fetch('/data/sbi-fingerprints.json');
    fingerprints = await resp.json();
  }

  const slots = extractHotbarSlots(ctx, img.width, img.height);
  drawDetectionOverlay(ctx, slots);

  const results = matchPacks(slots);
  progress.hidden = true;
  renderResults(results);

  // Save thumbnail to history
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320; thumbCanvas.height = Math.round(320 * img.height / img.width);
  thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
  saveHistory(thumbCanvas.toDataURL('image/jpeg', 0.6), results);

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
