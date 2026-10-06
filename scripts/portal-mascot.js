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
  const roamButton = document.querySelector("#mascotRoam");
  const greet = document.querySelector("#mascotGreet");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sheets = {
    idle: { cols: 4, count: 16, frameMs: 150 },
    blink: { cols: 3, count: 3 },
    wave: { cols: 4, count: 16, frameMs: 65 },
    walk: { cols: 4, count: 16 }
  };
  let ready = false;
  let paused = motionPreference.matches;
  let action = "idle";
  let elapsed = 0;
  let idleTime = 0;
  let lastTime = 0;
  let frameRequest = 0;
  let point = { x: 0, y: 0 };
  let walkStart = { x: 0, y: 0 };
  let walkTarget = { x: 0, y: 0 };
  let roaming = true;
  let nextWalk = 5000;
  let drag = null;
  let suppressClickUntil = 0;
  let lastFrame = "";
  let facingLeft = false;
  let heading = -2.65;
  const blinkFrames = [0, 1, 2, 1, 0];

  function bounds() {
    const bottomSpace = window.innerWidth <= 680 ? 88 : 20;
    const maxX = Math.max(8, window.innerWidth - companion.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - companion.offsetHeight - bottomSpace);
    return { minX: 8, maxX, minY: Math.min(72, maxY), maxY };
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function placeControls() {
    if (controls.hidden) return;
    const width = controls.offsetWidth;
    const height = controls.offsetHeight;
    const x = clamp(point.x + (companion.offsetWidth - width) / 2, 8, Math.max(8, window.innerWidth - width - 8));
    const above = point.y - height - 8;
    const y = above >= 8 ? above : clamp(point.y + companion.offsetHeight + 8, 8, Math.max(8, window.innerHeight - height - 8));
    controls.style.left = `${x - point.x}px`;
    controls.style.top = `${y - point.y}px`;
  }

  function position() {
    const b = bounds();
    point.x = clamp(point.x, b.minX, b.maxX);
    point.y = clamp(point.y, b.minY, b.maxY);
    companion.style.transform = `translate(${point.x}px, ${point.y}px)`;
    placeControls();
  }

  function goHome() {
    const b = bounds();
    point = { x: Math.max(b.minX, b.maxX - 16), y: Math.max(b.minY, b.maxY - 32) };
    heading = -2.65;
    facingLeft = false;
    position();
    setAction("idle", false);
  }

  function chooseDestination() {
    const b = bounds();
    const distance = window.innerWidth <= 680 ? 80 + Math.random() * 80 : 120 + Math.random() * 120;
    let angle = heading + (Math.random() - 0.5) * 1.2;
    let x = point.x + Math.cos(angle) * distance;
    let y = point.y + Math.sin(angle) * distance;
    if (x < b.minX || x > b.maxX) angle = Math.PI - angle;
    if (y < b.minY || y > b.maxY) angle = -angle;
    x = clamp(point.x + Math.cos(angle) * distance, b.minX, b.maxX);
    y = clamp(point.y + Math.sin(angle) * distance, b.minY, b.maxY);
    heading = angle;
    return { x, y };
  }

  function pageBusy() {
    return !controls.hidden || !!document.querySelector("dialog[open], input:focus, textarea:focus, select:focus, [contenteditable='true']:focus");
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
    companion.dataset.facing = mirror ? "left" : "right";
  }

  function setAction(next, announce) {
    action = next;
    elapsed = 0;
    idleTime = 0;
    nextWalk = 5000 + Math.random() * 5000;
    companion.dataset.action = next;
    if (next === "walk") {
      walkStart = { ...point };
      walkTarget = chooseDestination();
      if (Math.abs(walkTarget.x - walkStart.x) > 1) facingLeft = walkTarget.x < walkStart.x;
    }
    if (announce) status.textContent = { blink: "眨眼，輕輕擺尾", wave: "向你揮揮手", walk: "出發探索！", idle: "休息一下" }[next];
    draw(next, 0, facingLeft);
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
    if (action === "walk" && pageBusy()) { start(); return; }
    elapsed += delta;
    if (action === "walk") {
      const distance = Math.hypot(walkTarget.x - walkStart.x, walkTarget.y - walkStart.y);
      const duration = Math.max(1200, distance / 0.052 + 450);
      const ramp = Math.min(450, duration / 4);
      const t = Math.min(elapsed, duration);
      const denominator = 2 * ramp * (duration - ramp);
      const progress = t < ramp ? t * t / denominator : t > duration - ramp
        ? 1 - (duration - t) * (duration - t) / denominator
        : (t - ramp / 2) / (duration - ramp);
      point = { x: walkStart.x + (walkTarget.x - walkStart.x) * progress, y: walkStart.y + (walkTarget.y - walkStart.y) * progress };
      position();
      // Tie each step to distance so feet slow down with the body at both ends.
      const cycles = Math.max(1, Math.round(distance / 54));
      draw("walk", Math.floor(progress * cycles * sheets.walk.count) % sheets.walk.count, facingLeft);
      if (elapsed >= duration) setAction(Math.random() < 0.35 ? "wave" : "idle", false);
    } else if (action === "wave") {
      draw("wave", Math.floor(elapsed / sheets.wave.frameMs) % sheets.wave.count, facingLeft);
      if (elapsed >= sheets.wave.frameMs * sheets.wave.count) setAction("idle", false);
    } else if (action === "blink") {
      draw("blink", blinkFrames[Math.min(4, Math.floor(elapsed / 70))], facingLeft);
      if (elapsed >= 350) setAction("idle", false);
    } else {
      const cycle = elapsed % 6350;
      if (cycle >= 6000) draw("blink", blinkFrames[Math.min(4, Math.floor((cycle - 6000) / 70))], facingLeft);
      else draw("idle", Math.floor(elapsed / sheets.idle.frameMs) % sheets.idle.count, facingLeft);
      if (!pageBusy() && !companion.matches(":hover")) idleTime += delta;
      if (roaming && idleTime >= nextWalk && !pageBusy() && !companion.matches(":hover")) setAction("walk", false);
    }
    start();
  }

  function start() {
    if (!frameRequest && ready && !paused && !drag && !companion.hidden && !document.hidden) frameRequest = window.requestAnimationFrame(animate);
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
      draw(next, next === "blink" ? 2 : 1, facingLeft);
      status.textContent = "已依系統設定減少動態，顯示動作定格。";
      return;
    }
    paused = false;
    controls.hidden = true;
    menu.setAttribute("aria-expanded", "false");
    setAction(next, true);
    syncPause();
  }

  greet.addEventListener("click", () => { if (performance.now() >= suppressClickUntil) perform("wave"); });
  greet.addEventListener("pointerdown", event => {
    if (!ready || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { ...point }, moved: false };
    greet.setPointerCapture(event.pointerId);
    stop();
  });
  greet.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    companion.classList.add("is-dragging");
    point = { x: drag.origin.x + dx, y: drag.origin.y + dy };
    position();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    companion.classList.remove("is-dragging");
    if (greet.hasPointerCapture(event.pointerId)) greet.releasePointerCapture(event.pointerId);
    if (moved) { suppressClickUntil = performance.now() + 500; setAction("idle", false); }
    start();
  }
  greet.addEventListener("pointerup", endDrag);
  greet.addEventListener("pointercancel", endDrag);
  greet.addEventListener("lostpointercapture", endDrag);
  companion.addEventListener("pointerenter", () => { if (action === "walk") setAction("idle", false); });
  document.querySelectorAll("[data-mascot-action]").forEach(button => button.addEventListener("click", () => perform(button.dataset.mascotAction)));
  menu.addEventListener("click", () => {
    if (action === "walk") setAction("idle", false);
    controls.hidden = !controls.hidden;
    menu.setAttribute("aria-expanded", String(!controls.hidden));
    placeControls();
  });
  roamButton.addEventListener("click", () => {
    roaming = !roaming;
    roamButton.textContent = roaming ? "自由散步：開啟" : "自由散步：關閉";
    roamButton.setAttribute("aria-pressed", String(roaming));
    if (action === "walk") setAction("idle", false);
    idleTime = 0;
  });
  document.querySelector("#mascotHome").addEventListener("click", () => { goHome(); status.textContent = "小曜回到角落休息了。"; });
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
    goHome();
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
    image.src = `./assets/mascot/${name}.webp?v=20261007b`;
    await image.decode();
    if (image.width !== sheet.cols * 256 || image.height !== Math.ceil(sheet.count / sheet.cols) * 256) throw new Error("Unexpected mascot sheet geometry");
    sheet.image = image;
  })).then(() => {
    ready = true;
    fallback.hidden = true;
    canvas.hidden = false;
    companion.hidden = false;
    companion.classList.add("is-roaming");
    goHome();
    syncPause();
  }).catch(() => {
    // The original mascot remains available when new assets cannot load.
    companion.hidden = true;
  });
})();
