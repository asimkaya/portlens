/** Browser shortcuts and menus that make a desktop app feel like a web page. */
export function stopBehavingLikeAWebPage() {
  // Developers still want reload and the inspector while working on the UI.
  if (import.meta.env.DEV) return;

  // The browser menu (Back, Print, Inspect...) is useful in the search box and nowhere else.
  document.addEventListener("contextmenu", (event) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const reload = event.key === "F5" || (event.ctrlKey && key === "r");
    const inspect = event.key === "F12" || (event.ctrlKey && event.shiftKey && "ij".includes(key));
    const pageCommands = event.ctrlKey && !event.shiftKey && "pgsu".includes(key);
    const zoom = event.ctrlKey && ["+", "=", "-", "0"].includes(event.key);
    if (reload || inspect || pageCommands || zoom) event.preventDefault();
  });

  document.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false },
  );
}
