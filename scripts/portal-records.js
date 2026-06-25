(function () {
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
    }
  ];

  const categoryLabels = {
    quiz: "測驗",
    learning: "學習",
    creative: "創作",
    utility: "實用"
  };

  const toolGrid = document.querySelector("#toolGrid");
  const toolCountEl = document.querySelector("#portalToolCount");
  const todayEntryEl = document.querySelector("#portalTodayEntry");
  const categoryCountEl = document.querySelector("#portalCategoryCount");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderTool(tool) {
    const tags = tool.tags
      .map((tag) => `<strong>${escapeHtml(tag)}</strong>`)
      .join("");
    const record = tool.record
      ? `<div class="tool-record">
          <span>最新紀錄</span>
          <strong id="quizRecordAccuracy">尚無紀錄</strong>
          <span id="quizRecordMeta">完成一次測驗後顯示</span>
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
        <a class="launch-button" href="${escapeHtml(tool.url)}">
          <span>${escapeHtml(tool.cta)}</span>
          <span class="arrow-symbol" aria-hidden="true"></span>
        </a>
      </article>`;
  }

  function renderTools() {
    if (!toolGrid) return;

    toolGrid.innerHTML = tools.map(renderTool).join("");

    const liveTools = tools.filter((tool) => tool.url);

    if (toolCountEl) toolCountEl.textContent = `${liveTools.length} 個`;
    if (todayEntryEl) todayEntryEl.textContent = `${liveTools.length} 個`;
    if (categoryCountEl) categoryCountEl.textContent = `${Object.keys(categoryLabels).length} 類`;
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
        const target = filter === "all" ? document.querySelector("#top") : document.querySelector("#quick-title");
        const scrollTarget = navRole === "tools" ? document.querySelector("#quick-title") : target;

        event.preventDefault();
        if (inNavigation && searchInput) {
          searchInput.value = "";
        }
        setFilter(filter, navRole);
        scrollTarget?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });

    searchInput?.addEventListener("input", applyFilters);
    setFilter("all", "home");
  }

  renderTools();
  setupFilters();
})();

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
