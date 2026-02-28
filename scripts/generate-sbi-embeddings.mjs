import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');
const DATA_DIR = path.join(__dirname, '..', 'data');
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const EMBED_DIM = 512;
const COMPOSITE_SIZE = 224;

env.allowLocalModels = false;
env.remoteHost = 'https://hf-mirror.com';

// Build 224x224 composite: top=widget(224x112), bottom-left=sword(112x112), bottom-right=pearl(112x112)
async function buildComposite(packDir) {
  const widgetsPath = path.join(packDir, 'widgets.png');
  const swordPath = path.join(packDir, 'diamond_sword.png');
  const pearlPath = path.join(packDir, 'ender_pearl.png');

  const bg = { r: 20, g: 20, b: 20, alpha: 255 };
  let base = sharp({ create: { width: COMPOSITE_SIZE, height: COMPOSITE_SIZE, channels: 4, background: bg } });

  const composites = [];

  if (fs.existsSync(widgetsPath)) {
    try {
      const meta = await sharp(widgetsPath).metadata();
      const scale = meta.width / 256;
      // Extract hotbar strip (182x22 native)
      const cx = 0, cy = 0, cw = Math.round(182 * scale), ch = Math.round(22 * scale);
      const widgetBuf = await sharp(widgetsPath)
        .extract({ left: cx, top: cy, width: cw, height: ch })
        .resize(COMPOSITE_SIZE, Math.round(COMPOSITE_SIZE / 2), { fit: 'fill', kernel: 'nearest' })
        .ensureAlpha().toBuffer();
      composites.push({ input: widgetBuf, top: 0, left: 0 });
    } catch {}
  }

  if (fs.existsSync(swordPath)) {
    try {
      const buf = await sharp(swordPath)
        .resize(Math.round(COMPOSITE_SIZE / 2), Math.round(COMPOSITE_SIZE / 2), { fit: 'fill', kernel: 'nearest' })
        .ensureAlpha().toBuffer();
      composites.push({ input: buf, top: Math.round(COMPOSITE_SIZE / 2), left: 0 });
    } catch {}
  }

  if (fs.existsSync(pearlPath)) {
    try {
      const buf = await sharp(pearlPath)
        .resize(Math.round(COMPOSITE_SIZE / 2), Math.round(COMPOSITE_SIZE / 2), { fit: 'fill', kernel: 'nearest' })
        .ensureAlpha().toBuffer();
      composites.push({ input: buf, top: Math.round(COMPOSITE_SIZE / 2), left: Math.round(COMPOSITE_SIZE / 2) });
    } catch {}
  }

  if (composites.length === 0) return null;

  const pngBuf = await base.composite(composites).png().toBuffer();
  return pngBuf;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function main() {
  console.log('Loading CLIP model...');
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' });
  console.log('Model loaded.');

  const dirs = fs.readdirSync(THUMB_DIR).filter(d =>
    fs.statSync(path.join(THUMB_DIR, d)).isDirectory()
  );
  console.log(`Processing ${dirs.length} packs...`);

  const names = [];
  const vectors = []; // each: Float32Array(512)
  let done = 0, skipped = 0;

  for (const dir of dirs) {
    const packDir = path.join(THUMB_DIR, dir);
    try {
      const pngBuf = await buildComposite(packDir);
      if (!pngBuf) { skipped++; continue; }

      // Build RawImage from raw RGBA pixels (Node.js safe, no URL.createObjectURL)
      const rawBuf = await sharp(pngBuf).resize(COMPOSITE_SIZE, COMPOSITE_SIZE, { fit: 'fill' }).raw().ensureAlpha().toBuffer();
      const image = new RawImage(new Uint8ClampedArray(rawBuf), COMPOSITE_SIZE, COMPOSITE_SIZE, 4);

      const inputs = await processor(image);
      const { image_embeds } = await model(inputs);
      const vec = new Float32Array(image_embeds.data);

      // L2-normalize
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] ** 2;
      norm = Math.sqrt(norm);
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;

      names.push(dir);
      vectors.push(vec);
      done++;
      if (done % 20 === 0) console.log(`  ${done}/${dirs.length}`);
    } catch (e) {
      console.warn(`  skip ${dir}: ${e.message}`);
      skipped++;
    }
  }

  // Write binary: N × 512 × 4 bytes
  const bin = Buffer.alloc(vectors.length * EMBED_DIM * 4);
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < EMBED_DIM; j++) {
      bin.writeFloatLE(vectors[i][j], (i * EMBED_DIM + j) * 4);
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'sbi-clip-embeddings.bin'), bin);
  fs.writeFileSync(path.join(DATA_DIR, 'sbi-clip-index.json'), JSON.stringify({ version: 1, dim: EMBED_DIM, names }));
  console.log(`Done. ${done} packs embedded, ${skipped} skipped.`);
  console.log(`Binary: ${(bin.length / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
