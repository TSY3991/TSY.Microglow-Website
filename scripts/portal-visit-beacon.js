(function () {
  "use strict";

  // Site-wide cumulative popularity beacon. Every page of every Microglow site
  // loads this file; the server (record_portal_visit) counts one browser at most
  // once per 30 minutes, so browsing across pages and sites is one visit.
  // No supabase-js needed: a single anonymous RPC call. Failures are silent.

  const PROJECT_URL = "https://xduwufkfmzovlwcyodcp.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_jlQ4vurF0dI_tlkCMyDKeg_MskXpSC_";
  // Same key the portal home page uses for online presence (same origin = shared).
  const KEY_STORAGE = "tsyMicroglowPortal.presenceKey.v1";
  const SENT_AT_STORAGE = "tsyMicroglowPortal.visitSentAt.v1";
  const CLIENT_THROTTLE_MS = 10 * 60 * 1000;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return;

  function readStore(name) {
    try {
      return window.localStorage.getItem(name);
    } catch (_) {
      return null;
    }
  }

  function writeStore(name, value) {
    try {
      window.localStorage.setItem(name, value);
    } catch (_) {
      // Storage blocked: carry on without it.
    }
  }

  function getKey() {
    const saved = readStore(KEY_STORAGE);
    if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
    const fresh = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    writeStore(KEY_STORAGE, fresh);
    return fresh;
  }

  // Skip the network call when this browser already reported a moment ago.
  const lastSent = Number(readStore(SENT_AT_STORAGE)) || 0;
  if (Date.now() - lastSent < CLIENT_THROTTLE_MS) return;
  writeStore(SENT_AT_STORAGE, String(Date.now()));

  try {
    window
      .fetch(`${PROJECT_URL}/rest/v1/rpc/record_portal_visit`, {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_key: getKey() }),
        keepalive: true
      })
      .catch(() => {});
  } catch (_) {
    // Counter unavailable: never affect the page.
  }
})();
