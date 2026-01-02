const LISTS_KEY = 'vale_lists';

function getLists() {
  return JSON.parse(localStorage.getItem(LISTS_KEY) || '[]');
}

function saveLists(lists) {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

function createList(name) {
  const lists = getLists();
  if (lists.find(l => l.name === name)) return false;
  lists.push({ name, cover: '', packs: [] });
  saveLists(lists);
  return true;
}

function sanitizeName(name) {
  return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check for redirect from 404
  const redirectPath = sessionStorage.getItem('listPath');
  if (redirectPath) {
    sessionStorage.removeItem('listPath');
    const listId = redirectPath.split('/').filter(Boolean)[1];
    if (listId) {
      window.location.replace('/l/#' + listId);
      return;
    }
  }

  // Check hash for list detail
  const hash = window.location.hash.slice(1);
  if (hash) {
    loadListDetail(hash);
    return;
  }

  const grid = document.getElementById('list-grid');
  const createSection = document.getElementById('create-list-section');

  function updateUI() {
    const isAdmin = window.AUTH?.isLoggedIn();
    createSection.style.display = isAdmin ? 'block' : 'none';
    renderLists();
  }

  function renderLists() {
    const lists = getLists();
    if (lists.length === 0) {
      grid.innerHTML = '<p>No lists yet.</p>';
      return;
    }

    grid.innerHTML = lists.map(list => {
      const safeName = sanitizeName(list.name);
      return `
        <a class="pack-card" href="/l/#${safeName}" onclick="loadListDetail('${safeName}'); return false;">
          <div class="cover" style="background:#f0f0f0;aspect-ratio:2;display:flex;align-items:center;justify-content:center;border-bottom:2px solid #000;">
            <span style="font-size:24px;font-weight:bold;">${list.name}</span>
          </div>
          <div class="info">
            <div class="name">${list.name}</div>
            <div class="meta" style="font-size:12px;color:#666;">${list.packs.length} packs</div>
          </div>
        </a>
      `;
    }).join('');
  }

  window.addEventListener('auth-change', updateUI);
  updateUI();

  document.getElementById('create-list-btn').onclick = () => {
    const input = document.getElementById('new-list-name');
    const name = input.value.trim();
    if (name && createList(name)) {
      input.value = '';
      renderLists();
    }
  };
});

async function loadListDetail(listId) {
  const lists = getLists();
  const list = lists.find(l => sanitizeName(l.name) === listId);

  if (!list) {
    document.querySelector('.explore-section').innerHTML = '<p>List not found. <a href="/l/">Back to Lists</a></p>';
    return;
  }

  document.title = `${list.name} - VALE`;
  window.history.pushState({}, '', '/l/#' + listId);

  let allPacks = [];
  try {
    const index = await fetch('/data/index.json').then(r => r.json());
    allPacks = index.items;
  } catch (e) {}

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
        <h1 style="margin:16px 0 8px;">${list.name}</h1>
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
      document.getElementById('add-packs-btn')?.addEventListener('click', () => showAddPackModal(list, allPacks, render));
      document.getElementById('delete-list-btn')?.addEventListener('click', () => {
        if (confirm(`Delete list "${list.name}"?`)) {
          const newLists = lists.filter(l => l.name !== list.name);
          saveLists(newLists);
          window.location.href = '/l/';
        }
      });

      document.querySelectorAll('.remove-pack-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const packName = btn.dataset.pack;
          list.packs = list.packs.filter(p => p !== packName);
          saveLists(lists);
          render();
        };
      });
    }
  }

  window.addEventListener('auth-change', render);
  render();
}

function showAddPackModal(list, allPacks, onDone) {
  const lists = getLists();
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

  modal.querySelector('#confirm-add-packs').onclick = () => {
    selected.forEach(name => {
      if (!list.packs.includes(name)) list.packs.push(name);
    });
    saveLists(lists);
    modal.remove();
    onDone();
  };
}
