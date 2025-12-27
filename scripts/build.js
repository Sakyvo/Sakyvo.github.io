const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy src files to dist
copyDir('src/css', 'dist/assets/css');
copyDir('src/js', 'dist/assets/js');
fs.copyFileSync('src/index.html', 'dist/index.html');
fs.copyFileSync('src/admin.html', 'dist/admin.html');

// Copy resourcepacks to dist for download
if (fs.existsSync('resourcepacks')) {
  copyDir('resourcepacks', 'dist/resourcepacks');
}

// Generate pack subdirectories
const indexPath = 'dist/data/index.json';
if (fs.existsSync(indexPath)) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const packHtml = fs.readFileSync('src/pack.html', 'utf-8');

  for (const pack of index.items) {
    const packDir = path.join('dist', pack.name);
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'index.html'), packHtml);
  }
  console.log(`Generated ${index.items.length} pack pages.`);
}

console.log('Build complete.');
