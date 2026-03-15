const sharp = require('sharp');
const path = require('path');

const W = 1280, H = 720;
const unit = 2;
const hotbarX = (W - 182 * unit) / 2;
const hotbarY = H - 22 * unit;

let rects = '';

// 9 hotbar slots (black borders)
for (let i = 0; i < 9; i++) {
  const x = hotbarX + (1 + i * 20) * unit;
  const y = hotbarY + unit;
  const sz = 20 * unit;
  rects += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="none" stroke="#000" stroke-width="2.5"/>`;
}

const heartY = hotbarY - 17 * unit;
const iconSz = 9 * unit;

// Hearts (red)
for (let i = 0; i < 10; i++) {
  rects += `<rect x="${hotbarX + i * 8 * unit}" y="${heartY}" width="${iconSz}" height="${iconSz}" fill="none" stroke="#fca5a5" stroke-width="2"/>`;
}

// Hunger (yellow)
for (let i = 0; i < 10; i++) {
  rects += `<rect x="${hotbarX + (182 - 9 - i * 8) * unit}" y="${heartY}" width="${iconSz}" height="${iconSz}" fill="none" stroke="#fbbf24" stroke-width="2"/>`;
}

// Armor (gray)
const armorY = heartY - 10 * unit;
for (let i = 0; i < 10; i++) {
  rects += `<rect x="${hotbarX + i * 8 * unit}" y="${armorY}" width="${iconSz}" height="${iconSz}" fill="none" stroke="#9ca3af" stroke-width="2"/>`;
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
