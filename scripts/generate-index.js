const fs = require('fs');
const path = require('path');

const PAGE_SIZE = 50;

const MC_COLORS = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
  'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
};

function cleanMinecraftText(text) {
  if (!text) return '';
  return text.replace(/^[!#]\s*/, '').replace(/§[0-9a-fk-or]/gi, '').trim();
}

function toColoredHtml(text) {
  if (!text) return '';
  const cleaned = text.replace(/^[!#]\s*/, '').trim();
  let result = '', color = null;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '§' && i + 1 < cleaned.length) {
      const code = cleaned[i + 1].toLowerCase();
      if (MC_COLORS[code]) color = MC_COLORS[code];
      i++;
    } else {
      result += color ? `<span style="color:${color}">${cleaned[i]}</span>` : cleaned[i];
    }
  }
  return result;
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const mb = stats.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(stats.size / 1024).toFixed(0)}KB`;
  } catch { return 'Unknown'; }
}

function main() {
  const extractedPath = 'data/extracted.json';
  if (!fs.existsSync(extractedPath)) {
    console.log('No extracted.json found. Run extract-textures.js first.');
    return;
  }

  const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  // Load lists
  const listsPath = 'l/lists.json';
  const lists = fs.existsSync(listsPath) ? JSON.parse(fs.readFileSync(listsPath, 'utf-8')) : [];
  const packToLists = {};
  lists.forEach(list => {
    list.packs.forEach(packName => {
      if (!packToLists[packName]) packToLists[packName] = [];
      packToLists[packName].push(list.name);
    });
  });

  // Generate pack details
  const packs = extracted.map(e => {
    const zipPath = path.join('resourcepacks', `${e.originalName}.zip`);
    const cleanName = cleanMinecraftText(e.originalName);
    return {
      id: e.originalName,
      name: e.packId,
      displayName: cleanName || e.packId,
      coloredName: toColoredHtml(e.originalName),
      description: e.description || '',
      cover: `/thumbnails/${e.packId}/cover.png`,
      packPng: `/thumbnails/${e.packId}/pack.png`,
      icon: fs.existsSync(path.join(e.outputDir, 'icon.png')) ? `/thumbnails/${e.packId}/icon.png` : null,
      file: `resourcepacks/${e.originalName}.zip`,
      fileSize: getFileSize(zipPath),
      uploadDate: today,
      lists: packToLists[e.packId] || [],
      textures: e.extracted,
      downloads: {
        github: `https://raw.githubusercontent.com/Sakyvo/Sakyvo.github.io/main/resourcepacks/${encodeURIComponent(e.originalName)}.zip`,
        mirror: `https://ghproxy.com/https://raw.githubusercontent.com/Sakyvo/Sakyvo.github.io/main/resourcepacks/${encodeURIComponent(e.originalName)}.zip`
      }
    };
  });

  // Sort by displayName for A-Z
  packs.sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Write individual pack JSON
  fs.mkdirSync('data/packs', { recursive: true });
  packs.forEach(p => {
    fs.writeFileSync(`data/packs/${p.name}.json`, JSON.stringify(p, null, 2));
  });

  // Generate index.json (lightweight)
  const indexItems = packs.map(p => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    coloredName: p.coloredName,
    description: p.description,
    lists: p.lists,
    cover: p.cover,
    packPng: p.packPng
  }));

  const index = {
    total: packs.length,
    pageSize: PAGE_SIZE,
    pages: Math.ceil(packs.length / PAGE_SIZE),
    items: indexItems
  };
  fs.writeFileSync('data/index.json', JSON.stringify(index, null, 2));

  // Generate paginated data
  fs.mkdirSync('data/pages', { recursive: true });
  for (let i = 0; i < index.pages; i++) {
    const pageItems = packs.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
    fs.writeFileSync(`data/pages/page-${i + 1}.json`, JSON.stringify({ page: i + 1, items: pageItems }, null, 2));
  }

  console.log(`Generated index with ${packs.length} packs, ${index.pages} pages.`);
}

main();
