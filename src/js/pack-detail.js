document.addEventListener('DOMContentLoaded', async () => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const packName = pathParts[0];

  if (!packName) {
    document.getElementById('pack-content').innerHTML = 'Pack not found';
    return;
  }

  try {
    const pack = await fetch(`../data/packs/${packName}.json`).then(r => r.json());
    document.title = `${pack.displayName} - VALE`;

    const images = [
      pack.cover && `<img src="..${pack.cover}" alt="Cover">`,
      pack.icon && `<img src="..${pack.icon}" alt="Icon">`,
      pack.packPng && `<img src="..${pack.packPng}" alt="Pack">`
    ].filter(Boolean).join('');

    const textures = Object.values(pack.textures || {}).flat();
    const textureHtml = textures.length ? `
      <div class="texture-section">
        <h2>TEXTURES</h2>
        <div class="texture-grid">
          ${textures.map(t => `<img src="../thumbnails/${pack.name}/${t}" alt="${t}">`).join('')}
        </div>
      </div>
    ` : '';

    document.getElementById('pack-content').innerHTML = `
      <div class="detail-header">
        <div class="detail-images">${images}</div>
        <div class="detail-info">
          <h1>${pack.displayName}</h1>
          ${pack.description ? `<p class="description">${pack.description}</p>` : ''}
          <p class="meta">${pack.fileSize}</p>
        </div>
      </div>
      <div class="download-section">
        <h2>DOWNLOAD</h2>
        <a class="btn btn-primary" href="${pack.downloads.github}" download>GitHub</a>
        <a class="btn btn-secondary" href="${pack.downloads.mirror}" download>Mirror</a>
      </div>
      ${textureHtml}
    `;
  } catch (e) {
    document.getElementById('pack-content').innerHTML = 'Pack not found';
  }
});
