class PackLoader {
  constructor() {
    this.index = null;
    this.loadedPages = new Set();
    this.pagesData = {};
    this.pageSize = 50;
    this.observer = new IntersectionObserver(
      entries => this.onIntersect(entries),
      { rootMargin: '200px' }
    );
  }

  async init() {
    this.index = await fetch('/data/index.json').then(r => r.json());
    this.renderPlaceholders();
    this.observeItems();
  }

  renderPlaceholders() {
    const grid = document.querySelector('.pack-grid');
    grid.innerHTML = this.index.items
      .map((item, i) => `
        <div class="pack-card" data-index="${i}" data-id="${item.id}" data-loaded="false">
          <div class="placeholder"></div>
          <div class="info">
            <div class="name">${item.name}</div>
          </div>
        </div>
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
    const data = await fetch(`/data/pages/page-${page}.json`).then(r => r.json());
    this.pagesData[page] = data.items;
    this.loadedPages.add(page);
  }

  getPackByIndex(index) {
    const page = Math.floor(index / this.pageSize) + 1;
    const offset = index % this.pageSize;
    return this.pagesData[page]?.[offset];
  }

  renderCard(el, pack) {
    el.innerHTML = `
      <img src="${pack.cover}" alt="${pack.name}" loading="lazy">
      <div class="info">
        <div class="name">${pack.name}</div>
        <div class="tags">
          ${pack.tags.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    `;
    el.onclick = () => location.href = `/pack/${pack.name}/`;
  }
}

window.PackLoader = PackLoader;
