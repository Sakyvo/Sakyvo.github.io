const sharp = require('sharp');
const path = require('path');

const W = 182;
const H = 48;
const HOTBAR_SLOTS = 9;
const pixels = Buffer.alloc(W * H * 4, 0);

const COLORS = {
  armor: [156, 163, 175, 255],
  health: [255, 77, 79, 255],
  hunger: [255, 159, 28, 255],
  hotbar: [0, 0, 0, 255],
};

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const offset = (y * W + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function drawBox(x, y, size, border, color, hideRightBorder) {
  for (let yy = y; yy < y + border; yy++) {
    for (let xx = x; xx < x + size; xx++) setPixel(xx, yy, color);
  }
  for (let yy = y + size - border; yy < y + size; yy++) {
    for (let xx = x; xx < x + size; xx++) setPixel(xx, yy, color);
  }
  for (let xx = x; xx < x + border; xx++) {
    for (let yy = y + border; yy < y + size - border; yy++) setPixel(xx, yy, color);
  }
  if (!hideRightBorder) {
    for (let xx = x + size - border; xx < x + size; xx++) {
      for (let yy = y + border; yy < y + size - border; yy++) setPixel(xx, yy, color);
    }
  }
}

function drawHudRow(x, y, color) {
  for (let i = 0; i < 10; i++) {
    drawBox(x + i * 8, y, 9, 1, color, i < 9);
  }
}

function drawHotbarRow() {
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    drawBox(1 + i * 20, 28, 20, 2, COLORS.hotbar, i < HOTBAR_SLOTS - 1);
  }
}

async function writePng(name) {
  const outPath = path.join(__dirname, '..', 'sbi', name);
  await sharp(pixels, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
  console.log(`Created ${outPath} (${W}x${H})`);
}

drawHudRow(0, 0, COLORS.armor);
drawHudRow(0, 10, COLORS.health);
drawHudRow(101, 10, COLORS.hunger);
drawHotbarRow();

Promise.all([
  writePng('cropbox_preview.png'),
  writePng('cropbox.png'),
]).catch(error => {
  console.error(error);
  process.exit(1);
});
