const REPO_OWNER = 'Sakyvo';
const REPO_NAME = 'Sakyvo.github.io';

class Admin {
  constructor() {
    this.loginRequired = document.getElementById('login-required');
    this.adminSection = document.getElementById('admin-section');
    this.messageEl = document.getElementById('message');

    document.getElementById('show-login-btn').onclick = () => AUTH.showLoginModal();
    document.getElementById('upload-btn').onclick = () => this.upload();

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
      const index = await fetch('data/index.json').then(r => r.json());
      const listEl = document.getElementById('pack-list');
      listEl.innerHTML = index.items.map(p => `
        <div class="pack-item">
          <span>${p.displayName}</span>
          <button class="delete-btn" data-id="${p.id}">DELETE</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => this.deletePack(btn.dataset.id);
      });
    } catch (e) {
      document.getElementById('pack-list').innerHTML = 'Failed to load packs';
    }
  }

  async upload() {
    const token = AUTH.getToken();
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file || !file.name.endsWith('.zip')) {
      this.showMessage('Please select a .zip file', 'error');
      return;
    }

    if (!token) {
      this.showMessage('Please login first', 'error');
      return;
    }

    try {
      this.showMessage('Uploading...', 'success');
      const content = await this.fileToBase64(file);
      const path = `resourcepacks/${file.name}`;

      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Add ${file.name}`,
          content: content
        })
      });

      if (res.ok) {
        this.showMessage('Upload successful! Run build to update site.', 'success');
        fileInput.value = '';
      } else {
        const err = await res.json();
        this.showMessage(`Upload failed: ${err.message}`, 'error');
      }
    } catch (e) {
      this.showMessage(`Error: ${e.message}`, 'error');
    }
  }

  async deletePack(id) {
    if (!confirm(`Delete ${id}?`)) return;
    const token = AUTH.getToken();

    if (!token) {
      this.showMessage('Please login first', 'error');
      return;
    }

    try {
      const path = `resourcepacks/${id}.zip`;
      const fileRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        headers: { Authorization: `token ${token}` }
      });

      if (!fileRes.ok) {
        this.showMessage('File not found', 'error');
        return;
      }

      const fileData = await fileRes.json();
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'DELETE',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Delete ${id}`,
          sha: fileData.sha
        })
      });

      if (res.ok) {
        this.showMessage('Deleted! Run build to update site.', 'success');
        this.loadPacks();
      } else {
        const err = await res.json();
        this.showMessage(`Delete failed: ${err.message}`, 'error');
      }
    } catch (e) {
      this.showMessage(`Error: ${e.message}`, 'error');
    }
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
