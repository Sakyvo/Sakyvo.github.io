const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_OWNER = 'Sakyvo';
const REPO_PREFIX = 'packs-';
const MAX_REPO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const FULL_MARKER = '!  FULL  !';
const PACKS_DIR = path.join(__dirname, '..', 'resourcepacks');
const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'pack-registry.json');
const REPOS_ROOT = path.join(__dirname, '..', '..');

function getRepoName(n) {
  return `${REPO_PREFIX}${String(n).padStart(3, '0')}`;
}

function getRepoDir(n) {
  return path.join(REPOS_ROOT, getRepoName(n));
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
}

function getPacksSortedByDate() {
  const files = fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.zip'));
  return files.map(f => {
    const full = path.join(PACKS_DIR, f);
    const stat = fs.statSync(full);
    return { file: f, path: full, size: stat.size, mtime: stat.mtimeMs };
  }).sort((a, b) => a.mtime - b.mtime);
}

function initRepo(n) {
  const dir = getRepoDir(n);
  const name = getRepoName(n);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    exec('git init', { cwd: dir });
    exec(`git remote add origin https://github.com/${REPO_OWNER}/${name}.git`, { cwd: dir });
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\nResource pack storage for VALE.\n`);
    fs.mkdirSync(path.join(dir, 'resourcepacks'), { recursive: true });
    exec('git add .', { cwd: dir });
    exec('git commit -m "init"', { cwd: dir });
  }
  return dir;
}

function getRepoUsedSize(dir) {
  const rpDir = path.join(dir, 'resourcepacks');
  if (!fs.existsSync(rpDir)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(rpDir)) {
    total += fs.statSync(path.join(rpDir, f)).size;
  }
  return total;
}
function isRepoFull(dir) {
  return fs.existsSync(path.join(dir, FULL_MARKER));
}

function markFull(dir) {
  fs.writeFileSync(path.join(dir, FULL_MARKER), 'This repository has reached its storage limit.\n');
}

function migrate() {
  const packs = getPacksSortedByDate();
  console.log(`Found ${packs.length} packs, total ${(packs.reduce((s, p) => s + p.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB`);

  const registry = {};
  let repoNum = 1;
  let repoDir = initRepo(repoNum);
  let repoUsed = getRepoUsedSize(repoDir);

  for (const pack of packs) {
    // Check if adding this pack would exceed limit
    if (repoUsed + pack.size > MAX_REPO_SIZE) {
      console.log(`  Repo ${getRepoName(repoNum)} full (${(repoUsed / 1024 / 1024 / 1024).toFixed(2)} GB), marking...`);
      markFull(repoDir);
      repoNum++;
      repoDir = initRepo(repoNum);
      repoUsed = getRepoUsedSize(repoDir);
    }

    const dest = path.join(repoDir, 'resourcepacks', pack.file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(pack.path, dest);
      console.log(`  ${pack.file} -> ${getRepoName(repoNum)} (${(pack.size / 1024 / 1024).toFixed(1)} MB)`);
    }
    repoUsed += pack.size;
    registry[pack.file] = {
      repo: getRepoName(repoNum),
      repoNum,
      size: pack.size
    };
  }

  // Save registry
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`\nRegistry saved: ${Object.keys(registry).length} packs across ${repoNum} repos`);

  // Batch commit+push per repo (max ~500MB per push to avoid timeout)
  const BATCH_SIZE = 500 * 1024 * 1024;
  for (let i = 1; i <= repoNum; i++) {
    const dir = getRepoDir(i);
    const name = getRepoName(i);
    const rpDir = path.join(dir, 'resourcepacks');
    const allFiles = fs.readdirSync(rpDir).filter(f => f.endsWith('.zip'));
    exec('git branch -M main', { cwd: dir });

    // Split into batches
    let batch = [], batchSize = 0, batchNum = 0;
    for (const f of allFiles) {
      const sz = fs.statSync(path.join(rpDir, f)).size;
      batch.push(f);
      batchSize += sz;
      if (batchSize >= BATCH_SIZE || f === allFiles[allFiles.length - 1]) {
        batchNum++;
        console.log(`\n${name} batch ${batchNum}: ${batch.length} files (${(batchSize / 1024 / 1024).toFixed(0)} MB)...`);
        for (const bf of batch) {
          exec(`git add "resourcepacks/${bf}"`, { cwd: dir });
        }
        // Also add README, FULL marker if last batch
        if (f === allFiles[allFiles.length - 1]) {
          exec('git add -A', { cwd: dir });
        }
        try {
          exec(`git commit -m "add packs batch ${batchNum}"`, { cwd: dir });
          exec('git push -u origin main', { cwd: dir, timeout: 600000 });
          console.log(`  batch ${batchNum} pushed OK`);
        } catch (e) {
          console.error(`  batch ${batchNum} failed: ${e.message}`);
        }
        batch = [];
        batchSize = 0;
      }
    }
  }
}

migrate();
