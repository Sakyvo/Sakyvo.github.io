const fs = require('fs');
const path = require('path');

const PAGE_SIZE = 50;

function sanitizeName(name) {
  return name.replace(/[§!@#$%^&*()+=\[\]{}|\\:;"'<>,?\/~`]/g, '').replace(/\s+/g, '_').trim();
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const mb = stats.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(stats.size / 1024).toFixed(0)}KB`;
  } catch { return 'Unknown'; }
}

function main() {
  const extractedPath = 'dist/data/extracted.json';
  if (!fs.existsSync(extractedPath)) {
    console.log('No extracted.json found. Run extract-textures.js first.');
    return;
  }

  const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  // Generate pack details
  const packs = extracted.map(e => {
    const zipPath = path.join('resourcepacks', `${e.originalName}.zip`);
    return {
      id: e.originalName,
      name: e.packId,
      author: 'Unknown',
      resolution: '16x',
      tags: ['16x'],
      cover: `/thumbnails/${e.packId}/cover.png`,
      file: `resourcepacks/${e.originalName}.zip`,
      fileSize: getFileSize(zipPath),
      uploadDate: today,
      textures: e.extracted,
      downloads: {
        github: `https://raw.githubusercontent.com/Sakyvo/Sakyvo.github.io/main/resourcepacks/${encodeURIComponent(e.originalName)}.zip`,
        mirror: `https://ghproxy.com/https://raw.githubusercontent.com/Sakyvo/Sakyvo.github.io/main/resourcepacks/${encodeURIComponent(e.originalName)}.zip`
      }
    };
  });

  // Write individual pack JSON
  fs.mkdirSync('dist/data/packs', { recursive: true });
  packs.forEach(p => {
    fs.writeFileSync(`dist/data/packs/${p.name}.json`, JSON.stringify(p, null, 2));
  });

  // Generate index.json (lightweight)
  const indexItems = packs.map(p => ({
    id: p.id,
    name: p.name,
    cover: p.cover,
    tags: p.tags,
    resolution: p.resolution
  }));

  const index = {
    total: packs.length,
    pageSize: PAGE_SIZE,
    pages: Math.ceil(packs.length / PAGE_SIZE),
    items: indexItems
  };
  fs.writeFileSync('dist/data/index.json', JSON.stringify(index, null, 2));

  // Generate paginated data
  fs.mkdirSync('dist/data/pages', { recursive: true });
  for (let i = 0; i < index.pages; i++) {
    const pageItems = packs.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
    fs.writeFileSync(`dist/data/pages/page-${i + 1}.json`, JSON.stringify({ page: i + 1, items: pageItems }, null, 2));
  }

  console.log(`Generated index with ${packs.length} packs, ${index.pages} pages.`);
}

main();
