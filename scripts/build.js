const fs = require('fs');
const path = require('path');

// Generate pack subdirectories from pack.html template
const indexPath = 'data/index.json';
if (fs.existsSync(indexPath)) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const packHtml = fs.readFileSync('pack.html', 'utf-8');

  fs.mkdirSync('p', { recursive: true });
  for (const pack of index.items) {
    const packDir = path.join('p', pack.name);
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'index.html'), packHtml);
  }
  console.log(`Generated ${index.items.length} pack pages.`);
}

console.log('Build complete.');
