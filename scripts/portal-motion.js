(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const viewportHeight = () => window.innerHeight || document.documentElement.clientHeight;

  function splitBannerHeadline() {
    const headline = document.querySelector(".banner-copy strong");
    if (!headline || headline.dataset.split) return;
    const text = headline.textContent.trim();
    headline.dataset.split = "true";
    headline.setAttribute("aria-label", text);
    headline.textContent = "";
    Array.from(text).forEach((char, index) => {
      const span = document.createElement("span");
      span.className = "char";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--ci", String(index));
      span.textContent = char;
      headline.appendChild(span);
    });
  }

  function setupScrollProgress() {
    const bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);

    let ticking = false;
    function update() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.setProperty("--p", progress.toFixed(4));
      ticking = false;
    }
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function setupReveal() {
    const selector = [
      ".mission-card",
      ".metric-card",
      ".section-bar",
      ".tool-card",
      ".recommend-card",
      ".feedback-panel"
    ].join(",");
    const targets = Array.from(document.querySelectorAll(selector));
    if (!targets.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    const siblingCount = new Map();
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < viewportHeight() * 0.92) return;
      const index = siblingCount.get(el.parentElement) || 0;
      siblingCount.set(el.parentElement, index + 1);
      el.style.setProperty("--d", `${Math.min(index, 4) * 90}ms`);
      el.classList.add("reveal");
      observer.observe(el);
    });

    // Re-play the entrance when the category filter or search shows a card again.
    const cards = Array.from(document.querySelectorAll("[data-tool-card]"));
    const hiddenObserver = new MutationObserver((mutations) => {
      const shown = mutations
        .map((mutation) => mutation.target)
        .filter((card) => !card.hidden && card.classList.contains("is-in"));
      shown.forEach((card, index) => {
        card.style.setProperty("--d", `${index * 80}ms`);
        card.classList.remove("is-in");
        void card.offsetWidth;
        requestAnimationFrame(() => card.classList.add("is-in"));
      });
    });
    window.addEventListener("beforeprint", () => {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    });
    cards.forEach((card) => {
      hiddenObserver.observe(card, { attributes: true, attributeFilter: ["hidden"] });
    });
  }

  function setupCountUp() {
    const ids = [
      "#portalToolCount",
      "#portalTodayEntry",
      "#portalLevel",
      "#missionScore",
      "#portalCategoryCount"
    ];
    const elements = ids.map((id) => document.querySelector(id)).filter(Boolean);
    if (!elements.length || !("IntersectionObserver" in window)) return;

    function run(el) {
      const original = el.textContent;
      const match = original.match(/^(\D*)(\d+)([\s\S]*)$/);
      if (!match) return;
      const [, prefix, digits, suffix] = match;
      const end = Number(digits);
      if (!Number.isFinite(end) || end <= 0) return;
      const start = performance.now();
      const duration = 1100;
      let written = original;
      (function frame(now) {
        // Someone else (e.g. record sync) updated the text mid-animation: let it win.
        if (el.textContent !== written) return;
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        written = t === 1 ? original : `${prefix}${Math.round(end * eased)}${suffix}`;
        el.textContent = written;
        if (t < 1) requestAnimationFrame(frame);
      })(start);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        run(entry.target);
      });
    }, { threshold: 0.6 });
    elements.forEach((el) => observer.observe(el));
  }

  function setupProgressBars() {
    const bars = ["#explorerXpBar", "#missionProgressBar"]
      .map((id) => document.querySelector(id))
      .filter(Boolean);
    if (!bars.length || !("IntersectionObserver" in window)) return;

    const targets = new Map();
    bars.forEach((bar) => {
      targets.set(bar, bar.style.width);
      bar.style.width = "0%";
    });
    void document.body.offsetWidth;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        entry.target.style.width = targets.get(entry.target) || "0%";
      });
    }, { threshold: 0.6 });
    bars.forEach((bar) => observer.observe(bar));
  }

  function setupOnlineTick() {
    const el = document.querySelector("#siteOnlineCount");
    if (!el) return;
    let last = el.textContent;
    new MutationObserver(() => {
      if (el.textContent === last) return;
      last = el.textContent;
      el.classList.remove("tick");
      void el.offsetWidth;
      el.classList.add("tick");
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  function setupPointerEffects() {
    if (!finePointer) return;

    const spotSelector = [
      ".tool-card",
      ".metric-card",
      ".mission-card",
      ".recommend-card",
      ".news-item",
      ".top-stat",
      ".feedback-panel"
    ].join(",");
    const magnetSelector = ".launch-button, .follow-button, .feedback-button, .account-status-link";
    const banner = document.querySelector(".hero-banner");

    let frame = 0;
    let lastEvent = null;

    function apply() {
      frame = 0;
      const event = lastEvent;
      if (!event) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const spot = target.closest(spotSelector);
      if (spot) {
        const rect = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        spot.style.setProperty("--my", `${event.clientY - rect.top}px`);
      }

      const magnet = target.closest(magnetSelector);
      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
        const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
        magnet.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 8).toFixed(1)}px`;
      }

      if (banner && banner.contains(target)) {
        const rect = banner.getBoundingClientRect();
        banner.style.setProperty("--px", ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
        banner.style.setProperty("--py", ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
      }
    }

    document.addEventListener("pointermove", (event) => {
      lastEvent = event;
      if (!frame) frame = requestAnimationFrame(apply);
    }, { passive: true });

    document.addEventListener("pointerout", (event) => {
      const from = event.target instanceof Element ? event.target : null;
      if (!from) return;
      const magnet = from.closest(magnetSelector);
      if (magnet && !magnet.contains(event.relatedTarget)) magnet.style.translate = "";
      if (banner && banner.contains(from) && !banner.contains(event.relatedTarget)) {
        banner.style.setProperty("--px", "0");
        banner.style.setProperty("--py", "0");
      }
    }, { passive: true });
  }

  function setupIdlePause() {
    const root = document.documentElement;
    const sync = () => root.classList.toggle("is-tab-hidden", document.hidden);
    document.addEventListener("visibilitychange", sync);
    sync();
    const banner = document.querySelector(".hero-banner");
    if (banner && "IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => banner.classList.toggle("is-offscreen", !entry.isIntersecting));
      }).observe(banner);
    }
  }

  function setupSectionNav() {
    if (!("IntersectionObserver" in window)) return;
    const links = Array.from(document.querySelectorAll(".nav-item, .mobile-dock a"))
      .filter((a) => !a.hasAttribute("data-filter-trigger") && a.getAttribute("href")?.startsWith("#"));
    const map = new Map();
    links.forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      if (!id || id === "top") return;
      const target = document.getElementById(id);
      const section = target && (target.closest("section") || target);
      if (!section) return;
      if (!map.has(section)) map.set(section, []);
      map.get(section).push(a);
    });
    if (!map.size) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        (map.get(entry.target) || []).forEach((a) => a.classList.toggle("in-view", entry.isIntersecting));
      });
    }, { rootMargin: "-35% 0px -45% 0px" });
    map.forEach((_, section) => observer.observe(section));
  }

  splitBannerHeadline();
  setupScrollProgress();
  setupReveal();
  setupCountUp();
  setupProgressBars();
  setupOnlineTick();
  setupPointerEffects();
  setupIdlePause();
  setupSectionNav();
})();
