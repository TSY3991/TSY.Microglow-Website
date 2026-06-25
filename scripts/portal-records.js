(function () {
  const STATS_KEY = "amateurRadioQuiz.stats.v1";
  const accuracyEl = document.querySelector("#quizRecordAccuracy");
  const metaEl = document.querySelector("#quizRecordMeta");

  if (!accuracyEl || !metaEl) return;

  function readStats() {
    try {
      const raw = window.localStorage.getItem(STATS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    } catch {
      return null;
    }
  }

  function getLatestSession(sessions) {
    return sessions
      .filter((session) => session && session.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  }

  function formatRelativeDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "最近";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);

    if (dayDiff === 0) return "今天";
    if (dayDiff === 1) return "昨天";
    if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} 天前`;

    return date.toLocaleDateString("zh-TW", {
      month: "2-digit",
      day: "2-digit"
    });
  }

  function updateQuizRecord() {
    const sessions = readStats();
    const latest = Array.isArray(sessions) ? getLatestSession(sessions) : null;

    if (!latest) {
      accuracyEl.textContent = "尚無紀錄";
      metaEl.textContent = "完成一次測驗後顯示";
      return;
    }

    const score = Number(latest.score) || 0;
    const total = Number(latest.total || latest.answered) || 0;
    const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
    const label = latest.label || "測驗練習";
    const dateText = formatRelativeDate(latest.date);

    accuracyEl.textContent = `${accuracy}% 正確率`;
    metaEl.textContent = `${label}：${dateText}`;
  }

  updateQuizRecord();
  window.addEventListener("focus", updateQuizRecord);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateQuizRecord();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STATS_KEY) updateQuizRecord();
  });
})();

(function () {
  const VISITOR_ID_KEY = "tsyMicroglowPortal.visitorId.v1";
  const ONLINE_KEY = "tsyMicroglowPortal.onlineSessions.v1";
  const ACTIVE_WINDOW_MS = 20000;
  const visitorEl = document.querySelector("#siteVisitorCount");
  const onlineEl = document.querySelector("#siteOnlineCount");

  if (!visitorEl || !onlineEl) return;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readOnlineSessions() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ONLINE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeOnlineSessions(sessions) {
    try {
      window.localStorage.setItem(ONLINE_KEY, JSON.stringify(sessions));
    } catch {
      // Ignore private-mode storage failures; the widget will fall back to "1".
    }
  }

  function getVisitorId() {
    try {
      const existing = window.localStorage.getItem(VISITOR_ID_KEY);
      if (existing) return existing;
      const created = createId();
      window.localStorage.setItem(VISITOR_ID_KEY, created);
      return created;
    } catch {
      return "private-session";
    }
  }

  const tabId = createId();
  const visitorId = getVisitorId();

  function updateCounter() {
    const now = Date.now();
    const sessions = readOnlineSessions();

    sessions[tabId] = {
      visitorId,
      seenAt: now
    };

    for (const [id, session] of Object.entries(sessions)) {
      if (!session?.seenAt || now - Number(session.seenAt) > ACTIVE_WINDOW_MS) {
        delete sessions[id];
      }
    }

    writeOnlineSessions(sessions);

    const visitorIds = new Set(
      Object.values(sessions)
        .map((session) => session?.visitorId)
        .filter(Boolean)
    );

    visitorEl.textContent = String(Math.max(visitorIds.size, 1));
    onlineEl.textContent = String(Math.max(Object.keys(sessions).length, 1));
  }

  function removeTab() {
    const sessions = readOnlineSessions();
    delete sessions[tabId];
    writeOnlineSessions(sessions);
  }

  updateCounter();
  window.setInterval(updateCounter, 8000);
  window.addEventListener("focus", updateCounter);
  window.addEventListener("storage", (event) => {
    if (event.key === ONLINE_KEY) updateCounter();
  });
  window.addEventListener("pagehide", removeTab);
})();
