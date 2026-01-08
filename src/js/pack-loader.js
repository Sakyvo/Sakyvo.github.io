class PackLoader {
  constructor() {
    this.index = null;
    this.loadedPages = new Set();
    this.pagesData = {};
    this.pageSize = 50;
    this.sortByDate = false;
    this.observer = new IntersectionObserver(
      entries => this.onIntersect(entries),
      { rootMargin: '200px' }
    );
  }

  async init() {
    this.index = await fetch('data/index.json').then(r => r.json());
    this.renderPlaceholders();
    this.observeItems();
  }

  setSortByDate(val) {
    this.sortByDate = val;
    this.renderPlaceholders();
    this.observeItems();
  }

  getItems() {
    return this.sortByDate ? [...this.index.items].reverse() : this.index.items;
  }

  renderPlaceholders() {
    const grid = document.querySelector('.pack-grid');
    const items = this.getItems();
    grid.innerHTML = items
      .map((item, i) => `
        <a class="pack-card" data-index="${i}" data-id="${item.name}" data-loaded="false" href="p/${item.name}/">
          <div class="placeholder"></div>
          <div class="info">
            <div class="name">${item.displayName}</div>
          </div>
        </a>
      `)
      .join('');
  }

  observeItems() {
    document.querySelectorAll('.pack-card[data-loaded="false"]')
      .forEach(el => this.observer.observe(el));
  }

  async onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const el = entry.target;
      const index = parseInt(el.dataset.index);
      const page = Math.floor(index / this.pageSize) + 1;

      if (!this.loadedPages.has(page)) {
        await this.loadPage(page);
      }

      const pack = this.getPackByIndex(index);
      if (pack) this.renderCard(el, pack);

      el.dataset.loaded = 'true';
      this.observer.unobserve(el);
    }
  }

  async loadPage(page) {
    const data = await fetch(`data/pages/page-${page}.json`).then(r => r.json());
    this.pagesData[page] = data.items;
    this.loadedPages.add(page);
  }

  getPackByIndex(index) {
    const items = this.getItems();
    const item = items[index];
    if (!item) return null;
    const origIndex = this.index.items.indexOf(item);
    const page = Math.floor(origIndex / this.pageSize) + 1;
    const offset = origIndex % this.pageSize;
    return this.pagesData[page]?.[offset];
  }

  renderCard(el, pack) {
    el.innerHTML = `
      <img class="cover" src="${pack.cover}" alt="${pack.displayName}" loading="lazy">
      <div class="info">
        <img class="pack-icon" src="${pack.packPng}" alt="">
        <div class="name">${pack.displayName}</div>
      </div>
    `;
  }
}

window.PackLoader = PackLoader;
