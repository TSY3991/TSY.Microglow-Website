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
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus({ preventScroll: true });
  });
})();
