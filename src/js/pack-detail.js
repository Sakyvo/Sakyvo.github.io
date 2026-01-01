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
              <div class="grid-row">${img('iron_sword.png')}${img('fishing_rod_uncast.png')}${img('golden_carrot.png')}${img('apple_golden.png')}</div>
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
    `;

    // Setup animated textures
    document.querySelectorAll('.texture-grid img').forEach(img => {
      img.onload = function() {
        if (this.naturalHeight > this.naturalWidth) {
          const frames = this.naturalHeight / this.naturalWidth;
          if (Number.isInteger(frames) && frames > 1) {
            const wrapper = document.createElement('div');
            wrapper.className = 'animated-texture';
            wrapper.style.setProperty('--frames', frames);
            wrapper.style.setProperty('--bg', `url(${this.src})`);
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
