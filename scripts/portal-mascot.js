(function () {
  "use strict";
  const companion = document.querySelector("#mascotCompanion");
  if (!companion) return;
  const canvas = document.querySelector("#mascotCanvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  const fallback = document.querySelector("#mascotFallback");
  const menu = document.querySelector("#mascotMenu");
  const controls = document.querySelector("#mascotControls");
  const pauseButton = document.querySelector("#mascotPause");
  const restore = document.querySelector("#mascotRestore");
  const status = document.querySelector("#mascotStatus");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sheets = {
    idle: { cols: 3, count: 6 },
    wave: { cols: 4, count: 16, frameMs: 65 },
    walk: { cols: 4, count: 16, frameMs: 65 }
  };
  let ready = false;
  let paused = motionPreference.matches;
  let action = "idle";
  let elapsed = 0;
  let idleTime = 0;
  let lastTime = 0;
  let frameRequest = 0;
  let offset = 0;
  let walkStart = 0;
  let walkTarget = 0;
  let lastFrame = "";

  function maxTravel() {
    // Keep the controls inside the viewport, including on narrow phones.
    return Math.max(0, Math.min(220, window.innerWidth - 252));
  }

  function position() {
    offset = Math.max(-maxTravel(), Math.min(0, offset));
    companion.style.transform = `translateX(${offset}px)`;
  }

  function draw(name, frame, mirror) {
    const key = `${name}:${frame}:${mirror}`;
    if (key === lastFrame || !ready) return;
    lastFrame = key;
    const sheet = sheets[name];
    const source = sheet.image;
    context.clearRect(0, 0, 256, 256);
    context.save();
    if (mirror) { context.translate(256, 0); context.scale(-1, 1); }
    context.drawImage(source, (frame % sheet.cols) * 256,
      Math.floor(frame / sheet.cols) * 256, 256, 256, 0, 0, 256, 256);
    context.restore();
    companion.dataset.frame = `${name}:${frame}`;
  }

  function setAction(next, announce) {
    action = next;
    elapsed = 0;
    idleTime = 0;
    companion.dataset.action = next;
    if (next === "walk") {
      walkStart = offset;
      walkTarget = offset < -maxTravel() / 2 ? 0 : -maxTravel();
    }
    if (announce) status.textContent = { blink: "眨眼，輕輕擺尾", wave: "向你揮揮手", walk: "出發探索！", idle: "休息一下" }[next];
    draw(next === "blink" ? "idle" : next, 0, next === "walk" && walkTarget < walkStart);
  }

  function stop() {
    window.cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    lastTime = 0;
  }

  function animate(time) {
    frameRequest = 0;
    const delta = lastTime ? Math.min(time - lastTime, 60) : 0;
    lastTime = time;
    elapsed += delta;
    if (action === "walk") {
      const duration = Math.max(1000, Math.abs(walkTarget - walkStart) / 0.042);
      offset = walkStart + (walkTarget - walkStart) * Math.min(1, elapsed / duration);
      position();
      draw("walk", Math.floor(elapsed / sheets.walk.frameMs) % sheets.walk.count, walkTarget < walkStart);
      if (elapsed >= duration) setAction("wave", false);
    } else if (action === "wave") {
      draw("wave", Math.floor(elapsed / sheets.wave.frameMs) % sheets.wave.count, false);
      if (elapsed >= sheets.wave.frameMs * sheets.wave.count) setAction("idle", false);
    } else if (action === "blink") {
      draw("idle", Math.min(5, Math.floor(elapsed / 140)), false);
      if (elapsed >= 840) setAction("idle", false);
    } else {
      // Hold open eyes between occasional blinks; tail motion uses authored frames.
      const cycle = elapsed % 5200;
      const frame = cycle < 4200 ? [0, 5, 4, 5][Math.floor(cycle / 1050)] : Math.min(5, Math.floor((cycle - 4200) / 160));
      draw("idle", frame, false);
      idleTime += delta;
      if (idleTime >= 20000 && controls.hidden && !document.querySelector("dialog[open]") && !document.querySelector("input:focus, textarea:focus")) setAction("walk", false);
    }
    start();
  }

  function start() {
    if (!frameRequest && ready && !paused && !companion.hidden && !document.hidden) frameRequest = window.requestAnimationFrame(animate);
  }

  function syncPause() {
    pauseButton.textContent = paused ? "繼續動畫" : "暫停動畫";
    pauseButton.setAttribute("aria-pressed", String(paused));
    companion.dataset.paused = String(paused);
    if (paused) stop(); else start();
  }

  function perform(next) {
    if (!ready) return;
    // Explicit actions remain still when the OS requests reduced motion.
    if (motionPreference.matches) {
      setAction(next, false);
      draw(next === "blink" ? "idle" : next, next === "blink" ? 2 : 1, false);
      status.textContent = "已依系統設定減少動態，顯示動作定格。";
      return;
    }
    paused = false;
    controls.hidden = true;
    menu.setAttribute("aria-expanded", "false");
    setAction(next, true);
    syncPause();
  }

  document.querySelector("#mascotGreet").addEventListener("click", () => perform("wave"));
  document.querySelectorAll("[data-mascot-action]").forEach(button => button.addEventListener("click", () => perform(button.dataset.mascotAction)));
  menu.addEventListener("click", () => {
    if (action === "walk") setAction("idle", false);
    controls.hidden = !controls.hidden;
    menu.setAttribute("aria-expanded", String(!controls.hidden));
  });
  pauseButton.addEventListener("click", () => {
    if (motionPreference.matches) {
      status.textContent = "系統已設定減少動態；吉祥物維持靜止。";
      return;
    }
    paused = !paused;
    syncPause();
  });
  document.querySelector("#mascotHide").addEventListener("click", () => {
    companion.hidden = true;
    controls.hidden = true;
    menu.setAttribute("aria-expanded", "false");
    restore.hidden = false;
    stop();
    restore.focus();
  });
  restore.addEventListener("click", () => {
    companion.hidden = false;
    restore.hidden = true;
    offset = 0;
    position();
    setAction("idle", false);
    start();
    menu.focus();
  });
  companion.addEventListener("keydown", event => {
    if (event.key === "Escape") { controls.hidden = true; menu.setAttribute("aria-expanded", "false"); menu.focus(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
  window.addEventListener("resize", () => { position(); if (action === "walk") setAction("idle", false); });
  motionPreference.addEventListener("change", () => {
    paused = motionPreference.matches;
    setAction("idle", false);
    syncPause();
  });

  Promise.all(Object.entries(sheets).map(async ([name, sheet]) => {
    const image = new Image();
    image.src = `./assets/mascot/${name}.webp?v=20261006b`;
    await image.decode();
    if (image.width !== sheet.cols * 256 || image.height !== Math.ceil(sheet.count / sheet.cols) * 256) throw new Error("Unexpected mascot sheet geometry");
    sheet.image = image;
  })).then(() => {
    ready = true;
    fallback.hidden = true;
    canvas.hidden = false;
    companion.hidden = false;
    setAction("idle", false);
    syncPause();
  }).catch(() => {
    // The original mascot remains available when new assets cannot load.
    companion.hidden = true;
  });
})();
