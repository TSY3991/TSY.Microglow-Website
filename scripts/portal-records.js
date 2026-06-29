(function () {
  const STATS_KEY = "amateurRadioQuiz.stats.v1";
  const GAME_STATS_KEY = "tsyMicroglowPortal.gameStats.v1";
  const PROGRESS_KEY = "tsyMicroglowPortal.progress.v1";
  const tools = [
    {
      id: "amateur-radio-quiz",
      category: "quiz",
      categoryLabel: "測驗練習",
      title: "三等業餘無線電人員測驗練習",
      description: "提供題庫練習、模擬考、錯題本與本機學習紀錄",
      url: "https://tsy3991.github.io/amateur-radio-quiz/",
      cta: "開始練習",
      keywords: "測驗 練習 題庫 模擬考 錯題本 本機紀錄 無線電 三等 業餘 電台",
      tags: ["題庫", "模擬考", "錯題本", "本機紀錄"],
      featured: true,
      record: true
    },
    {
      id: "microglow-games",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光遊戲大廳",
      description: "集中放置微光創作室的小遊戲，包含俄羅斯方塊與後續新增的休閒挑戰。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/",
      cta: "進入大廳",
      keywords: "小遊戲 遊戲大廳 俄羅斯方塊 Tetris 貪吃蛇 Snake 休閒 挑戰",
      tags: ["小遊戲", "遊戲大廳", "休閒挑戰", "持續新增"],
      featured: false,
      record: false
    }
  ];

  const categoryLabels = {
    quiz: "測驗",
    game: "小遊戲",
    learning: "學習",
    creative: "創作",
    utility: "實用"
  };

  const toolGrid = document.querySelector("#toolGrid");
  const toolCountEl = document.querySelector("#portalToolCount");
  const todayEntryEl = document.querySelector("#portalTodayEntry");
  const todayEntryDetailEl = document.querySelector("#portalTodayEntryDetail");
  const categoryCountEl = document.querySelector("#portalCategoryCount");
  const portalLevelEl = document.querySelector("#portalLevel");
  const explorerRankEl = document.querySelector("#explorerRank");
  const explorerMetaEl = document.querySelector("#explorerMeta");
  const explorerXpBarEl = document.querySelector("#explorerXpBar");
  const missionProgressBarEl = document.querySelector("#missionProgressBar");
  const missionScoreEl = document.querySelector("#missionScore");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderTool(tool) {
    const tags = tool.tags
      .map((tag) => `<strong>${escapeHtml(tag)}</strong>`)
      .join("");
    const emptyRecordMeta = tool.category === "game" ? "遊玩一次後顯示" : "完成一次測驗後顯示";
    const record = tool.record
      ? `<div class="tool-record">
          <span>最新紀錄</span>
          <strong data-record-value="${escapeHtml(tool.id)}">尚無紀錄</strong>
          <span data-record-meta="${escapeHtml(tool.id)}">${emptyRecordMeta}</span>
        </div>`
      : `<div class="tool-record is-static">
          <span>工具狀態</span>
          <strong>已上線</strong>
          <span>${escapeHtml(categoryLabels[tool.category] || tool.categoryLabel)}</span>
        </div>`;

    return `<article
        class="primary-tool tool-card${tool.featured ? " is-featured" : ""}"
        data-tool-card
        data-category="${escapeHtml(tool.category)}"
        data-title="${escapeHtml(tool.title)}"
        data-keywords="${escapeHtml(tool.keywords)}"
      >
        <span class="corner-ribbon" aria-hidden="true"></span>
        <div class="tool-visual" aria-hidden="true">
          <span class="antenna"></span>
          <span class="signal signal-one"></span>
          <span class="signal signal-two"></span>
        </div>
        <div class="tool-copy">
          <p>${escapeHtml(tool.categoryLabel)}</p>
          <h3>${escapeHtml(tool.title)}</h3>
          <span>${escapeHtml(tool.description)}</span>
          <div class="feature-tags" aria-label="工具特色">${tags}</div>
        </div>
        ${record}
        <a class="launch-button" href="${escapeHtml(tool.url)}" data-tool-launch="${escapeHtml(tool.id)}">
          <span>${escapeHtml(tool.cta)}</span>
          <span class="arrow-symbol" aria-hidden="true"></span>
        </a>
      </article>`;
  }

  function renderTools() {
    if (!toolGrid) return;

    toolGrid.innerHTML = tools.map(renderTool).join("");

    const liveTools = tools.filter((tool) => tool.url);
    const liveCategories = Array.from(new Set(liveTools.map((tool) => tool.categoryLabel)));

    if (toolCountEl) toolCountEl.textContent = `${liveTools.length} 個`;
    if (todayEntryEl) todayEntryEl.textContent = `${liveTools.length} 個`;
    if (todayEntryDetailEl) {
      todayEntryDetailEl.textContent = liveCategories.length
        ? `${liveCategories.join(" / ")}已上線`
        : "持續上線中";
    }
    if (categoryCountEl) categoryCountEl.textContent = `${Object.keys(categoryLabels).length} 類`;
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

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
    } catch {
      // Ignore private-mode storage failures.
    }
  }

  function readProgress() {
    const progress = readJson(PROGRESS_KEY, {});
    return {
      visitedDays: Array.isArray(progress.visitedDays) ? progress.visitedDays : [],
      searches: Number(progress.searches) || 0,
      filters: Number(progress.filters) || 0,
      launches: progress.launches && typeof progress.launches === "object" ? progress.launches : {}
    };
  }

  function readQuizSessions() {
    const stats = readJson(STATS_KEY, null);
    return Array.isArray(stats?.sessions) ? stats.sessions : [];
  }

  function markVisit() {
    const progress = readProgress();
    const today = todayKey();

    if (!progress.visitedDays.includes(today)) {
      progress.visitedDays.push(today);
      writeJson(PROGRESS_KEY, progress);
    }
  }

  function incrementProgress(field, toolId) {
    const progress = readProgress();

    if (field === "launches" && toolId) {
      progress.launches[toolId] = (Number(progress.launches[toolId]) || 0) + 1;
    } else if (field === "searches" || field === "filters") {
      progress[field] += 1;
    }

    writeJson(PROGRESS_KEY, progress);
    updateProgressUi();
  }

  function sumLaunches(launches) {
    return Object.values(launches).reduce((total, value) => total + (Number(value) || 0), 0);
  }

  function computeXp(progress, sessions) {
    const gameStats = readJson(GAME_STATS_KEY, {});
    const gamePlays = Object.values(gameStats?.games || {}).reduce((total, game) => {
      return total + (Number(game?.plays) || 0);
    }, 0);
    const visitXp = Math.min(progress.visitedDays.length * 5, 100);
    const searchXp = Math.min(progress.searches * 2, 50);
    const filterXp = Math.min(progress.filters * 2, 50);
    const launchXp = Math.min(sumLaunches(progress.launches) * 10, 200);
    const quizXp = Math.min(sessions.length * 20, 300);
    const gameXp = Math.min(gamePlays * 10, 200);
    const bestAccuracy = sessions.reduce((best, session) => {
      const score = Number(session?.score) || 0;
      const total = Number(session?.total || session?.answered) || 0;
      const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
      return Math.max(best, accuracy);
    }, 0);
    const milestoneXp = bestAccuracy >= 90 ? 50 : bestAccuracy >= 80 ? 30 : bestAccuracy >= 60 ? 15 : 0;

    return 20 + visitXp + searchXp + filterXp + launchXp + quizXp + gameXp + milestoneXp;
  }

  function levelFromXp(xp) {
    return Math.min(10, Math.floor(xp / 100) + 1);
  }

  function computePortalLevel() {
    const liveToolCount = tools.filter((tool) => tool.url).length;
    let level = 1;

    if (liveToolCount >= 1) level = 2;
    if (liveToolCount >= 3) level = 3;
    if (liveToolCount >= 5) level = 4;
    if (liveToolCount >= 8) level = 5;

    return level;
  }

  function updateProgressUi() {
    const progress = readProgress();
    const sessions = readQuizSessions();
    const xp = computeXp(progress, sessions);
    const explorerLevel = levelFromXp(xp);
    const currentLevelXp = (explorerLevel - 1) * 100;
    const nextLevelXp = explorerLevel * 100;
    const xpInLevel = Math.max(0, xp - currentLevelXp);
    const xpNeeded = nextLevelXp - currentLevelXp;
    const xpPercent = explorerLevel >= 10 ? 100 : Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    const liveToolCount = tools.filter((tool) => tool.url).length;
    const missionTotal = Object.keys(categoryLabels).length;
    const missionCurrent = Math.min(liveToolCount, missionTotal);

    if (portalLevelEl) portalLevelEl.textContent = `Lv.${computePortalLevel()}`;
    if (explorerRankEl) explorerRankEl.textContent = `微光探索者 Lv.${explorerLevel}`;
    if (explorerMetaEl) explorerMetaEl.textContent = `${xp} XP・${progress.visitedDays.length} 天探索`;
    if (explorerXpBarEl) explorerXpBarEl.style.width = `${xpPercent}%`;
    if (missionProgressBarEl) {
      missionProgressBarEl.style.width = `${Math.round((missionCurrent / missionTotal) * 100)}%`;
      const track = missionProgressBarEl.parentElement;
      if (track) track.setAttribute("aria-label", `完成進度 ${missionCurrent} / ${missionTotal}`);
    }
    if (missionScoreEl) missionScoreEl.textContent = `${missionCurrent} / ${missionTotal}`;
  }

  function setupFilters() {
    const searchInput = document.querySelector("#toolSearchInput");
    const cards = Array.from(document.querySelectorAll("[data-tool-card]"));
    const emptyState = document.querySelector("[data-tool-empty]");
    const filterTriggers = Array.from(document.querySelectorAll("[data-filter-trigger]"));

    if (!cards.length || !filterTriggers.length) return;

    let activeFilter = "all";
    let activeNavRole = "home";

    function normalize(value) {
      return String(value || "").toLowerCase().trim();
    }

    function getCardText(card) {
      return normalize([
        card.dataset.title,
        card.dataset.category,
        card.dataset.keywords,
        card.textContent
      ].join(" "));
    }

    function updateTriggerState() {
      filterTriggers.forEach((trigger) => {
        const triggerFilter = trigger.dataset.filterTrigger || "all";
        const navRole = trigger.dataset.navRole;
        let isActive = triggerFilter === activeFilter;
        const inNavigation = Boolean(trigger.closest(".nav-groups, .mobile-dock"));

        if (inNavigation && navRole) {
          isActive = triggerFilter === activeFilter && navRole === activeNavRole;
        }

        trigger.classList.toggle("active", isActive);

        if (trigger.tagName === "BUTTON") {
          trigger.setAttribute("aria-pressed", String(isActive));
        }

        if (inNavigation && isActive) {
          trigger.setAttribute("aria-current", "page");
        } else if (inNavigation) {
          trigger.removeAttribute("aria-current");
        }
      });
      document.querySelectorAll("[data-news-trigger]").forEach((trigger) => {
        trigger.classList.remove("active");
        trigger.removeAttribute("aria-current");
      });
    }

    function applyFilters() {
      const query = normalize(searchInput?.value);
      let visibleCount = 0;

      cards.forEach((card) => {
        const cardCategory = card.dataset.category || "";
        const matchesFilter = activeFilter === "all" || cardCategory === activeFilter;
        const matchesSearch = !query || getCardText(card).includes(query);
        const shouldShow = matchesFilter && matchesSearch;

        card.hidden = !shouldShow;
        if (shouldShow) visibleCount += 1;
      });

      if (emptyState) {
        emptyState.hidden = visibleCount > 0;
      }
    }

    function setFilter(filter, navRole) {
      activeFilter = filter || "all";
      activeNavRole = navRole || (activeFilter === "all" ? "tools" : activeFilter);
      updateTriggerState();
      applyFilters();
    }

    filterTriggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        const filter = trigger.dataset.filterTrigger || "all";
        const inNavigation = Boolean(trigger.closest(".nav-groups, .mobile-dock"));
        const navRole = trigger.dataset.navRole || (filter === "all" ? "tools" : filter);
        const scrollTarget = navRole === "home"
          ? document.querySelector("#top")
          : document.querySelector("#quick-title");

        event.preventDefault();
        if (inNavigation && searchInput) {
          searchInput.value = "";
        }
        incrementProgress("filters");
        setFilter(filter, navRole);
        scrollTarget?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });

    let searchDebounce = null;
    let lastTrackedQuery = "";
    searchInput?.addEventListener("input", () => {
      applyFilters();
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        const query = normalize(searchInput.value);
        if (query.length >= 2 && query !== lastTrackedQuery) {
          lastTrackedQuery = query;
          incrementProgress("searches");
        }
      }, 600);
    });
    setFilter("all", "home");
  }

  function setupNewsNavigation() {
    const newsTarget = document.querySelector("#news-title");
    const newsTriggers = Array.from(document.querySelectorAll("[data-news-trigger]"));

    newsTriggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        document.querySelectorAll(".nav-groups .nav-item, .mobile-dock a").forEach((item) => {
          item.classList.remove("active");
          item.removeAttribute("aria-current");
        });
        trigger.classList.add("active");
        trigger.setAttribute("aria-current", "page");
        newsTarget?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });
  }

  renderTools();
  markVisit();
  setupFilters();
  setupNewsNavigation();
  document.querySelectorAll("[data-tool-launch]").forEach((link) => {
    link.addEventListener("click", () => {
      incrementProgress("launches", link.dataset.toolLaunch);
    });
  });
  updateProgressUi();
  window.addEventListener("focus", updateProgressUi);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateProgressUi();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STATS_KEY || event.key === GAME_STATS_KEY || event.key === PROGRESS_KEY) updateProgressUi();
  });
})();

(function () {
  const STATS_KEY = "amateurRadioQuiz.stats.v1";
  const GAME_STATS_KEY = "tsyMicroglowPortal.gameStats.v1";
  const quizValueEl = document.querySelector('[data-record-value="amateur-radio-quiz"]');
  const quizMetaEl = document.querySelector('[data-record-meta="amateur-radio-quiz"]');

  if (!quizValueEl) return;

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
    if (!quizValueEl || !quizMetaEl) return;

    const sessions = readStats();
    const latest = Array.isArray(sessions) ? getLatestSession(sessions) : null;

    if (!latest) {
      quizValueEl.textContent = "尚無紀錄";
      quizMetaEl.textContent = "完成一次測驗後顯示";
      return;
    }

    const score = Number(latest.score) || 0;
    const total = Number(latest.total || latest.answered) || 0;
    const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
    const label = latest.label || "測驗練習";
    const dateText = formatRelativeDate(latest.date);

    quizValueEl.textContent = `${accuracy}% 正確率`;
    quizMetaEl.textContent = `${label}：${dateText}`;
  }

  updateQuizRecord();
  window.addEventListener("focus", updateQuizRecord);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateQuizRecord();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STATS_KEY || event.key === GAME_STATS_KEY) updateQuizRecord();
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
