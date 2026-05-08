const fs = require('fs');
const path = require('path');
const {
  PREVIEW_TEXTURE_FILES,
  sanitizeTextureFileInPlace,
  generateCoverFromOutputDir,
} = require('./thumbnail-preview-utils');

const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');

async function main() {
  const dirs = fs.readdirSync(THUMB_DIR).filter(name => {
    const full = path.join(THUMB_DIR, name);
    return fs.statSync(full).isDirectory();
  });

  let changedFiles = 0;
  let rebuiltCovers = 0;

  for (const dir of dirs) {
    const packDir = path.join(THUMB_DIR, dir);
    let packChanged = false;

    for (const filename of PREVIEW_TEXTURE_FILES) {
      const filePath = path.join(packDir, filename);
      if (!fs.existsSync(filePath)) continue;
      if (await sanitizeTextureFileInPlace(filePath)) {
        changedFiles++;
        packChanged = true;
      }
    }

    if (await generateCoverFromOutputDir(packDir)) {
      rebuiltCovers++;
    }
  }

  console.log(`Preview alpha cleanup done. Files changed: ${changedFiles}, covers rebuilt: ${rebuiltCovers}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
