(function () {
  "use strict";

  const PROJECT_REF = "xduwufkfmzovlwcyodcp";
  const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
  const PUBLISHABLE_KEY = "sb_publishable_jlQ4vurF0dI_tlkCMyDKeg_MskXpSC_";
  const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
  const RETURN_TO_KEY = "microglow-auth-return-to-v1";
  const PRODUCTION_ORIGIN = "https://tsy3991.github.io";
  const PRODUCTION_PATHS = ["/TSY.Microglow-Website/", "/TSY.Microglow-Games/"];

  function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function isAllowedReturnTo(url) {
    if (url.origin === PRODUCTION_ORIGIN) {
      return PRODUCTION_PATHS.some((prefix) => url.pathname.startsWith(prefix));
    }

    if (isLocalHost(url.hostname) && url.origin === window.location.origin) {
      return (
        url.pathname === "/" ||
        url.pathname.startsWith("/auth/") ||
        url.pathname.startsWith("/Games/")
      );
    }

    return false;
  }

  function sanitizeReturnTo(rawValue, fallbackValue) {
    const fallback = new URL(fallbackValue || "./", window.location.href);
    if (!rawValue) return fallback.href;

    try {
      const candidate = new URL(rawValue, window.location.origin);
      return isAllowedReturnTo(candidate) ? candidate.href : fallback.href;
    } catch (_) {
      return fallback.href;
    }
  }

  function rememberReturnTo(rawValue, fallbackValue) {
    const safeValue = sanitizeReturnTo(rawValue, fallbackValue);
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, safeValue);
    } catch (_) {
      window.localStorage.setItem(RETURN_TO_KEY, safeValue);
    }
    return safeValue;
  }

  function consumeReturnTo(fallbackValue) {
    let storedValue = null;
    try {
      storedValue = window.sessionStorage.getItem(RETURN_TO_KEY);
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    } catch (_) {
      storedValue = window.localStorage.getItem(RETURN_TO_KEY);
      window.localStorage.removeItem(RETURN_TO_KEY);
    }
    return sanitizeReturnTo(storedValue, fallbackValue);
  }

  function getPortalBaseUrl() {
    if (window.location.origin === PRODUCTION_ORIGIN) {
      return `${PRODUCTION_ORIGIN}/TSY.Microglow-Website/`;
    }

    if (isLocalHost(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:8849/`;
    }

    return new URL("./", window.location.href).href;
  }

  function getUnifiedReturnTo() {
    if (isLocalHost(window.location.hostname) && window.location.port === "8848") {
      const portalBase = new URL(getPortalBaseUrl());
      portalBase.pathname = `/Games${window.location.pathname}`;
      portalBase.search = window.location.search;
      portalBase.hash = window.location.hash;
      return portalBase.href;
    }
    return window.location.href;
  }

  function getPortalLoginUrl(returnTo) {
    const url = new URL("auth/login.html", getPortalBaseUrl());
    url.searchParams.set("returnTo", returnTo || getUnifiedReturnTo());
    return url.href;
  }

  function isAnonymousUser(user) {
    return Boolean(
      user?.is_anonymous ||
      user?.app_metadata?.provider === "anonymous" ||
      user?.user_metadata?.is_anonymous
    );
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase JS 未載入，中央帳號功能無法初始化。");
    return;
  }

  const client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      storageKey: STORAGE_KEY,
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  window.MicroglowAuth = {
    client,
    projectUrl: PROJECT_URL,
    storageKey: STORAGE_KEY,
    getSession: () => client.auth.getSession(),
    onAuthStateChange: (callback) => client.auth.onAuthStateChange(callback),
    signIn: ({ email, password, captchaToken }) =>
      client.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined
      }),
    signUp: ({ email, password, captchaToken, emailRedirectTo }) =>
      client.auth.signUp({
        email,
        password,
        options: {
          ...(captchaToken ? { captchaToken } : {}),
          ...(emailRedirectTo ? { emailRedirectTo } : {})
        }
      }),
    signOut: () => client.auth.signOut({ scope: "local" }),
    exchangeCodeForSession: (code) => client.auth.exchangeCodeForSession(code),
    isAnonymousUser,
    sanitizeReturnTo,
    rememberReturnTo,
    consumeReturnTo,
    getPortalBaseUrl,
    getPortalLoginUrl,
    getUnifiedReturnTo
  };
})();
