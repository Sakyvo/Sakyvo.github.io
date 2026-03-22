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
        if (!window.location.pathname.startsWith('/admin')) {
          window.location.href = '/admin/';
        }
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

    const isAdminPage = window.location.pathname.startsWith('/admin');

    if (this.isLoggedIn()) {
      if (isAdminPage) {
        authBtn.textContent = 'LOGOUT';
        authBtn.href = '#';
        authBtn.onclick = (e) => { e.preventDefault(); this.showLogoutConfirm(); };
      } else {
        authBtn.textContent = 'ADMIN';
        authBtn.href = '/admin/';
        authBtn.onclick = null;
      }
    } else {
      authBtn.textContent = 'LOGIN';
      authBtn.href = '#';
      authBtn.onclick = (e) => { e.preventDefault(); this.showLoginModal(); };
    }

    if (!nav.querySelector('.auth-btn')) {
      nav.appendChild(authBtn);
    }
  },

  showLogoutConfirm() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:350px;text-align:center;">
        <p style="margin-bottom:24px;">Confirm logout?</p>
        <div class="modal-buttons">
          <button class="btn btn-primary" id="logout-yes">CONFIRM</button>
          <button class="btn btn-secondary" id="logout-no">CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#logout-yes').onclick = () => { modal.remove(); this.logout(); };
    modal.querySelector('#logout-no').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  }
};

window.AUTH = AUTH;
window.addEventListener('auth-change', () => AUTH.updateNav());
document.addEventListener('DOMContentLoaded', () => AUTH.updateNav());


// Maintenance mode check
(function() {
  var isAdmin = window.location.pathname.startsWith('/admin');
  var token = AUTH.getToken();
  var loggedIn = AUTH.isLoggedIn();

  // Use GitHub API when logged in (bypasses CDN cache), raw URL otherwise
  var fetchMaintenance;
  if (loggedIn && token) {
    fetchMaintenance = fetch('https://api.github.com/repos/' + AUTH.REPO_OWNER + '/' + AUTH.REPO_NAME + '/contents/data/maintenance.json', {
      headers: { Authorization: 'token ' + token }
    }).then(function(r) {
      if (!r.ok) return null;
      return r.json().then(function(d) {
        return JSON.parse(decodeURIComponent(escape(atob(d.content))));
      });
    });
  } else {
    fetchMaintenance = fetch('https://raw.githubusercontent.com/' + AUTH.REPO_OWNER + '/' + AUTH.REPO_NAME + '/main/data/maintenance.json?t=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; });
  }

  fetchMaintenance
    .then(function(data) {
      if (!data || !data.enabled) return;
      if (loggedIn) {
        // Admin badge on all pages
        var badge = document.createElement('div');
        badge.textContent = 'MAINTENANCE ON';
        badge.style.cssText = 'position:fixed;top:12px;right:12px;background:#c00;color:#fff;padding:6px 14px;font-size:12px;font-weight:bold;letter-spacing:1px;z-index:9999;';
        document.body.appendChild(badge);
        return;
      }
      if (isAdmin) return;
      document.documentElement.innerHTML = '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VALE - Maintenance</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111;color:#ccc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.maintenance{text-align:center;border:2px solid #444;padding:60px 48px;max-width:460px}.maintenance h1{font-size:28px;letter-spacing:6px;margin-bottom:16px;color:#fff}.maintenance p{font-size:14px;color:#888;line-height:1.6}.maintenance .line{width:40px;height:2px;background:#444;margin:20px auto}</style></head><body><div class="maintenance"><h1>VALE</h1><div class="line"></div><p>Service in Maintenance</p></div></body>';
    })
    .catch(function() {});
})();
