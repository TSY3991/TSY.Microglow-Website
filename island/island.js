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
    $("#statXpBar").style.width = `${level >= 10 ? 100 : xp % 100}%`;
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
        url: link?.getAttribute("href") || "",
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
        url: link?.getAttribute("href") || "",
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
  const box = (w, h, d, c, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z);
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
    const geo = new THREE.CylinderGeometry(w / 2, w / 2, d, 3);
    const m = mesh(geo, c, 0, y + w / 4, 0);
    m.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    m.scale.set(1, 1, 0.55);
    return m;
  }

  function flag(color, x, y, z, h = 0.9) {
    const g = new THREE.Group();
    g.add(cyl(0.025, 0.025, h, "#5b5148", x, y, z, 6));
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
        g.add(box(1.0, 0.55, 0.8, "#fff4df", 0, 0, 0));
        [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]].forEach(([x, z]) => {
          g.add(cyl(0.16, 0.16, 0.8, light, x, 0, z, 10));
          g.add(mesh(new THREE.ConeGeometry(0.21, 0.36, 10), color, x, 0.98, z));
        });
        g.add(flag("#f5b432", 0, 0.55, 0, 0.8));
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
          const s = ball(i === 6 ? 0.17 : 0.13, i === 6 ? dark : light, -0.6 + i * 0.2, 0.15, 0);
          g.add(s);
          animators.push((t) => { s.position.z = Math.sin(t * 2.4 + i * 0.7) * 0.22; });
        }
        break;
      }
      case "stairs": {
        for (let i = 0; i < 5; i += 1) g.add(box(0.5, 0.12 + i * 0.16, 0.26, i % 2 ? light : "#fff4df", 0, 0, 0.55 - i * 0.26));
        const kid = ball(0.11, "#f5b432", 0, 0.9, -0.5);
        g.add(kid);
        animators.push((t) => { kid.position.y = 0.95 + Math.abs(Math.sin(t * 3)) * 0.2; });
        break;
      }
      case "gem": {
        g.add(cyl(0.3, 0.38, 0.16, "#fff4df", 0, 0, 0, 6));
        const gem = mesh(new THREE.OctahedronGeometry(0.36), light, 0, 0.7, 0, { emissive: color, emissiveIntensity: 0.35, roughness: 0.2 });
        g.add(gem);
        animators.push((t) => { gem.rotation.y = t * 0.8; gem.position.y = 0.7 + Math.sin(t * 2) * 0.06; });
        break;
      }
      case "orbs": {
        ["#f06b5d", "#4fc1e3", "#f5b432"].forEach((c, i) => {
          const a = (i / 3) * Math.PI * 2;
          const o = ball(0.2, c, Math.cos(a) * 0.32, 0.2, Math.sin(a) * 0.32);
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
        g.add(box(0.9, 0.5, 0.7, "#fff4df", 0, 0, 0));
        g.add(roof(0.9, 0.78, color, 0.5));
        const gear = mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 10), "#f5b432", 0.62, 0.62, 0.15);
        g.add(gear);
        animators.push((t) => { gear.rotation.z = t; });
        break;
      }
      case "camera": {
        g.add(box(0.75, 0.45, 0.4, dark, 0, 0, 0));
        const lens = cyl(0.17, 0.17, 0.22, "#2b2b2b", 0, 0.05, 0.3, 18);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.23, 0.3);
        g.add(lens, box(0.18, 0.1, 0.12, "#f06b5d", 0.22, 0.45, 0));
        break;
      }
      case "reel": {
        const disc = cyl(0.42, 0.42, 0.1, light, 0, 0, 0, 24);
        disc.rotation.x = Math.PI / 2;
        disc.position.y = 0.5;
        g.add(disc, box(0.12, 0.1, 0.12, "#5b5148", 0, 0, 0));
        animators.push((t) => { disc.rotation.y = t * 1.2; });
        break;
      }
      case "drive": {
        g.add(box(0.7, 0.22, 0.5, "#fff4df", 0, 0, 0), box(0.7, 0.22, 0.5, light, 0, 0.24, 0));
        const led = ball(0.05, "#36b879", 0.25, 0.36, 0.26, glow("#36b879"));
        g.add(led);
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
        break;
      }
      case "radar": {
        g.add(cyl(0.05, 0.07, 0.6, "#5b5148", 0, 0, 0, 8));
        const dish = mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), light, 0, 0.62, 0, { side: THREE.DoubleSide });
        dish.rotation.x = Math.PI * 0.75;
        const pivot = new THREE.Group();
        pivot.add(dish);
        g.add(pivot);
        animators.push((t) => { pivot.rotation.y = t * 0.9; });
        break;
      }
      case "easel": {
        const legs = [[-0.22, 0.1], [0.22, 0.1], [0, -0.22]];
        legs.forEach(([x, z]) => {
          const leg = cyl(0.03, 0.03, 1.1, "#a5753f", x, 0, z, 6);
          leg.rotation.x = z < 0 ? -0.25 : 0.12;
          g.add(leg);
        });
        g.add(box(0.7, 0.55, 0.05, "#fffdf8", 0, 0.45, 0.16));
        g.add(ball(0.1, "#f5b432", -0.12, 0.8, 0.2), ball(0.08, "#4fc1e3", 0.14, 0.62, 0.2), ball(0.07, color, 0.02, 0.72, 0.2));
        break;
      }
      case "school": {
        g.add(box(1.0, 0.55, 0.6, "#fff4df", 0, 0, 0));
        g.add(roof(1.0, 0.68, color, 0.55));
        g.add(box(0.22, 0.32, 0.04, dark, 0, 0, 0.31));
        g.add(cyl(0.12, 0.12, 0.03, "#fffdf8", 0, 0.62, 0.31, 16));
        g.add(flag("#f5b432", 0.6, 0, 0.35, 1.3));
        break;
      }
      case "tower": {
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.4, 1.9, 4, 4, true), color, 0, 0.95, 0, { wireframe: true }));
        g.add(cyl(0.03, 0.03, 1.9, "#5b5148", 0, 0, 0, 6));
        const tip = ball(0.09, "#f25757", 0, 1.98, 0, glow("#f25757"));
        g.add(tip);
        const ring = mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 28), "#4fc1e3", 0, 1.98, 0, glow("#4fc1e3"));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        animators.push((t) => {
          const p = (t * 0.8) % 1;
          ring.scale.setScalar(0.4 + p * 2.2);
          ring.material.opacity = 1 - p;
          tip.visible = Math.sin(t * 4) > 0;
        });
        ring.material.transparent = true;
        break;
      }
      case "kiosk": {
        g.add(cyl(0.05, 0.05, 0.8, "#5b5148", -0.3, 0, 0, 6), cyl(0.05, 0.05, 0.8, "#5b5148", 0.3, 0, 0, 6));
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
        g.add(cyl(0.035, 0.05, 0.85, "#5b5148", 0, 0, 0, 8));
        g.add(ball(0.12, "#fff2ce", 0, 0.92, 0, glow("#f5b432")));
        break;
      }
      case "flowers": {
        for (let i = 0; i < 6; i += 1) {
          const a = hash(i * 7.1) * Math.PI * 2;
          const r = 0.15 + hash(i * 3.3) * 0.4;
          g.add(ball(0.08, ["#f06b5d", "#f5b432", "#fffdf8", "#8f52da"][i % 4], Math.cos(a) * r, 0.1, Math.sin(a) * r));
        }
        break;
      }
      default: { // tree
        g.add(cyl(0.06, 0.08, 0.35, "#a5753f", 0, 0, 0, 6));
        g.add(mesh(new THREE.IcosahedronGeometry(0.34, 0), shade("#36b879", hash(color.length) * 0.1), 0, 0.62, 0, { flatShading: true }));
      }
    }
    return g;
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
    const star = mesh(new THREE.OctahedronGeometry(0.13), "#f5b432", 0, 0, 0, glow("#f5b432"));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, transparent: true, depthWrite: false }));
    halo.scale.setScalar(0.9);
    b.add(star, halo);
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
    const kinds = ["tree", "tree", "tree", "flowers", "lamp", "bench"];
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
    const lot = mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.1, 24), shade(district.color, 0.32), 0, top, 0);
    const rim = mesh(new THREE.TorusGeometry(1.27, 0.06, 6, 32), shade(district.color, -0.05), 0, top + 0.1, 0);
    rim.rotation.x = Math.PI / 2;
    group.add(lot, rim);

    const kind = PROP_BY_ID[payload.entry.id] || PROP_BY_CATEGORY[payload.entry.category] || "tree";
    const prop = buildProp(kind, district.color);
    prop.position.y = top + 0.1;
    prop.rotation.y = hash(index + district.color.length) * 0.8 - 0.4;
    prop.scale.setScalar(1.7);
    group.add(prop);

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
    const base = mesh(new THREE.CylinderGeometry(radius, radius * 1.03, height, 6), shade(district.color, 0.02), 0, height / 2, 0);
    const cap = mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 0.98, 0.08, 6), "#eef3dc", 0, height + 0.04, 0);
    base.rotation.y = cap.rotation.y = towardCore - Math.PI / 6;
    const path = mesh(new THREE.CylinderGeometry(LOT_RING + 0.35, LOT_RING + 0.35, 0.02, 40), "#f4e7cc", 0, height + 0.09, 0);
    const pathHole = mesh(new THREE.CylinderGeometry(LOT_RING - 0.35, LOT_RING - 0.35, 0.03, 40), "#eef3dc", 0, height + 0.09, 0);
    group.add(base, cap);
    if (payloads.length > 1) group.add(path, pathHole);

    const island = { district, world, radius, height: height + 0.1, isIsland: true, payload: null, lift: 0, lots: [] };
    const spots = lotSpots(payloads.length);
    island.lots = spots;
    scatter(group, d * 97 + 13, height + 0.1, radius, payloads.length > 1 ? 12 : 8, spots);

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
    const top = height + 0.1;
    group.add(
      mesh(new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 1.03, height, 6), "#e9d6ac", 0, height / 2, 0),
      mesh(new THREE.CylinderGeometry(CORE_RADIUS * 0.94, CORE_RADIUS * 0.97, 0.08, 6), "#fff8e8", 0, height + 0.04, 0)
    );
    const orb = ball(0.9, "#fff2ce", 0, top + 1.7, 0, { emissive: "#f5b432", emissiveIntensity: 1.2 });
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
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), faceMat);
    face.position.z = 0.06;
    const frame = mesh(new THREE.CylinderGeometry(1.76, 1.76, 0.1, 48), "#a5753f", 0, 0, 0);
    frame.rotation.x = Math.PI / 2;
    sign.add(frame, face);
    sign.position.set(-2.8, top + 2.9, -1.3);
    group.add(sign);
    group.add(cyl(0.08, 0.08, 1.4, "#a5753f", -2.8, top, -1.3, 8));
    // Always face the logo straight at the viewer.
    animators.push(() => { sign.lookAt(camera.position); });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
      const item = buildProp(i % 2 ? "bench" : "lamp", "#36b879");
      item.position.set(Math.cos(a) * 2.6, top, Math.sin(a) * 2.6);
      item.rotation.y = -a + Math.PI / 2;
      group.add(item);
    }

    coreCell = { district: null, isCore: true, payload: { type: "core", news }, group, world: new THREE.Vector3(), height: top, lift: 0, propTop: 2.7, radius: CORE_RADIUS * 0.8, lots: [new THREE.Vector3(), new THREE.Vector3(0, 0, 2.3)] };
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
    g.position.set((from.x + to.x) / 2, 0.45, (from.z + to.z) / 2);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(g);
  }

  function buildIsland(entries, news) {
    buildCore(news);
    DISTRICTS.forEach((district, d) => buildIslandFor(district, d, entries));
  }

  function addWorld() {
    scene.add(new THREE.HemisphereLight(0xfff6e5, 0x9ec7cf, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
    sun.position.set(-22, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
        mill.add(cyl(0.05, 0.08, 2.4, "#fffdf8", 0, 0, 0, 8));
        const blades = new THREE.Group();
        for (let b = 0; b < 3; b += 1) {
          const blade = box(0.08, 1.1, 0.03, "#fffdf8", 0, 0, 0);
          blade.rotation.z = (b / 3) * Math.PI * 2;
          blades.add(blade);
        }
        blades.position.set(0, 2.4, 0.08);
        mill.add(blades);
        mill.position.set(size * 0.2, 0.43, 0);
        islet.add(mill);
        animators.push((t) => { blades.rotation.z = t * 1.5 + i; });
      }
      islet.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(islet);
    }
    for (let i = 0; i < 4; i += 1) {
      const boat = new THREE.Group();
      boat.add(box(0.5, 0.22, 1.2, "#fffdf8", 0, 0, 0), box(0.04, 1.1, 0.04, "#a5753f", 0, 0.22, 0));
      const sail = mesh(new THREE.ConeGeometry(0.42, 0.9, 3), PERSON_COLORS[i], 0, 0.8, 0.15);
      sail.scale.set(0.15, 1, 1);
      boat.add(sail);
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

  /* ---------- people: residents stroll, online visitors wear a gold ring ---------- */

  const people = [];
  let peopleVisible = true;
  const PERSON_COLORS = ["#f06b5d", "#4fc1e3", "#f5b432", "#8f52da", "#36b879", "#2e73df"];
  const PERSON_GEO = {};
  let visitorCount = 0;

  function personGeometry() {
    if (!PERSON_GEO.body) {
      PERSON_GEO.body = new THREE.CylinderGeometry(0.1, 0.14, 0.32, 8);
      PERSON_GEO.head = new THREE.SphereGeometry(0.12, 10, 8);
      PERSON_GEO.ring = new THREE.TorusGeometry(0.22, 0.035, 6, 20);
    }
    return PERSON_GEO;
  }

  function walkAreas() {
    return [coreCell, ...DISTRICTS.map((d) => d.island)];
  }

  function randomSpot(area) {
    // Stay on the island, off the facility lots.
    const limit = (area.isCore ? CORE_RADIUS : area.radius) * 0.78;
    for (let i = 0; i < 10; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * limit;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!area.lots.some((p) => Math.hypot(x - p.x, z - p.z) < 1.5)) {
        return new THREE.Vector3(area.world.x + x, 0, area.world.z + z);
      }
    }
    return new THREE.Vector3(area.world.x + limit * 0.9, 0, area.world.z);
  }

  function makePerson(area, visitor) {
    const geo = personGeometry();
    const g = new THREE.Group();
    const color = PERSON_COLORS[Math.floor(Math.random() * PERSON_COLORS.length)];
    const body = new THREE.Mesh(geo.body, mat(color));
    body.position.y = 0.16;
    const head = new THREE.Mesh(geo.head, mat("#ffe1c4"));
    head.position.y = 0.44;
    body.castShadow = head.castShadow = true;
    g.add(body, head);
    if (visitor) {
      const ring = new THREE.Mesh(geo.ring, mat("#f5b432", glow("#f5b432")));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      g.scale.setScalar(1.3);
    }
    g.visible = peopleVisible;
    scene.add(g);
    const start = randomSpot(area);
    const person = { g, area, visitor, path: [], pos: start, wait: Math.random() * 3, speed: 0.8 + Math.random() * 0.5 };
    g.position.set(start.x, area.height, start.z);
    people.push(person);
    return person;
  }

  // Waypoints carry their own height so people step up onto bridges and back down.
  function planRoute(p) {
    const roll = Math.random();
    const here = p.area;
    const BRIDGE_Y = 0.62;
    if (here.isCore && roll < 0.3) {
      const d = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
      const [a, b] = d.bridge;
      p.path = [{ v: a, y: BRIDGE_Y }, { v: b, y: BRIDGE_Y }, { v: randomSpot(d.island), y: d.island.height, area: d.island }];
    } else if (!here.isCore && roll < 0.12) {
      const [a, b] = here.district.bridge;
      p.path = [{ v: b, y: BRIDGE_Y }, { v: a, y: BRIDGE_Y }, { v: randomSpot(coreCell), y: coreCell.height, area: coreCell }];
    } else {
      p.path = [{ v: randomSpot(here), y: here.height, area: here }];
    }
  }

  function populate() {
    walkAreas().forEach((area) => {
      const n = area.isCore ? 8 : area.lots.length > 1 ? 16 : 8;
      for (let i = 0; i < n; i += 1) makePerson(area, false);
    });
  }

  function setPeopleCount(count) {
    const target = Math.max(1, Math.min(16, count));
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

  function updatePeople(dt) {
    people.forEach((p) => {
      if (!p.path.length) {
        p.wait -= dt;
        if (p.wait <= 0) {
          planRoute(p);
          p.wait = 0.5 + Math.random() * 3;
        }
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
      } else {
        p.pos.x += (dx / dist) * move;
        p.pos.z += (dz / dist) * move;
        p.g.rotation.y = Math.atan2(dx, dz);
      }
      p.g.position.x = p.pos.x;
      p.g.position.z = p.pos.z;
      p.g.position.y += (step.y - p.g.position.y) * Math.min(1, dt * 8);
      p.g.children[0].position.y = 0.16 + Math.abs(Math.sin(performance.now() / 120 + p.g.id)) * 0.04;
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
    Object.assign(goal, { radius: window.innerWidth < 820 ? 84 : HOME.radius, phi: HOME.phi, target: HOME.target.clone() });
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
        } else if (action === "tour") {
          startTour();
        }
      });
    });
    document.querySelector('[data-action="pause"]').setAttribute("aria-pressed", String(paused));
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
  }

  function endTour() {
    $("#tour").hidden = true;
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
      const quiet = Boolean(cell && far && cell !== hovered && cell !== selected);
      tag.classList.toggle("is-behind", projected.z > 1 || quiet);
      tag.style.transform = `translate(${(projected.x * 0.5 + 0.5) * w}px, ${(-projected.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    });
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
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

  async function boot() {
    updateXpUi();
    setupTabs();
    setupToolbar();
    window.addEventListener("storage", () => { updateXpUi(); refreshLit(); });

    let content = { entries: [], news: [] };
    try {
      content = await loadPortalContent();
      $("#loadStatus").hidden = true;
    } catch (error) {
      console.error("無法讀取入口網站內容：", error);
      $("#loadStatus").textContent = "暫時讀不到作品清單，請回入口網站瀏覽。";
    }

    if (!renderer) {
      $("#fallback").hidden = false;
      DISTRICTS.forEach((d) => { d.count = 0; d.cells = []; });
      $("#panel").classList.add("is-open");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
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
