const REPO_OWNER = 'Sakyvo';
const REPO_NAME = 'Sakyvo.github.io';
const ADMIN_PASSWORD = 'vale2024';

class Admin {
  constructor() {
    this.token = localStorage.getItem('gh_token') || '';
    this.isLoggedIn = localStorage.getItem('admin_logged') === 'true';

    this.loginSection = document.getElementById('login-section');
    this.adminSection = document.getElementById('admin-section');
    this.messageEl = document.getElementById('message');

    document.getElementById('login-btn').onclick = () => this.login();
    document.getElementById('logout-btn').onclick = () => this.logout();
    document.getElementById('upload-btn').onclick = () => this.upload();
    document.getElementById('token-input').value = this.token;

    if (this.isLoggedIn) this.showAdmin();
    else this.showLogin();
  }

  showMessage(text, type) {
    this.messageEl.className = `message ${type}`;
    this.messageEl.textContent = text;
    this.messageEl.style.display = 'block';
  }

  showLogin() {
    this.loginSection.style.display = 'block';
    this.adminSection.style.display = 'none';
  }

  showAdmin() {
    this.loginSection.style.display = 'none';
    this.adminSection.style.display = 'block';
    this.loadPacks();
  }

  login() {
    const pwd = document.getElementById('password-input').value;
    if (pwd === ADMIN_PASSWORD) {
      localStorage.setItem('admin_logged', 'true');
      this.isLoggedIn = true;
      this.showAdmin();
    } else {
      this.showMessage('Wrong password', 'error');
    }
  }

  logout() {
    localStorage.removeItem('admin_logged');
    this.isLoggedIn = false;
    this.showLogin();
  }

  saveToken() {
    this.token = document.getElementById('token-input').value;
    localStorage.setItem('gh_token', this.token);
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
    this.saveToken();
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file || !file.name.endsWith('.zip')) {
      this.showMessage('Please select a .zip file', 'error');
      return;
    }

    if (!this.token) {
      this.showMessage('Please enter GitHub token', 'error');
      return;
    }

    try {
      this.showMessage('Uploading...', 'success');
      const content = await this.fileToBase64(file);
      const path = `resourcepacks/${file.name}`;

      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${this.token}`,
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
    this.saveToken();

    if (!this.token) {
      this.showMessage('Please enter GitHub token', 'error');
      return;
    }

    try {
      const path = `resourcepacks/${id}.zip`;
      const fileRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        headers: { Authorization: `token ${this.token}` }
      });

      if (!fileRes.ok) {
        this.showMessage('File not found', 'error');
        return;
      }

      const fileData = await fileRes.json();
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'DELETE',
        headers: {
          Authorization: `token ${this.token}`,
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
