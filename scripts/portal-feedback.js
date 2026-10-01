(function () {
  "use strict";

  const form = document.querySelector("#feedbackForm");
  const list = document.querySelector("#knownIssueList");
  if (!form || !list) return;

  const client = window.MicroglowAuth?.client;
  const statusEl = document.querySelector("#feedbackStatus");
  const submitBtn = document.querySelector("#feedbackSubmit");
  const COOLDOWN_KEY = "tsyMicroglowPortal.feedbackAt.v1";
  const COOLDOWN_MS = 60 * 1000;
  const STATUS_LABELS = { reported: "已回報", investigating: "處理中", fixed: "已修復" };

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone || "";
  }

  function lastSentAt() {
    try {
      return Number(window.localStorage.getItem(COOLDOWN_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function markSent() {
    try {
      window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    } catch {
      /* private mode: server-side limits still apply */
    }
  }

  function deviceSummary() {
    const touch = window.matchMedia("(pointer: coarse)").matches ? "觸控裝置" : "桌機";
    return `${touch} ${window.innerWidth}x${window.innerHeight}`;
  }

  const ERROR_TEXT = {
    description_too_short: "請多描述一點（至少 5 個字）。",
    description_too_long: "內容太長了，請縮短到 2000 字以內。",
    rate_limited: "目前回報太頻繁，請稍後再試。"
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.elements.website.value) {
      setStatus("已收到，謝謝你的回報！", "ok");
      return;
    }
    const description = form.elements.description.value.trim();
    form.elements.description.removeAttribute("aria-invalid");
    if (description.length < 5) {
      form.elements.description.setAttribute("aria-invalid", "true");
      setStatus(ERROR_TEXT.description_too_short, "error");
      form.elements.description.focus();
      return;
    }
    if (!client) {
      setStatus("回報服務暫時無法使用，請稍後再試。", "error");
      return;
    }
    const wait = COOLDOWN_MS - (Date.now() - lastSentAt());
    if (wait > 0) {
      setStatus(`剛剛已送出一則，請 ${Math.ceil(wait / 1000)} 秒後再送。`, "error");
      return;
    }

    submitBtn.disabled = true;
    setStatus("送出中…", "");
    try {
      const { data, error } = await client.rpc("submit_portal_feedback", {
        p_page: form.elements.page.value,
        p_device: deviceSummary(),
        p_description: description,
        p_contact: form.elements.contact.value,
        p_user_agent: navigator.userAgent
      });
      if (error) throw error;
      if (data && data.ok === false) {
        setStatus(ERROR_TEXT[data.error] || "送出失敗，請稍後再試。", "error");
        return;
      }
      markSent();
      form.reset();
      setStatus("已收到，謝謝你的回報！", "ok");
    } catch (error) {
      console.error("送出回報失敗", error);
      setStatus("送出失敗，請稍後再試。", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  function renderIssues(issues) {
    list.textContent = "";
    if (!issues.length) {
      const empty = document.createElement("li");
      empty.className = "known-issue-empty";
      empty.textContent = "目前沒有公開的已知問題。";
      list.appendChild(empty);
      return;
    }
    issues.forEach((issue) => {
      const item = document.createElement("li");
      item.className = "known-issue";
      const badge = document.createElement("span");
      badge.className = "issue-badge";
      badge.dataset.status = issue.status;
      badge.textContent = STATUS_LABELS[issue.status] || issue.status;
      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = issue.title;
      body.appendChild(title);
      if (issue.summary) {
        const summary = document.createElement("small");
        summary.textContent = issue.summary;
        body.appendChild(summary);
      }
      item.append(badge, body);
      list.appendChild(item);
    });
  }

  async function loadIssues() {
    if (!client) {
      renderIssues([]);
      return;
    }
    try {
      const { data, error } = await client.rpc("list_portal_known_issues");
      if (error) throw error;
      renderIssues(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("載入已知問題失敗", error);
      list.textContent = "";
      const failed = document.createElement("li");
      failed.className = "known-issue-empty";
      failed.textContent = "暫時無法載入已知問題。";
      list.appendChild(failed);
    }
  }

  loadIssues();
})();
