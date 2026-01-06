let listsData = [];
let allPacks = [];

const LIST_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>List - VALE</title>
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  <header>
    <a href="/" class="logo">VALE</a>
    <nav></nav>
  </header>
  <section class="hero" style="padding:40px 0;">
    <div class="search-box">
      <input type="text" id="list-search" placeholder="Search lists..." style="display:none;">
      <button class="search-btn" style="display:none;">🔍</button>
    </div>
  </section>
  <section class="explore-section">
    <div class="section-header">
      <div class="section-tabs">
        <a href="/" class="tab-btn">EXPLORE</a>
        <a href="/l/" class="tab-btn active">LISTS</a>
      </div>
    </div>
    <div class="list-grid" id="list-grid"></div>
  </section>
  <footer><p>VALE Project</p></footer>
  <script src="/assets/js/auth.js"></script>
  <script src="/assets/js/list.js"></script>
</body>
</html>`;

async function loadLists() {
  try {
    const res = await fetch('/l/lists.json?t=' + Date.now());
    listsData = await res.json();
    localStorage.setItem('vale_lists', JSON.stringify(listsData));
  } catch (e) {
    const cached = localStorage.getItem('vale_lists');
    listsData = cached ? JSON.parse(cached) : [];
  }
  return listsData;
}

async function saveLists() {
  localStorage.setItem('vale_lists', JSON.stringify(listsData));
  const token = AUTH.getToken();
  if (!token) return false;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(listsData, null, 2))));

  let sha;
  try {
    const res = await fetch(`https://api.github.com/repos/${AUTH.REPO_OWNER}/${AUTH.REPO_NAME}/contents/l/lists.json`, {
      headers: { Authorization: `token ${token}` }
    });
    if (res.ok) sha = (await res.json()).sha;
  } catch (e) {}

  const res = await fetch(`https://api.github.com/repos/${AUTH.REPO_OWNER}/${AUTH.REPO_NAME}/contents/l/lists.json`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update lists', content, sha })
  });
  return res.ok;
}

async function createListPage(listId) {
  const token = AUTH.getToken();
  if (!token) return false;

  const content = btoa(unescape(encodeURIComponent(LIST_PAGE_HTML)));
  const path = `l/${listId}/index.html`;

  const res = await fetch(`https://api.github.com/repos/${AUTH.REPO_OWNER}/${AUTH.REPO_NAME}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Create list page: ${listId}`, content })
  });
  return res.ok;
}

async function deleteListPage(listId) {
  const token = AUTH.getToken();
  if (!token) throw new Error('Not logged in');

  const path = `l/${listId}/index.html`;

  let sha;
  const getRes = await fetch(`https://api.github.com/repos/${AUTH.REPO_OWNER}/${AUTH.REPO_NAME}/contents/${path}`, {
    headers: { Authorization: `token ${token}` }
  });
  if (getRes.status === 404) return true;
  if (!getRes.ok) throw new Error('Failed to get file');
  sha = (await getRes.json()).sha;

  const res = await fetch(`https://api.github.com/repos/${AUTH.REPO_OWNER}/${AUTH.REPO_NAME}/contents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Delete list page: ${listId}`, sha })
  });
  if (!res.ok) throw new Error('Failed to delete from repo');
  return true;
}

function sanitizeName(name) {
  return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

document.addEventListener('DOMContentLoaded', async () => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'l' && pathParts[1]) {
    await loadLists();
    try {
      const index = await fetch('/data/index.json').then(r => r.json());
      allPacks = index.items;
    } catch (e) {}
    loadListDetail(pathParts[1]);
    return;
  }

  await loadLists();

  const grid = document.getElementById('list-grid');
  const searchInput = document.getElementById('list-search');

  function renderLists(query = '') {
    const filtered = listsData.filter(l =>
      l.name.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      grid.innerHTML = query ? '<p>No lists found.</p>' : '<p>No lists yet.</p>';
      return;
    }

    grid.innerHTML = filtered.map(list => {
      const safeName = sanitizeName(list.name);
      return `
        <a class="pack-card" href="/l/${safeName}/">
          <div class="cover" style="background:#f0f0f0;aspect-ratio:2;display:flex;align-items:center;justify-content:center;border-bottom:2px solid #000;">
            ${list.cover ? `<img src="${list.cover}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:24px;font-weight:bold;">${list.name}</span>`}
          </div>
          <div class="info">
            <div class="name">${list.name}</div>
            <div class="meta" style="font-size:12px;color:#666;">${list.packs.length} packs</div>
          </div>
        </a>
      `;
    }).join('');
  }

  function updateUI() {
    const isAdmin = window.AUTH?.isLoggedIn();
    document.getElementById('manage-btn').style.display = isAdmin ? 'inline-block' : 'none';
    renderLists(searchInput.value);
  }

  searchInput.oninput = () => renderLists(searchInput.value);

  document.getElementById('manage-btn').onclick = showManageModal;

  window.addEventListener('auth-change', updateUI);
  updateUI();
});

function showManageModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:500px;">
      <h2>MANAGE LISTS</h2>
      <div class="tag-input-group" style="margin-bottom:16px;">
        <input type="text" id="new-list-name" placeholder="New list name">
        <button class="btn btn-primary" id="create-list-btn">CREATE</button>
      </div>
      <div id="manage-list" style="max-height:300px;overflow-y:auto;"></div>
      <div class="modal-buttons" style="margin-top:16px;">
        <button class="btn btn-secondary" id="close-manage">CLOSE</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function renderManageList() {
    const listEl = modal.querySelector('#manage-list');
    listEl.innerHTML = listsData.map((l, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;">
        <span style="flex:1;">${l.name}</span>
        <button class="btn btn-secondary delete-list-btn" data-index="${i}" style="padding:4px 8px;">DELETE</button>
      </div>
    `).join('') || '<p style="color:#666;">No lists</p>';

    listEl.querySelectorAll('.delete-list-btn').forEach(btn => {
      btn.onclick = async () => {
        const idx = parseInt(btn.dataset.index);
        const name = listsData[idx].name;
        const listId = sanitizeName(name);
        if (await showConfirm(`Delete list "${name}"?`)) {
          try {
            await deleteListPage(listId);
            listsData.splice(idx, 1);
            await saveLists();
            location.reload();
          } catch (e) {
            alert('Delete failed: ' + e.message);
          }
        }
      };
    });
  }

  modal.querySelector('#create-list-btn').onclick = async () => {
    const input = modal.querySelector('#new-list-name');
    const name = input.value.trim();
    if (!name) return;
    if (listsData.find(l => l.name === name)) {
      alert('List already exists');
      return;
    }
    const listId = sanitizeName(name);
    listsData.push({ name, cover: '', description: '', packs: [] });
    await saveLists();
    await createListPage(listId);
    input.value = '';
    renderManageList();
    location.reload();
  };

  modal.querySelector('#close-manage').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  renderManageList();
}

async function loadListDetail(listId) {
  const list = listsData.find(l => sanitizeName(l.name) === listId);

  if (!list) {
    document.querySelector('.explore-section').innerHTML = '<p>List not found. <a href="/l/">Back to Lists</a></p>';
    return;
  }

  document.title = `${list.name} - VALE`;

  if (allPacks.length === 0) {
    try {
      const index = await fetch('/data/index.json').then(r => r.json());
      allPacks = index.items;
    } catch (e) {}
  }

  function render() {
    const isAdmin = window.AUTH?.isLoggedIn();
    const packsInList = list.packs.map(name => allPacks.find(p => p.name === name)).filter(Boolean);

    document.querySelector('.explore-section').innerHTML = `
      <div class="section-header">
        <div class="section-tabs">
          <a href="/" class="tab-btn">EXPLORE</a>
          <a href="/l/" class="tab-btn active">LISTS</a>
        </div>
      </div>
      <div style="margin-bottom:24px;">
        <a href="/l/" class="back-link">← Back to Lists</a>
        <div style="display:flex;align-items:center;gap:12px;margin:16px 0 8px;">
          <h1 style="margin:0;">${list.name}</h1>
          ${isAdmin ? `<button class="btn btn-secondary" id="edit-list-btn" style="padding:4px 12px;">EDIT</button>` : ''}
        </div>
        ${list.description ? `<p style="color:#666;margin-bottom:8px;">${list.description}</p>` : ''}
        <p class="meta">${list.packs.length} packs</p>
      </div>
      ${isAdmin ? `
        <div style="margin-bottom:24px;">
          <button class="btn btn-primary" id="add-packs-btn">ADD PACKS</button>
          <button class="btn btn-secondary" id="delete-list-btn">DELETE LIST</button>
        </div>
      ` : ''}
      <div class="pack-grid">
        ${packsInList.length === 0 ? '<p>No packs in this list.</p>' : packsInList.map(pack => `
          <div class="pack-card" style="position:relative;">
            <a href="/p/${pack.name}/" style="display:block;">
              <img class="cover" src="${pack.cover}" alt="${pack.displayName}">
              <div class="info">
                <img class="pack-icon" src="${pack.packPng}" alt="">
                <div class="name">${pack.displayName}</div>
              </div>
            </a>
            ${isAdmin ? `<button class="remove-pack-btn" data-pack="${pack.name}" style="position:absolute;top:8px;right:8px;background:#fff;border:1px solid #000;padding:4px 8px;cursor:pointer;">×</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    if (isAdmin) {
      document.getElementById('edit-list-btn')?.addEventListener('click', () => showEditModal(list, render));
      document.getElementById('add-packs-btn')?.addEventListener('click', () => showAddPackModal(list, render));
      document.getElementById('delete-list-btn')?.addEventListener('click', async () => {
        if (await showConfirm(`Delete list "${list.name}"?`)) {
          try {
            const listId = sanitizeName(list.name);
            await deleteListPage(listId);
            listsData = listsData.filter(l => l.name !== list.name);
            await saveLists();
            window.location.href = '/l/';
          } catch (e) {
            alert('Delete failed: ' + e.message);
          }
        }
      });

      document.querySelectorAll('.remove-pack-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const packName = btn.dataset.pack;
          if (await showConfirm(`Remove "${packName}" from list?`)) {
            list.packs = list.packs.filter(p => p !== packName);
            await saveLists();
            render();
          }
        };
      });
    }
  }

  window.addEventListener('auth-change', render);
  render();
}

function showEditModal(list, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:400px;">
      <h2>EDIT LIST</h2>
      <div class="form-group">
        <label>NAME</label>
        <input type="text" id="edit-name" value="${list.name}">
      </div>
      <div class="form-group">
        <label>COVER URL</label>
        <input type="text" id="edit-cover" value="${list.cover || ''}" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>DESCRIPTION</label>
        <textarea id="edit-desc" rows="3" style="width:100%;padding:8px;border:2px solid #000;">${list.description || ''}</textarea>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-primary" id="save-edit">SAVE</button>
        <button class="btn btn-secondary" id="cancel-edit">CANCEL</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#save-edit').onclick = async () => {
    const newName = modal.querySelector('#edit-name').value.trim();
    if (!newName) return;
    list.name = newName;
    list.cover = modal.querySelector('#edit-cover').value.trim();
    list.description = modal.querySelector('#edit-desc').value.trim();
    await saveLists();
    modal.remove();
    window.history.replaceState({}, '', '/l/' + sanitizeName(newName) + '/');
    onDone();
  };

  modal.querySelector('#cancel-edit').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function showAddPackModal(list, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:500px;">
      <h2>Add Packs</h2>
      <input type="text" id="pack-search" placeholder="Search packs..." style="width:100%;padding:12px;border:2px solid #000;margin-bottom:16px;">
      <div id="pack-list" style="max-height:300px;overflow-y:auto;"></div>
      <div class="modal-buttons">
        <button class="btn btn-primary" id="confirm-add-packs">ADD SELECTED</button>
        <button class="btn btn-secondary" id="cancel-add-packs">CANCEL</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const selected = new Set();
  const searchInput = modal.querySelector('#pack-search');
  const packList = modal.querySelector('#pack-list');

  function renderPackList(query = '') {
    const filtered = allPacks.filter(p =>
      !list.packs.includes(p.name) &&
      (p.displayName.toLowerCase().includes(query) || p.name.toLowerCase().includes(query))
    );

    packList.innerHTML = filtered.map(p => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;cursor:pointer;">
        <input type="checkbox" value="${p.name}" ${selected.has(p.name) ? 'checked' : ''}>
        <img src="${p.packPng}" style="width:32px;height:32px;image-rendering:pixelated;">
        <span>${p.displayName}</span>
      </label>
    `).join('') || '<p style="padding:8px;color:#666;">No packs found</p>';

    packList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.value);
        else selected.delete(cb.value);
      };
    });
  }

  searchInput.oninput = () => renderPackList(searchInput.value.toLowerCase());
  renderPackList();

  modal.querySelector('#cancel-add-packs').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.querySelector('#confirm-add-packs').onclick = async () => {
    selected.forEach(name => {
      if (!list.packs.includes(name)) list.packs.push(name);
    });
    modal.remove();
    onDone();
    saveLists();
  };
}

function showConfirm(message) {
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
