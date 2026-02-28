// CLIP Web Worker for SBI
// Loads Transformers.js + embeddings, runs inference on demand

import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '/assets/js/transformers.web.min.js';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const EMBED_DIM = 512;

// Use mirror for regions where huggingface.co is blocked
env.remoteHost = 'https://hf-mirror.com';
env.allowLocalModels = false;

let processor = null, model = null;
let embedNames = null, embedMatrix = null; // Float32Array: N × 512

function post(type, payload) { self.postMessage({ type, ...payload }); }

async function loadModel() {
  post('status', { msg: 'Downloading AI model (~86MB, cached after first use)...' });
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' });
  post('status', { msg: 'Loading embeddings...' });
}

async function loadEmbeddings() {
  const idxResp = await fetch('/data/sbi-clip-index.json');
  const idx = await idxResp.json();
  embedNames = idx.names;

  const binResp = await fetch('/data/sbi-clip-embeddings.bin');
  const buf = await binResp.arrayBuffer();
  embedMatrix = new Float32Array(buf);
}

function getPackVec(i) {
  return embedMatrix.subarray(i * EMBED_DIM, i * EMBED_DIM + EMBED_DIM);
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < EMBED_DIM; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function embedPixels(pixels, width, height) {
  const image = new RawImage(new Uint8ClampedArray(pixels), width, height, 4);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  const vec = new Float32Array(image_embeds.data);
  // L2-normalize
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] ** 2;
  norm = Math.sqrt(norm);
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      await Promise.all([loadModel(), loadEmbeddings()]);
      post('ready', {});
    } catch (e) {
      post('error', { msg: e.message });
    }
    return;
  }

  if (data.type === 'search') {
    try {
      post('status', { msg: 'Running AI analysis...' });
      // data.pixels: Uint8Array RGBA, data.width, data.height (hotbar region)
      const queryVec = await embedPixels(data.pixels, data.width, data.height);

      const scores = [];
      for (let i = 0; i < embedNames.length; i++) {
        const sim = cosineSim(queryVec, getPackVec(i));
        scores.push({ name: embedNames[i], clipScore: sim });
      }
      post('results', { scores });
    } catch (e) {
      post('error', { msg: e.message });
    }
  }
};
