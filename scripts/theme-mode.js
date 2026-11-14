(function () {
  'use strict';
  var storageKey = 'tsyMicroglowTheme.v1';
  var root = document.documentElement;
  var theme = 'light';
  try { var saved = window.localStorage.getItem(storageKey); if (saved === 'dark' || saved === 'light') theme = saved; } catch (_) {}
  root.setAttribute('data-theme', theme);

  function updateMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var value = theme === 'dark' ? meta.getAttribute('data-dark-theme-color') : meta.getAttribute('data-light-theme-color');
    if (value) meta.setAttribute('content', value);
  }
  function updateLogo() {
    var logo = document.querySelector('.brand-logo[data-light-src][data-dark-src]');
    if (!logo) return;
    var source = theme === 'dark' ? logo.getAttribute('data-dark-src') : logo.getAttribute('data-light-src');
    if (source && logo.getAttribute('src') !== source) logo.setAttribute('src', source);
  }
  function updateButton(button) {
    var dark = theme === 'dark';
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    button.setAttribute('aria-label', dark ? '切換至淺色模式' : '切換至深色模式');
    button.textContent = dark ? '☀ 淺色' : '☾ 深色';
  }
  function setTheme(value, persist) {
    theme = value === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    if (persist) { try { window.localStorage.setItem(storageKey, theme); } catch (_) {} }
    document.querySelectorAll('[data-theme-toggle]').forEach(updateButton);
    updateMeta();
    updateLogo();
    document.dispatchEvent(new CustomEvent('tsy-theme-change', { detail: { theme: theme } }));
  }
  function mountButton() {
    if (document.querySelector('[data-theme-toggle]')) { updateButton(document.querySelector('[data-theme-toggle]')); return true; }
    var targets = ['[data-theme-controls]', '.header-actions', '.topbar', '.detail-topbar', '.kit-topbar', '.quiz-header', '.about-header', '.app-header', 'header', 'nav', '.panel', 'main'];
    var host = null;
    for (var i = 0; i < targets.length && !host; i++) host = document.querySelector(targets[i]);
    if (!host) return false;
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'tsy-theme-toggle'; button.setAttribute('data-theme-toggle', ''); button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', function () { setTheme(theme === 'dark' ? 'light' : 'dark', true); });
    host.insertBefore(button, host.firstChild); updateButton(button); return true;
  }
  updateMeta();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { updateMeta(); updateLogo(); if (!mountButton()) { var observer = new MutationObserver(function () { if (mountButton()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); setTimeout(function () { observer.disconnect(); }, 5000); } }); else { updateMeta(); updateLogo(); mountButton(); }
  window.addEventListener('storage', function (event) { if (event.key === storageKey && (event.newValue === 'dark' || event.newValue === 'light')) setTheme(event.newValue, false); });
})();
