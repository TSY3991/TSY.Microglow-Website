(function () {
  "use strict";

  const onlineEl = document.querySelector("#siteOnlineCount");
  if (!onlineEl) return;

  const client = window.MicroglowAuth?.client;
  if (!client) {
    console.error("MicroglowAuth 未就緒，線上人數維持本機估計值。");
    return;
  }

  // One key per browser (not per tab) so several open tabs count as one visitor.
  const PRESENCE_KEY_STORAGE = "tsyMicroglowPortal.presenceKey.v1";

  function createPresenceKey() {
    const fresh = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      const saved = window.localStorage.getItem(PRESENCE_KEY_STORAGE);
      if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
      window.localStorage.setItem(PRESENCE_KEY_STORAGE, fresh);
    } catch (_) {
      // Storage blocked: fall back to a per-tab key.
    }
    return fresh;
  }

  const channel = client.channel("portal-online", {
    config: { presence: { key: createPresenceKey() } }
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      onlineEl.textContent = String(Math.max(Object.keys(state).length, 1));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ online_at: Date.now() });
      }
    });

  window.addEventListener("pagehide", () => {
    client.removeChannel(channel);
  });
})();
