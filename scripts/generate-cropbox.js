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

function addGridRow(x, y, count, side, color) {
  const step = Math.max(1, side - border);
  const totalWidth = step * Math.max(0, count - 1) + side;
  rects += `<rect x="${x}" y="${y}" width="${totalWidth}" height="${border}" fill="${color}"/>`;
  rects += `<rect x="${x}" y="${y + side - border}" width="${totalWidth}" height="${border}" fill="${color}"/>`;
  for (let i = 0; i <= count; i++) {
    rects += `<rect x="${x + i * step}" y="${y}" width="${border}" height="${side}" fill="${color}"/>`;
  }
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
const hudSpan = Math.max(1, Math.round(81 * unit));
const hudSize = Math.max(1, Math.floor((hudSpan + 9) / 10));

// Hearts (red)
addGridRow(hotbarX, heartY, 10, hudSize, '#ef4444');

// Hunger (yellow)
addGridRow(hotbarX + Math.round(101 * unit), heartY, 10, hudSize, '#fbbf24');

// Armor (gray)
const armorY = heartY - Math.round(10 * unit);
addGridRow(hotbarX, armorY, 10, hudSize, '#9ca3af');

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
