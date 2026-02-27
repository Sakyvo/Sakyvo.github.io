(function() {
'use strict';

const KEY = 'vale-sbi-history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function renderList() {
  const list = document.getElementById('sbi-history-list');
  const detail = document.getElementById('sbi-history-detail');
  const history = getHistory();
  detail.hidden = true;
  if (history.length === 0) {
    list.innerHTML = '<p class="sbi-no-results">暂无搜索记录</p>';
    return;
  }
  list.innerHTML = history.map((h, i) =>
    '<div class="sbi-history-item" data-idx="' + i + '">' +
      '<img class="sbi-history-thumb" src="' + h.imageDataUrl + '">' +
      '<div class="sbi-history-meta">' +
        '<div>' + formatTime(h.timestamp) + '</div>' +
        '<div class="sbi-history-count">' + h.results.length + ' 个匹配</div>' +
      '</div>' +
    '</div>'
  ).join('');
  list.querySelectorAll('.sbi-history-item').forEach(el => {
    el.addEventListener('click', () => showDetail(parseInt(el.dataset.idx)));
  });
}

function showDetail(idx) {
  const history = getHistory();
  const h = history[idx];
  if (!h) return;
  const list = document.getElementById('sbi-history-list');
  const detail = document.getElementById('sbi-history-detail');
  list.hidden = true;
  detail.hidden = false;
  window.location.hash = '#' + (idx + 1);
  let html = '<button class="btn btn-secondary sbi-back-btn" id="sbi-back">← 返回列表</button>';
  html += '<img class="sbi-detail-img" src="' + h.imageDataUrl + '">';
  if (h.results.length === 0) {
    html += '<p class="sbi-no-results">无匹配结果</p>';
  } else {
    html += h.results.map(r => {
      const pct = Math.round(r.score * 100);
      return '<a class="sbi-result-card" href="/p/' + encodeURIComponent(r.name) + '/">' +
        '<div class="sbi-score">' + pct + '%</div>' +
        '<div class="sbi-result-info"><div class="sbi-result-name">' + r.name.replace(/_/g, ' ') + '</div></div>' +
        '<img class="sbi-result-cover" src="' + r.cover + '" onerror="this.src=\'' + r.packPng + '\'">' +
      '</a>';
    }).join('');
  }
  detail.innerHTML = html;
  document.getElementById('sbi-back').addEventListener('click', () => {
    window.location.hash = '';
    list.hidden = false;
    detail.hidden = true;
  });
}

function init() {
  renderList();
  const hash = window.location.hash;
  if (hash && hash.match(/^#\d+$/)) {
    showDetail(parseInt(hash.slice(1)) - 1);
  }
  window.addEventListener('hashchange', () => {
    const h = window.location.hash;
    if (!h || h === '#') renderList(), document.getElementById('sbi-history-list').hidden = false;
    else if (h.match(/^#\d+$/)) showDetail(parseInt(h.slice(1)) - 1);
  });
}

init();
})();
