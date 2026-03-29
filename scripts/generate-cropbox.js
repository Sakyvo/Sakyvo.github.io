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
const slotStep = Math.max(1, Math.round(8 * unit));
const hudSize = Math.max(1, Math.round(9 * unit));

let rects = '';

function addBox(x, y, w, h, border, color) {
  rects += `<rect x="${x}" y="${y}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + h - border}" width="${w}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
  rects += `<rect x="${x + w - border}" y="${y + border}" width="${border}" height="${h - border * 2}" fill="${color}"/>`;
}

const slotX = hotbarX + inset;
const slotY = hotbarY + inset;
const slotW = Math.round(181 * unit);
const slotH = Math.round(20 * unit);

rects += `<rect x="${slotX}" y="${slotY}" width="${slotW}" height="${border}" fill="#000"/>`;
rects += `<rect x="${slotX}" y="${slotY + slotH - border}" width="${slotW}" height="${border}" fill="#000"/>`;
for (let i = 0; i <= 9; i++) {
  rects += `<rect x="${hotbarX + Math.round((1 + i * 20) * unit)}" y="${slotY}" width="${border}" height="${slotH}" fill="#000"/>`;
}

const heartY = hotbarY - Math.round(17 * unit);

// Hearts (red)
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + i * slotStep, heartY, hudSize, hudSize, border, '#ef4444');
}

// Hunger (yellow)
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + Math.round((182 - 9 - i * 8) * unit), heartY, hudSize, hudSize, border, '#fbbf24');
}

// Armor (gray)
const armorY = heartY - Math.round(10 * unit);
for (let i = 0; i < 10; i++) {
  addBox(hotbarX + i * slotStep, armorY, hudSize, hudSize, border, '#9ca3af');
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
