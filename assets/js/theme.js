/* Tema claro/escuro. Carregado no <head> para aplicar antes de desenhar a página. */
(function () {
  "use strict";

  const KEY = "meggym.theme"; // "auto" | "light" | "dark"
  const COLORS = { light: "#ffffff", dark: "#181b21" }; // cor da barra do sistema = cabeçalho
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function get() {
    try {
      const value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : "auto";
    } catch {
      return "auto";
    }
  }

  function effective(choice) {
    return choice === "auto" ? (media.matches ? "dark" : "light") : choice;
  }

  function apply(choice = get()) {
    const root = document.documentElement;
    if (choice === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = COLORS[effective(choice)];
  }

  function set(choice) {
    try {
      if (choice === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* sem localStorage: vale só nesta visita */
    }
    apply(choice);
  }

  media.addEventListener?.("change", () => get() === "auto" && apply("auto"));
  apply();

  window.MegTheme = { get, set };
})();
