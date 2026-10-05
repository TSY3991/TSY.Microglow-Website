(function () {
  "use strict";

  const auth = window.MicroglowAuth;
  const status = document.querySelector("[data-callback-status]");
  const link = document.querySelector("[data-callback-link]");
  const policy = window.MicroglowPasswordPolicy;
  const recoveryForm = document.querySelector("[data-recovery-form]");
  const recoveryPassword = document.querySelector("[data-recovery-password]");
  const recoveryConfirm = document.querySelector("[data-recovery-confirm]");
  const recoveryMfaLabel = document.querySelector("[data-recovery-mfa-label]");
  const recoveryMfa = document.querySelector("[data-recovery-mfa]");
  const recoverySubmit = document.querySelector("[data-recovery-submit]");
  let recoveryEvent = false;
  const portalFallback = auth?.getPortalBaseUrl() || new URL("../", window.location.href).href;

  function showError(message) {
    status.textContent = message;
    link.hidden = false;
    link.href = portalFallback;
    link.textContent = "返回入口網站";
  }

  function finish(message) {
    const returnTo = auth.consumeReturnTo(portalFallback);
    status.textContent = message;
    link.hidden = false;
    link.href = returnTo;
    link.textContent = "立即繼續";
    window.setTimeout(() => window.location.replace(returnTo), 500);
  }

  async function showRecoveryForm() {
    document.querySelector("#callback-title").textContent = "設定新密碼";
    document.querySelector(".callback-spinner").hidden = true;
    status.textContent = "請設定新密碼（至少 12 個字元，不可使用常見或曾外洩的密碼）。";
    recoveryForm.hidden = false;
    try {
      const { data } = await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") recoveryMfaLabel.hidden = false;
    } catch (_) { /* 查不到就不顯示驗證碼欄位 */ }

    recoveryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = recoveryPassword.value;
      if (password !== recoveryConfirm.value) {
        status.textContent = "兩次輸入的密碼不一致。";
        return;
      }
      recoverySubmit.disabled = true;
      try {
        const { data: sessionData } = await auth.getSession();
        const problem = policy ? await policy.validate(password, sessionData?.session?.user?.email) : null;
        if (problem) throw new Error(problem);

        if (!recoveryMfaLabel.hidden) {
          const code = recoveryMfa.value.replace(/\s+/g, "");
          if (!/^\d{6}$/.test(code)) throw new Error("請輸入 6 位數的兩步驟驗證代碼。");
          const { data: list, error: listError } = await auth.client.auth.mfa.listFactors();
          if (listError) throw listError;
          const factor = list?.totp?.[0];
          if (!factor) throw new Error("找不到驗證器，請聯絡管理者。");
          const { error: mfaError } = await auth.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
          if (mfaError) throw mfaError;
        }

        const { error } = await auth.client.auth.updateUser({ password });
        if (error) throw error;
        recoveryForm.hidden = true;
        finish("密碼已更新，正在返回原服務…");
      } catch (error) {
        status.textContent = error?.message || "設定新密碼失敗，請重試。";
        recoverySubmit.disabled = false;
      }
    });
  }

  async function completeCallback() {
    if (!auth) {
      showError("Supabase Auth client 載入失敗，請返回入口網站重試。");
      return;
    }

    auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
    });

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
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const { data, error } = await auth.getSession();
      if (error) throw error;
      if (!data?.session) throw new Error("找不到有效登入 session，請重新登入。");

      if (code && recoveryEvent) {
        await showRecoveryForm();
        return;
      }

      finish("登入確認完成，正在返回原服務…");
    } catch (error) {
      showError(error?.message || "登入確認失敗，請重新登入。");
    }
  }

  completeCallback();
})();
