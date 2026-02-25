const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_OWNER = 'Sakyvo';
const REPO_PREFIX = 'packs-';
const MAX_REPO_SIZE = 5 * 1024 * 1024 * 1024;
const FULL_MARKER = '!  FULL  !';
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

function getRepoUsedSize(dir) {
  const rpDir = path.join(dir, 'resourcepacks');
  if (!fs.existsSync(rpDir)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(rpDir)) {
    total += fs.statSync(path.join(rpDir, f)).size;
  }
  return total;
}

function findAvailableRepo() {
  for (let n = 1; ; n++) {
    const dir = getRepoDir(n);
    if (!fs.existsSync(dir)) {
      // Need to create new repo(s)
      return { num: n, dir, needsCreate: true };
    }
    if (!fs.existsSync(path.join(dir, FULL_MARKER))) {
      return { num: n, dir, needsCreate: false };
    }
  }
}

function initRepo(n) {
  const dir = getRepoDir(n);
  const name = getRepoName(n);
  fs.mkdirSync(dir, { recursive: true });
  exec('git init', { cwd: dir });
  try {
    exec(`git remote add origin https://github.com/${REPO_OWNER}/${name}.git`, { cwd: dir });
  } catch (e) {}
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\nResource pack storage for VALE.\n`);
  fs.mkdirSync(path.join(dir, 'resourcepacks'), { recursive: true });
  exec('git add .', { cwd: dir });
  exec('git commit -m "init"', { cwd: dir });
  exec('git branch -M main', { cwd: dir });
  // Create remote repo via gh if available, otherwise user must create manually
  try {
    exec(`gh repo create ${REPO_OWNER}/${name} --public -y`, { cwd: dir });
  } catch (e) {
    console.log(`Note: auto-create repo failed, ensure ${REPO_OWNER}/${name} exists on GitHub`);
  }
  exec('git push -u origin main', { cwd: dir, timeout: 300000 });
  return dir;
}

function markFull(dir) {
  fs.writeFileSync(path.join(dir, FULL_MARKER), 'This repository has reached its storage limit.\n');
  exec('git add -A', { cwd: dir });
  exec('git commit -m "mark repo full"', { cwd: dir });
  exec('git push origin main', { cwd: dir, timeout: 60000 });
}

function upload(zipPaths) {
  const registry = fs.existsSync(REGISTRY_PATH)
    ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
    : {};

  for (const zipPath of zipPaths) {
    const file = path.basename(zipPath);
    if (registry[file]) {
      console.log(`Skip: ${file} already in ${registry[file].repo}`);
      continue;
    }

    const size = fs.statSync(zipPath).size;
    let { num, dir, needsCreate } = findAvailableRepo();

    if (needsCreate) {
      console.log(`Creating new repo ${getRepoName(num)}...`);
      dir = initRepo(num);
    }

    // Check if this pack fits
    const used = getRepoUsedSize(dir);
    if (used + size > MAX_REPO_SIZE) {
      console.log(`${getRepoName(num)} full, marking and moving to next...`);
      markFull(dir);
      num++;
      dir = getRepoDir(num);
      if (!fs.existsSync(dir)) {
        console.log(`Creating new repo ${getRepoName(num)}...`);
        dir = initRepo(num);
      }
    }

    const dest = path.join(dir, 'resourcepacks', file);
    fs.copyFileSync(zipPath, dest);
    registry[file] = { repo: getRepoName(num), repoNum: num, size };

    // Commit and push
    exec(`git add "resourcepacks/${file}"`, { cwd: dir });
    exec(`git commit -m "add ${file}"`, { cwd: dir });
    exec('git push origin main', { cwd: dir, timeout: 300000 });
    console.log(`Uploaded: ${file} -> ${getRepoName(num)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`Registry updated: ${Object.keys(registry).length} packs total`);
}

// Usage: node upload-pack.js <file1.zip> [file2.zip] ...
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node upload-pack.js <file1.zip> [file2.zip] ...');
  process.exit(1);
}
upload(args.map(a => path.resolve(a)));
