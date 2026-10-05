(function () {
  "use strict";

  // 探索者經驗雲端同步：只對「正式會員（非匿名）」啟用。
  // 本機資料與雲端取聯集／最大值，進度只會增加、不會被清零。
  const auth = window.MicroglowAuth;
  if (!auth) return;

  const PROGRESS_KEY = "tsyMicroglowPortal.progress.v1";
  const STATS_KEY = "amateurRadioQuiz.stats.v1";
  const GAME_STATS_KEY = "tsyMicroglowPortal.gameStats.v1";
  const MIN_GAP_MS = 10000;
  const INTERVAL_MS = 120000;

  let running = false;
  let lastRunAt = 0;
  let lastSentHash = "";
  let activeUserId = null;

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function buildPayload() {
    const progress = readJson(PROGRESS_KEY, {});
    const stats = readJson(STATS_KEY, {});
    const gameStats = readJson(GAME_STATS_KEY, {});
    const games = {};
    if (isObject(gameStats.games)) {
      Object.entries(gameStats.games).forEach(([id, game]) => {
        if (!isObject(game)) return;
        games[id] = {
          title: typeof game.title === "string" ? game.title.slice(0, 60) : id,
          plays: Math.max(0, Math.floor(Number(game.plays) || 0)),
          bestScore: Number(game.bestScore) || 0
        };
      });
    }
    return {
      visitedDays: Array.isArray(progress.visitedDays) ? progress.visitedDays : [],
      searches: Number(progress.searches) || 0,
      filters: Number(progress.filters) || 0,
      launches: isObject(progress.launches) ? progress.launches : {},
      quizSessions: Array.isArray(stats?.sessions) ? stats.sessions.slice(-300) : [],
      games
    };
  }

  function applyMerged(data) {
    const changedKeys = [];

    const progress = readJson(PROGRESS_KEY, {});
    // 與「目前」本機值再合併一次（聯集／最大值），避免請求期間的新增被覆蓋
    const localDays = Array.isArray(progress.visitedDays) ? progress.visitedDays : [];
    const launches = isObject(progress.launches) ? { ...progress.launches } : {};
    Object.entries(data.launches || {}).forEach(([id, count]) => {
      launches[id] = Math.max(Number(launches[id]) || 0, Number(count) || 0);
    });
    const nextProgress = {
      ...progress,
      visitedDays: Array.from(new Set([...localDays, ...(data.visitedDays || [])])).sort(),
      searches: Math.max(Number(progress.searches) || 0, Number(data.searches) || 0),
      filters: Math.max(Number(progress.filters) || 0, Number(data.filters) || 0),
      launches
    };
    if (JSON.stringify(nextProgress) !== JSON.stringify(progress) && writeJson(PROGRESS_KEY, nextProgress)) {
      changedKeys.push(PROGRESS_KEY);
    }

    if (Array.isArray(data.quizSessions) && data.quizSessions.length) {
      const stats = readJson(STATS_KEY, {});
      const local = Array.isArray(stats?.sessions) ? stats.sessions : [];
      if (data.quizSessions.length > local.length) {
        // 雲端為去重後的聯集（新到舊）；本機維持舊到新的慣例
        const merged = data.quizSessions.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        if (writeJson(STATS_KEY, { ...(isObject(stats) ? stats : {}), sessions: merged })) {
          changedKeys.push(STATS_KEY);
        }
      }
    }

    if (isObject(data.games)) {
      const gameStats = readJson(GAME_STATS_KEY, {});
      const localGames = isObject(gameStats.games) ? { ...gameStats.games } : {};
      let touched = false;
      Object.entries(data.games).forEach(([id, cloud]) => {
        const local = isObject(localGames[id]) ? localGames[id] : {};
        const plays = Math.max(Number(local.plays) || 0, Number(cloud.plays) || 0);
        const bestScore = Math.max(Number(local.bestScore) || 0, Number(cloud.bestScore) || 0);
        if (plays !== (Number(local.plays) || 0) || bestScore !== (Number(local.bestScore) || 0)) {
          localGames[id] = { ...cloud, ...local, plays, bestScore };
          touched = true;
        }
      });
      if (touched && writeJson(GAME_STATS_KEY, { ...(isObject(gameStats) ? gameStats : {}), games: localGames })) {
        changedKeys.push(GAME_STATS_KEY);
      }
    }

    changedKeys.forEach((key) => {
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
  }

  async function sync(force) {
    if (running) return;
    if (!force && Date.now() - lastRunAt < MIN_GAP_MS) return;
    running = true;
    lastRunAt = Date.now();
    try {
      const { data: sessionData } = await auth.getSession();
      const user = sessionData?.session?.user;
      if (!user || auth.isAnonymousUser(user)) {
        activeUserId = null;
        return;
      }
      if (activeUserId !== user.id) {
        activeUserId = user.id;
        lastSentHash = "";
      }

      const payload = buildPayload();
      const hash = JSON.stringify(payload);
      if (hash === lastSentHash) return;

      const { data, error } = await auth.client.rpc("sync_portal_progress", { p_payload: payload });
      if (error || !data?.ok) return;

      applyMerged(data.data);
      lastSentHash = JSON.stringify(buildPayload());
    } catch (_) {
      /* 同步失敗不影響本機使用，下次再試 */
    } finally {
      running = false;
    }
  }

  auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      window.setTimeout(() => sync(true), 300);
    }
  });
  document.addEventListener("visibilitychange", () => sync(document.hidden));
  window.addEventListener("pagehide", () => sync(true));
  window.addEventListener("storage", (event) => {
    if (event.key === PROGRESS_KEY || event.key === STATS_KEY || event.key === GAME_STATS_KEY) sync(false);
  });
  window.setInterval(() => { if (!document.hidden) sync(false); }, INTERVAL_MS);
  sync(true);
})();
