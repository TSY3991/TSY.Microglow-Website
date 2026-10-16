(() => {
  'use strict';
  const cards = Array.from(document.querySelectorAll('[data-tool]'));
  const search = document.querySelector('#tool-search');
  const buttons = Array.from(document.querySelectorAll('[data-filter]'));
  const count = document.querySelector('#tool-count');
  const empty = document.querySelector('#tool-empty');
  const status = document.querySelector('#copy-status');
  let category = 'all';
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    cards.forEach(card => {
      card.hidden = !((category === 'all' || card.dataset.category === category) && (!query || card.dataset.search.includes(query)));
      if (!card.hidden) visible += 1;
    });
    count.textContent = visible + ' / ' + cards.length + ' 個工具';
    empty.hidden = visible > 0;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
  }
  document.querySelector('[data-controls]').hidden = false;
  search.addEventListener('input', filter);
  buttons.forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; filter(); }));
  document.querySelector('#clear-search').addEventListener('click', () => { search.value = ''; category = 'all'; filter(); search.focus(); });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    const text = source.value === undefined ? source.textContent : source.value;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '';
      requestAnimationFrame(() => { status.textContent = button.dataset.copy === 'classroom-prompt' ? '已複製引導文字與合集網址，可貼到 Codex／Claude Code。' : '已複製檢查方式。'; });
    } catch {
      const selection = window.getSelection();
      if (source instanceof HTMLTextAreaElement) { source.focus(); source.select(); }
      else { const range = document.createRange(); range.selectNodeContents(source); selection.removeAllRanges(); selection.addRange(range); }
      status.textContent = '瀏覽器未允許自動複製，已選取文字；請手動複製。';
    }
  }));
  filter();
})();
