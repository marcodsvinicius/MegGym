/* Aparência: Energia, Esportivo, Pink Money e Arcade + modo automático, claro ou escuro.
   Carregado no <head> para aplicar antes de desenhar a página (sem piscar). */
(function () {
  "use strict";

  const KEY = "meggym.theme"; // modo: "auto" | "light" | "dark"
  const STYLE_KEY = "meggym.style"; // estilo do aparelho (o do último perfil que entrou)
  const STYLES = ["energia", "esportivo", "pink-money", "arcade"];
  const DEFAULT_STYLE = "energia";
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
    return normalizeStyle(read(STYLE_KEY));
  }

  function normalizeStyle(style) {
    return STYLES.includes(style) ? style : DEFAULT_STYLE;
  }

  function effective(choice) {
    return choice === "auto" ? (media.matches ? "dark" : "light") : choice;
  }

  // Cores e medidas têm uma única fonte: os tokens CSS, já carregados no head.
  function token(name) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function apply(choice = get(), style = getStyle()) {
    style = normalizeStyle(style);
    const root = document.documentElement;
    if (choice === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    root.setAttribute("data-style", style);
    root.setAttribute("data-color-scheme", effective(choice));
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = token("--system-bar");
  }

  function set(choice) {
    write(KEY, choice === "auto" ? null : choice);
    apply(choice, getStyle());
  }

  function setStyle(style) {
    const value = normalizeStyle(style);
    write(STYLE_KEY, value);
    apply(get(), value);
    return value;
  }

  media.addEventListener?.("change", () => get() === "auto" && apply());
  apply();

  window.MegTheme = { get, set, getStyle, setStyle, normalizeStyle, STYLES, DEFAULT_STYLE, token };
})();

