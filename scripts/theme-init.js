// 外觀模式初始化：放在 <head> 以同步方式載入，避免載入時閃白。
// 偏好存在 localStorage "microglow-theme"：auto（預設，跟隨系統）／light／dark。
// 結果寫到 <html data-theme="light|dark" data-theme-pref="auto|light|dark">。
(function () {
  var KEY = "microglow-theme";
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function readPref() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function apply() {
    var pref = readPref();
    var dark = pref === "dark" || (pref === "auto" && !!(mq && mq.matches));
    root.setAttribute("data-theme", dark ? "dark" : "light");
    root.setAttribute("data-theme-pref", pref);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0b1819" : "#0e8f88");
    return pref;
  }

  function setPref(next) {
    try {
      if (next === "light" || next === "dark") localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch (e) {}
    return apply();
  }

  apply();
  if (mq) {
    var onChange = function () { apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply();
  });

  window.MicroglowTheme = { get: readPref, set: setPref };
})();
