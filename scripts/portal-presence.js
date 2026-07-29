(function () {
  "use strict";

  const onlineEl = document.querySelector("#siteOnlineCount");
  if (!onlineEl) return;

  const client = window.MicroglowAuth?.client;
  if (!client) {
    console.error("MicroglowAuth 未就緒，線上人數維持本機估計值。");
    return;
  }

  function createPresenceKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
