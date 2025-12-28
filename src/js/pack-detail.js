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

    const t = pack.textures || {};
    const items = t.items || [];
    const blocks = t.blocks || [];
    const armor = t.armor || [];
    const gui = t.gui || [];
    const particle = t.particle || [];

    const img = (name) => `<img src="/thumbnails/${pack.name}/${name}" alt="${name}">`;

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
        <div class="preview-grid">
          <div class="preview-left">
            <div class="preview-row">${items.slice(0,4).map(img).join('')}</div>
            <div class="preview-row">${items.slice(4,8).map(img).join('')}</div>
            <div class="preview-row">${blocks.map(img).join('')}</div>
          </div>
          <div class="preview-right">
            <div class="preview-row">${armor.map(img).join('')}</div>
            <div class="preview-row">${gui.map(img).join('')}</div>
            <div class="preview-row">${particle.map(img).join('')}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('pack-content').innerHTML = 'Pack not found';
  }
});
