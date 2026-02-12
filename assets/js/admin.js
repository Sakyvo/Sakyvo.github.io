const REPO_OWNER = 'Sakyvo';
const REPO_NAME = 'Sakyvo.github.io';

class Admin {
  constructor() {
    this.loginRequired = document.getElementById('login-required');
    this.adminSection = document.getElementById('admin-section');
    this.messageEl = document.getElementById('message');
    this.packs = [];
    this.selected = new Set();
    this.multiSelectMode = false;
    this.sortByDate = false;
    this.listSortByDate = false;
    this.checkedLists = new Set();

    document.getElementById('show-login-btn')?.addEventListener('click', () => AUTH.showLoginModal());
    document.getElementById('upload-btn')?.addEventListener('click', () => this.upload());
    document.getElementById('batch-delete-btn')?.addEventListener('click', () => this.batchDelete());
    document.getElementById('pack-search')?.addEventListener('input', (e) => this.renderPacks(e.target.value));
    document.getElementById('admin-sort-btn')?.addEventListener('click', () => this.toggleSort());
    document.getElementById('create-list-btn')?.addEventListener('click', () => this.createList());
    document.getElementById('list-search')?.addEventListener('input', (e) => this.renderLists(e.target.value));
    document.getElementById('list-sort-btn')?.addEventListener('click', () => this.toggleListSort());
    document.getElementById('manual-build-btn')?.addEventListener('click', () => this.manualBuild());

    window.addEventListener('auth-change', () => this.checkAuth());
    this.checkAuth();
  }

  loadLists() {
    this.renderLists('');
  }

  renderLists(query = '') {
    const lists = JSON.parse(localStorage.getItem('vale_lists') || '[]');
    const container = document.getElementById('list-checkboxes');

    let filtered = lists.filter(l => l.name.toLowerCase().includes(query.toLowerCase()));

    if (this.listSortByDate) {
      filtered = [...filtered].reverse();
    } else {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding:12px;color:#666;font-size:12px;">No lists found</div>';
      return;
    }
    container.innerHTML = filtered.map(l => `
      <label class="admin-list-item">
        <span class="admin-list-name">${l.name}</span>
        <input type="checkbox" class="list-checkbox admin-list-checkbox" value="${l.name}" ${this.checkedLists.has(l.name) ? 'checked' : ''}>
      </label>
    `).join('');

    container.querySelectorAll('.list-checkbox').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) this.checkedLists.add(cb.value);
        else this.checkedLists.delete(cb.value);
      };
    });
  }

  toggleListSort() {
    this.listSortByDate = !this.listSortByDate;
    document.getElementById('list-sort-btn').textContent = this.listSortByDate ? 'DATE' : 'A-Z';
    this.renderLists(document.getElementById('list-search').value);
  }

  createList() {
    const name = prompt('Enter new list name:');
    if (!name?.trim()) return;
    const lists = JSON.parse(localStorage.getItem('vale_lists') || '[]');
    if (lists.find(l => l.name === name.trim())) {
      alert('List already exists');
      return;
    }
    lists.push({ name: name.trim(), cover: '', description: '', packs: [] });
    localStorage.setItem('vale_lists', JSON.stringify(lists));
    // 自动勾选新创建的列表
    this.checkedLists.add(name.trim());
    this.renderLists(document.getElementById('list-search').value);
  }

  toggleSort() {
    this.sortByDate = !this.sortByDate;
    document.getElementById('admin-sort-btn').textContent = this.sortByDate ? 'DATE' : 'A-Z';
    this.renderPacks(document.getElementById('pack-search').value);
  }

  checkAuth() {
    if (AUTH.isLoggedIn()) {
      this.loginRequired.style.display = 'none';
      this.adminSection.style.display = 'block';
      this.loadLists();
      this.loadPacks();
    } else {
      this.loginRequired.style.display = 'block';
      this.adminSection.style.display = 'none';
    }
  }

  showMessage(text, type) {
    this.messageEl.className = `message ${type}`;
    this.messageEl.textContent = text;
    this.messageEl.style.display = 'block';
  }

  async loadPacks() {
    try {
      const index = await fetch('/data/index.json').then(r => r.json());
      this.packs = index.items;
      this.renderPacks();
    } catch (e) {
      document.getElementById('pack-list').innerHTML = 'Failed to load packs';
    }
  }

  renderPacks(query = '') {
    const listEl = document.getElementById('pack-list');
    let filtered = this.packs.filter(p =>
      p.displayName.toLowerCase().includes(query.toLowerCase()) ||
      p.name.toLowerCase().includes(query.toLowerCase())
    );

    if (this.sortByDate) {
      filtered = [...filtered].reverse();
    } else {
      filtered = [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    listEl.innerHTML = filtered.map(p => `
      <div class="admin-pack-item" data-name="${p.name}">
        <div class="admin-pack-row1">
          <img class="admin-pack-icon ${this.selected.has(p.name) ? 'selected' : ''}" src="${p.packPng}" data-name="${p.name}">
          <a href="/p/${p.name}/" class="admin-pack-name">${p.displayName}</a>
        </div>
        <div class="admin-pack-row2">
          <img class="admin-texture" src="/thumbnails/${p.name}/diamond_sword.png" onerror="this.style.display='none'">
          <img class="admin-texture" src="/thumbnails/${p.name}/ender_pearl.png" onerror="this.style.display='none'">
          <button class="admin-delete-btn ${this.multiSelectMode ? 'disabled' : ''}" data-name="${p.name}">DELETE</button>
        </div>
      </div>
    `).join('') || '<p>No packs found</p>';

    listEl.querySelectorAll('.admin-pack-icon').forEach(img => {
      img.onclick = () => this.toggleSelect(img.dataset.name);
    });

    listEl.querySelectorAll('.admin-delete-btn:not(.disabled)').forEach(btn => {
      btn.onclick = () => this.deletePack(btn.dataset.name);
    });

    this.updateBatchBtn();
  }

  toggleSelect(name) {
    if (this.selected.has(name)) {
      this.selected.delete(name);
    } else {
      this.selected.add(name);
    }
    this.multiSelectMode = this.selected.size > 0;
    this.renderPacks(document.getElementById('pack-search').value);
  }

  updateBatchBtn() {
    const btn = document.getElementById('batch-delete-btn');
    if (this.multiSelectMode) {
      btn.className = 'btn btn-danger';
      btn.textContent = `DELETE (${this.selected.size})`;
    } else {
      btn.className = 'btn btn-secondary';
      btn.textContent = 'BATCH DELETE';
    }
  }

  async batchDelete() {
    if (this.selected.size === 0) return;
    if (!await this.confirm(`Delete ${this.selected.size} packs?`)) return;

    const token = AUTH.getToken();
    if (!token) { this.showMessage('Please login first', 'error'); return; }

    this.showMessage('Deleting...', 'success');
    const names = [...this.selected];

    try {
      const refRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`, {
        headers: { Authorization: `token ${token}` }
      });
      if (!refRes.ok) throw new Error('Failed to get branch ref');
      const latestCommitSha = (await refRes.json()).object.sha;

      const commitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${latestCommitSha}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (!commitRes.ok) throw new Error('Failed to get commit');
      const baseTreeSha = (await commitRes.json()).tree.sha;

      const treeItems = [];
      for (const name of names) {
        const pack = this.packs.find(p => p.name === name);
        if (!pack) continue;
        treeItems.push({ path: `resourcepacks/${pack.id}.zip`, mode: '100644', type: 'blob', sha: null });
      }

      if (treeItems.length === 0) {
        this.showMessage('No packs to delete', 'error');
        return;
      }

      const treeRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
      });
      if (!treeRes.ok) throw new Error('Failed to create tree');
      const treeData = await treeRes.json();

      const newCommitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${treeItems.length} pack(s)`, tree: treeData.sha, parents: [latestCommitSha] })
      });
      if (!newCommitRes.ok) throw new Error('Failed to create commit');
      const newCommit = await newCommitRes.json();

      const updateRefRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/main`, {
        method: 'PATCH',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha })
      });
      if (!updateRefRes.ok) throw new Error('Failed to update branch');

      this.selected.clear();
      this.multiSelectMode = false;
      this.showMessage(`Deleted ${treeItems.length} pack(s). Build triggered.`, 'success');
      this.loadPacks();
    } catch (e) {
      this.selected.clear();
      this.multiSelectMode = false;
      this.showMessage(`Delete error: ${e.message}`, 'error');
      this.loadPacks();
    }
  }

  async upload() {
    const token = AUTH.getToken();
    const fileInput = document.getElementById('file-input');
    const files = Array.from(fileInput.files);
    const selectedLists = [...this.checkedLists];

    if (files.length === 0) {
      this.showMessage('Please select files', 'error');
      return;
    }

    if (!token) {
      this.showMessage('Please login first', 'error');
      return;
    }

    this.showMessage('Validating files...', 'success');

    const valid = [];
    const invalid = [];

    for (const file of files) {
      if (!file.name.endsWith('.zip')) {
        invalid.push(`${file.name}: Not a .zip file`);
        continue;
      }
      try {
        const zip = await JSZip.loadAsync(file);
        if (!zip.file('pack.mcmeta')) {
          invalid.push(`${file.name}: Missing pack.mcmeta in root`);
          continue;
        }
        valid.push(file);
      } catch (e) {
        invalid.push(`${file.name}: Invalid zip file`);
      }
    }

    if (invalid.length > 0) {
      this.showInvalidFiles(invalid);
    }

    if (valid.length === 0) {
      this.showMessage('No valid files to upload', 'error');
      return;
    }

    if (!await this.confirm(`Upload ${valid.length} pack(s)?`)) return;

    this.showMessage('Uploading...', 'success');

    try {
      // Get latest commit and tree SHA
      const refRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`, {
        headers: { Authorization: `token ${token}` }
      });
      if (!refRes.ok) throw new Error('Failed to get branch ref');
      const latestCommitSha = (await refRes.json()).object.sha;

      const commitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${latestCommitSha}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (!commitRes.ok) throw new Error('Failed to get commit');
      const baseTreeSha = (await commitRes.json()).tree.sha;

      // Create blobs sequentially to avoid conflicts
      const uploadedNames = [];
      const treeItems = [];

      for (let i = 0; i < valid.length; i++) {
        const file = valid[i];
        this.showMessage(`Uploading ${i + 1}/${valid.length}: ${file.name}...`, 'success');
        try {
          const content = await this.fileToBase64(file);
          const blobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
            method: 'POST',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, encoding: 'base64' })
          });
          if (!blobRes.ok) continue;
          const blob = await blobRes.json();
          treeItems.push({ path: `resourcepacks/${file.name}`, mode: '100644', type: 'blob', sha: blob.sha });
          uploadedNames.push(this.sanitizeName(file.name.replace('.zip', '')));
        } catch (e) { continue; }
      }

      if (treeItems.length === 0) {
        this.showMessage('All uploads failed', 'error');
        return;
      }

      // Include lists.json update in the same commit
      if (selectedLists.length > 0 && uploadedNames.length > 0) {
        const lists = JSON.parse(localStorage.getItem('vale_lists') || '[]');
        selectedLists.forEach(listName => {
          const list = lists.find(l => l.name === listName);
          if (list) {
            uploadedNames.forEach(name => {
              if (!list.packs.includes(name)) list.packs.push(name);
            });
          }
        });
        localStorage.setItem('vale_lists', JSON.stringify(lists));
        try {
          const listsBlobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
            method: 'POST',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: JSON.stringify(lists, null, 2), encoding: 'utf-8' })
          });
          if (listsBlobRes.ok) {
            const listsBlob = await listsBlobRes.json();
            treeItems.push({ path: 'l/lists.json', mode: '100644', type: 'blob', sha: listsBlob.sha });
          }
        } catch (e) {}
      }

      // Single commit with all files
      this.showMessage('Creating commit...', 'success');
      const treeRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
      });
      if (!treeRes.ok) throw new Error('Failed to create tree');
      const treeData = await treeRes.json();

      const newCommitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Add ${uploadedNames.length} pack(s)`, tree: treeData.sha, parents: [latestCommitSha] })
      });
      if (!newCommitRes.ok) throw new Error('Failed to create commit');
      const newCommit = await newCommitRes.json();

      const updateRefRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/main`, {
        method: 'PATCH',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha })
      });
      if (!updateRefRes.ok) throw new Error('Failed to update branch');

      const success = uploadedNames.length;
      const failed = valid.length - success;
      fileInput.value = '';
      this.showMessage(`Uploaded ${success}, failed ${failed}. Build triggered.`, success > 0 ? 'success' : 'error');
    } catch (e) {
      this.showMessage(`Upload error: ${e.message}`, 'error');
    }
  }

  sanitizeName(name) {
    return name.replace(/^.*?[!#]+\s*(?=[0-9a-zA-Z\u4e00-\u9fff§_])/, '').replace(/_([0-9a-fk-or])/gi, '§$1').replace(/§[0-9a-fk-or]/gi, '').replace(/[!@#$%^&*()+=\[\]{}|\\:;"'<>,?\/~`]/g, '').trim().replace(/\s+/g, '_');
  }

  showInvalidFiles(invalid) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <h2>Invalid Files</h2>
        <div style="color:#c00;max-height:200px;overflow-y:auto;">
          ${invalid.map(s => `<p>${s}</p>`).join('')}
        </div>
        <div class="modal-buttons">
          <button class="btn btn-secondary" id="close-invalid">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-invalid').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  }

  async deletePack(name) {
    const pack = this.packs.find(p => p.name === name);
    if (!pack) return;
    if (!await this.confirm(`Delete "${pack.displayName}"?`)) return;

    const token = AUTH.getToken();
    if (!token) { this.showMessage('Please login first', 'error'); return; }

    try {
      const path = `resourcepacks/${pack.id}.zip`;
      const fileRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        headers: { Authorization: `token ${token}` }
      });
      if (!fileRes.ok) { this.showMessage('File not found', 'error'); return; }

      const fileData = await fileRes.json();
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'DELETE',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${pack.id}`, sha: fileData.sha })
      });

      if (res.ok) {
        this.showMessage('Deleted! Build triggered.', 'success');
        this.loadPacks();
      } else {
        const err = await res.json();
        this.showMessage(`Delete failed: ${err.message}`, 'error');
      }
    } catch (e) {
      this.showMessage(`Error: ${e.message}`, 'error');
    }
  }

  async triggerBuild() {
    const token = AUTH.getToken();
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' })
      });
      if (res.ok || res.status === 204) {
        this.showMessage('Upload complete! Build started.', 'success');
      }
    } catch (e) {}
  }

  async manualBuild() {
    const token = AUTH.getToken();
    if (!token) { this.showMessage('Please login first', 'error'); return; }
    if (!await this.confirm('Run build to refresh packs?')) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px;text-align:center;">
        <h2 style="margin-bottom:16px;">BUILD</h2>
        <p id="build-status" style="margin-bottom:8px;">Starting build...</p>
        <div style="background:#eee;height:8px;margin-bottom:16px;"><div id="build-bar" style="background:#000;height:100%;width:10%;transition:width 0.3s;"></div></div>
        <p id="build-time" style="font-size:12px;color:#666;"></p>
      </div>
    `;
    document.body.appendChild(modal);

    const statusEl = modal.querySelector('#build-status');
    const barEl = modal.querySelector('#build-bar');
    const timeEl = modal.querySelector('#build-time');
    const startTime = Date.now();
    const updateTime = () => { timeEl.textContent = `${Math.floor((Date.now() - startTime) / 1000)}s`; };
    const timer = setInterval(updateTime, 1000);

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' })
      });
      if (!res.ok && res.status !== 204) {
        clearInterval(timer);
        statusEl.textContent = 'Failed to start build';
        barEl.style.background = '#c00';
        setTimeout(() => modal.remove(), 2000);
        return;
      }

      statusEl.textContent = 'Waiting for workflow...';
      barEl.style.width = '20%';

      await new Promise(r => setTimeout(r, 3000));

      let runId = null;
      for (let i = 0; i < 10; i++) {
        const runsRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build.yml/runs?per_page=1`, {
          headers: { Authorization: `token ${token}` }
        });
        const runs = await runsRes.json();
        if (runs.workflow_runs?.[0]?.status !== 'completed') {
          runId = runs.workflow_runs?.[0]?.id;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!runId) {
        clearInterval(timer);
        statusEl.textContent = 'Build may have completed quickly';
        barEl.style.width = '100%';
        setTimeout(() => { modal.remove(); location.reload(); }, 1500);
        return;
      }

      statusEl.textContent = 'Building...';
      barEl.style.width = '40%';

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const runRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}`, {
          headers: { Authorization: `token ${token}` }
        });
        const run = await runRes.json();
        const progress = Math.min(40 + i * 2, 90);
        barEl.style.width = `${progress}%`;

        if (run.status === 'completed') {
          clearInterval(timer);
          if (run.conclusion === 'success') {
            statusEl.textContent = 'Build complete!';
            barEl.style.width = '100%';
            setTimeout(() => { modal.remove(); location.reload(); }, 1500);
          } else {
            statusEl.textContent = `Build failed: ${run.conclusion}`;
            barEl.style.background = '#c00';
            barEl.style.width = '100%';
            setTimeout(() => modal.remove(), 3000);
          }
          return;
        }
      }

      clearInterval(timer);
      statusEl.textContent = 'Build timed out. Check GitHub Actions.';
      setTimeout(() => modal.remove(), 3000);
    } catch (e) {
      clearInterval(timer);
      statusEl.textContent = `Error: ${e.message}`;
      setTimeout(() => modal.remove(), 3000);
    }
  }

  confirm(message) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:350px;text-align:center;">
          <p style="margin-bottom:24px;">${message}</p>
          <div class="modal-buttons">
            <button class="btn btn-primary" id="confirm-yes">CONFIRM</button>
            <button class="btn btn-secondary" id="confirm-no">CANCEL</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#confirm-yes').onclick = () => { modal.remove(); resolve(true); };
      modal.querySelector('#confirm-no').onclick = () => { modal.remove(); resolve(false); };
      modal.onclick = (e) => { if (e.target === modal) { modal.remove(); resolve(false); } };
    });
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new Admin());
