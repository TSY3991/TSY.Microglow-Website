(function () {
  "use strict";

  const auth = window.MicroglowAuth;
  const accountLink = document.querySelector("[data-portal-auth]");
  const accountLabel = document.querySelector("[data-portal-auth-label]");
  const accountMeta = document.querySelector("[data-portal-auth-meta]");

  if (!accountLink || !accountLabel || !accountMeta) return;

  function render(session) {
    const user = session?.user;
    const isAnonymous = user && auth?.isAnonymousUser(user);

    accountLink.classList.toggle("is-signed-in", Boolean(user && !isAnonymous));
    accountLink.classList.toggle("is-guest", Boolean(isAnonymous));
    accountLink.href = auth
      ? auth.getPortalLoginUrl(window.location.href)
      : "./auth/login.html";

    if (!user) {
      accountMeta.textContent = "微光帳號";
      accountLabel.textContent = "登入／註冊";
      return;
    }

    if (isAnonymous) {
      accountMeta.textContent = "訪客試玩中";
      accountLabel.textContent = "升級正式會員";
      return;
    }

    accountMeta.textContent = "正式會員";
    accountLabel.textContent = user.email || "已登入";
  }

  if (!auth) {
    render(null);
    return;
  }

  auth.getSession()
    .then(({ data, error }) => render(error ? null : data?.session))
    .catch(() => render(null));

  auth.onAuthStateChange((_event, session) => render(session));
})();
