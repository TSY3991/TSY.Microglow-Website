(function () {
  "use strict";

  // Same-origin keys shared with the portal (see scripts/portal-records.js).
  const STATS_KEY = "amateurRadioQuiz.stats.v1";
  const GAME_STATS_KEY = "tsyMicroglowPortal.gameStats.v1";
  const PROGRESS_KEY = "tsyMicroglowPortal.progress.v1";
  const CLOUD_COUNTS_KEY = "tsyMicroglowPortal.cloudCounts.v1";
  const PRESENCE_KEY_STORAGE = "tsyMicroglowPortal.presenceKey.v1";
  const TOUR_KEY = "tsyMicroglowIsland.tourSeen.v1";

  // Six rays of the light point; ray order follows the hex directions.
  const DISTRICTS = [
    { key: "game", name: "遊戲島", en: "GAMES", color: "#8f52da", blurb: "打開瀏覽器就能玩的微光小遊戲，以及遊戲大廳。" },
    { key: "utility", name: "工具島", en: "TOOLS", color: "#0e8f88", blurb: "照片、影音、PDF、備份與比價等實用工具。" },
    { key: "creative", name: "創作島", en: "CREATIVE", color: "#f06b5d", blurb: "AI 圖片與貼圖等創作工具的集合地。" },
    { key: "learning", name: "學習島", en: "LEARNING", color: "#36b879", blurb: "微光課程學習入口。" },
    { key: "quiz", name: "測驗島", en: "QUIZ", color: "#1497c9", blurb: "三等業餘無線電人員測驗練習。" }
  ];
  const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // Entries fill the middle of each ray first so short districts still look centred.
  const SLOT_ORDER = ["r2", "r3", "r1", "r4", "s2", "s1", "s3"];
  const PROP_BY_ID = {
    "microglow-games": "lobby", tetris: "tetris", snake: "snake", downstairs: "stairs", gem: "gem", orbs: "orbs",
    "business-empire": "city", "microglow-tools": "workshop", "photo-converter": "camera", "car-media-converter": "reel",
    "portable-backup-tool": "drive", "pdf-workshop": "paper", "price-radar": "radar", "microglow-creative": "easel",
    "microglow-learning": "school", "amateur-radio-quiz": "tower"
  };
  const PROP_BY_CATEGORY = { game: "orbs", utility: "workshop", creative: "easel", learning: "school", quiz: "tower" };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- storage + XP (mirrors portal-records.js computeXpBreakdown) ---------- */

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function readProgress() {
    const progress = readJson(PROGRESS_KEY, {});
    return {
      ...progress,
      visitedDays: Array.isArray(progress.visitedDays) ? progress.visitedDays : [],
      searches: Number(progress.searches) || 0,
      filters: Number(progress.filters) || 0,
      launches: progress.launches && typeof progress.launches === "object" ? progress.launches : {}
    };
  }

  function recordLaunch(id) {
    const progress = readProgress();
    progress.launches[id] = (Number(progress.launches[id]) || 0) + 1;
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // Private mode: launching still works, it just is not counted.
    }
  }

  function computeXp() {
    const progress = readProgress();
    const sessions = readJson(STATS_KEY, null)?.sessions;
    const quiz = Array.isArray(sessions) ? sessions : [];
    const gamePlays = Object.values(readJson(GAME_STATS_KEY, {})?.games || {})
      .reduce((total, game) => total + (Number(game?.plays) || 0), 0);
    const bestAccuracy = quiz.reduce((best, s) => {
      const total = Number(s?.total || s?.answered) || 0;
      return Math.max(best, total > 0 ? Math.round(((Number(s?.score) || 0) / total) * 100) : 0);
    }, 0);
    const launches = Object.values(progress.launches).reduce((t, v) => t + (Number(v) || 0), 0);
    const priceReports = Math.max(0, Math.floor(Number(readJson(CLOUD_COUNTS_KEY, {})?.priceReports) || 0));
    return 20
      + Math.min(progress.visitedDays.length * 5, 100)
      + Math.min(progress.searches * 2, 50)
      + Math.min(progress.filters * 2, 50)
      + Math.min(launches * 10, 200)
      + Math.min(quiz.length * 20, 300)
      + Math.min(gamePlays * 10, 200)
      + Math.min(priceReports * 10, 200)
      + (bestAccuracy >= 90 ? 50 : bestAccuracy >= 80 ? 30 : bestAccuracy >= 60 ? 15 : 0);
  }

  function updateXpUi() {
    const xp = computeXp();
    const level = Math.min(10, Math.floor(xp / 100) + 1);
    $("#statLevel").textContent = `Lv.${level}`;
    $("#statXp").textContent = `${xp} XP`;
    const progress = level >= 10 ? 100 : xp % 100;
    $("#statXpBar").style.width = `${progress}%`;
    $("#statXpTrack").setAttribute("aria-valuenow", String(progress));
  }

  /* ---------- content: parsed from the portal's own static HTML ---------- */

  async function loadPortalContent() {
    const response = await fetch("../index.html", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");

    const entries = Array.from(doc.querySelectorAll("#toolGrid article.tool-card")).map((card) => {
      const link = card.querySelector("[data-tool-launch]");
      return {
        id: link?.dataset.toolLaunch || "",
        url: link ? new URL(link.getAttribute("href"), response.url).href : "",
        cta: link?.querySelector("span")?.textContent.trim() || "前往",
        category: card.dataset.category || "",
        kicker: card.querySelector(".tool-copy > p")?.textContent.trim() || "",
        title: card.querySelector(".tool-copy h3")?.textContent.trim() || "",
        text: card.querySelector(".tool-copy > span")?.textContent.trim() || "",
        tags: Array.from(card.querySelectorAll(".feature-tags strong")).map((el) => el.textContent.trim())
      };
    }).filter((entry) => entry.id && entry.url);

    const news = Array.from(doc.querySelectorAll(".news-list .news-item")).map((item) => {
      const link = item.querySelector("strong a");
      return {
        date: item.querySelector("time")?.textContent.trim() || "",
        title: item.querySelector("strong")?.textContent.trim() || "",
        url: link ? new URL(link.getAttribute("href"), response.url).href : "",
        text: item.querySelector("p")?.textContent.trim() || ""
      };
    });
    return { entries, news };
  }

  /* ---------- three.js scene ---------- */

  const THREE = window.THREE;
  const sceneEl = $("#scene");
  const labelsEl = $("#labels");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.error("WebGL 無法啟動：", error);
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xefe6d4, 100, 220);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  const animators = [];
  const labels = [];
  const cells = [];
  const pickables = [];
  const matCache = new Map();

  function mat(color, extra) {
    const key = `${color}|${extra ? JSON.stringify(extra) : ""}`;
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...extra }));
    }
    return matCache.get(key);
  }

  function mesh(geometry, color, x = 0, y = 0, z = 0, extra) {
    const m = new THREE.Mesh(geometry, mat(color, extra));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  const box = (w, h, d, c, x, y, z, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, extra);
  const cyl = (rt, rb, h, c, x, y, z, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z);
  const ball = (r, c, x, y, z, extra) => mesh(new THREE.SphereGeometry(r, 18, 14), c, x, y, z, extra);
  const glow = (c) => ({ emissive: c, emissiveIntensity: 0.9 });

  function shade(hex, amount) {
    const c = new THREE.Color(hex);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * (amount > 0 ? 0.75 : 1)), Math.max(0, Math.min(1, hsl.l + amount)));
    return `#${c.getHexString()}`;
  }

  const HEX_SIZE = 2.3;

  function hexToWorld(q, r) {
    return new THREE.Vector3(HEX_SIZE * Math.sqrt(3) * (q + r / 2), 0, HEX_SIZE * 1.5 * r);
  }

  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function roof(w, d, c, y) {
    const g = new THREE.Group();
    g.add(box(w, d * 0.58, w * 0.72, c, 0, y, 0));
    g.add(box(w * 0.78, d * 0.42, w * 0.56, shade(c, 0.12), 0, y + d * 0.58, 0));
    return g;
  }

  function blockGear(size, color) {
    const g = new THREE.Group();
    const arm = size * 0.22;
    g.add(box(size, arm, arm, color, 0, 0, 0), box(arm, size, arm, color, 0, 0, 0));
    g.add(box(size * 0.48, size * 0.48, arm * 1.25, "#fff4df", 0, size * 0.2, 0));
    return g;
  }

  function blockSignal(size, color) {
    const g = new THREE.Group();
    const t = Math.max(0.025, size * 0.09);
    g.add(box(size, t, t, color, 0, 0, 0), box(size, t, t, color, 0, size - t, 0));
    g.add(box(t, size, t, color, -size / 2 + t / 2, 0, 0), box(t, size, t, color, size / 2 - t / 2, 0, 0));
    return g;
  }

  function blockPadFrame(size, thickness, color) {
    const g = new THREE.Group();
    g.add(box(size, thickness, thickness, color, 0, 0, -size / 2 + thickness / 2));
    g.add(box(size, thickness, thickness, color, 0, 0, size / 2 - thickness / 2));
    g.add(box(thickness, thickness, size - thickness * 2, color, -size / 2 + thickness / 2, 0, 0));
    g.add(box(thickness, thickness, size - thickness * 2, color, size / 2 - thickness / 2, 0, 0));
    return g;
  }

  function flag(color, x, y, z, h = 0.9) {
    const g = new THREE.Group();
    g.add(box(0.05, h, 0.05, "#5b5148", x, y, z));
    const f = box(0.32, 0.2, 0.02, color, x + 0.17, y + h - 0.22, z);
    g.add(f);
    animators.push((t) => { f.rotation.y = Math.sin(t * 3 + x) * 0.25; });
    return g;
  }

  // Toy-model props built from primitives; one per entry kind.
  function buildProp(kind, color) {
    const g = new THREE.Group();
    const light = shade(color, 0.22);
    const dark = shade(color, -0.12);
    switch (kind) {
      case "lobby": {
        // A tiny arcade cabinet: bright screen, marquee, controls and plinth.
        g.add(box(1.12, 0.14, 0.82, dark, 0, 0, 0));
        g.add(box(0.78, 0.86, 0.62, "#fff4df", 0, 0.14, 0));
        g.add(box(0.82, 0.18, 0.66, color, 0, 0.96, 0));
        g.add(box(0.57, 0.42, 0.035, "#17383a", 0, 0.48, 0.33));
        g.add(box(0.46, 0.05, 0.02, "#4fc1e3", 0, 0.59, 0.36));
        g.add(box(0.12, 0.06, 0.055, "#f06b5d", -0.15, 0.23, 0.36));
        g.add(box(0.12, 0.06, 0.055, "#f5b432", 0.14, 0.23, 0.36));
        g.add(box(0.07, 0.07, 0.07, "#36b879", 0, 0.22, 0.36));
        g.add(flag("#f5b432", 0.45, 0.2, -0.22, 0.7));
        break;
      }
      case "tetris": {
        const colors = ["#f06b5d", "#4fc1e3", "#f5b432", "#36b879", color];
        [[0, 0, 0], [0.32, 0, 0], [-0.32, 0, 0], [0, 0.32, 0], [0.32, 0.32, -0.32], [0, 0.64, 0]].forEach(([x, y, z], i) => {
          g.add(box(0.3, 0.3, 0.3, colors[i % colors.length], x, y, z));
        });
        const top = g.children[g.children.length - 1];
        animators.push((t) => { top.position.y = 0.79 + Math.abs(Math.sin(t * 1.5)) * 0.25; });
        break;
      }
      case "snake": {
        for (let i = 0; i < 7; i += 1) {
          const s = box(0.22, 0.22, 0.22, i === 6 ? "#36b879" : light, -0.6 + i * 0.2, 0.05, 0);
          g.add(s);
          animators.push((t) => { s.position.z = Math.sin(t * 2.4 + i * 0.7) * 0.22; });
        }
        g.add(box(0.24, 0.24, 0.24, "#f06b5d", 0.15, 0.02, 0.42), box(0.08, 0.08, 0.08, "#36b879", 0.15, 0.26, 0.42));
        break;
      }
      case "stairs": {
        for (let i = 0; i < 5; i += 1) g.add(box(0.5, 0.12 + i * 0.16, 0.26, i % 2 ? light : "#fff4df", 0, 0, 0.55 - i * 0.26));
        const kid = box(0.18, 0.18, 0.18, "#f5b432", 0, 0.81, -0.5);
        g.add(kid);
        animators.push((t) => { kid.position.y = 0.95 + Math.abs(Math.sin(t * 3)) * 0.2; });
        break;
      }
      case "gem": {
        g.add(box(0.82, 0.14, 0.82, "#fff4df", 0, 0, 0));
        const gem = box(0.52, 0.52, 0.52, light, 0, 0.42, 0, { emissive: color, emissiveIntensity: 0.35, roughness: 0.2 });
        g.add(gem);
        animators.push((t) => { gem.rotation.y = t * 0.8; gem.position.y = 0.7 + Math.sin(t * 2) * 0.06; });
        break;
      }
      case "orbs": {
        ["#f06b5d", "#4fc1e3", "#f5b432"].forEach((c, i) => {
          const a = (i / 3) * Math.PI * 2;
          const o = box(0.3, 0.3, 0.3, c, Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32);
          g.add(o);
          animators.push((t) => { o.position.y = 0.2 + Math.abs(Math.sin(t * 2 + i)) * 0.18; });
        });
        break;
      }
      case "city": {
        [[-0.32, 1.2, -0.2], [0.12, 0.8, 0.22], [0.38, 1.5, -0.25], [-0.2, 0.55, 0.42]].forEach(([x, h, z], i) => {
          g.add(box(0.3, h, 0.3, i % 2 ? "#fff4df" : light, x, 0, z));
          g.add(box(0.31, 0.06, 0.31, "#f5b432", x, h * 0.7, z));
        });
        break;
      }
      case "workshop": {
        g.add(box(1.16, 0.12, 0.82, dark, 0, 0, 0));
        g.add(box(0.92, 0.48, 0.65, color, 0, 0.12, 0));
        g.add(box(0.42, 0.12, 0.13, "#a5753f", 0, 0.61, -0.04));
        g.add(box(0.46, 0.07, 0.72, "#fff4df", 0, 0.31, 0.34));
        g.add(box(0.16, 0.05, 0.16, "#f5b432", -0.28, 0.28, 0.39));
        g.add(box(0.06, 0.06, 0.035, "#fff4df", -0.28, 0.28, 0.42));
        const gear = blockGear(0.42, "#f5b432");
        gear.position.set(0.52, 0.56, 0.08);
        g.add(gear);
        animators.push((t) => { gear.rotation.z = t; });
        break;
      }
      case "camera": {
        g.add(box(0.92, 0.52, 0.44, dark, 0, 0, 0));
        g.add(box(0.34, 0.13, 0.24, light, -0.17, 0.48, 0));
        g.add(box(0.34, 0.34, 0.16, "#2b2b2b", 0, 0.06, 0.32));
        g.add(box(0.22, 0.22, 0.06, "#4fc1e3", 0, 0.12, 0.43), box(0.18, 0.1, 0.12, "#f06b5d", 0.28, 0.45, 0));
        break;
      }
      case "reel": {
        const disc = new THREE.Group();
        disc.add(box(0.66, 0.12, 0.66, light, 0, 0.42, 0));
        disc.add(box(0.16, 0.16, 0.16, "#5b5148", 0, 0.44, 0));
        [[-0.2, 0], [0.2, 0], [0, -0.2], [0, 0.2]].forEach(([x, z]) => disc.add(box(0.08, 0.08, 0.08, "#fff4df", x, 0.44, z)));
        g.add(disc);
        animators.push((t) => { disc.rotation.y = t * 1.2; });
        break;
      }
      case "drive": {
        g.add(box(0.92, 0.16, 0.65, dark, 0, 0, 0));
        g.add(box(0.78, 0.31, 0.54, "#fff4df", 0, 0.13, 0));
        g.add(box(0.68, 0.08, 0.46, light, 0, 0.42, 0));
        g.add(box(0.18, 0.06, 0.04, "#a5753f", 0, 0.5, 0.24));
        const led = box(0.08, 0.08, 0.08, "#36b879", 0.26, 0.46, 0.24, glow("#36b879"));
        g.add(led, box(0.08, 0.08, 0.08, "#f5b432", -0.26, 0.46, 0.24));
        animators.push((t) => { led.visible = Math.sin(t * 6) > -0.2; });
        break;
      }
      case "paper": {
        for (let i = 0; i < 5; i += 1) {
          const p = box(0.55, 0.06, 0.72, "#fffdf8", 0, i * 0.07, 0);
          p.rotation.y = (hash(i + 3) - 0.5) * 0.4;
          g.add(p);
        }
        g.add(box(0.22, 0.08, 0.1, "#f25757", 0.12, 0.35, 0.2));
        for (let i = 0; i < 3; i += 1) g.add(box(0.3, 0.012, 0.025, i === 0 ? "#4fc1e3" : "#a9b8b2", -0.02, 0.39, -0.13 + i * 0.12));
        break;
      }
      case "radar": {
        g.add(box(0.14, 0.6, 0.14, "#5b5148", 0, 0, 0));
        const pivot = new THREE.Group();
        pivot.add(box(0.78, 0.12, 0.55, light, 0, 0.58, 0));
        pivot.add(box(0.58, 0.08, 0.08, "#fff4df", 0, 0.7, 0.12));
        pivot.add(box(0.08, 0.34, 0.08, "#a5753f", 0, 0.42, 0));
        g.add(box(0.14, 0.55, 0.14, "#a5753f", 0, 0, 0));
        g.add(pivot);
        animators.push((t) => { pivot.rotation.y = t * 0.9; });
        break;
      }
      case "easel": {
        const legs = [[-0.22, 0.1], [0.22, 0.1], [0, -0.22]];
        legs.forEach(([x, z]) => {
          const leg = box(0.06, 1.1, 0.06, "#a5753f", x, 0, z);
          leg.rotation.z = x === 0 ? 0.12 : x < 0 ? -0.16 : 0.16;
          g.add(leg);
        });
        g.add(box(0.78, 0.62, 0.08, "#a5753f", 0, 0.45, 0.16));
        g.add(box(0.66, 0.5, 0.035, "#fffdf8", 0, 0.5, 0.22));
        g.add(box(0.2, 0.28, 0.12, "#f06b5d", -0.1, 0.69, 0.26));
        g.add(box(0.14, 0.14, 0.14, "#f5b432", -0.38, 0.18, 0.2), box(0.12, 0.12, 0.12, "#4fc1e3", -0.2, 0.18, 0.2), box(0.12, 0.12, 0.12, color, -0.3, 0.3, 0.31));
        break;
      }
      case "school": {
        g.add(box(1.0, 0.55, 0.6, "#fff4df", 0, 0, 0));
        g.add(roof(1.0, 0.68, color, 0.55));
        g.add(box(0.22, 0.32, 0.04, dark, 0, 0, 0.31));
        g.add(box(0.18, 0.08, 0.18, "#fffdf8", 0, 0.62, 0.31));
        [-0.32, 0.32].forEach((x) => g.add(box(0.18, 0.18, 0.035, "#4fc1e3", x, 0.19, 0.32)));
        g.add(box(0.72, 0.07, 0.48, "#36b879", 0, 0.72, -0.02));
        g.add(flag("#f5b432", 0.6, 0, 0.35, 1.3));
        break;
      }
      case "tower": {
        // A pocket radio with a clear antenna and animated signal waves.
        g.add(box(0.72, 0.95, 0.34, color, 0, 0.08, 0));
        g.add(box(0.5, 0.48, 0.035, "#17383a", 0, 0.38, 0.19));
        g.add(box(0.35, 0.045, 0.02, "#4fc1e3", 0, 0.55, 0.215));
        g.add(box(0.12, 0.07, 0.05, "#f5b432", -0.2, 0.16, 0.21), box(0.12, 0.07, 0.05, "#f06b5d", 0.2, 0.16, 0.21));
        const antenna = box(0.05, 0.92, 0.05, "#a5753f", 0.24, 0.9, -0.08);
        antenna.rotation.z = -0.18;
        g.add(antenna);
        const tip = box(0.1, 0.1, 0.1, "#f25757", 0.34, 1.73, -0.08, glow("#f25757"));
        g.add(tip);
        const ring = blockSignal(0.52, "#4fc1e3");
        ring.position.set(0.34, 1.7, -0.08);
        g.add(ring);
        animators.push((t) => {
          const p = (t * 0.8) % 1;
          ring.scale.setScalar(0.4 + p * 2.2);
          ring.visible = p < 0.9;
          tip.visible = Math.sin(t * 4) > 0;
        });
        break;
      }
      case "kiosk": {
        g.add(box(0.08, 0.8, 0.08, "#5b5148", -0.3, 0, 0), box(0.08, 0.8, 0.08, "#5b5148", 0.3, 0, 0));
        g.add(box(0.85, 0.5, 0.08, color, 0, 0.6, 0));
        g.add(box(0.7, 0.36, 0.09, "#fffdf8", 0, 0.67, 0));
        break;
      }
      case "bench": {
        g.add(box(0.6, 0.06, 0.22, "#c99a62", 0, 0.18, 0), box(0.6, 0.2, 0.05, "#c99a62", 0, 0.24, -0.1));
        g.add(box(0.05, 0.18, 0.18, "#5b5148", -0.25, 0, 0), box(0.05, 0.18, 0.18, "#5b5148", 0.25, 0, 0));
        break;
      }
      case "lamp": {
        g.add(box(0.07, 0.85, 0.07, "#5b5148", 0, 0, 0));
        g.add(box(0.24, 0.22, 0.24, "#fff2ce", 0, 0.84, 0, glow("#f5b432")));
        break;
      }
      case "flowers": {
        for (let i = 0; i < 6; i += 1) {
          const a = hash(i * 7.1) * Math.PI * 2;
          const r = 0.15 + hash(i * 3.3) * 0.4;
          g.add(box(0.13, 0.13, 0.13, ["#f06b5d", "#f5b432", "#fffdf8", "#8f52da"][i % 4], Math.cos(a) * r, 0.04, Math.sin(a) * r));
        }
        break;
      }
      default: { // tree
        g.add(box(0.13, 0.35, 0.13, "#a5753f", 0, 0, 0));
        g.add(box(0.48, 0.42, 0.48, shade("#36b879", hash(color.length) * 0.1), 0, 0.32, 0));
        g.add(box(0.34, 0.3, 0.34, "#62a36e", 0.05, 0.7, 0.02));
      }
    }
    gridifyBlockMeshes(g, 0.26, 0.012);
    return g;
  }

  const GRID_BRICK_GEO = new THREE.BoxGeometry(1, 1, 1);
  const GRID_STUD_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const LEGO_MATERIALS = new WeakMap();
  const FLOOR_NEUTRALS = ["#eee9dc", "#f4f3ed"];

  function legoMaterial(source) {
    if (!LEGO_MATERIALS.has(source)) {
      const plastic = source.clone();
      plastic.color.set("#ffffff");
      plastic.vertexColors = true;
      plastic.roughness = 0.34;
      plastic.metalness = 0.02;
      plastic.needsUpdate = true;
      LEGO_MATERIALS.set(source, plastic);
    }
    return LEGO_MATERIALS.get(source);
  }

  function legoBrickColor(color, seed) {
    const marker = ((Math.trunc(seed) % 29) + 29) % 29;
    const result = color.clone();
    const hsl = {};
    result.getHSL(hsl);
    if (hsl.l > 0.2 && hsl.l < 0.84 && hsl.s > 0.12) {
      hsl.s = Math.min(0.68, hsl.s);
      hsl.l = Math.max(0.34, Math.min(0.67, hsl.l * 1.04 + (marker % 3 - 1) * 0.025));
      result.setHSL(hsl.h, hsl.s, hsl.l);
    }
    return result;
  }

  function appendScaledGeometry(source, sx, sy, sz, cx, cy, cz, positions, normals, colors, indices, paint, rotation = 0) {
    const position = source.attributes.position;
    const normal = source.attributes.normal;
    const first = positions.length / 3;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i) * sx;
      const y = position.getY(i) * sy;
      const z = position.getZ(i) * sz;
      positions.push(x * cos + z * sin + cx, y + cy, -x * sin + z * cos + cz);
      const nx = normal.getX(i) / sx;
      const ny = normal.getY(i) / sy;
      const nz = normal.getZ(i) / sz;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push((nx * cos + nz * sin) / length, ny / length, (-nx * sin + nz * cos) / length);
      colors.push(paint.r, paint.g, paint.b);
    }
    if (source.index) {
      for (let i = 0; i < source.index.count; i += 1) indices.push(first + source.index.getX(i));
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(first + i);
    }
  }

  function gridifyBlockMesh(part, pitch, seam) {
    const { width, height, depth } = part.geometry.parameters;
    if (Math.min(width, height, depth) < 0.055) return;
    const across = Math.max(1, Math.ceil(width / pitch));
    const high = Math.max(1, Math.ceil(height / pitch));
    const deep = Math.max(1, Math.ceil(depth / pitch));
    const cellX = width / across;
    const cellY = height / high;
    const cellZ = depth / deep;
    const gap = Math.min(seam, cellX * 0.06, cellY * 0.06, cellZ * 0.06);
    const brickX = Math.max(0.025, cellX - gap);
    const brickY = Math.max(0.025, cellY - gap);
    const brickZ = Math.max(0.025, cellZ - gap);
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const color = part.material.color.clone();
    const addBrick = (sx, sy, sz, x, y, z, seed) => appendScaledGeometry(GRID_BRICK_GEO, sx, sy, sz, x, y, z, positions, normals, colors, indices, legoBrickColor(color, seed));
    const addStud = (width, height, x, y, z, seed) => appendScaledGeometry(GRID_STUD_GEO, width, height, width, x, y, z, positions, normals, colors, indices, legoBrickColor(color, seed));

    for (let iy = 0; iy < high; iy += 1) {
      const y = -height / 2 + (iy + 0.5) * cellY;
      for (let ix = 0; ix < across; ix += 1) {
        const x = -width / 2 + (ix + 0.5) * cellX;
        for (let iz = 0; iz < deep; iz += 1) {
          const z = -depth / 2 + (iz + 0.5) * cellZ;
          const seed = part.id * 37 + ix * 17 + iy * 11 + iz * 7;
          addBrick(brickX, brickY, brickZ, x, y, z, seed);
          if (iy === high - 1) {
            const studWidth = Math.min(cellX, cellZ) * 0.58;
            const studHeight = Math.min(cellY * 0.24, 0.045);
            addStud(studWidth, studHeight, x, y + brickY / 2 + studHeight / 2, z, seed);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    part.geometry = geometry;
    part.material = legoMaterial(part.material);
    part.castShadow = true;
    part.receiveShadow = true;
  }

  function gridifyBlockMeshes(root, pitch, seam) {
    const blocks = [];
    root.traverse((part) => {
      if (part.isMesh && part.geometry.type === "BoxGeometry") blocks.push(part);
    });
    blocks.forEach((part) => gridifyBlockMesh(part, pitch, seam));
  }

  let legoFloorMaterial = null;

  function finishLegoGeometry(positions, normals, colors, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function legoFloorMat() {
    if (!legoFloorMaterial) {
      legoFloorMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.36, metalness: 0.02 });
    }
    return legoFloorMaterial;
  }

  function tileColor(districtColor, roll) {
    if (roll < 0.72) return new THREE.Color(FLOOR_NEUTRALS[0]);
    if (roll < 0.9) return new THREE.Color(FLOOR_NEUTRALS[1]);
    return new THREE.Color(districtColor).lerp(new THREE.Color(FLOOR_NEUTRALS[0]), 0.62);
  }

  function addStuddedHexFloor(root, radius, floorY, rotation, districtColor, seed) {
    const tile = 0.64;
    const thickness = 0.075;
    const gap = 0.018;
    const studWidth = 0.2;
    const studHeight = 0.045;
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const limit = radius * Math.cos(Math.PI / 6) - tile * 0.72;
    const edgeNormals = Array.from({ length: 6 }, (_, i) => Math.PI / 6 + i * Math.PI / 3);
    const across = Math.ceil(radius / tile);

    for (let ix = -across; ix <= across; ix += 1) {
      const x = ix * tile;
      for (let iz = -across; iz <= across; iz += 1) {
        const z = iz * tile;
        if (edgeNormals.some((a) => x * Math.cos(a) + z * Math.sin(a) > limit)) continue;
        const color = tileColor(districtColor, hash(seed + ix * 71 + iz * 97));
        appendScaledGeometry(GRID_BRICK_GEO, tile - gap, thickness, tile - gap, x, thickness / 2, z,
          positions, normals, colors, indices, color);
        appendScaledGeometry(GRID_STUD_GEO, studWidth, studHeight, studWidth, x, thickness + studHeight / 2, z,
          positions, normals, colors, indices, color);
      }
    }

    const floor = new THREE.Mesh(finishLegoGeometry(positions, normals, colors, indices), legoFloorMat());
    floor.position.y = floorY;
    floor.rotation.y = rotation;
    floor.castShadow = true;
    floor.receiveShadow = true;
    root.add(floor);
    return floorY + thickness + studHeight;
  }

  function addHexBrickWall(root, radius, height, rotation, color, seed) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const segmentCount = Math.max(2, Math.ceil(radius / 0.62));
    const rows = Math.max(1, Math.ceil(height / 0.26));
    const segment = radius / segmentCount;
    const brickHeight = height / rows;
    const depth = 0.22;
    const gap = 0.014;
    const studWidth = 0.14;
    const studHeight = 0.035;
    const baseColor = new THREE.Color(color);

    for (let side = 0; side < 6; side += 1) {
      const a0 = rotation + side * Math.PI / 3;
      const a1 = rotation + (side + 1) * Math.PI / 3;
      const x0 = radius * Math.cos(a0);
      const z0 = radius * Math.sin(a0);
      const x1 = radius * Math.cos(a1);
      const z1 = radius * Math.sin(a1);
      const dx = x1 - x0;
      const dz = z1 - z0;
      const length = Math.hypot(dx, dz);
      const outwardX = ((x0 + x1) / 2) / (radius * Math.cos(Math.PI / 6));
      const outwardZ = ((z0 + z1) / 2) / (radius * Math.cos(Math.PI / 6));
      const turn = Math.atan2(-dz, dx);

      for (let row = 0; row < rows; row += 1) {
        const y = (row + 0.5) * brickHeight;
        for (let i = 0; i < segmentCount; i += 1) {
          const t = (i + 0.5) / segmentCount;
          const x = x0 + dx * t - outwardX * depth / 2;
          const z = z0 + dz * t - outwardZ * depth / 2;
          const paint = legoBrickColor(baseColor, seed + side * 101 + row * 31 + i * 17);
          appendScaledGeometry(GRID_BRICK_GEO, segment - gap, brickHeight - gap, depth - gap,
            x, y, z, positions, normals, colors, indices, paint, turn);
          if (row === rows - 1) {
            appendScaledGeometry(GRID_STUD_GEO, studWidth, studHeight, studWidth, x,
              y + (brickHeight - gap) / 2 + studHeight / 2, z, positions, normals, colors, indices, paint, turn);
          }
        }
      }
    }

    const wall = new THREE.Mesh(finishLegoGeometry(positions, normals, colors, indices), legoFloorMat());
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
    return wall;
  }

  function haloTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,236,170,1)");
    grad.addColorStop(0.4, "rgba(255,200,90,0.45)");
    grad.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const HALO = THREE ? haloTexture() : null;

  function addBeacon(cell) {
    if (cell.beacon) return;
    const b = new THREE.Group();
    const star = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), "#f5b432", 0, 0, 0, glow("#f5b432"));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, transparent: true, depthWrite: false }));
    halo.scale.setScalar(0.9);
    b.add(star, halo);
    gridifyBlockMeshes(b, 0.1, 0.008);
    b.position.set(0, cell.height + cell.propTop + 0.35, 0);
    cell.group.add(b);
    cell.beacon = b;
    animators.push((t) => { star.rotation.y = t * 2; b.position.y = cell.height + cell.propTop + 0.35 + Math.sin(t * 2 + cell.world.x) * 0.06; });
  }

  function addLabel(text, position, className, district) {
    const el = document.createElement("span");
    el.className = `tag ${className || ""}`;
    el.textContent = text;
    if (district) el.style.setProperty("--district", district.color);
    labelsEl.appendChild(el);
    const label = { el, position };
    labels.push(label);
    return label;
  }

  // Five district islands ring the core plaza. Each island is one broad hex
  // platform; its facilities (the entries) stand on round lots with open
  // ground between them for people to stroll, and a bridge links it to the core.
  const CORE_RADIUS = 4.2;
  const ISLAND_GAP = 4.5;
  const LOT_RING = 3.4;
  let coreCell = null;

  function islandRadius(count) {
    return count <= 1 ? 4.6 : 6.6;
  }

  function lotSpots(count) {
    if (count <= 1) return [new THREE.Vector3(0, 0, 0)];
    const ring = Math.min(6, count - 1);
    const spots = [new THREE.Vector3(0, 0, 0)];
    for (let i = 0; i < ring; i += 1) {
      const a = (i / ring) * Math.PI * 2 + Math.PI / 6;
      spots.push(new THREE.Vector3(Math.cos(a) * LOT_RING, 0, Math.sin(a) * LOT_RING));
    }
    return spots;
  }

  function scatter(group, seed, top, radius, count, avoid) {
    const kinds = ["tree", "tree", "flowers", "lamp", "bench"];
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i += 1) {
      const a = hash(seed + i * 5.7) * Math.PI * 2;
      const r = radius * (0.3 + hash(seed + i * 2.3) * 0.58);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 1.7)) continue;
      const item = buildProp(kinds[Math.floor(hash(seed + i * 9.1) * kinds.length)], "#36b879");
      item.position.set(x, top, z);
      item.rotation.y = a;
      item.scale.setScalar(0.9 + hash(seed + i) * 0.4);
      group.add(item);
      placed += 1;
    }
  }

  function buildFacility(island, payload, spot, index) {
    const { district } = island;
    const world = island.world.clone().add(spot);
    const group = new THREE.Group();
    group.position.copy(world);
    const top = island.height;
    const lot = mesh(new THREE.BoxGeometry(2.5, 0.1, 2.5), "#eee9dc", 0, top + 0.05, 0);
    const inset = mesh(new THREE.BoxGeometry(2.28, 0.035, 2.28), shade(district.color, 0.16), 0, top + 0.117, 0);
    const rim = blockPadFrame(2.65, 0.1, shade(district.color, 0.12));
    rim.position.y = top + 0.1;
    group.add(lot, inset, rim);

    const kind = PROP_BY_ID[payload.entry.id] || PROP_BY_CATEGORY[payload.entry.category] || "tree";
    const prop = buildProp(kind, district.color);
    prop.position.y = top + 0.1;
    prop.rotation.y = hash(index + district.color.length) * 0.8 - 0.4;
    prop.scale.setScalar(1.7);
    group.add(prop);
    gridifyBlockMeshes(group, 0.26, 0.012);

    const cell = { district, payload, group, world, height: top + 0.1, lift: 0, island };
    cell.propTop = new THREE.Box3().setFromObject(prop).max.y - cell.height;
    group.traverse((obj) => { if (obj.isMesh) obj.userData.cell = cell; });
    pickables.push(group);
    scene.add(group);
    cells.push(cell);
    cell.label = addLabel(payload.entry.title, new THREE.Vector3(world.x, cell.height + cell.propTop + 0.3, world.z), "", district);
    cell.label.cell = cell;
    return cell;
  }

  function buildIslandFor(district, d, entries) {
    const payloads = entries.filter((e) => e.category === district.key).slice(0, 7).map((entry) => ({ type: "entry", entry }));
    const radius = islandRadius(payloads.length);
    const angle = (d / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const world = dir.clone().multiplyScalar(CORE_RADIUS + ISLAND_GAP + radius);
    const height = 0.5;

    const group = new THREE.Group();
    group.position.copy(world);
    // Rotate the hex so a flat side faces the core and the bridge lands square.
    const towardCore = Math.atan2(-dir.x, -dir.z);
    const rotation = towardCore - Math.PI / 6;
    const base = mesh(new THREE.CylinderGeometry(radius, radius * 1.03, height, 6), shade(district.color, -0.035), 0, height / 2, 0);
    base.rotation.y = rotation;
    group.add(base);
    addHexBrickWall(group, radius, height, rotation, district.color, d * 137 + 5);
    const floorTop = addStuddedHexFloor(group, radius * 0.985, height + 0.035, rotation, district.color, d * 419 + 23);

    const benchSpot = new THREE.Vector3(-radius * 0.68, 0, radius * 0.32);
    const island = { district, world, radius, height: floorTop, isIsland: true, payload: null, lift: 0, lots: [], benches: [benchSpot] };
    const spots = lotSpots(payloads.length);
    island.lots = spots;
    scatter(group, d * 97 + 13, floorTop, radius, payloads.length > 1 ? 7 : 4, spots);
    const bench = buildProp("bench", "#36b879");
    bench.position.set(benchSpot.x, floorTop, benchSpot.z);
    bench.rotation.y = Math.atan2(-benchSpot.x, -benchSpot.z);
    group.add(bench);

    // Shoreline pier toward the core.
    const pierEnd = dir.clone().multiplyScalar(-radius * 0.87);
    group.traverse((obj) => { if (obj.isMesh) obj.userData.cell = island; });
    pickables.push(group);
    scene.add(group);

    district.count = payloads.length;
    district.island = island;
    district.center = world;
    district.cells = payloads.map((payload, i) => buildFacility(island, payload, spots[i], i));

    const from = dir.clone().multiplyScalar(CORE_RADIUS * 0.86);
    const to = world.clone().add(pierEnd);
    buildBridge(from, to, district.color);
    district.bridge = [from, to];

    const sign = world.clone().add(dir.clone().multiplyScalar(radius * 0.55));
    sign.y = 5.2;
    addLabel(`${district.name}・${district.count}`, sign, "is-district", district);
  }

  function buildCore(news) {
    const group = new THREE.Group();
    const height = 0.7;
    const rotation = -Math.PI / 6;
    const base = mesh(new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 1.03, height, 6), "#a98a5a", 0, height / 2, 0);
    base.rotation.y = rotation;
    group.add(base);
    addHexBrickWall(group, CORE_RADIUS, height, rotation, "#e9b94d", 839);
    const top = addStuddedHexFloor(group, CORE_RADIUS * 0.94, height + 0.035, rotation, "#f5b432", 1207);
    const orb = mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), "#fff2ce", 0, top + 1.7, 0, { emissive: "#f5b432", emissiveIntensity: 1.2 });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, transparent: true, depthWrite: false }));
    halo.scale.setScalar(6);
    halo.position.copy(orb.position);
    const lamp = new THREE.PointLight(0xffc766, 10, 16, 1.6);
    lamp.position.copy(orb.position);
    group.add(orb, halo, lamp, cyl(0.18, 0.32, 0.8, "#a5753f", 0, top, 0, 10));
    animators.push((t) => {
      const y = top + 1.7 + Math.sin(t * 1.4) * 0.18;
      orb.position.y = y; halo.position.y = y; lamp.position.y = y;
      halo.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.2;
    });
    // News board: the plaza's notice kiosk shows the latest portal update.
    const board = buildProp("kiosk", "#f5b432");
    board.scale.setScalar(2);
    board.position.set(0, top, 2.3);
    board.rotation.y = Math.PI;
    group.add(board);

    // Studio logo on a round double-sided sign at the back of the plaza.
    const logoTex = new THREE.TextureLoader().load("../assets/microglow-studio-logo.webp");
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 8;
    const sign = new THREE.Group();
    const faceMat = new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.85 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.25), faceMat);
    face.position.z = 0.06;
    const frame = mesh(new THREE.BoxGeometry(2.55, 2.55, 0.16), "#a5753f", 0, 0, 0);
    face.position.z = 0.09;
    sign.add(frame, face,
      box(2.5, 0.08, 0.05, "#f5b432", 0, 1.2, 0.1),
      box(2.5, 0.08, 0.05, "#f5b432", 0, -1.28, 0.1),
      box(0.08, 2.5, 0.05, "#f5b432", -1.2, -1.2, 0.1),
      box(0.08, 2.5, 0.05, "#f5b432", 1.2, -1.2, 0.1));
    sign.position.set(-2.8, top + 2.9, -1.3);
    group.add(sign);
    group.add(box(0.14, 1.4, 0.14, "#a5753f", -2.8, top, -1.3));
    // Always face the logo straight at the viewer.
    animators.push(() => { sign.lookAt(camera.position); });
    const benches = [];
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
      const kind = i % 2 ? "bench" : "lamp";
      const item = buildProp(kind, "#36b879");
      item.position.set(Math.cos(a) * 2.6, top, Math.sin(a) * 2.6);
      item.rotation.y = -a + Math.PI / 2;
      group.add(item);
      if (kind === "bench") benches.push(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
    }
    gridifyBlockMeshes(group, 0.26, 0.012);

    coreCell = { district: null, isCore: true, payload: { type: "core", news }, group, world: new THREE.Vector3(), height: top, lift: 0, propTop: 2.7, radius: CORE_RADIUS * 0.8, lots: [new THREE.Vector3(), new THREE.Vector3(0, 0, 2.3)], benches };
    group.traverse((obj) => { if (obj.isMesh) obj.userData.cell = coreCell; });
    pickables.push(group);
    scene.add(group);
    cells.push(coreCell);
    addLabel("微光核心・公告廣場", new THREE.Vector3(0, top + 3.0, 0), "is-district", { color: "#082528" });
  }

  function buildBridge(from, to, color) {
    const dir = to.clone().sub(from).setY(0);
    const len = dir.length();
    const g = new THREE.Group();
    g.add(box(1.2, 0.14, len, "#c99a62", 0, 0, 0));
    const planks = Math.floor(len / 0.32);
    for (let i = 0; i < planks; i += 1) g.add(box(1.26, 0.03, 0.1, "#a5753f", 0, 0.14, -len / 2 + 0.16 + i * 0.32));
    [-0.62, 0.62].forEach((x) => {
      g.add(box(0.05, 0.05, len, color, x, 0.42, 0));
      for (let z = -len / 2 + 0.1; z <= len / 2; z += 0.8) g.add(box(0.06, 0.42, 0.06, "#a5753f", x, 0.02, z));
    });
    g.position.set((from.x + to.x) / 2, 0.56, (from.z + to.z) / 2);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    gridifyBlockMeshes(g, 0.26, 0.012);
    scene.add(g);
  }

  function buildIsland(entries, news) {
    buildCore(news);
    DISTRICTS.forEach((district, d) => buildIslandFor(district, d, entries));
  }

  function addWorld() {
    scene.add(new THREE.HemisphereLight(0xfff3da, 0x718b87, 0.95));
    const sun = new THREE.DirectionalLight(0xffe8bd, 2.8);
    sun.position.set(-22, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 110 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const water = mesh(new THREE.CircleGeometry(160, 72), "#6fbfd3", 0, -0.02, 0, { roughness: 0.35 });
    water.rotation.x = -Math.PI / 2;
    water.castShadow = false;
    scene.add(water);

    // Little satellite islets and sailboats to fill the sea.
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + hash(i) * 0.5;
      const r = 29 + hash(i + 20) * 8;
      const islet = new THREE.Group();
      const size = 1.2 + hash(i + 40) * 1.4;
      islet.add(cyl(size, size * 1.15, 0.35, "#ecd9b0", 0, 0, 0, 20));
      islet.add(cyl(size * 0.85, size * 0.9, 0.08, "#cfe3b6", 0, 0.35, 0, 20));
      const kinds = ["tree", "tree", "flowers", "lamp"];
      for (let k = 0; k < 2 + Math.floor(hash(i + 60) * 3); k += 1) {
        const p = buildProp(kinds[k % kinds.length], "#36b879");
        const pa = hash(i * 3 + k) * Math.PI * 2;
        p.position.set(Math.cos(pa) * size * 0.45, 0.43, Math.sin(pa) * size * 0.45);
        islet.add(p);
      }
      if (i % 3 === 0) {
        const mill = new THREE.Group();
        mill.add(box(0.1, 2.4, 0.1, "#fffdf8", 0, 0, 0));
        const blades = new THREE.Group();
        for (let b = 0; b < 3; b += 1) {
          const blade = box(0.08, 1.1, 0.03, "#fffdf8", 0, 0, 0);
          blade.rotation.z = (b / 3) * Math.PI * 2;
          blades.add(blade);
        }
        blades.position.set(0, 2.4, 0.08);
        mill.add(blades);
        mill.position.set(size * 0.2, 0.43, 0);
        gridifyBlockMeshes(mill, 0.26, 0.012);
        islet.add(mill);
        animators.push((t) => { blades.rotation.z = t * 1.5 + i; });
      }
      islet.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(islet);
    }
    for (let i = 0; i < 4; i += 1) {
      const boat = new THREE.Group();
      boat.add(box(0.5, 0.22, 1.2, "#fffdf8", 0, 0, 0), box(0.04, 1.1, 0.04, "#a5753f", 0, 0.22, 0));
      const sailColor = ["#ef735f", "#0e8f88", "#d55e62", "#62a36e"][i];
      boat.add(box(0.12, 0.9, 0.56, sailColor, 0, 0.78, 0.15));
      boat.add(box(0.12, 0.48, 0.38, shade(sailColor, 0.18), 0, 1.08, 0.15));
      gridifyBlockMeshes(boat, 0.26, 0.012);
      scene.add(boat);
      const r = 24 + i * 1.6;
      const speed = 0.04 + hash(i + 7) * 0.03;
      animators.push((t) => {
        const a = t * speed * (i % 2 ? -1 : 1) + i * 1.7;
        boat.position.set(Math.cos(a) * r, 0.05 + Math.sin(t * 2 + i) * 0.05, Math.sin(a) * r);
        boat.rotation.y = -a + (i % 2 ? 0 : Math.PI);
        boat.rotation.z = Math.sin(t * 1.6 + i) * 0.06;
      });
    }
  }

  /* ---------- original toy residents: five roles, shared geometry and materials ---------- */

  const people = [];
  let peopleVisible = true;
  const ROLE_BY_DISTRICT = {
    game: { color: "#ef735f", accessory: "game" },
    utility: { color: "#0e8f88", accessory: "tool" },
    creative: { color: "#d55e62", accessory: "artist" },
    learning: { color: "#62a36e", accessory: "student" },
    quiz: { color: "#398cbd", accessory: "radio" }
  };
  const PERSON_GEO = {};
  const PERSON_MATS = new Map();
  let visitorCount = 0;
  let visitorVisualLimit = 12;

  function personGeometry() {
    if (!PERSON_GEO.body) {
      PERSON_GEO.body = new THREE.BoxGeometry(0.3, 0.34, 0.2);
      PERSON_GEO.head = new THREE.BoxGeometry(0.3, 0.3, 0.28);
      PERSON_GEO.muzzle = new THREE.BoxGeometry(0.085, 0.025, 0.025);
      PERSON_GEO.eye = new THREE.BoxGeometry(0.04, 0.04, 0.025);
      PERSON_GEO.ear = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      PERSON_GEO.limb = new THREE.BoxGeometry(0.085, 0.2, 0.1);
      PERSON_GEO.hand = new THREE.BoxGeometry(0.1, 0.08, 0.12);
      PERSON_GEO.shoe = new THREE.BoxGeometry(0.12, 0.08, 0.16);
      PERSON_GEO.accessory = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      PERSON_GEO.gamePad = new THREE.BoxGeometry(0.24, 0.1, 0.1);
      PERSON_GEO.toolHat = new THREE.BoxGeometry(0.22, 0.1, 0.2);
      PERSON_GEO.artistHat = new THREE.BoxGeometry(0.26, 0.09, 0.24);
      PERSON_GEO.book = new THREE.BoxGeometry(0.22, 0.05, 0.17);
      PERSON_GEO.antenna = new THREE.BoxGeometry(0.025, 0.28, 0.025);
      PERSON_GEO.stud = new THREE.CylinderGeometry(0.035, 0.035, 0.035, 8);
      PERSON_GEO.ring = new THREE.TorusGeometry(0.22, 0.035, 6, 20);
    }
    return PERSON_GEO;
  }

  function addPersonStud(part, material, x = 0, z = 0) {
    const stud = new THREE.Mesh(personGeometry().stud, material);
    stud.position.set(x, 0.1675, z);
    part.add(stud);
  }

  function personMat(color, extra) {
    const key = `${color}|${Boolean(extra)}`;
    if (!PERSON_MATS.has(key)) PERSON_MATS.set(key, mat(color, extra || {}));
    return PERSON_MATS.get(key);
  }

  function roleFor(area) {
    if (area?.district?.key && ROLE_BY_DISTRICT[area.district.key]) return ROLE_BY_DISTRICT[area.district.key];
    const roles = Object.values(ROLE_BY_DISTRICT);
    return roles[Math.floor(Math.random() * roles.length)];
  }

  function walkAreas() {
    return [coreCell, ...DISTRICTS.map((d) => d.island)];
  }

  function randomSpot(area) {
    const limit = (area.isCore ? CORE_RADIUS : area.radius) * 0.78;
    for (let i = 0; i < 12; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * limit;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!area.lots.some((p) => Math.hypot(x - p.x, z - p.z) < 1.5)
        && !(area.benches || []).some((p) => Math.hypot(x - p.x, z - p.z) < 0.9)) {
        return new THREE.Vector3(area.world.x + x, 0, area.world.z + z);
      }
    }
    return new THREE.Vector3(area.world.x + limit * 0.9, 0, area.world.z);
  }

  function makePerson(area, visitor) {
    const geo = personGeometry();
    const g = new THREE.Group();
    const role = roleFor(area);
    const body = new THREE.Mesh(geo.body, personMat(role.color));
    body.position.y = 0.39;
    body.castShadow = true;
    body.add(new THREE.Mesh(geo.book, personMat(shade(role.color, -0.1))));
    body.children[0].position.set(0, -0.105, 0.105);
    body.children[0].scale.set(1.1, 0.55, 0.45);
    const head = new THREE.Mesh(geo.head, personMat("#ffe6c9"));
    head.position.y = 0.73;
    const faceMat = personMat("#3d3029");
    const muzzle = new THREE.Mesh(geo.muzzle, faceMat);
    muzzle.position.set(0, 0.65, 0.153);
    const eyes = [-0.075, 0.075].map((x) => {
      const eye = new THREE.Mesh(geo.eye, faceMat);
      eye.position.set(x, 0.77, 0.153);
      return eye;
    });
    const ears = [-0.12, 0.12].map((x) => {
      const ear = new THREE.Mesh(geo.ear, personMat(role.color));
      ear.position.set(x * 1.3, 0.76, 0);
      const inner = new THREE.Mesh(geo.eye, personMat("#f4b8a0"));
      inner.position.set(x * 1.3, 0.76, 0.044);
      return [ear, inner];
    }).flat();
    [-0.07, 0.07].forEach((x) => addPersonStud(head, personMat(role.color), x));
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.19, 0.49, 0);
      const arm = new THREE.Mesh(geo.limb, personMat(role.color));
      arm.position.y = -0.1;
      arm.rotation.z = side * -0.38;
      const hand = new THREE.Mesh(geo.hand, personMat("#ffe6c9"));
      hand.position.set(0, -0.22, 0.015);
      pivot.add(arm, hand);
      g.add(pivot);
      return pivot;
    });
    const legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.085, 0.18, 0);
      const leg = new THREE.Mesh(geo.limb, personMat("#247b77"));
      leg.position.y = -0.08;
      const shoe = new THREE.Mesh(geo.shoe, personMat("#8b624d"));
      shoe.position.set(0, -0.18, 0.025);
      pivot.add(leg, shoe);
      g.add(pivot);
      return pivot;
    });
    [body, head, muzzle, ...eyes, ...ears].forEach((part) => { part.castShadow = true; g.add(part); });

    const accessory = new THREE.Group();
    if (role.accessory === "game") {
      const pad = new THREE.Mesh(geo.gamePad, personMat("#443b54"));
      pad.add(new THREE.Mesh(geo.accessory, personMat("#f06b5d")), new THREE.Mesh(geo.accessory, personMat("#f5b432")));
      pad.children[0].position.set(-0.055, 0.035, 0.052);
      pad.children[1].position.set(0.055, 0.035, 0.052);
      accessory.add(pad);
      accessory.position.set(0, 0.39, 0.19);
    } else if (role.accessory === "tool") {
      accessory.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.24), personMat("#f5b432")));
      const crown = new THREE.Mesh(geo.toolHat, personMat("#f5b432"));
      crown.position.y = 0.055;
      accessory.add(crown);
      accessory.position.set(0, 0.91, 0);
    } else if (role.accessory === "artist") {
      const brim = new THREE.Mesh(geo.artistHat, personMat("#f5b432"));
      accessory.add(brim, new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.17), personMat("#d55e62")));
      accessory.children[1].position.set(-0.015, 0.07, -0.015);
      accessory.position.set(0, 0.9, 0);
    } else if (role.accessory === "student") {
      const book = new THREE.Mesh(geo.gamePad, personMat("#f5b432"));
      book.add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.08, 0.08), personMat("#fff4df")));
      book.children[0].position.x = 0.12;
      accessory.add(book);
      accessory.position.set(0.19, 0.4, 0.13);
    } else {
      const antenna = new THREE.Mesh(geo.antenna, personMat("#a5753f"));
      antenna.position.set(0.12, 0.16, 0);
      const radio = new THREE.Mesh(geo.gamePad, personMat("#147d9a"));
      radio.position.set(-0.015, -0.12, 0.02);
      const tip = new THREE.Mesh(geo.accessory, personMat("#f5b432", glow("#f5b432")));
      tip.position.set(0.12, 0.31, 0);
      accessory.add(radio, antenna, tip);
      accessory.position.set(0.19, 0.48, 0.11);
    }
    g.add(accessory);
    if (visitor) {
      const ring = new THREE.Mesh(geo.ring, personMat("#f5b432", glow("#f5b432")));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.04;
      ring.scale.setScalar(1.22);
      g.add(ring);
    }
    gridifyBlockMeshes(g, 0.12, 0.008);
    g.visible = peopleVisible;
    scene.add(g);
    const start = randomSpot(area);
    const person = { g, area, visitor, role, path: [], pos: start, wait: Math.random() * 3, speed: 0.65 + Math.random() * 0.35,
      arms, legs, eyes, action: "idle", actionTime: 0, phase: Math.random() * Math.PI * 2 };
    g.position.set(start.x, area.height, start.z);
    people.push(person);
    return person;
  }

  function planRoute(p) {
    const roll = Math.random();
    const here = p.area;
    const BRIDGE_Y = 0.73;
    if (Math.random() < 0.12 && here.benches?.length) {
      const seat = here.benches[Math.floor(Math.random() * here.benches.length)];
      p.path = [{ v: new THREE.Vector3(here.world.x + seat.x, 0, here.world.z + seat.z), y: here.height, area: here, action: "sit" }];
    } else if (Math.random() < 0.18 && !here.isCore && here.district.cells.length) {
      const target = here.district.cells[Math.floor(Math.random() * here.district.cells.length)];
      const away = target.world.clone().sub(here.world).setY(0).normalize().multiplyScalar(1.85);
      p.path = [{ v: target.world.clone().add(away), y: here.height, area: here, action: "inspect" }];
    } else if (here.isCore && roll < 0.3) {
      const d = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
      const [a, b] = d.bridge;
      p.path = [{ v: a, y: BRIDGE_Y }, { v: b, y: BRIDGE_Y }, { v: randomSpot(d.island), y: d.island.height, area: d.island }];
    } else if (!here.isCore && roll < 0.12) {
      const [a, b] = here.district.bridge;
      p.path = [{ v: b, y: BRIDGE_Y }, { v: a, y: BRIDGE_Y }, { v: randomSpot(coreCell), y: coreCell.height, area: coreCell }];
    } else {
      const meet = people.find((other) => other !== p && other.area === here && !other.visitor && p.pos.distanceTo(other.pos) < 7);
      if (meet && Math.random() < 0.45) {
        const direction = p.pos.clone().sub(meet.pos).setY(0).normalize().multiplyScalar(0.72);
        p.path = [{ v: meet.pos.clone().add(direction), y: here.height, area: here, action: "wave" }];
      } else p.path = [{ v: randomSpot(here), y: here.height, area: here }];
    }
    p.action = "walk";
  }

  function populate() {
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    walkAreas().forEach((area) => {
      const n = mobile ? (area.isCore ? 3 : 2) : (area.isCore ? 6 : area.lots.length > 1 ? 5 : 3);
      for (let i = 0; i < n; i += 1) makePerson(area, false);
    });
    visitorVisualLimit = mobile ? 5 : 12;
  }

  function setPeopleCount(count) {
    const target = Math.min(visitorVisualLimit, Math.max(1, count));
    const pool = walkAreas();
    while (visitorCount < target) {
      makePerson(pool[Math.floor(Math.random() * pool.length)], true);
      visitorCount += 1;
    }
    while (visitorCount > target) {
      const index = people.findIndex((p) => p.visitor);
      scene.remove(people[index].g);
      people.splice(index, 1);
      visitorCount -= 1;
    }
  }

  function posePerson(p, time) {
    const walking = p.action === "walk";
    const swing = walking ? Math.sin(time * 7 + p.phase) * 0.55 : 0;
    p.legs[0].rotation.x = swing;
    p.legs[1].rotation.x = -swing;
    p.arms[0].rotation.x = -swing * 0.75;
    p.arms[1].rotation.x = swing * 0.75;
    p.arms[0].rotation.z = p.action === "wave" ? -1.8 + Math.sin(time * 10) * 0.25 : 0;
    const blinking = Math.sin(time * 0.8 + p.phase * 2) > 0.997;
    p.eyes.forEach((eye) => { eye.scale.y = blinking ? 0.15 : 1; });
    if (!p.path.length) p.g.position.y = p.area.height + (walking ? Math.abs(Math.sin(time * 7 + p.phase)) * 0.035 : 0);
    else if (walking) p.g.position.y += Math.abs(Math.sin(time * 7 + p.phase)) * 0.002;
    if (p.action === "sit") {
      p.g.position.y -= 0.1;
      p.legs[0].rotation.x = p.legs[1].rotation.x = -0.65;
    }
    p.g.rotation.x = p.action === "inspect" ? -0.08 : 0;
  }

  function updatePeople(dt) {
    const time = performance.now() / 1000;
    people.forEach((p) => {
      if (!p.path.length) {
        p.wait -= dt;
        p.actionTime = Math.max(0, p.actionTime - dt);
        if (p.actionTime === 0 && ["sit", "wave", "inspect"].includes(p.action)) p.action = "idle";
        if (p.wait <= 0) {
          planRoute(p);
          p.wait = 0.5 + Math.random() * 3;
        }
        posePerson(p, time);
        return;
      }
      const step = p.path[0];
      const target = step.v;
      const dx = target.x - p.pos.x;
      const dz = target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const move = p.speed * dt;
      if (dist <= move) {
        p.pos.set(target.x, 0, target.z);
        if (step.area) p.area = step.area;
        p.path.shift();
        if (step.action) {
          p.action = step.action;
          p.actionTime = step.action === "sit" ? 4 + Math.random() * 4 : 1.4 + Math.random() * 1.3;
          p.wait = p.actionTime;
          if (step.action === "wave") {
            const friend = people.find((other) => other !== p && other.area === p.area && other.pos.distanceTo(p.pos) < 1.3);
            if (friend) {
              friend.action = "wave";
              friend.actionTime = p.actionTime;
              friend.wait = p.actionTime;
            }
          }
        }
      } else {
        p.pos.x += (dx / dist) * move;
        p.pos.z += (dz / dist) * move;
        p.g.rotation.y = Math.atan2(dx, dz);
      }
      p.g.position.x = p.pos.x;
      p.g.position.z = p.pos.z;
      p.g.position.y += (step.y - p.g.position.y) * Math.min(1, dt * 8);
      posePerson(p, time);
    });
  }

  function connectPresence() {
    const client = window.MicroglowAuth?.client;
    if (!client) return;
    let key;
    try {
      key = window.localStorage.getItem(PRESENCE_KEY_STORAGE) || undefined;
    } catch {
      key = undefined;
    }
    const channel = client.channel("portal-online", { config: { presence: { key: key || crypto.randomUUID() } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const count = Math.max(Object.keys(channel.presenceState()).length, 1);
        $("#statOnline").textContent = String(count);
        setPeopleCount(count);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ online_at: Date.now() });
      });
    window.addEventListener("pagehide", () => client.removeChannel(channel));
  }

  /* ---------- camera ---------- */

  const HOME = { radius: 60, theta: 0.55, phi: 0.88, target: new THREE.Vector3(0, 0.6, 0) };
  const view = { radius: HOME.radius, theta: HOME.theta, phi: HOME.phi, target: HOME.target.clone() };
  const goal = { radius: HOME.radius, theta: HOME.theta, phi: HOME.phi, target: HOME.target.clone() };
  let paused = reduceMotion;
  let lastInteraction = 0;

  function goHome() {
    Object.assign(goal, { radius: window.innerWidth < 820 ? 140 : HOME.radius, phi: HOME.phi, target: HOME.target.clone() });
  }

  function focusOn(point, radius) {
    goal.target.set(point.x, 0.8, point.z);
    goal.radius = radius;
    goal.phi = Math.min(goal.phi, 0.95);
    if (point.lengthSq() > 0.01) {
      // Rotate so the focused spot faces the viewer, taking the short way round.
      const wanted = Math.atan2(point.x, point.z);
      let delta = wanted - goal.theta;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      goal.theta += delta;
    }
  }

  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 4);
    view.radius += (goal.radius - view.radius) * k;
    view.theta += (goal.theta - view.theta) * k;
    view.phi += (goal.phi - view.phi) * k;
    view.target.lerp(goal.target, k);
    const sinPhi = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.radius * sinPhi * Math.sin(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sinPhi * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
  }

  /* ---------- picking + selection ---------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let selected = null;

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    return hit?.object.userData.cell || null;
  }

  function selectCell(cell, fromList) {
    selected = cell;
    if (!cell) {
      renderDetail(null);
      return;
    }
    if (cell.isIsland) focusOn(cell.world, 32);
    else if (cell.district) focusOn(cell.world, 20);
    else goHome();
    renderDetail(cell);
    if (!fromList) $("#panel").classList.add("has-detail");
  }

  /* ---------- panel UI ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function isLit(entry) {
    return Number(readProgress().launches[entry.id]) > 0;
  }

  function renderDetail(cell) {
    const box = $("#detail");
    box.replaceChildren();
    document.querySelectorAll(".entries button.is-active").forEach((b) => b.classList.remove("is-active"));
    if (!cell) {
      box.hidden = true;
      $("#panel").classList.remove("has-detail");
      return;
    }
    const district = cell.district || { name: "微光核心", en: "CORE", color: "#082528" };
    box.style.setProperty("--district", district.color);
    const payload = cell.payload;
    const actions = el("div", "actions");
    const close = el("button", "", "關閉");
    close.type = "button";
    close.addEventListener("click", () => selectCell(null));

    if (payload?.type === "entry") {
      const e = payload.entry;
      box.append(el("p", "kicker", `${district.name}・${e.kicker}${isLit(e) ? "・✦ 已點亮" : ""}`), el("h2", "", e.title), el("p", "", e.text));
      if (e.tags.length) {
        const chips = el("div", "chips");
        e.tags.forEach((tag) => chips.append(el("span", "", tag)));
        box.append(chips);
      }
      const go = el("a", "go", `${e.cta} →`);
      go.href = e.url;
      go.addEventListener("click", () => recordLaunch(e.id));
      actions.append(go);
      document.querySelector(`.entries button[data-id="${CSS.escape(e.id)}"]`)?.classList.add("is-active");
    } else if (payload?.type === "news") {
      const n = payload.item;
      box.append(el("p", "kicker", `公告廣場・${n.date}`), el("h2", "", n.title), el("p", "", n.text));
      if (n.url) {
        const go = el("a", "go", "看更新 →");
        go.href = n.url;
        actions.append(go);
      }
    } else if (!cell.district) {
      box.append(el("p", "kicker", "CORE"), el("h2", "", "微光核心"),
        el("p", "", "TSY 微光創作室成立於 2026 年 5 月。五座分區島圍著這座廣場，木橋通往每一區；廣場上的公告看板是入口網站的最新消息。"));
      (payload?.news || []).slice(0, 3).forEach((n) => box.append(el("p", "", `${n.date}｜${n.title}`)));
      const log = el("button", "", "看日誌");
      log.type = "button";
      log.addEventListener("click", () => $("#tabLog").click());
      actions.append(log);
    } else {
      box.append(el("p", "kicker", `${district.name}・${district.en}`), el("h2", "", district.name),
        el("p", "", `${district.blurb} 島上有 ${district.count} 項設施，點設施或清單看介紹。`));
    }
    actions.append(close);
    box.append(actions);
    box.hidden = false;
    $("#panelBody").scrollTop = 0;
  }

  function renderDistrictList() {
    const list = $("#districtList");
    list.replaceChildren();
    DISTRICTS.forEach((district, i) => {
      const section = el("section", "district");
      section.dataset.district = district.key;
      section.style.setProperty("--district", district.color);
      const head = el("button", "district-head");
      head.type = "button";
      const label = el("div");
      label.append(el("strong", "", district.name), el("small", "", district.blurb));
      head.append(el("span", "district-num", String(i + 1).padStart(2, "0")), label, el("em", "", String(district.count)));
      head.addEventListener("click", () => {
        selectCell(null);
        focusOn(district.center, 34);
      });
      section.append(head);

      const ul = el("ul", "entries");
      district.cells.filter((c) => c.payload).forEach((cell) => {
        const li = el("li");
        const b = el("button");
        b.type = "button";
        if (cell.payload.type === "entry") {
          b.dataset.id = cell.payload.entry.id;
          b.append(el("span", "", cell.payload.entry.title));
          if (isLit(cell.payload.entry)) b.append(el("span", "lit", "✦ 已點亮"));
        } else {
          b.append(el("span", "", cell.payload.item.title), el("span", "lit", cell.payload.item.date));
        }
        b.addEventListener("click", () => selectCell(cell, true));
        li.append(b);
        ul.append(li);
      });
      section.append(ul);
      list.append(section);
    });
    applyListFilters();
  }

  function applyListFilters() {
    const query = $("#entrySearch").value.trim().toLocaleLowerCase();
    const category = $("#districtFilter").value;
    let matched = 0;
    document.querySelectorAll(".district").forEach((section) => {
      const district = DISTRICTS.find((item) => item.key === section.dataset.district);
      const categoryMatch = category === "all" || category === district.key;
      let sectionMatches = 0;
      section.querySelectorAll(".entries li").forEach((item, index) => {
        const entry = district.cells?.[index]?.payload?.entry;
        const haystack = entry ? `${entry.title} ${entry.kicker} ${entry.text} ${entry.tags.join(" ")}`.toLocaleLowerCase() : item.textContent.toLocaleLowerCase();
        const match = categoryMatch && (!query || haystack.includes(query));
        item.hidden = !match;
        if (match) sectionMatches += 1;
      });
      section.hidden = !categoryMatch || sectionMatches === 0;
      matched += sectionMatches;
    });
    $("#resultCount").textContent = `${matched} 項作品`;
    $("#emptyState").hidden = matched > 0;
  }

  function renderFallbackList(entries) {
    const list = $("#districtList");
    list.replaceChildren();
    DISTRICTS.forEach((district, index) => {
      const items = entries.filter((entry) => entry.category === district.key);
      const section = el("section", "district");
      section.dataset.district = district.key;
      section.style.setProperty("--district", district.color);
      const head = el("div", "district-head");
      head.append(el("span", "district-num", String(index + 1).padStart(2, "0")), el("div", "", district.name), el("em", "", String(items.length)));
      section.append(head);
      const ul = el("ul", "entries");
      items.forEach((entry) => {
        const li = el("li");
        const link = el("a", "fallback-entry", entry.title);
        link.href = entry.url;
        li.append(link);
        ul.append(li);
      });
      section.append(ul);
      list.append(section);
    });
    $("#loadStatus").hidden = entries.length > 0 && !contentLoadFailed;
    $("#loadStatus").textContent = contentLoadFailed
      ? "暫時讀不到入口網站作品資料，請稍後重試或回入口網站瀏覽。"
      : entries.length ? "3D 場景無法啟動，以下清單仍可開啟作品。" : "首頁目前沒有可顯示的作品。";
    applyListFilters();
  }

  function setupListControls() {
    $("#entrySearch").addEventListener("input", applyListFilters);
    $("#districtFilter").addEventListener("change", applyListFilters);
    const resultText = {
      game: "從遊戲島挑一款微光小遊戲，或進入遊戲大廳。",
      utility: "工具島整理照片、影音、PDF、備份與比價工具。",
      creative: "創作島集合 AI 圖片與貼圖創作入口。",
      learning: "學習島連到微光課程學習入口。",
      quiz: "測驗島提供三等業餘無線電測驗練習入口。"
    };
    $("#finderOptions").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-finder]");
      if (!button) return;
      $("#finderOptions").querySelectorAll("button").forEach((item) => item.classList.toggle("is-selected", item === button));
      $("#districtFilter").value = button.dataset.finder;
      applyListFilters();
      const district = DISTRICTS.find((item) => item.key === button.dataset.finder);
      $("#finderResult").textContent = `${district.name}：${resultText[district.key]}`;
      $("#finderResult").hidden = false;
      $("#panel").classList.add("is-open");
      $("#panelGrip").setAttribute("aria-expanded", "true");
      document.querySelector(`.district[data-district="${CSS.escape(district.key)}"]`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    });
  }

  function renderLog(news) {
    const list = $("#logList");
    list.replaceChildren();
    news.slice(0, 12).forEach((n) => {
      const li = el("li");
      const time = el("time", "", n.date);
      const body = el("div");
      const title = el("strong");
      if (n.url) {
        const a = el("a", "", n.title);
        a.href = n.url;
        title.append(a);
      } else {
        title.textContent = n.title;
      }
      body.append(title, el("p", "", n.text));
      li.append(time, body);
      list.append(li);
    });
  }

  function refreshLit() {
    const entryCells = cells.filter((c) => c.payload?.type === "entry");
    let lit = 0;
    entryCells.forEach((cell) => {
      if (isLit(cell.payload.entry)) {
        lit += 1;
        addBeacon(cell);
        cell.label?.el.classList.add("is-lit");
      }
    });
    $("#statLit").textContent = `${lit} / ${entryCells.length}`;
    const percent = entryCells.length ? Math.round((lit / entryCells.length) * 100) : 0;
    $("#statLitBar").className = `lit-bar progress-${Math.floor(percent / 10) * 10}`;
    $("#statLitHint").textContent = `${percent}% 已點亮・開啟作品累積探索進度`;
  }

  function setupTabs() {
    const tabs = [["#tabMap", "#viewMap"], ["#tabLog", "#viewLog"]];
    tabs.forEach(([tab, panel]) => {
      $(tab).addEventListener("click", () => {
        tabs.forEach(([t, p]) => {
          $(t).setAttribute("aria-selected", String(t === tab));
          $(p).hidden = p !== panel;
        });
        $("#panel").classList.add("is-open");
        $("#panelGrip").setAttribute("aria-expanded", "true");
      });
    });
    $("#panelGrip").addEventListener("click", () => {
      const open = !$("#panel").classList.contains("is-open");
      $("#panel").classList.toggle("is-open", open);
      if (!open) $("#panel").classList.remove("has-detail");
      $("#panelGrip").setAttribute("aria-expanded", String(open));
    });
  }

  function setupToolbar() {
    document.querySelectorAll(".toolbar button").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        const toggle = () => {
          const on = button.getAttribute("aria-pressed") !== "true";
          button.setAttribute("aria-pressed", String(on));
          return on;
        };
        if (action === "home") {
          selectCell(null);
          goHome();
          const bird = document.querySelector('[data-action="bird"]');
          bird.setAttribute("aria-pressed", "false");
        } else if (action === "bird") {
          const on = toggle();
          goal.phi = on ? 0.12 : HOME.phi;
          goal.radius = on ? 78 : HOME.radius;
          goal.target.set(0, 0.6, 0);
        } else if (action === "labels") {
          labelsEl.classList.toggle("is-hidden", !toggle());
        } else if (action === "people") {
          peopleVisible = toggle();
          people.forEach((p) => { p.g.visible = peopleVisible; });
        } else if (action === "pause") {
          paused = toggle();
          button.textContent = paused ? "播放" : "暫停";
        } else if (action === "tour") {
          startTour();
        }
      });
    });
    const pauseButton = document.querySelector('[data-action="pause"]');
    pauseButton.setAttribute("aria-pressed", String(paused));
    pauseButton.textContent = paused ? "播放" : "暫停";
  }

  /* ---------- tour ---------- */

  const TOUR = [
    ["五座分區島", "遊戲、工具、創作、學習、測驗五座島圍著中央的微光核心，每座島上的建築就是那一區的作品。"],
    ["每棟設施是一件作品", "點設施看介紹，按「前往」直接開啟。開啟過的作品會亮起金色的燈，算進你的探索者經驗。"],
    ["戴金圈的小人是線上訪客", "其他小人是島上居民，會沿著木橋在分區間散步。拖曳可旋轉、滾輪或雙指可縮放。右側「日誌」是入口網站的最新公告，跟主站同步。"]
  ];
  let tourIndex = 0;

  function showTourStep() {
    const [title, text] = TOUR[tourIndex];
    $("#tourStep").textContent = `HELLO, MICROGLOW / ${String(tourIndex + 1).padStart(2, "0")}`;
    $("#tourTitle").textContent = title;
    $("#tourText").textContent = text;
    $("#tourNext").textContent = tourIndex === TOUR.length - 1 ? "開始探索" : "下一步 →";
    $("#tour").hidden = false;
    $("#tourBackdrop").hidden = false;
    $("#panel").inert = true;
    $(".brand").inert = true;
    $(".toolbar").inert = true;
    $("#tourNext").focus();
  }

  function endTour() {
    $("#tour").hidden = true;
    $("#tourBackdrop").hidden = true;
    $("#panel").inert = false;
    $(".brand").inert = false;
    $(".toolbar").inert = false;
    document.querySelector('[data-action="tour"]').focus();
    try {
      window.localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Tour will simply show again next visit.
    }
  }

  function startTour() {
    tourIndex = 0;
    showTourStep();
  }

  $("#tourSkip").addEventListener("click", endTour);
  $("#tourNext").addEventListener("click", () => {
    tourIndex += 1;
    if (tourIndex >= TOUR.length) endTour();
    else showTourStep();
  });

  /* ---------- input ---------- */

  function setupInput() {
    const pointers = new Map();
    let downAt = null;
    let pinchStart = 0;
    const canvas = renderer.domElement;

    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      downAt = { x: event.clientX, y: event.clientY, moved: 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y) / goal.radius;
      }
      lastInteraction = performance.now();
    });

    canvas.addEventListener("pointermove", (event) => {
      const prev = pointers.get(event.pointerId);
      if (!prev) {
        const cell = pick(event.clientX, event.clientY);
        hovered = cell?.payload?.type === "entry" ? cell : null;
        canvas.style.cursor = cell ? "pointer" : "";
        return;
      }
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        goal.radius = Math.min(110, Math.max(12, Math.hypot(a.x - b.x, a.y - b.y) / pinchStart));
      } else if (downAt?.moved > 4) {
        sceneEl.classList.add("is-dragging");
        goal.theta -= dx * 0.006;
        goal.phi = Math.min(1.3, Math.max(0.1, goal.phi - dy * 0.005));
      }
      lastInteraction = performance.now();
    });

    const release = (event) => {
      pointers.delete(event.pointerId);
      sceneEl.classList.remove("is-dragging");
      if (downAt && downAt.moved <= 4 && pointers.size === 0 && event.type === "pointerup") {
        const cell = pick(event.clientX, event.clientY);
        selectCell(cell);
      }
      if (pointers.size === 0) downAt = null;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      goal.radius = Math.min(110, Math.max(12, goal.radius * (1 + Math.sign(event.deltaY) * 0.1)));
      lastInteraction = performance.now();
    }, { passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.target.closest("input, textarea")) return;
      if (event.key === "Escape") selectCell(null);
      if (event.key === "ArrowLeft") goal.theta += 0.2;
      if (event.key === "ArrowRight") goal.theta -= 0.2;
    });
  }

  /* ---------- loop ---------- */

  const projected = new THREE.Vector3();

  function updateLabels() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Zoomed out, only district signs show; entry tags appear once you zoom in or point at them.
    const far = view.radius > 40;
    labels.forEach(({ el: tag, position, cell }) => {
      projected.copy(position).project(camera);
      const quiet = Boolean(cell && ((far && cell !== hovered && cell !== selected) || (selected && cell !== selected && cell.island !== selected.island)));
      const screenX = (projected.x * 0.5 + 0.5) * w;
      const screenY = (-projected.y * 0.5 + 0.5) * h;
      const marginX = tag.offsetWidth / 2 + 8;
      const marginY = tag.offsetHeight + 8;
      const offscreen = screenX < marginX || screenX > w - marginX || screenY < marginY || screenY > h - 8;
      tag.classList.toggle("is-behind", projected.z > 1 || quiet || offscreen);
      tag.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%)`;
    });
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!renderer) return;
    renderer.setSize(w, h);
    // Keep the island centred in the space the panel leaves free.
    if (w > 820) camera.setViewOffset(w, h, ($("#panel").offsetWidth + 16) / 2, 0, w, h);
    else camera.setViewOffset(w, h, 0, ($("#panel").offsetHeight) / 3, w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let last = performance.now();
  let clock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      clock += dt;
      if (now - lastInteraction > 4000 && !selected) goal.theta += dt * 0.05;
      animators.forEach((fn) => fn(clock));
      updatePeople(dt);
    }
    cells.forEach((cell) => {
      const target = cell === selected ? 0.35 : cell === hovered ? 0.15 : 0;
      cell.lift += (target - cell.lift) * (1 - Math.exp(-dt * 10));
      cell.group.position.y = cell.lift;
    });
    updateCamera(dt);
    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */

  let contentLoadFailed = false;

  async function boot() {
    updateXpUi();
    setupTabs();
    setupToolbar();
    setupListControls();
    window.addEventListener("storage", () => { updateXpUi(); refreshLit(); });

    let content = { entries: [], news: [] };
    try {
      content = await loadPortalContent();
      $("#loadStatus").hidden = true;
    } catch (error) {
      console.error("無法讀取入口網站內容：", error);
      contentLoadFailed = true;
      $("#loadStatus").textContent = "暫時讀不到作品清單，請回入口網站瀏覽。";
    }

    if (!renderer) {
      $("#fallback").hidden = false;
      DISTRICTS.forEach((d) => { d.count = 0; d.cells = []; });
      $("#panel").classList.add("is-open");
      $("#panelGrip").setAttribute("aria-expanded", "true");
      renderFallbackList(content.entries);
      renderLog(content.news);
      return;
    }

    const mobile = window.matchMedia("(max-width: 820px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneEl.appendChild(renderer.domElement);

    addWorld();
    buildIsland(content.entries, content.news);
    renderDistrictList();
    renderLog(content.news);
    refreshLit();
    populate();
    setPeopleCount(1);
    goHome();
    view.radius = goal.radius + 30;
    view.phi = 0.35;
    resize();
    window.addEventListener("resize", resize);
    setupInput();
    connectPresence();
    $("#statOnline").parentElement.nextElementSibling.textContent = `金圈小人最多顯示 ${visitorVisualLimit} 位線上訪客`;

    let seen = false;
    try {
      seen = window.localStorage.getItem(TOUR_KEY) === "1";
    } catch {
      seen = false;
    }
    if (!seen) startTour();
    requestAnimationFrame(frame);
  }

  boot();
})();
