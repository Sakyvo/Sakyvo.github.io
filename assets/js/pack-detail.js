document.addEventListener('DOMContentLoaded', async () => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const packName = pathParts[0] === 'p' ? pathParts[1] : pathParts[0];

  if (!packName) {
    document.getElementById('pack-content').innerHTML = 'Pack not found';
    return;
  }

  try {
    const pack = await fetch(`/data/packs/${packName}.json`).then(r => r.json());
    document.title = `${pack.displayName} - VALE`;

    const base = `/thumbnails/${pack.name}/`;
    const img = (name) => `<img src="${base}${name}" alt="${name}" data-texture="${name}">`;

    document.getElementById('pack-content').innerHTML = `
      <div class="detail-header">
        <img class="pack-icon-large" src="${pack.packPng}" alt="Pack">
        <div class="detail-info">
          <h1>${pack.displayName}</h1>
          <p class="original-name">${pack.id}</p>
          <p class="meta">${pack.fileSize}</p>
        </div>
      </div>
      <div class="download-section">
        <h2>DOWNLOAD</h2>
        <a class="btn btn-primary" href="${pack.downloads.github}" download>GitHub</a>
        <a class="btn btn-secondary" href="${pack.downloads.mirror}" download>Mirror</a>
      </div>
      <div class="preview-section">
        <h2>Preview</h2>
        <div class="preview-columns">
          <div class="preview-col">
            <div class="preview-card texture-grid">
              <div class="grid-row">${img('diamond_sword.png')}${img('ender_pearl.png')}${img('potion_bottle_splash.png')}${img('steak.png')}</div>
              <div class="grid-row">${img('iron_sword.png')}${img('fishing_rod_uncast.png')}${img('apple_golden.png')}${img('golden_carrot.png')}</div>
              <div class="grid-row">${img('grass_side.png')}${img('stone.png')}${img('cobblestone.png')}${img('wool_colored_white.png')}</div>
              <div class="grid-row">${img('dirt.png')}${img('planks_oak.png')}${img('log_oak.png')}${img('diamond_ore.png')}</div>
            </div>
            <div class="preview-card icons-card">${img('icons.png')}</div>
          </div>
          <div class="preview-col">
            <div class="preview-card armor-card"><div id="armor-viewer"></div></div>
            <div class="preview-card particles-card">${img('particles.png')}</div>
          </div>
        </div>
      </div>
      <div class="admin-actions" id="admin-actions" style="display:none;">
        <h3>ADMIN</h3>
        <button class="btn btn-primary" id="add-to-list-btn">ADD TO LIST</button>
        <button class="btn btn-secondary" id="delete-pack-btn">DELETE PACK</button>
      </div>
    `;

    // Admin actions
    function updateAdminUI() {
      const adminSection = document.getElementById('admin-actions');
      if (window.AUTH?.isLoggedIn()) {
        adminSection.style.display = 'block';
      } else {
        adminSection.style.display = 'none';
      }
    }

    window.addEventListener('auth-change', updateAdminUI);
    updateAdminUI();

    // Add to list modal
    document.getElementById('add-to-list-btn').onclick = () => {
      const lists = JSON.parse(localStorage.getItem('vale_lists') || '[]');

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
          <h2>Add to List</h2>
          <input type="text" id="list-search" placeholder="Search or create list..." style="width:100%;padding:12px;border:2px solid #000;margin-bottom:16px;">
          <div id="list-options" style="max-height:250px;overflow-y:auto;"></div>
          <div class="modal-buttons">
            <button class="btn btn-primary" id="confirm-add-list">ADD</button>
            <button class="btn btn-secondary" id="cancel-add-list">CANCEL</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const selected = new Set();
      const searchInput = modal.querySelector('#list-search');
      const optionsDiv = modal.querySelector('#list-options');

      function renderOptions(query = '') {
        const q = query.toLowerCase();
        const filtered = lists.filter(l => l.name.toLowerCase().includes(q));
        const alreadyIn = lists.filter(l => l.packs.includes(packName)).map(l => l.name);

        let html = filtered.map(l => `
          <label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;cursor:pointer;">
            <input type="checkbox" value="${l.name}" ${selected.has(l.name) ? 'checked' : ''} ${alreadyIn.includes(l.name) ? 'disabled checked' : ''}>
            <span>${l.name}</span>
            ${alreadyIn.includes(l.name) ? '<span style="color:#999;font-size:12px;">(already added)</span>' : ''}
          </label>
        `).join('');

        if (query && !lists.find(l => l.name.toLowerCase() === q)) {
          html += `
            <label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;cursor:pointer;background:#f0f0f0;">
              <input type="checkbox" value="__new__${query}" ${selected.has('__new__' + query) ? 'checked' : ''}>
              <span>Create "${query}"</span>
            </label>
          `;
        }

        optionsDiv.innerHTML = html || '<p style="padding:8px;color:#666;">No lists found</p>';

        optionsDiv.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
          cb.onchange = () => {
            if (cb.checked) selected.add(cb.value);
            else selected.delete(cb.value);
          };
        });
      }

      searchInput.oninput = () => renderOptions(searchInput.value.trim());
      renderOptions();

      modal.querySelector('#cancel-add-list').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      modal.querySelector('#confirm-add-list').onclick = () => {
        selected.forEach(val => {
          if (val.startsWith('__new__')) {
            const name = val.replace('__new__', '');
            lists.push({ name, cover: '', packs: [packName] });
          } else {
            const list = lists.find(l => l.name === val);
            if (list && !list.packs.includes(packName)) {
              list.packs.push(packName);
            }
          }
        });
        localStorage.setItem('vale_lists', JSON.stringify(lists));
        modal.remove();
        alert('Added to list(s)!');
      };
    };

    document.getElementById('delete-pack-btn').onclick = async () => {
      if (!confirm(`Delete ${pack.displayName}?`)) return;

      const token = window.AUTH?.getToken();
      if (!token) return alert('Please login first');

      try {
        const path = `resourcepacks/${pack.id}.zip`;
        const fileRes = await fetch(`https://api.github.com/repos/Sakyvo/Sakyvo.github.io/contents/${path}`, {
          headers: { Authorization: `token ${token}` }
        });

        if (!fileRes.ok) return alert('File not found');

        const fileData = await fileRes.json();
        const res = await fetch(`https://api.github.com/repos/Sakyvo/Sakyvo.github.io/contents/${path}`, {
          method: 'DELETE',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Delete ${pack.id}`, sha: fileData.sha })
        });

        if (res.ok) {
          alert('Deleted! Run build to update site.');
          window.location.href = '/';
        } else {
          const err = await res.json();
          alert(`Delete failed: ${err.message}`);
        }
      } catch (e) {
        alert(`Error: ${e.message}`);
      }
    };

    // Setup animated textures
    document.querySelectorAll('.texture-grid img').forEach(img => {
      img.onload = async function() {
        if (this.naturalHeight > this.naturalWidth) {
          const frames = this.naturalHeight / this.naturalWidth;
          if (Number.isInteger(frames) && frames > 1) {
            const wrapper = document.createElement('div');
            wrapper.className = 'animated-texture';
            wrapper.style.backgroundImage = `url(${this.src})`;
            wrapper.style.backgroundSize = `100% ${frames * 100}%`;

            // Try to load mcmeta
            let frameTime = 2; // default 2 ticks = 100ms
            try {
              const mcmeta = await fetch(this.src + '.mcmeta').then(r => r.json());
              if (mcmeta.animation?.frametime) frameTime = mcmeta.animation.frametime;
            } catch(e) {}

            let currentFrame = 0;
            setInterval(() => {
              currentFrame = (currentFrame + 1) % frames;
              wrapper.style.backgroundPosition = `0 ${(currentFrame / (frames - 1)) * 100}%`;
            }, frameTime * 50); // 1 tick = 50ms

            this.parentNode.replaceChild(wrapper, this);
          }
        }
      };
    });

    const container = document.getElementById('armor-viewer');
    if (container && window.ArmorViewer) {
      new ArmorViewer(
        container,
        '/Default_Texture/Steve.png',
        `${base}diamond_layer_1.png`,
        `${base}diamond_layer_2.png`
      );
    }
  } catch (e) {
    document.getElementById('pack-content').innerHTML = 'Pack not found';
  }
});
