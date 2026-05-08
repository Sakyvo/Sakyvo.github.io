const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ITEM_COVER_TEXTURES = [
  'diamond_sword.png',
  'ender_pearl.png',
  'splash_potion_of_healing.png',
  'steak.png',
  'iron_sword.png',
  'fishing_rod_uncast.png',
  'apple_golden.png',
  'golden_carrot.png',
];

const PREVIEW_TEXTURE_FILES = new Set([
  ...ITEM_COVER_TEXTURES,
  'potion_overlay.png',
  'potion_bottle_splash.png',
  'grass_side.png',
  'stone.png',
  'cobblestone.png',
  'wool_colored_white.png',
  'dirt.png',
  'planks_oak.png',
  'log_oak.png',
  'diamond_ore.png',
  'particle_magicCrit.png',
  'particle_crit.png',
  'buff_speed.png',
  'buff_fire_resistance.png',
]);

const LOW_ALPHA_MAX = 16;
const NEUTRAL_DELTA_MAX = 12;
const DARK_RGB_MAX = 96;

function shouldSanitizePreviewTexture(filename) {
  return PREVIEW_TEXTURE_FILES.has(path.basename(filename));
}

function isLowAlphaNeutralDark(r, g, b, a) {
  if (a <= 0 || a > LOW_ALPHA_MAX) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= DARK_RGB_MAX && max - min <= NEUTRAL_DELTA_MAX;
}

async function ensurePngBuffer(input) {
  return sharp(input).png().toBuffer();
}

async function getFirstFrameBuffer(input) {
  const buffer = Buffer.isBuffer(input) ? input : await fs.promises.readFile(input);
  const meta = await sharp(buffer).metadata();
  if (meta.height > meta.width && meta.height % meta.width === 0) {
    return sharp(buffer)
      .extract({ left: 0, top: 0, width: meta.width, height: meta.width })
      .png()
      .toBuffer();
  }
  return ensurePngBuffer(buffer);
}

async function sanitizePreviewPngBuffer(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let changed = false;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) {
      if (r || g || b) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        changed = true;
      }
      continue;
    }

    if (!isLowAlphaNeutralDark(r, g, b, a)) continue;
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
    changed = true;
  }

  return {
    changed,
    buffer: await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).png().toBuffer(),
  };
}

async function sanitizeFirstFrameBuffer(input) {
  const firstFrame = await getFirstFrameBuffer(input);
  const { buffer } = await sanitizePreviewPngBuffer(firstFrame);
  return buffer;
}

async function sanitizeTextureFileInPlace(filePath) {
  const original = await fs.promises.readFile(filePath);
  const { buffer, changed } = await sanitizePreviewPngBuffer(original);
  if (changed) await fs.promises.writeFile(filePath, buffer);
  return changed;
}

async function getResized64Frames(inputPath) {
  if (!fs.existsSync(inputPath)) return null;
  const buffer = await fs.promises.readFile(inputPath);
  const meta = await sharp(buffer).metadata();
  const animated = meta.height > meta.width && meta.height % meta.width === 0;
  const frameCount = animated ? meta.height / meta.width : 1;
  const out = [];
  for (let f = 0; f < frameCount; f++) {
    const slice = animated
      ? await sharp(buffer)
          .extract({ left: 0, top: f * meta.width, width: meta.width, height: meta.width })
          .png()
          .toBuffer()
      : await ensurePngBuffer(buffer);
    const { buffer: cleaned } = await sanitizePreviewPngBuffer(slice);
    const resized = await sharp(cleaned).resize(64, 64, { kernel: 'nearest' }).png().toBuffer();
    out.push(resized);
  }
  return out;
}

async function generateCoverFromOutputDir(outputDir) {
  const perTexture = [];
  let maxFrames = 1;
  for (let i = 0; i < ITEM_COVER_TEXTURES.length; i++) {
    const inputPath = path.join(outputDir, ITEM_COVER_TEXTURES[i]);
    const frames = await getResized64Frames(inputPath);
    perTexture.push(frames);
    if (frames && frames.length > maxFrames) maxFrames = frames.length;
  }

  if (!perTexture.some(t => t && t.length)) return false;

  const composites = [];
  for (let f = 0; f < maxFrames; f++) {
    for (let i = 0; i < ITEM_COVER_TEXTURES.length; i++) {
      const tf = perTexture[i];
      if (!tf || !tf.length) continue;
      composites.push({
        input: tf[f % tf.length],
        left: (i % 4) * 64,
        top: Math.floor(i / 4) * 64 + f * 128,
      });
    }
  }

  const coverBuffer = await sharp({
    create: {
      width: 256,
      height: 128 * maxFrames,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const sanitizedCover = await sanitizePreviewPngBuffer(coverBuffer);
  await fs.promises.writeFile(path.join(outputDir, 'cover.png'), sanitizedCover.buffer);

  return true;
}

module.exports = {
  ITEM_COVER_TEXTURES,
  PREVIEW_TEXTURE_FILES,
  shouldSanitizePreviewTexture,
  getFirstFrameBuffer,
  sanitizePreviewPngBuffer,
  sanitizeFirstFrameBuffer,
  sanitizeTextureFileInPlace,
  generateCoverFromOutputDir,
};
