const sharp = require('sharp');
const path = require('path');

const SCALE = 4;
const W = 182 * SCALE;
const H = 22 * SCALE;

const rects = Array.from({ length: 9 }, (_, i) => {
  const x = (1 + i * 20) * SCALE;
  const y = SCALE;
  const sz = 20 * SCALE;
  return `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="#1e1e1e" stroke="#000" stroke-width="3"/>`;
}).join('\n');

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#3a3a3a"/>
${rects}
</svg>`;

const outPath = path.join(__dirname, '..', 'sbi', 'cropbox_large.png');
sharp(Buffer.from(svg)).png().toFile(outPath)
  .then(() => console.log(`Created ${outPath} (${W}x${H})`))
  .catch(e => { console.error(e); process.exit(1); });
