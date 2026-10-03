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
      record: true,
      recordEmptyText: "完成一次測驗後顯示"
    },
    {
      id: "microglow-games",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光遊戲大廳",
      description: "集中放置微光創作室的小遊戲，包含俄羅斯方塊、貪吃蛇、小朋友下樓梯、微光寶石、微光連珠對戰與微光商業帝國。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/",
      cta: "進入大廳",
      keywords: "小遊戲 遊戲大廳 俄羅斯方塊 Tetris 貪吃蛇 Snake 小朋友下樓梯 下樓梯 Downstairs 微光寶石 消消樂 match3 微光連珠對戰 轉珠 怪物 戰鬥 微光商業帝國 business empire 策略 股票 房產 副業 多人連線 舒壓 休閒 挑戰",
      tags: ["小遊戲", "遊戲大廳", "舒壓消消樂", "持續新增"],
      featured: false,
      record: false
    },
    {
      id: "microglow-creative",
      category: "creative",
      categoryLabel: "創作工具",
      title: "微光創作工具大廳",
      description: "集中放置微光創作室的創作工具，第一個工具「AI創意生圖工具」提供宮廟海報、節慶祝福與活動視覺模板。",
      url: "https://tsy3991.github.io/TSY.Microglow-Creative/",
      cta: "進入創作工具",
      keywords: "創作工具 AI創意生圖工具 AI 圖片 生圖 宮廟海報 節慶祝福 活動視覺 模板 ChatGPT Gemini",
      tags: ["圖片創作", "Prompt 模板", "持續新增"],
      featured: false,
      record: false
    },
    {
      id: "microglow-tools",
      category: "utility",
      categoryLabel: "實用工具",
      title: "微光工具箱",
      description: "集中放置微光創作室的實用小工具，包含 PhotoConverter 照片轉檔、通用媒體轉檔、PriceRadar 價格雷達與隨身硬碟同步備份工具。",
      url: "https://tsy3991.github.io/TSY.Microglow-Tools/",
      cta: "進入工具箱",
      keywords: "工具箱 實用工具 照片 圖片 PhotoConverter HEIC HEIF JPG JPEG PNG WebP AVIF TIFF BMP GIF ICO PDF 批次轉檔 價格雷達 PriceRadar 條碼 比價 備份 隨身硬碟 USB 行動硬碟 同步 保守同步 鏡像同步 媒體 車機 音樂 音訊 影片 MP3 MP4 MKV AVI MOV TS FLV WebM WMV MPG 3GP 1080p 720p 480p 自動解析度 裝置相容 轉檔 FFmpeg Real-ESRGAN AI 畫質放大 Windows 桌面工具 下載 安裝 免安裝",
      tags: ["工具箱", "桌面工具", "持續新增"],
      featured: false,
      record: false
    },
    {
      id: "photo-converter",
      category: "utility",
      categoryLabel: "實用工具",
      title: "PhotoConverter 照片轉檔工具",
      description: "批次把 HEIC／JPG／PNG／WebP 等圖片轉成多種格式或合併成 PDF，每張輸出都會重新解碼驗證。",
      url: "https://tsy3991.github.io/TSY.Microglow-Tools/tools/photo-converter/",
      cta: "前往下載",
      keywords: "照片 圖片 PhotoConverter HEIC HEIF JPG JPEG PNG WebP AVIF TIFF BMP GIF ICO PDF 批次轉檔 Windows 安裝 免安裝",
      tags: ["照片轉檔", "批次處理", "PDF"],
      record: false
    },
    {
      id: "car-media-converter",
      category: "utility",
      categoryLabel: "實用工具",
      title: "媒體轉檔工具",
      description: "將音訊與影片轉成常見格式，提供來源影片分析、自動建議設定、批次處理、AI 畫質放大與完成驗證。",
      url: "https://tsy3991.github.io/TSY.Microglow-Tools/tools/car-media-converter/",
      cta: "前往下載",
      keywords: "媒體 CarMediaConverter 車機 音樂 音訊 影片 MP3 MP4 MKV AVI MOV TS FLV WebM WMV MPG 3GP 1080p 720p 480p 解析度 幀率 來源分析 自動建議 轉檔 FFmpeg Real-ESRGAN AI 畫質放大 Windows 安裝 免安裝",
      tags: ["影音轉檔", "來源分析", "完成驗證"],
      record: false
    },
    {
      id: "portable-backup-tool",
      category: "utility",
      categoryLabel: "實用工具",
      title: "隨身硬碟同步備份工具",
      description: "把電腦資料夾自動備份到隨身硬碟，支援保守同步與鏡像同步，刪除的檔案會先隔離 30 天才清除。",
      url: "https://tsy3991.github.io/TSY.Microglow-Tools/tools/portable-backup-tool/",
      cta: "前往下載",
      keywords: "PortableBackupTool 備份 隨身硬碟 USB 行動硬碟 同步 保守同步 鏡像同步 資料夾 Windows 安裝 免安裝",
      tags: ["資料備份", "自動同步", "桌面工具"],
      record: false
    },
    {
      id: "price-radar",
      category: "utility",
      categoryLabel: "實用工具",
      title: "PriceRadar 價格雷達",
      description: "掃描商品條碼、回報賣場價格，透過大家共同建立的資料快速比較價格。",
      url: "https://tsy3991.github.io/TSY.Microglow-Tools/tools/price-radar/",
      cta: "開始比價",
      keywords: "PriceRadar 價格雷達 條碼 商品 賣場 價格 比價 掃描 網頁 App PWA",
      tags: ["條碼掃描", "價格比較", "網頁工具"],
      record: false
    },
    {
      id: "tetris",
      category: "game",
      categoryLabel: "小遊戲",
      title: "霓虹方塊俄羅斯",
      description: "科技感霓虹方塊搭配輕鬆可愛的操作節奏，支援鍵盤與手機觸控。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/tetris/",
      cta: "開始遊玩",
      keywords: "俄羅斯方塊 Tetris 霓虹 方塊下落 消行 鍵盤 手機 小遊戲",
      tags: ["方塊下落", "鍵盤操作", "手機觸控"],
      record: false
    },
    {
      id: "snake",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光貪吃蛇",
      description: "收集能量點、延長霓虹蛇身，支援方向鍵、WASD、手機按鈕與滑動操作。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/snake/",
      cta: "開始遊玩",
      keywords: "貪吃蛇 Snake 能量點 方向鍵 WASD 滑動 手機 小遊戲",
      tags: ["貪吃蛇", "能量收集", "手機操作"],
      record: false
    },
    {
      id: "downstairs",
      category: "game",
      categoryLabel: "小遊戲",
      title: "小朋友下樓梯",
      description: "左右移動踩住階梯，避開上方壓力並收集星星，支援鍵盤與手機觸控。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/downstairs/",
      cta: "開始遊玩",
      keywords: "小朋友 下樓梯 Downstairs 階梯 星星 左右移動 鍵盤 手機 小遊戲",
      tags: ["下樓挑戰", "星星收集", "手機觸控"],
      record: false
    },
    {
      id: "gem",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光寶石",
      description: "交換相鄰寶石形成 3 連消除，限定步數內達成目標分數，全 15 關難度漸增。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/gem/",
      cta: "開始遊玩",
      keywords: "微光寶石 Gem 消消樂 match3 三消 寶石 交換 關卡 舒壓 小遊戲",
      tags: ["寶石三消", "15 關挑戰", "舒壓"],
      record: false
    },
    {
      id: "orbs",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光連珠對戰",
      description: "拖曳連接木火土金水元素珠，剋制屬性、五連大絕，角色跨局升級持續變強。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/orbs/",
      cta: "開始遊玩",
      keywords: "微光連珠對戰 Orbs 轉珠 連珠 木火土金水 五行 元素 怪物 戰鬥 角色 升級 小遊戲",
      tags: ["五行連珠", "屬性戰鬥", "角色升級"],
      record: false
    },
    {
      id: "business-empire",
      category: "game",
      categoryLabel: "小遊戲",
      title: "微光商業帝國",
      description: "擲骰探索雙圈能量城市，配置股票、房產與副業，讓被動收入替你打造財務自由。",
      url: "https://tsy3991.github.io/TSY.Microglow-Games/games/business-empire/",
      cta: "開始遊玩",
      keywords: "微光商業帝國 business empire 商業 策略 桌遊 擲骰 股票 房產 副業 被動收入 多人連線 小遊戲",
      tags: ["商業策略", "股票房產", "多人連線"],
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
    const record = tool.record
      ? `<div class="tool-record">
          <span>最新紀錄</span>
          <strong data-record-value="${escapeHtml(tool.id)}">尚無紀錄</strong>
          <span data-record-meta="${escapeHtml(tool.id)}">${escapeHtml(tool.recordEmptyText || "完成一次後顯示")}</span>
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
        <a class="launch-button" href="${escapeHtml(tool.url)}" data-tool-launch="${escapeHtml(tool.id)}"${tool.newTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>
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

  function computeXpBreakdown(progress, sessions) {
    const gameStats = readJson(GAME_STATS_KEY, {});
    const gamePlays = Object.values(gameStats?.games || {}).reduce((total, game) => {
      return total + (Number(game?.plays) || 0);
    }, 0);
    const bestAccuracy = sessions.reduce((best, session) => {
      const score = Number(session?.score) || 0;
      const total = Number(session?.total || session?.answered) || 0;
      const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
      return Math.max(best, accuracy);
    }, 0);
    const milestoneXp = bestAccuracy >= 90 ? 50 : bestAccuracy >= 80 ? 30 : bestAccuracy >= 60 ? 15 : 0;
    const launches = sumLaunches(progress.launches);
    const items = [
      { label: "初始經驗", hint: "加入微光探索者", xp: 20, max: 20 },
      { label: "每日造訪", hint: `${progress.visitedDays.length} 天・每天 +5`, xp: Math.min(progress.visitedDays.length * 5, 100), max: 100 },
      { label: "搜尋工具", hint: `${progress.searches} 次・每次 +2`, xp: Math.min(progress.searches * 2, 50), max: 50 },
      { label: "分類篩選", hint: `${progress.filters} 次・每次 +2`, xp: Math.min(progress.filters * 2, 50), max: 50 },
      { label: "開啟工具", hint: `${launches} 次・每次 +10`, xp: Math.min(launches * 10, 200), max: 200 },
      { label: "完成測驗", hint: `${sessions.length} 場・每場 +20`, xp: Math.min(sessions.length * 20, 300), max: 300 },
      { label: "遊玩遊戲", hint: `${gamePlays} 次・每次 +10`, xp: Math.min(gamePlays * 10, 200), max: 200 },
      { label: "測驗最佳正確率", hint: `最佳 ${bestAccuracy}%・60/80/90% 分級`, xp: milestoneXp, max: 50 }
    ];
    return { items, total: items.reduce((sum, item) => sum + item.xp, 0) };
  }

  function computeXp(progress, sessions) {
    return computeXpBreakdown(progress, sessions).total;
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
    // Mission tracks "categories with at least one live tool", not raw tool
    // count — a category with 2+ tools shouldn't inflate progress past 100%
    // of what's actually filled in.
    const liveCategoryCount = new Set(tools.filter((tool) => tool.url).map((tool) => tool.category)).size;
    const missionTotal = Object.keys(categoryLabels).length;
    const missionCurrent = Math.min(liveCategoryCount, missionTotal);

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

  function setupExplorerPanel() {
    const trigger = document.querySelector("#explorerTrigger");
    const dialog = document.querySelector("#explorerDialog");
    if (!trigger || !dialog || typeof dialog.showModal !== "function") return;
    const body = dialog.querySelector("[data-explorer-body]");

    function render() {
      const progress = readProgress();
      const { items, total } = computeXpBreakdown(progress, readQuizSessions());
      const level = levelFromXp(total);
      const toNext = level >= 10 ? 0 : level * 100 - total;
      const title = dialog.querySelector("[data-explorer-title]");
      const summary = dialog.querySelector("[data-explorer-summary]");
      title.textContent = `微光探索者 Lv.${level}`;
      summary.textContent = level >= 10
        ? `${total} XP・已達最高等級`
        : `${total} XP・距離 Lv.${level + 1} 還差 ${toNext} XP`;
      body.textContent = "";
      items.forEach((item) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        name.className = "xp-row-name";
        name.textContent = item.label;
        const hint = document.createElement("small");
        hint.textContent = item.hint;
        name.appendChild(hint);
        const value = document.createElement("strong");
        value.textContent = `${item.xp} / ${item.max}`;
        const track = document.createElement("div");
        track.className = "xp-row-track";
        const fill = document.createElement("i");
        fill.style.width = `${Math.round((item.xp / item.max) * 100)}%`;
        track.appendChild(fill);
        row.append(name, value, track);
        body.appendChild(row);
      });
    }

    trigger.addEventListener("click", () => {
      render();
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
    });
    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector("[data-explorer-close]").addEventListener("click", () => dialog.close());
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
        if (visibleCount === 0) {
          // No search query + a specific category selected means the category
          // simply has no tools yet — say "coming soon" instead of the
          // search-flavored "no results" copy.
          emptyState.textContent = !query && activeFilter !== "all"
            ? "這個分類的工具準備中，敬請期待！"
            : "找不到符合的入口。可以換個關鍵字或切回全部。";
        }
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

  function setupNewsToggle() {
    const newsList = document.querySelector("#newsList");
    const toggleButton = document.querySelector("#newsToggle");
    if (!newsList || !toggleButton) return;
    toggleButton.addEventListener("click", () => {
      const collapsed = newsList.dataset.collapsed !== "false";
      newsList.dataset.collapsed = collapsed ? "false" : "true";
      toggleButton.setAttribute("aria-expanded", collapsed ? "true" : "false");
      toggleButton.textContent = collapsed ? "收合消息" : "查看更多消息";
      if (!collapsed) newsList.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  renderTools();
  markVisit();
  setupFilters();
  setupExplorerPanel();
  setupNewsNavigation();
  setupNewsToggle();
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
