// CLIP Web Worker for SBI — ES module worker
// transformers.min.js is a webpack ESM bundle; WASM files co-located in /assets/js/

import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '/assets/js/transformers.min.js';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const EMBED_DIM = 512;
const MODEL_HOSTS = ['https://hf-mirror.com/', 'https://huggingface.co/'];

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remotePathTemplate = '{model}/resolve/{revision}/';
env.backends.onnx.wasm.wasmPaths = '/assets/js/';

let processor = null, model = null;
let embedNames = null, embedMatrix = null;

function post(type, payload) { self.postMessage({ type, ...payload }); }

async function loadModel() {
  const errors = [];
  for (const host of MODEL_HOSTS) {
    env.remoteHost = host;
    try {
      post('status', { msg: `Downloading AI model from ${new URL(host).host} (~86MB, cached after first use)...` });
      processor = await AutoProcessor.from_pretrained(MODEL_ID);
      post('status', { msg: `Loading vision model from ${new URL(host).host}...` });
      model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' });
      return;
    } catch (e) {
      errors.push(`${new URL(host).host}: ${e.message || String(e)}`);
      processor = null;
      model = null;
      post('status', { msg: `Model source ${new URL(host).host} unavailable, trying fallback...` });
    }
  }
  throw new Error(`Failed to fetch AI model from all sources. ${errors.join(' | ')}`);
}

async function loadEmbeddings() {
  const [idxResp, binResp] = await Promise.all([
    fetch('/data/sbi-clip-index.json'),
    fetch('/data/sbi-clip-embeddings.bin')
  ]);
  if (!idxResp.ok) throw new Error(`Failed to load /data/sbi-clip-index.json: ${idxResp.status}`);
  if (!binResp.ok) throw new Error(`Failed to load /data/sbi-clip-embeddings.bin: ${binResp.status}`);
  const idx = await idxResp.json();
  if (!Array.isArray(idx.names)) throw new Error('Invalid /data/sbi-clip-index.json format');
  embedNames = idx.names;
  embedMatrix = new Float32Array(await binResp.arrayBuffer());
  if (embedMatrix.length !== embedNames.length * EMBED_DIM) {
    throw new Error(`Embedding size mismatch: expected ${embedNames.length * EMBED_DIM}, got ${embedMatrix.length}`);
  }
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
      post('error', { msg: e.message || String(e) });
    }
    return;
  }
  if (data.type === 'search') {
    try {
      post('status', { msg: 'Running AI analysis...' });
      const queryVec = await embedPixels(data.pixels, data.width, data.height);
      const scores = embedNames.map((name, i) => ({
        name,
        clipScore: cosineSim(queryVec, embedMatrix.subarray(i * EMBED_DIM, i * EMBED_DIM + EMBED_DIM))
      }));
      post('results', { scores });
    } catch (e) {
      post('error', { msg: e.message || String(e) });
    }
  }
};
