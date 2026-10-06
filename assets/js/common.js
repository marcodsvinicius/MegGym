/* Funções compartilhadas entre o site público e o admin. */
(function () {
  "use strict";

  const DATA_PATH = "data/exercises.json";

  const DIFFICULTIES = {
    iniciante: "Iniciante",
    intermediario: "Intermediário",
    avancado: "Avançado",
  };

  // Equipamentos (ids são usados nos exercícios e no perfil do usuário).
  const EQUIPMENT = {
    elastico: "Elásticos",
    anilha: "Anilhas",
    banco: "Banco",
    halter: "Halter",
    barra: "Barra reta",
    "barra-fixa": "Barra fixa",
    kettlebell: "Kettlebell",
    estacao: "Estação de treinos",
    corda: "Corda de pular",
    "bola-suica": "Bola suíça",
    step: "Step",
    caneleira: "Caneleira",
    roldana: "Roldana de porta",
    "roda-abdominal": "Roda abdominal",
    "leg-press": "Máquina de leg press",
  };

  // Nomes de ícones do Material Symbols (https://fonts.google.com/icons).
  const EQUIPMENT_ICONS = {
    elastico: "gesture",
    anilha: "radio_button_checked",
    banco: "weekend",
    halter: "fitness_center",
    barra: "horizontal_rule",
    "barra-fixa": "door_front",
    kettlebell: "notifications",
    estacao: "precision_manufacturing",
    corda: "cable",
    "bola-suica": "sports_volleyball",
    step: "stairs",
    caneleira: "straighten",
    roldana: "settings_input_component",
    "roda-abdominal": "trip_origin",
    "leg-press": "airline_seat_recline_extra",
  };

  // Ícone do Material Symbols. Valores que não são nomes de ícone (ex.: emoji antigo) viram texto.
  function icon(name, cls = "") {
    const value = String(name || "");
    if (/^[a-z0-9_]+$/.test(value)) return `<span class="mi ${cls}" aria-hidden="true">${value}</span>`;
    return `<span class="${cls}" aria-hidden="true">${escapeHtml(value)}</span>`;
  }

  // O usuário consegue fazer o exercício se tiver todos os equipamentos dele
  // (exercícios sem equipamento = peso do corpo, sempre disponíveis).
  // equipmentAny: basta ter um deles (ex.: roldana OU elástico).
  function canDo(exercise, userEquipment) {
    const needed = Array.isArray(exercise.equipment) ? exercise.equipment : [];
    const any = Array.isArray(exercise.equipmentAny) ? exercise.equipmentAny : [];
    const has = new Set(userEquipment || []);
    return needed.every((id) => has.has(id)) && (!any.length || any.some((id) => has.has(id)));
  }

  function equipmentLabels(list) {
    return (Array.isArray(list) ? list : []).map((id) => EQUIPMENT[id]).filter(Boolean);
  }

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

  // Linhas do banco (group_id) → formato usado pelas telas (group).
  function fromRows(groups, exercises) {
    return {
      groups: (groups || []).map(({ id, name, icon, color, position }) => ({ id, name, icon, color, position })),
      exercises: (exercises || []).map((e) => ({
        id: e.id,
        group: e.group_id,
        name: e.name,
        description: e.description || "",
        sets: e.sets || "",
        reps: e.reps || "",
        rest: e.rest || "",
        difficulty: e.difficulty || "",
        image: e.image || "",
        video: e.video || "",
        position: e.position,
      })),
    };
  }

  async function loadFromSupabase() {
    const [groups, exercises] = await Promise.all([
      window.Supa.db("groups?select=*&order=position.asc,name.asc"),
      window.Supa.db("exercises?select=*&order=position.asc,created_at.asc"),
    ]);
    return fromRows(groups, exercises);
  }

  async function loadFromJson() {
    const res = await fetch(DATA_PATH, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Não foi possível carregar os exercícios (HTTP ${res.status}).`);
    return normalizeData(await res.json());
  }

  // No modo "supabase", lê do banco e usa o JSON do repositório como reserva se ele falhar.
  // No modo "github", lê só o JSON.
  async function loadData() {
    if (window.MEGGYM_CONFIG?.BACKEND === "supabase" && window.Supa) {
      try {
        const data = await loadFromSupabase();
        if (data.groups.length) return data;
      } catch (err) {
        console.warn("Supabase indisponível, usando data/exercises.json:", err.message);
      }
    }
    return loadFromJson();
  }

  function normalizeText(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  window.MegGym = {
    DATA_PATH,
    IMAGE_DIR,
    DIFFICULTIES,
    EQUIPMENT,
    EQUIPMENT_ICONS,
    icon,
    canDo,
    equipmentLabels,
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
    loadFromSupabase,
    fromRows,
  };
})();
