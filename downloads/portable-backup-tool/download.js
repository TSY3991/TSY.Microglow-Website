(function () {
  const REPO = "TSY3991/TSY.PortableBackupTool";
  const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

  const versionEl = document.querySelector("[data-version]");
  const publishedEl = document.querySelector("[data-published]");
  const notesEl = document.querySelector("[data-notes]");
  const downloadsEl = document.querySelector("[data-downloads]");
  const shaEl = document.querySelector("[data-sha]");
  const statusEl = document.querySelector("[data-status]");
  const fallbackEl = document.querySelector("[data-fallback]");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  // Small renderer for GitHub release notes: escapes HTML, groups "- "/"* " lines
  // into <ul><li>, keeps other non-empty lines as paragraphs. Not full Markdown.
  function renderNotes(body) {
    if (!body || !body.trim()) return "<p>此版本未提供更新說明。</p>";
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let inList = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isBullet = /^[-*]\s+/.test(line);
      if (isBullet) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`;
        continue;
      }
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (line) html += `<p>${escapeHtml(line)}</p>`;
    }
    if (inList) html += "</ul>";
    return html || "<p>此版本未提供更新說明。</p>";
  }

  // Groups a release asset filename into one of four known download slots, or
  // null if it doesn't match (e.g. SHA256.txt, ReadMe.txt, LICENSE.txt).
  function classifyAsset(name) {
    const lower = name.toLowerCase();
    const isArm64 = lower.includes("arm64");
    if (lower.endsWith(".exe") && lower.includes("setup")) {
      return {
        group: isArm64 ? "installer-arm64" : "installer-x64",
        label: isArm64 ? "安裝版（ARM64）" : "安裝版（x64，一般電腦）"
      };
    }
    if (lower.endsWith(".zip") && lower.includes("portable")) {
      return {
        group: isArm64 ? "portable-arm64" : "portable-x64",
        label: isArm64 ? "免安裝版（ARM64）" : "免安裝版（x64，一般電腦）"
      };
    }
    return null;
  }

  function buildDownloadCard(asset, meta) {
    return `
      <article class="download-card">
        <div class="download-card-copy">
          <p>${escapeHtml(meta.label)}</p>
          <strong>${escapeHtml(asset.name)}</strong>
          <span>${formatBytes(asset.size)}</span>
        </div>
        <a class="download-button" href="${escapeHtml(asset.browser_download_url)}">
          <span>下載</span>
          <span class="arrow-symbol" aria-hidden="true"></span>
        </a>
      </article>`;
  }

  function buildExtraLink(asset) {
    return `<a href="${escapeHtml(asset.browser_download_url)}">${escapeHtml(asset.name)}（${formatBytes(asset.size)}）</a>`;
  }

  async function loadShaText(assets) {
    if (!shaEl) return;
    const shaAsset = assets.find((asset) => /sha256/i.test(asset.name));
    if (!shaAsset) {
      shaEl.textContent = "此版本未附上 SHA256.txt。";
      return;
    }
    try {
      const response = await fetch(shaAsset.browser_download_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      shaEl.textContent = await response.text();
    } catch {
      shaEl.innerHTML = `無法自動載入雜湊值內容，請直接下載 <a href="${escapeHtml(shaAsset.browser_download_url)}">${escapeHtml(shaAsset.name)}</a> 查看。`;
    }
  }

  async function init() {
    try {
      const response = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];

      if (versionEl) versionEl.textContent = release.tag_name || "未知版本";
      if (publishedEl && release.published_at) {
        publishedEl.textContent = `發布於 ${formatDate(release.published_at)}`;
      }
      if (notesEl) notesEl.innerHTML = renderNotes(release.body);

      const grouped = {};
      const extras = [];
      for (const asset of assets) {
        const meta = classifyAsset(asset.name);
        if (meta) {
          grouped[meta.group] = { asset, meta };
        } else if (!/sha256/i.test(asset.name)) {
          extras.push(asset);
        }
      }

      const order = ["installer-x64", "portable-x64", "installer-arm64", "portable-arm64"];
      const cardsHtml = order
        .filter((key) => grouped[key])
        .map((key) => buildDownloadCard(grouped[key].asset, grouped[key].meta))
        .join("");

      if (downloadsEl) {
        downloadsEl.innerHTML = cardsHtml || "<p>目前找不到可下載的檔案，請直接前往 GitHub Releases 頁面。</p>";
      }

      if (extras.length && fallbackEl) {
        fallbackEl.innerHTML = `其他檔案：${extras.map(buildExtraLink).join("、")}`;
      }

      await loadShaText(assets);
    } catch {
      if (statusEl) {
        statusEl.textContent = "無法自動載入最新版本資訊，請直接前往下方「GitHub Releases 完整頁面」下載。";
        statusEl.hidden = false;
        statusEl.classList.add("is-error");
      }
      if (downloadsEl) downloadsEl.innerHTML = "";
      if (shaEl) shaEl.textContent = "無法載入，請前往 GitHub Releases 頁面查看 SHA256.txt。";
      if (notesEl) notesEl.innerHTML = "<p>無法載入更新說明。</p>";
    }
  }

  init();
})();
