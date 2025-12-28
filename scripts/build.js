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

// Copy src files to root
copyDir('src/css', 'assets/css');
copyDir('src/js', 'assets/js');
fs.copyFileSync('src/index.html', 'index.html');
fs.copyFileSync('src/admin.html', 'admin.html');

// Generate pack subdirectories
const indexPath = 'data/index.json';
if (fs.existsSync(indexPath)) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const packHtml = fs.readFileSync('src/pack.html', 'utf-8');

  fs.mkdirSync('p', { recursive: true });
  for (const pack of index.items) {
    const packDir = path.join('p', pack.name);
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'index.html'), packHtml);
  }
  console.log(`Generated ${index.items.length} pack pages.`);
}

console.log('Build complete.');
