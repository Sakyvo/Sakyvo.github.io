const sharp = require('sharp');
const path = require('path');

const W = 1280, H = 720;
const unit = 2;
const border = 1;
const widgetW = Math.round(182 * unit);
const widgetH = Math.round(22 * unit);
const hotbarX = Math.round((W - widgetW) / 2);
const hotbarY = H - widgetH;
const inset = Math.max(1, Math.round(unit));

let rects = '';

function addBox(x, y, w, h, border, color) {
  rects += `<rect x="${x}" y="${y}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + h - border}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
  rects += `<rect x="${x + w - border}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
}

function addGridRow(x, y, count, step, side, color) {
  const cellStep = Math.max(1, Math.round(step));
  const cellSide = Math.max(1, Math.round(side));
  for (let i = 0; i < count; i++) {
    addBox(x + i * cellStep, y, cellSide, cellSide, border, color);
  }
}

const slotX = hotbarX + inset;
const slotY = hotbarY + inset;
const slotSide = Math.max(1, Math.round(20 * unit));
addGridRow(slotX, slotY, 9, slotSide, slotSide, '#000');

const heartY = hotbarY - Math.round(17 * unit);
const hudStep = Math.max(1, Math.round(8 * unit));
const hudSide = Math.max(1, Math.round(9 * unit));

// Hearts (red)
addGridRow(hotbarX, heartY, 10, hudStep, hudSide, '#ef4444');

// Hunger (yellow)
addGridRow(hotbarX + Math.round(101 * unit), heartY, 10, hudStep, hudSide, '#fbbf24');

// Armor (gray)
const armorY = heartY - Math.round(10 * unit);
addGridRow(hotbarX, armorY, 10, hudStep, hudSide, '#9ca3af');

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
