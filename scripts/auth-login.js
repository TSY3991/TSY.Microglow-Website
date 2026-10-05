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
  const policy = window.MicroglowPasswordPolicy;
  const forgotButton = document.querySelector("[data-auth-forgot]");
  const pwHint = document.querySelector("[data-auth-pw-hint]");
  const mfaForm = document.querySelector("[data-mfa-form]");
  const mfaCodeInput = document.querySelector("[data-mfa-code]");
  const mfaStatus = document.querySelector("[data-mfa-status]");
  const mfaCancel = document.querySelector("[data-mfa-cancel]");
  const mfaState = document.querySelector("[data-mfa-state]");
  const mfaEnrollButton = document.querySelector("[data-mfa-enroll]");
  const mfaEnrollPanel = document.querySelector("[data-mfa-enroll-panel]");
  const mfaQr = document.querySelector("[data-mfa-qr]");
  const mfaSecret = document.querySelector("[data-mfa-secret]");
  const mfaEnrollCode = document.querySelector("[data-mfa-enroll-code]");
  const mfaEnrollConfirm = document.querySelector("[data-mfa-enroll-confirm]");
  const mfaEnrollCancel = document.querySelector("[data-mfa-enroll-cancel]");
  const mfaDisable = document.querySelector("[data-mfa-disable]");
  const mfaBoxStatus = document.querySelector("[data-mfa-box-status]");
  let pendingFactorId = null;
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
    if (pwHint) pwHint.hidden = mode === "login";
    if (forgotButton) forgotButton.hidden = mode !== "login";
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
    refreshMfaBox();
  }

  function setBoxStatus(message, tone) {
    mfaBoxStatus.textContent = message;
    mfaBoxStatus.dataset.tone = tone || "info";
  }

  async function verifiedTotpFactors() {
    const { data, error } = await auth.client.auth.mfa.listFactors();
    if (error) throw error;
    return data?.totp || [];
  }

  async function refreshMfaBox() {
    try {
      const factors = await verifiedTotpFactors();
      const active = factors.length > 0;
      mfaState.textContent = active
        ? "已啟用：登入時需要驗證器 App 的 6 位數代碼。"
        : "尚未啟用。啟用後，即使密碼外洩，別人也無法登入你的帳號。";
      mfaEnrollButton.hidden = active;
      mfaDisable.hidden = !active;
    } catch (error) {
      mfaState.textContent = error?.message || "無法讀取兩步驟驗證狀態。";
    }
  }

  async function startEnroll() {
    mfaEnrollButton.disabled = true;
    setBoxStatus("正在建立驗證金鑰…");
    try {
      // 清掉先前沒完成的未驗證 factor，避免名稱衝突
      const { data: list } = await auth.client.auth.mfa.listFactors();
      for (const factor of (list?.all || []).filter((f) => f.status === "unverified")) {
        await auth.client.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error } = await auth.client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `微光會員 ${new Date().toISOString().slice(0, 10)}`
      });
      if (error) throw error;
      pendingFactorId = data.id;
      mfaQr.src = data.totp.qr_code;
      mfaSecret.textContent = data.totp.secret;
      mfaEnrollPanel.hidden = false;
      mfaEnrollButton.hidden = true;
      setBoxStatus("");
    } catch (error) {
      setBoxStatus(error?.message || "無法啟用兩步驟驗證。", "error");
    } finally {
      mfaEnrollButton.disabled = false;
    }
  }

  async function confirmEnroll() {
    const code = mfaEnrollCode.value.replace(/\s+/g, "");
    if (!pendingFactorId || !/^\d{6}$/.test(code)) {
      setBoxStatus("請輸入驗證器 App 顯示的 6 位數代碼。", "error");
      return;
    }
    mfaEnrollConfirm.disabled = true;
    try {
      const { error } = await auth.client.auth.mfa.challengeAndVerify({ factorId: pendingFactorId, code });
      if (error) throw error;
      pendingFactorId = null;
      mfaEnrollCode.value = "";
      mfaEnrollPanel.hidden = true;
      setBoxStatus("兩步驟驗證已啟用。", "success");
      await refreshMfaBox();
    } catch (error) {
      setBoxStatus(error?.message || "代碼不正確，請重試。", "error");
    } finally {
      mfaEnrollConfirm.disabled = false;
    }
  }

  async function cancelEnroll() {
    if (pendingFactorId) {
      await auth.client.auth.mfa.unenroll({ factorId: pendingFactorId }).catch(() => {});
      pendingFactorId = null;
    }
    mfaEnrollPanel.hidden = true;
    setBoxStatus("");
    await refreshMfaBox();
  }

  async function disableMfa() {
    if (!window.confirm("確定要停用兩步驟驗證嗎？帳號安全性會降低。")) return;
    mfaDisable.disabled = true;
    try {
      const factors = await verifiedTotpFactors();
      for (const factor of factors) {
        const { error } = await auth.client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      setBoxStatus("已停用兩步驟驗證。", "success");
      await refreshMfaBox();
    } catch (error) {
      setBoxStatus(error?.message || "無法停用，請重新登入後再試。", "error");
    } finally {
      mfaDisable.disabled = false;
    }
  }

  // 密碼登入後若帳號有 TOTP，需補完 AAL2 才算登入完成
  async function needsMfaChallenge() {
    const { data, error } = await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  }

  function showMfaForm() {
    form.hidden = true;
    document.querySelector(".auth-tabs").hidden = true;
    mfaForm.hidden = false;
    mfaCodeInput.value = "";
    mfaCodeInput.focus();
  }

  async function handleMfaSubmit(event) {
    event.preventDefault();
    const code = mfaCodeInput.value.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      mfaStatus.textContent = "請輸入 6 位數代碼。";
      mfaStatus.dataset.tone = "error";
      return;
    }
    try {
      const factors = await verifiedTotpFactors();
      const factor = factors[0];
      if (!factor) throw new Error("找不到驗證器，請重新登入。");
      const { error } = await auth.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw error;
      mfaStatus.textContent = "驗證成功，正在返回原服務…";
      mfaStatus.dataset.tone = "success";
      window.setTimeout(() => window.location.replace(returnTo), 350);
    } catch (error) {
      mfaStatus.textContent = error?.message || "代碼不正確，請重試。";
      mfaStatus.dataset.tone = "error";
    }
  }

  async function handleForgot() {
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      setStatus("請先在上方輸入註冊時使用的 Email，再按「忘記密碼」。", "error");
      return;
    }
    setBusy(true);
    setStatus("正在寄送重設密碼信…");
    try {
      const captchaToken = await getCaptchaToken();
      const callbackUrl = new URL("./callback.html", window.location.href).href;
      const { error } = await auth.client.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl,
        captchaToken
      });
      if (error && error.status && error.status >= 500) throw error;
      // 不論帳號是否存在都顯示相同訊息，避免被用來探測會員 Email
      setStatus("若此 Email 已註冊，重設密碼信會在幾分鐘內寄到，請檢查信箱（含垃圾信件匣）。", "success");
    } catch (error) {
      setStatus(error?.message || "寄送失敗，請稍後再試。", "error");
    } finally {
      setBusy(false);
    }
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

    try {
      if (await needsMfaChallenge()) {
        showMfaForm();
        return;
      }
    } catch (_) { /* 查不到 AAL 時走一般流程 */ }

    showSignedSession(session);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!emailInput.checkValidity() || !password) {
      setStatus("請輸入有效 Email 與密碼。", "error");
      return;
    }

    // 登入不重驗密碼強度（舊帳號仍可登入）；註冊／升級才套用新規則
    if (mode === "signup") {
      setBusy(true);
      setStatus("正在檢查密碼強度…");
      const problem = policy ? await policy.validate(password, email) : null;
      setBusy(false);
      if (problem) {
        setStatus(problem, "error");
        return;
      }
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
        setStatus("註冊資料已送出！請到信箱點擊確認信完成驗證後再登入（沒收到請看垃圾信件匣）。", "success");
        return;
      }

      if (mode === "login" && await needsMfaChallenge()) {
        setStatus("");
        showMfaForm();
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
  forgotButton?.addEventListener("click", handleForgot);
  mfaForm?.addEventListener("submit", handleMfaSubmit);
  mfaCancel?.addEventListener("click", async () => {
    await auth.signOut();
    window.location.reload();
  });
  mfaEnrollButton?.addEventListener("click", startEnroll);
  mfaEnrollConfirm?.addEventListener("click", confirmEnroll);
  mfaEnrollCancel?.addEventListener("click", cancelEnroll);
  mfaDisable?.addEventListener("click", disableMfa);
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
