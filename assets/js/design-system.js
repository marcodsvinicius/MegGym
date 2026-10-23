/* Galeria isolada: não carrega o store e não altera treinos, perfis ou histórico. */
(() => {
  "use strict";
  const theme = window.MegTheme;
  const style = document.getElementById("ds-style");
  const mode = document.getElementById("ds-mode");
  const palette = document.getElementById("ds-palette");
  const dialog = document.getElementById("ds-dialog");
  const roles = ["bg", "surface", "surface-2", "text", "text-muted", "accent", "accent-contrast", "accent-container", "success", "danger", "border", "done"];
  function render() {
    palette.replaceChildren(...roles.map((name) => {
      const item = document.createElement("div");
      item.className = "ds-swatch";
      const swatch = document.createElement("i");
      swatch.setAttribute("aria-hidden", "true");
      swatch.style.setProperty("--swatch", `var(--${name})`);
      const label = document.createElement("code");
      label.textContent = `--${name}`;
      const value = document.createElement("small");
      value.textContent = theme.token(`--${name}`);
      item.append(swatch, label, value);
      return item;
    }));
  }
  style.value = theme.getStyle();
  mode.value = theme.get();
  style.addEventListener("change", () => { theme.setStyle(style.value); render(); });
  mode.addEventListener("change", () => { theme.set(mode.value); render(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  document.querySelector("[data-ds-open]").addEventListener("click", () => dialog.showModal());
  dialog.querySelectorAll("[data-ds-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  document.querySelectorAll(".chip, .set-check").forEach((button) => button.addEventListener("click", () => {
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    button.closest(".set-row")?.classList.toggle("done", pressed);
  }));
  render();
})();
