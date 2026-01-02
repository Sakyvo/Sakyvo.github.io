const AUTH = {
  REPO_OWNER: 'Sakyvo',
  REPO_NAME: 'Sakyvo.github.io',
  ADMIN_USER: 'Sakyvo',

  isLoggedIn() {
    return localStorage.getItem('auth_token') && localStorage.getItem('auth_user') === this.ADMIN_USER;
  },

  getToken() {
    return localStorage.getItem('auth_token') || '';
  },

  async login(username, token) {
    if (username !== this.ADMIN_USER) return { ok: false, error: 'Invalid username' };

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      if (!res.ok) return { ok: false, error: 'Invalid token' };

      const user = await res.json();
      if (user.login !== this.ADMIN_USER) return { ok: false, error: 'Token does not match user' };

      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', username);
      window.dispatchEvent(new Event('auth-change'));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new Event('auth-change'));
  },

  showLoginModal() {
    if (document.getElementById('login-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>LOGIN</h2>
        <div id="login-error" class="login-error"></div>
        <div class="form-group">
          <label>USERNAME</label>
          <input type="text" id="login-username" value="Sakyvo">
        </div>
        <div class="form-group">
          <label>GITHUB TOKEN</label>
          <input type="password" id="login-token" placeholder="ghp_...">
        </div>
        <div class="modal-buttons">
          <button class="btn btn-primary" id="login-submit">LOGIN</button>
          <button class="btn btn-secondary" id="login-cancel">CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('login-cancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById('login-submit').onclick = async () => {
      const username = document.getElementById('login-username').value;
      const token = document.getElementById('login-token').value;
      const errorEl = document.getElementById('login-error');

      if (!token) {
        errorEl.textContent = 'Please enter token';
        return;
      }

      errorEl.textContent = 'Verifying...';
      const result = await AUTH.login(username, token);

      if (result.ok) {
        modal.remove();
      } else {
        errorEl.textContent = result.error;
      }
    };
  },

  updateNav() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    const authBtn = nav.querySelector('.auth-btn') || document.createElement('a');
    authBtn.className = 'nav-btn auth-btn';

    if (this.isLoggedIn()) {
      authBtn.textContent = 'LOGOUT';
      authBtn.href = '#';
      authBtn.onclick = (e) => { e.preventDefault(); this.logout(); };
    } else {
      authBtn.textContent = 'LOGIN';
      authBtn.href = '#';
      authBtn.onclick = (e) => { e.preventDefault(); this.showLoginModal(); };
    }

    if (!nav.querySelector('.auth-btn')) {
      nav.appendChild(authBtn);
    }
  }
};

window.AUTH = AUTH;
window.addEventListener('auth-change', () => AUTH.updateNav());
document.addEventListener('DOMContentLoaded', () => AUTH.updateNav());
