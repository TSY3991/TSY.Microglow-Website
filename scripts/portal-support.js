(() => {
  const trigger = document.getElementById("supportTrigger");
  const dialog = document.getElementById("supportDialog");
  const close = document.getElementById("supportDialogClose");
  if (!trigger || !dialog || !close) return;

  trigger.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
  });
  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    close.addEventListener("click", () => dialog.close());
  }
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener("pointerdown", (e) => { pressedOutside = outside(e); });
    dialog.addEventListener("pointerup", (e) => { if (pressedOutside && outside(e)) dialog.close(); });
  }
  dialog.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus({ preventScroll: true });
  });
})();
