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

// Copy resourcepacks to dist for download
if (fs.existsSync('resourcepacks')) {
  copyDir('resourcepacks', 'dist/resourcepacks');
}

console.log('Build complete.');
