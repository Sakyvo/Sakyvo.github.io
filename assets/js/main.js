class PackSearch {
  constructor(loader) {
    this.loader = loader;
    this.searchInput = document.querySelector('#search-input');
    this.resultsContainer = document.querySelector('.pack-grid');
    this.searchInput.addEventListener('input', this.debounce(() => this.search(), 300));
  }

  search() {
    const query = this.searchInput.value.trim().toLowerCase();

    if (!query) {
      this.loader.renderPlaceholders();
      this.loader.observeItems();
      return;
    }

    const results = this.loader.index.items.filter(pack =>
      pack.displayName.toLowerCase().includes(query) ||
      pack.name.toLowerCase().includes(query)
    );

    this.renderResults(results);
  }

  renderResults(results) {
    this.resultsContainer.innerHTML = results
      .map(pack => `
        <a class="pack-card" href="${pack.name}/">
          <img class="cover" src="${pack.cover}" alt="${pack.displayName}">
          <div class="info">
            <img class="pack-icon" src="${pack.packPng}" alt="">
            <div class="name">${pack.displayName}</div>
          </div>
        </a>
      `)
      .join('');
  }

  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
}

class ListManager {
  constructor() {
    this.lists = JSON.parse(localStorage.getItem('vale_lists') || '[]');
  }

  getLists() { return this.lists; }

  saveLists() {
    localStorage.setItem('vale_lists', JSON.stringify(this.lists));
  }

  createList(name) {
    if (this.lists.find(l => l.name === name)) return false;
    this.lists.push({ name, cover: '', packs: [] });
    this.saveLists();
    return true;
  }

  deleteList(name) {
    this.lists = this.lists.filter(l => l.name !== name);
    this.saveLists();
  }

  updateList(name, data) {
    const list = this.lists.find(l => l.name === name);
    if (list) Object.assign(list, data);
    this.saveLists();
  }

  getPacksInList(name) {
    const list = this.lists.find(l => l.name === name);
    return list ? list.packs : [];
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const loader = new PackLoader();
  await loader.init();
  new PackSearch(loader);

  const listManager = new ListManager();
  window.listManager = listManager;

  // Tab switching
  const tabs = document.querySelectorAll('.tab-btn');
  const packGrid = document.querySelector('.pack-grid');
  const listsContainer = document.querySelector('.lists-container');

  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.dataset.tab === 'explore') {
        packGrid.style.display = '';
        listsContainer.style.display = 'none';
      } else {
        packGrid.style.display = 'none';
        listsContainer.style.display = '';
        renderLists();
      }
    };
  });

  function renderLists() {
    const lists = listManager.getLists();
    const isAdmin = window.AUTH?.isLoggedIn();

    let html = '';
    if (isAdmin) {
      html += `<div class="create-list-form" style="margin-bottom:24px;">
        <div class="tag-input-group">
          <input type="text" id="new-list-name" placeholder="New list name">
          <button class="btn btn-primary" id="create-list-btn">CREATE</button>
        </div>
      </div>`;
    }

    if (lists.length === 0) {
      html += '<p>No lists yet.</p>';
    } else {
      html += lists.map(list => `
        <div class="list-card" data-list="${list.name}">
          <div class="list-header">
            <span class="list-name">${list.name}</span>
            <span class="list-count">${list.packs.length} packs</span>
          </div>
          ${isAdmin ? `<button class="btn btn-secondary delete-list-btn" data-name="${list.name}">DELETE</button>` : ''}
        </div>
      `).join('');
    }

    listsContainer.innerHTML = html;

    if (isAdmin) {
      document.getElementById('create-list-btn')?.addEventListener('click', () => {
        const name = document.getElementById('new-list-name').value.trim();
        if (name && listManager.createList(name)) {
          renderLists();
        }
      });

      listsContainer.querySelectorAll('.delete-list-btn').forEach(btn => {
        btn.onclick = () => {
          if (confirm(`Delete list "${btn.dataset.name}"?`)) {
            listManager.deleteList(btn.dataset.name);
            renderLists();
          }
        };
      });
    }
  }
});
