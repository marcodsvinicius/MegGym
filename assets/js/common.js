/* Funções compartilhadas entre o site público e o admin. */
(function () {
  "use strict";

  const DATA_PATH = "data/exercises.json";

  const DIFFICULTIES = {
    iniciante: "Iniciante",
    intermediario: "Intermediário",
    avancado: "Avançado",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const IMAGE_DIR = "images/";

  // Aceita links http(s) ou arquivos enviados pelo admin para a pasta images/.
  // Bloqueia qualquer outra coisa (ex.: "javascript:") em src/href.
  function safeUrl(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^images\/[\w.-]+$/.test(text) && !text.includes("..")) return text;
    try {
      const url = new URL(text);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function safeColor(value) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || "").trim()) ? String(value).trim() : "#ff5a1f";
  }

  function slugify(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function uniqueId(text, existingIds) {
    const base = slugify(text) || "item";
    let id = base;
    let n = 2;
    while (existingIds.has(id)) id = `${base}-${n++}`;
    return id;
  }

  function youtubeId(value) {
    const url = safeUrl(value);
    if (!url) return "";
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0];
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
      if (m) return m[1];
    }
    return "";
  }

  function difficultyBadge(level) {
    if (!DIFFICULTIES[level]) return "";
    return `<span class="badge badge-${level}">${DIFFICULTIES[level]}</span>`;
  }

  function normalizeData(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    return {
      groups: Array.isArray(data.groups) ? data.groups : [],
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
    };
  }

  async function loadData() {
    // "cache: no-cache" faz o navegador revalidar, então cadastros novos aparecem logo após o deploy.
    const res = await fetch(DATA_PATH, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Não foi possível carregar os exercícios (HTTP ${res.status}).`);
    return normalizeData(await res.json());
  }

  function normalizeText(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  window.MegGym = {
    DATA_PATH,
    IMAGE_DIR,
    DIFFICULTIES,
    escapeHtml,
    safeUrl,
    safeColor,
    slugify,
    uniqueId,
    youtubeId,
    difficultyBadge,
    normalizeData,
    normalizeText,
    loadData,
  };
})();
