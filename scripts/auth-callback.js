(function () {
  "use strict";

  const auth = window.MicroglowAuth;
  const status = document.querySelector("[data-callback-status]");
  const link = document.querySelector("[data-callback-link]");
  const portalFallback = auth?.getPortalBaseUrl() || new URL("../", window.location.href).href;

  function showError(message) {
    status.textContent = message;
    link.hidden = false;
    link.href = portalFallback;
    link.textContent = "返回入口網站";
  }

  async function completeCallback() {
    if (!auth) {
      showError("Supabase Auth client 載入失敗，請返回入口網站重試。");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");
    const code = params.get("code");

    if (errorDescription) {
      window.history.replaceState({}, document.title, window.location.pathname);
      showError(errorDescription);
      return;
    }

    try {
      if (code) {
        const { error } = await auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      const { data, error } = await auth.getSession();
      if (error) throw error;
      if (!data?.session) throw new Error("找不到有效登入 session，請重新登入。");

      const returnTo = auth.consumeReturnTo(portalFallback);
      status.textContent = "登入確認完成，正在返回原服務…";
      link.hidden = false;
      link.href = returnTo;
      link.textContent = "立即繼續";
      window.setTimeout(() => window.location.replace(returnTo), 500);
    } catch (error) {
      showError(error?.message || "登入確認失敗，請重新登入。");
    }
  }

  completeCallback();
})();
