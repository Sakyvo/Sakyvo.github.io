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
      pack.name.toLowerCase().includes(query) ||
      pack.tags.some(tag => tag.toLowerCase().includes(query))
    );

    this.renderResults(results);
  }

  renderResults(results) {
    this.resultsContainer.innerHTML = results
      .map(pack => `
        <div class="pack-card" onclick="location.href='/pack/${pack.name}/'">
          <img src="${pack.cover}" alt="${pack.name}">
          <div class="info">
            <div class="name">${pack.name}</div>
            <div class="tags">
              ${pack.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
          </div>
        </div>
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

document.addEventListener('DOMContentLoaded', async () => {
  const loader = new PackLoader();
  await loader.init();
  new PackSearch(loader);
});
