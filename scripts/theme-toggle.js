// 外觀切換按鈕：自動（跟隨系統）→ 淺色 → 深色 → 自動。依賴 theme-init.js。
(function () {
  var button = document.querySelector("[data-theme-toggle]");
  var api = window.MicroglowTheme;
  if (!button || !api) return;

  var ORDER = ["auto", "light", "dark"];
  var INFO = {
    auto: { icon: "◐", label: "自動", hint: "跟隨系統" },
    light: { icon: "☀", label: "淺色", hint: "淺色" },
    dark: { icon: "☾", label: "深色", hint: "深色" }
  };
  var iconEl = button.querySelector("[data-theme-icon]");
  var labelEl = button.querySelector("[data-theme-label]");

  function render(pref) {
    var info = INFO[pref] || INFO.auto;
    if (iconEl) iconEl.textContent = info.icon;
    if (labelEl) labelEl.textContent = info.label;
    button.setAttribute("aria-label", "外觀模式：" + info.hint + "，點擊切換");
    button.setAttribute("title", "外觀模式：" + info.hint);
  }

  button.addEventListener("click", function () {
    var next = ORDER[(ORDER.indexOf(api.get()) + 1) % ORDER.length];
    render(api.set(next));
  });
  window.addEventListener("storage", function () { render(api.get()); });
  render(api.get());
})();
