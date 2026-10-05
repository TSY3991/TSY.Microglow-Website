(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(function () {
      /* 註冊失敗不影響一般使用 */
    });
  });
})();
