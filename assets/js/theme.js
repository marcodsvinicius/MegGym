/* Aparência: estilo (Energia, Suave, Esportivo) + modo (automático, claro, escuro).
   Carregado no <head> para aplicar antes de desenhar a página (sem piscar). */
(function () {
  "use strict";

  const KEY = "meggym.theme"; // modo: "auto" | "light" | "dark"
  const STYLE_KEY = "meggym.style"; // estilo do aparelho (o do último perfil que entrou)
  const STYLES = ["suave", "energia", "esportivo"];
  const DEFAULT_STYLE = "suave";
  // Cor da barra do sistema = cor do cabeçalho de cada estilo/modo.
  const COLORS = {
    suave: { light: "#fbf6f3", dark: "#1e1916" },
    energia: { light: "#ffffff", dark: "#0d0e10" },
    esportivo: { light: "#111111", dark: "#000000" },
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* sem localStorage: vale só nesta visita */
    }
  }

  function get() {
    const value = read(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  }

  function getStyle() {
    const value = read(STYLE_KEY);
    return STYLES.includes(value) ? value : DEFAULT_STYLE;
  }

  function effective(choice) {
    return choice === "auto" ? (media.matches ? "dark" : "light") : choice;
  }

  function apply(choice = get(), style = getStyle()) {
    const root = document.documentElement;
    if (choice === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    root.setAttribute("data-style", style);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = COLORS[style][effective(choice)];
  }

  function set(choice) {
    write(KEY, choice === "auto" ? null : choice);
    apply(choice, getStyle());
  }

  function setStyle(style) {
    const value = STYLES.includes(style) ? style : DEFAULT_STYLE;
    write(STYLE_KEY, value);
    apply(get(), value);
  }

  media.addEventListener?.("change", () => get() === "auto" && apply());
  apply();

  window.MegTheme = { get, set, getStyle, setStyle, STYLES, DEFAULT_STYLE };
})();
