(function () {
  "use strict";

  // 為每個密碼欄位加上「顯示／隱藏密碼」眼睛按鈕（不使用 inline style，符合 CSP）。
  const SVG_NS = "http://www.w3.org/2000/svg";

  function icon(slashed) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const paths = [
      "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z",
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
    ];
    if (slashed) paths.push("M4 4l16 16");
    paths.forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function enhance(input) {
    if (input.dataset.eyeReady) return;
    input.dataset.eyeReady = "1";
    const wrap = document.createElement("div");
    wrap.className = "pw-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pw-eye";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "顯示密碼");
    button.title = "顯示密碼";
    button.appendChild(icon(false));
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      const label = show ? "隱藏密碼" : "顯示密碼";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.replaceChildren(icon(show));
    });
    wrap.appendChild(button);

    // 重新輸入時清除紅框
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  }

  document.querySelectorAll('input[type="password"]').forEach(enhance);
})();
