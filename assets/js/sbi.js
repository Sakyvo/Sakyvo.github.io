(function() {
'use strict';

let fingerprints = null;

// --- Feature computation ---
function computeAHash(imageData, w, h) {
  const gray = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * imageData[i * 4] + 0.587 * imageData[i * 4 + 1] + 0.114 * imageData[i * 4 + 2];
  }
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const avg = sum / gray.length;
  const bits = new Uint8Array(Math.ceil(gray.length / 8));
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] >= avg) bits[i >> 3] |= (1 << (7 - (i & 7)));
  }
  return bits;
}

function computeHistogram(imageData, count) {
  const hist = new Float64Array(24);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (imageData[i * 4 + 3] < 128) continue;
    total++;
    hist[Math.min(imageData[i * 4] >> 5, 7)]++;
    hist[8 + Math.min(imageData[i * 4 + 1] >> 5, 7)]++;
    hist[16 + Math.min(imageData[i * 4 + 2] >> 5, 7)]++;
  }
  if (total > 0) for (let i = 0; i < 24; i++) hist[i] /= total;
  return hist;
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

function compare(extracted, packTex) {
  const ahashA = extracted.ahash;
  const ahashB = base64ToBytes(packTex.ahash);
  const hammingSim = 1 - hammingDistance(ahashA, ahashB) / 64;
  const histSim = cosineSimilarity(extracted.hist, packTex.hist);
  return 0.4 * hammingSim + 0.6 * histSim;
}

function extractRegion(ctx, x, y, w, h, targetW, targetH) {
  const tmp = document.createElement('canvas');
  tmp.width = targetW; tmp.height = targetH;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, targetW, targetH);
  return tctx.getImageData(0, 0, targetW, targetH);
}

function computeFeatures(imageData, w, h) {
  // Resize to 8x8 for aHash
  const tmp = document.createElement('canvas');
  tmp.width = 8; tmp.height = 8;
  const tctx = tmp.getContext('2d');
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').putImageData(imageData, 0, 0);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(src, 0, 0, 8, 8);
  const hashData = tctx.getImageData(0, 0, 8, 8);
  const ahash = computeAHash(hashData.data, 8, 8);
  const hist = computeHistogram(imageData.data, w * h);
  return { ahash, hist };
}

// --- Hotbar extraction (GUI Scale 3x) ---
function extractHotbarSlots(ctx, imgW, imgH) {
  const scale = imgH / 1080;
  const s3 = 3 * scale;
  const widgetW = 182 * s3;
  const slotStart = (imgW - widgetW) / 2 + 9 * scale;
  const slotSize = 48 * scale;
  const slotStep = 60 * scale;
  const slotY = imgH - 57 * scale;
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const x = Math.round(slotStart + i * slotStep);
    const y = Math.round(slotY);
    const sz = Math.round(slotSize);
    const region = extractRegion(ctx, x, y, sz, sz, 16, 16);
    // Check if slot is empty (mostly transparent or uniform)
    let nonEmpty = 0;
    for (let p = 0; p < 256; p++) {
      if (region.data[p * 4 + 3] > 128) nonEmpty++;
    }
    if (nonEmpty > 20) {
      slots.push({ index: i, features: computeFeatures(region, 16, 16), x, y, sz });
    }
  }
  return slots;
}

function extractCrosshair(ctx, imgW, imgH) {
  const scale = imgH / 1080;
  const chSize = Math.round(15 * 3 * scale);
  const cx = Math.round(imgW / 2 - chSize / 2);
  const cy = Math.round(imgH / 2 - chSize / 2);
  const region = extractRegion(ctx, cx, cy, chSize, chSize, 15, 15);
  return { features: computeFeatures(region, 15, 15), x: cx, y: cy, sz: chSize };
}

function matchPacks(crosshair, slots) {
  const ITEM_TYPES = ['diamond_sword', 'ender_pearl', 'splash_potion', 'steak', 'golden_carrot'];
  const results = [];
  for (const [packName, packData] of Object.entries(fingerprints.packs)) {
    let score = 0, matched = 0;
    if (crosshair && packData.crosshair) {
      const sim = compare(crosshair.features, packData.crosshair);
      score += sim * 3.0;
      matched++;
    }
    for (const slot of slots) {
      let bestSim = 0;
      for (const type of ITEM_TYPES) {
        if (!packData[type]) continue;
        const sim = compare(slot.features, packData[type]);
        if (sim > bestSim) bestSim = sim;
      }
      if (bestSim > 0.6) { score += bestSim; matched++; }
    }
    const finalScore = matched > 0 ? score / matched : 0;
    if (finalScore > 0.5) {
      results.push({ name: packName, score: finalScore });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

function drawDetectionOverlay(ctx, crosshair, slots, imgW, imgH) {
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  if (crosshair) {
    ctx.strokeRect(crosshair.x, crosshair.y, crosshair.sz, crosshair.sz);
    ctx.fillStyle = 'rgba(0,255,0,0.1)';
    ctx.fillRect(crosshair.x, crosshair.y, crosshair.sz, crosshair.sz);
  }
  ctx.strokeStyle = '#ff0';
  for (const slot of slots) {
    ctx.strokeRect(slot.x, slot.y, slot.sz, slot.sz);
  }
}

function renderResults(results) {
  const container = document.getElementById('sbi-results');
  if (results.length === 0) {
    container.innerHTML = '<p class="sbi-no-results">未找到匹配的材质包</p>';
    container.hidden = false;
    return;
  }
  container.innerHTML = results.map(r => {
    const pct = Math.round(r.score * 100);
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
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    imageDataUrl,
    results: results.map(r => ({
      name: r.name, score: r.score,
      cover: '/thumbnails/' + r.name + '/cover.png',
      packPng: '/thumbnails/' + r.name + '/pack.png'
    }))
  };
  history.unshift(entry);
  if (history.length > 5) history = history.slice(0, 5);
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
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  if (!fingerprints) {
    const resp = await fetch('/data/sbi-fingerprints.json');
    fingerprints = await resp.json();
  }

  const crosshair = extractCrosshair(ctx, img.width, img.height);
  const slots = extractHotbarSlots(ctx, img.width, img.height);
  drawDetectionOverlay(ctx, crosshair, slots, img.width, img.height);

  const results = matchPacks(crosshair, slots);
  progress.hidden = true;
  renderResults(results);

  // Save to history
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320; thumbCanvas.height = Math.round(320 * img.height / img.width);
  thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
  saveHistory(thumbCanvas.toDataURL('image/jpeg', 0.6), results);

  URL.revokeObjectURL(url);
}

// --- UI bindings ---
function init() {
  const uploadEl = document.getElementById('sbi-upload');
  const fileInput = document.getElementById('sbi-file');

  uploadEl.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) processImage(e.target.files[0]);
  });

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
      if (item.type.startsWith('image/')) {
        processImage(item.getAsFile());
        break;
      }
    }
  });
}

init();

})();
