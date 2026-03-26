const sharp = require('sharp');
const path = require('path');

const W = 1280, H = 720;
const unit = 2;
const hotbarX = (W - 182 * unit) / 2;
const hotbarY = H - 22 * unit;

let rects = '';

function addBox(x, y, w, h, border, color) {
  rects += `<rect x="${x}" y="${y}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + h - border}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
  rects += `<rect x="${x + w - border}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
}

const slotX = hotbarX + unit;
const slotY = hotbarY + unit;
const slotW = 181 * unit;
const slotH = 20 * unit;

rects += `<rect x="${slotX}" y="${slotY}" width="${slotW}" height="${unit}" fill="#000"/>`;
rects += `<rect x="${slotX}" y="${slotY + slotH - unit}" width="${slotW}" height="${unit}" fill="#000"/>`;
for (let i = 0; i <= 9; i++) {
  rects += `<rect x="${hotbarX + (1 + i * 20) * unit}" y="${slotY}" width="${unit}" height="${slotH}" fill="#000"/>`;
}

const heartY = hotbarY - 17 * unit;

// Hearts (red)
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + i * 8 * unit, heartY, 9 * unit, 9 * unit, 1, '#fca5a5');
}

// Hunger (yellow)
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + (182 - 9 - i * 8) * unit, heartY, 9 * unit, 9 * unit, 1, '#fbbf24');
}

// Armor (gray)
const armorY = heartY - 10 * unit;
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + i * 8 * unit, armorY, 9 * unit, 9 * unit, 1, '#9ca3af');
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
