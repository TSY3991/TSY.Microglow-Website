(function () {
  "use strict";

  const TURNSTILE_SITE_KEY = "0x4AAAAAAD7mtP2SYLK59ifA";
  const CAPTCHA_TIMEOUT_MS = 20000;
  const auth = window.MicroglowAuth;
  const form = document.querySelector("[data-auth-form]");
  const emailInput = document.querySelector("[data-auth-email]");
  const passwordInput = document.querySelector("[data-auth-password]");
  const submitButton = document.querySelector("[data-auth-submit]");
  const status = document.querySelector("[data-auth-status]");
  const tabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
  const widgetContainer = document.querySelector("[data-turnstile-widget]");
  const signedPanel = document.querySelector("[data-signed-panel]");
  const signedLabel = document.querySelector("[data-signed-label]");
  const continueLink = document.querySelector("[data-auth-continue]");
  const backLink = document.querySelector("[data-auth-back]");
  const signOutButton = document.querySelector("[data-auth-signout]");
  let mode = "login";
  let widgetId = null;
  let pendingToken = null;
  let tokenResolvers = [];
  let isUpgradeFlow = false;

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone || "info";
  }

  function setBusy(busy) {
    form.setAttribute("aria-busy", String(busy));
    submitButton.disabled = busy;
    tabs.forEach((tab) => { tab.disabled = busy; });
  }

  function resolveCaptcha(token) {
    pendingToken = token;
    tokenResolvers.splice(0).forEach((resolve) => resolve(token));
  }

  function renderTurnstile() {
    if (!widgetContainer || !window.turnstile || widgetId !== null) return;
    widgetId = window.turnstile.render(widgetContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: resolveCaptcha,
      "expired-callback": () => { pendingToken = null; },
      "error-callback": () => {
        pendingToken = null;
        setStatus("安全驗證載入失敗，請重新整理後再試。", "error");
      }
    });
  }

  function waitForTurnstile(attempt) {
    if (window.turnstile?.render) {
      renderTurnstile();
      return;
    }
    if (attempt >= 50) {
      setStatus("安全驗證服務暫時無法載入。", "error");
      return;
    }
    window.setTimeout(() => waitForTurnstile(attempt + 1), 200);
  }

  async function getCaptchaToken() {
    if (pendingToken) {
      const token = pendingToken;
      pendingToken = null;
      if (widgetId !== null) window.turnstile?.reset(widgetId);
      return token;
    }

    return Promise.race([
      new Promise((resolve) => tokenResolvers.push(resolve)),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("請先完成安全驗證。")), CAPTCHA_TIMEOUT_MS);
      })
    ]);
  }

  function selectMode(nextMode) {
    mode = nextMode;
    tabs.forEach((tab) => {
      const selected = tab.dataset.authTab === mode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    if (isUpgradeFlow && mode === "signup") {
      submitButton.textContent = "升級為正式會員";
      setStatus("設定 Email 與密碼後，好友、房間與配對紀錄會保留在這個帳號。");
    } else if (isUpgradeFlow && mode === "login") {
      submitButton.textContent = "登入並繼續";
      setStatus("登入其他既有正式帳號會切換身分，目前訪客紀錄不會轉移。", "warning");
    } else {
      submitButton.textContent = mode === "login" ? "登入並繼續" : "建立會員帳號";
      setStatus(mode === "login" ? "輸入正式會員帳號。" : "建立帳號後將使用同一個會員 UID。");
    }
  }

  function showSignedSession(session) {
    form.hidden = true;
    document.querySelector(".auth-tabs").hidden = true;
    signedPanel.hidden = false;
    signedLabel.textContent = session.user.email || "微光正式會員";
  }

  async function restoreSession() {
    if (!auth) {
      setStatus("Supabase Auth client 載入失敗，請稍後再試。", "error");
      setBusy(true);
      return;
    }

    const { data, error } = await auth.getSession();
    if (error) {
      setStatus(error.message || "無法讀取登入狀態。", "error");
      return;
    }

    const session = data?.session;
    if (!session) {
      setStatus("輸入正式會員帳號。");
      return;
    }

    if (auth.isAnonymousUser(session.user)) {
      isUpgradeFlow = true;
      selectMode("signup");
      return;
    }

    showSignedSession(session);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!emailInput.checkValidity() || password.length < 8) {
      setStatus("請輸入有效 Email，密碼至少 8 個字元。", "error");
      return;
    }

    const upgrading = isUpgradeFlow && mode === "signup";
    setBusy(true);
    setStatus(upgrading ? "正在升級帳號…" : mode === "login" ? "正在登入…" : "正在建立帳號…");

    try {
      const callbackUrl = new URL("./callback.html", window.location.href).href;

      if (upgrading) {
        const result = await auth.client.auth.updateUser(
          { email, password },
          { emailRedirectTo: callbackUrl }
        );
        if (result.error) throw result.error;
        setStatus("帳號升級成功，好友與房間紀錄已保留，正在返回原服務…", "success");
        window.setTimeout(() => window.location.replace(returnTo), 350);
        return;
      }

      const captchaToken = await getCaptchaToken();
      const result = mode === "login"
        ? await auth.signIn({ email, password, captchaToken })
        : await auth.signUp({ email, password, captchaToken, emailRedirectTo: callbackUrl });

      if (result.error) throw result.error;
      if (!result.data?.session) {
        setStatus("註冊資料已送出，請依信箱提示完成驗證。", "success");
        return;
      }

      setStatus("登入成功，正在返回原服務…", "success");
      window.setTimeout(() => window.location.replace(returnTo), 350);
    } catch (error) {
      setStatus(error?.message || "登入失敗，請稍後再試。", "error");
    } finally {
      setBusy(false);
    }
  }

  const query = new URLSearchParams(window.location.search);
  const returnTo = auth
    ? auth.rememberReturnTo(query.get("returnTo"), auth.getPortalBaseUrl())
    : new URL("../", window.location.href).href;

  backLink.href = returnTo;
  continueLink.href = returnTo;
  tabs.forEach((tab) => tab.addEventListener("click", () => selectMode(tab.dataset.authTab)));
  form.addEventListener("submit", handleSubmit);
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    const { error } = await auth.signOut();
    if (error) {
      setStatus(error.message || "登出失敗。", "error");
      signOutButton.disabled = false;
      return;
    }
    window.location.reload();
  });

  waitForTurnstile(0);
  restoreSession();
})();
