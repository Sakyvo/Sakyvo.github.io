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
        <a class="pack-card" href="/p/${pack.name}/">
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

document.addEventListener('DOMContentLoaded', async () => {
  const loader = new PackLoader();
  await loader.init();
  new PackSearch(loader);
});
