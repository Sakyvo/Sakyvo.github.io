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

    document.getElementById('show-login-btn').onclick = () => AUTH.showLoginModal();
    document.getElementById('upload-btn').onclick = () => this.upload();
    document.getElementById('batch-delete-btn').onclick = () => this.batchDelete();
    document.getElementById('pack-search').oninput = (e) => this.renderPacks(e.target.value);

    window.addEventListener('auth-change', () => this.checkAuth());
    this.checkAuth();
  }

  checkAuth() {
    if (AUTH.isLoggedIn()) {
      this.loginRequired.style.display = 'none';
      this.adminSection.style.display = 'block';
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
    const filtered = this.packs.filter(p =>
      p.displayName.toLowerCase().includes(query.toLowerCase()) ||
      p.name.toLowerCase().includes(query.toLowerCase())
    );

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
    let success = 0, failed = 0;

    for (const name of names) {
      try {
        const pack = this.packs.find(p => p.name === name);
        if (!pack) continue;
        const path = `resourcepacks/${pack.id}.zip`;
        const fileRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
          headers: { Authorization: `token ${token}` }
        });
        if (!fileRes.ok) { failed++; continue; }
        const fileData = await fileRes.json();
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
          method: 'DELETE',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Delete ${pack.id}`, sha: fileData.sha })
        });
        if (res.ok) success++; else failed++;
      } catch (e) { failed++; }
    }

    this.selected.clear();
    this.multiSelectMode = false;
    this.showMessage(`Deleted ${success}, failed ${failed}. Run build to update.`, success > 0 ? 'success' : 'error');
    this.loadPacks();
  }

  async upload() {
    const token = AUTH.getToken();
    const fileInput = document.getElementById('file-input');
    const files = Array.from(fileInput.files);

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
    let success = 0, failed = 0;

    for (const file of valid) {
      try {
        const content = await this.fileToBase64(file);
        const path = `resourcepacks/${file.name}`;
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
          method: 'PUT',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Add ${file.name}`, content })
        });
        if (res.ok) success++; else failed++;
      } catch (e) { failed++; }
    }

    fileInput.value = '';
    this.showMessage(`Uploaded ${success}, failed ${failed}. Run build to update.`, success > 0 ? 'success' : 'error');
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
        this.showMessage('Deleted! Run build to update.', 'success');
        this.loadPacks();
      } else {
        const err = await res.json();
        this.showMessage(`Delete failed: ${err.message}`, 'error');
      }
    } catch (e) {
      this.showMessage(`Error: ${e.message}`, 'error');
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
