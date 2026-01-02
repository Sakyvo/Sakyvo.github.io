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
          <div class="tag-list" id="pack-tags"></div>
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
        <div class="tag-input-group">
          <input type="text" id="tag-input" placeholder="Add to list...">
          <button class="btn btn-primary" id="add-tag-btn">ADD</button>
        </div>
        <button class="btn btn-secondary" id="delete-pack-btn">DELETE PACK</button>
      </div>
    `;

    // Load and display tags
    const packTags = JSON.parse(localStorage.getItem(`pack_tags_${packName}`) || '[]');
    renderTags(packTags);

    function renderTags(tags) {
      const isAdmin = window.AUTH?.isLoggedIn();
      document.getElementById('pack-tags').innerHTML = tags.map(tag =>
        `<span class="tag">${tag}${isAdmin ? `<span class="remove-tag" data-tag="${tag}">×</span>` : ''}</span>`
      ).join('');

      if (isAdmin) {
        document.querySelectorAll('.remove-tag').forEach(btn => {
          btn.onclick = () => {
            const newTags = tags.filter(t => t !== btn.dataset.tag);
            localStorage.setItem(`pack_tags_${packName}`, JSON.stringify(newTags));
            renderTags(newTags);
          };
        });
      }
    }

    // Admin actions
    function updateAdminUI() {
      const adminSection = document.getElementById('admin-actions');
      if (window.AUTH?.isLoggedIn()) {
        adminSection.style.display = 'block';
      } else {
        adminSection.style.display = 'none';
      }
      renderTags(JSON.parse(localStorage.getItem(`pack_tags_${packName}`) || '[]'));
    }

    window.addEventListener('auth-change', updateAdminUI);
    updateAdminUI();

    document.getElementById('add-tag-btn').onclick = () => {
      const input = document.getElementById('tag-input');
      const tag = input.value.trim();
      if (!tag) return;

      const tags = JSON.parse(localStorage.getItem(`pack_tags_${packName}`) || '[]');
      if (!tags.includes(tag)) {
        tags.push(tag);
        localStorage.setItem(`pack_tags_${packName}`, JSON.stringify(tags));
        renderTags(tags);
      }
      input.value = '';
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
