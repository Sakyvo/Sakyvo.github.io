const sharp = require('sharp');
const path = require('path');

const W = 182;
const H = 48;
const pixels = Buffer.alloc(W * H * 4, 0);

const COLORS = {
  armor:  [156, 163, 175, 255],
  health: [255, 77,  79,  255],
  hunger: [255, 159, 28,  255],
  hotbar: [0,   0,   0,   255],
};

function setPixel(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  pixels[o] = c[0]; pixels[o + 1] = c[1]; pixels[o + 2] = c[2]; pixels[o + 3] = c[3];
}

function drawRect1px(x, y, w, h, c) {
  for (let i = 0; i < w; i++) { setPixel(x + i, y, c); setPixel(x + i, y + h - 1, c); }
  for (let i = 1; i < h - 1; i++) { setPixel(x, y + i, c); setPixel(x + w - 1, y + i, c); }
}

function drawVLine(x, y1, y2, c) {
  for (let y = y1; y <= y2; y++) setPixel(x, y, c);
}

function drawHudRow(sx, sy, color) {
  for (let i = 0; i < 10; i++) drawRect1px(sx + i * 8, sy, 9, 9, color);
}

function drawHotbar(color) {
  drawRect1px(1, 28, 180, 20, color);
  for (let i = 1; i < 9; i++) drawVLine(1 + i * 20, 29, 46, color);
}

drawHudRow(0, 0, COLORS.armor);
drawHudRow(0, 10, COLORS.health);
drawHudRow(101, 10, COLORS.hunger);
drawHotbar(COLORS.hotbar);

async function writePng(name) {
  const outPath = path.join(__dirname, '..', 'sbi', name);
  await sharp(pixels, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
  console.log(`Created ${outPath} (${W}x${H})`);
}

Promise.all([
  writePng('cropbox_preview.png'),
  writePng('cropbox.png'),
]).catch(e => { console.error(e); process.exit(1); });
