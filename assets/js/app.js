/* MegGym — app (mobile first): Início, Treinos, Exercícios e Atividade. */
(function () {
  "use strict";

  const { loadData, escapeHtml, safeUrl, safeColor, youtubeId, difficultyBadge, normalizeText, DIFFICULTIES, EQUIPMENT, EQUIPMENT_ICONS, equipmentLabels, canDo, icon } =
    window.MegGym;
  const Store = window.MegStore;

  const $ = (id) => document.getElementById(id);
  const app = $("app");

  let base = { groups: [], exercises: [] };
  let user = null;
  let draft = null; // treino sendo criado/editado
  const filters = { search: "", difficulty: "" };
  let timer = null; // cronômetro do treino em andamento
  let equipFilter = true; // mostrar só exercícios que o usuário consegue fazer com os equipamentos dele

  /* ================= Dados ================= */

  function groups() {
    return base.groups;
  }

  function exercises() {
    return [...base.exercises, ...Store.customExercises()];
  }

  // Exercício aparece no grupo principal e nos grupos secundários (ex.: afundo em quadríceps e glúteos).
  function inGroup(ex, groupId) {
    return ex.group === groupId || (Array.isArray(ex.groups) && ex.groups.includes(groupId));
  }

  function available(ex) {
    return !equipFilter || canDo(ex, user?.equipment);
  }

  // Rótulos do que falta para o usuário fazer o exercício.
  function missingEquipment(ex) {
    const has = new Set(user?.equipment || []);
    const missing = equipmentLabels((ex.equipment || []).filter((id) => !has.has(id)));
    const any = ex.equipmentAny || [];
    if (any.length && !any.some((id) => has.has(id))) missing.push(equipmentLabels(any).join(" ou "));
    return missing;
  }

  // Botão do filtro de equipamentos (usado na lista e ao montar treino).
  function equipFilterHtml(hiddenCount) {
    const mine = (user?.equipment || []).length;
    return `
      <div class="equip-filter">
        <button class="chip" type="button" data-equip-filter="on" aria-pressed="${equipFilter}">${icon("home", "mi-inline")} Meus equipamentos${mine ? ` (${mine})` : ""}</button>
        <button class="chip" type="button" data-equip-filter="off" aria-pressed="${!equipFilter}">Todos</button>
        ${equipFilter && hiddenCount ? `<span class="meta">${hiddenCount} ocultos</span>` : ""}
      </div>`;
  }

  function findExercise(id) {
    return exercises().find((e) => e.id === id) || null;
  }

  function findGroup(id) {
    return groups().find((g) => g.id === id) || null;
  }

  // Grupos musculares de um treino = grupos dos exercícios escolhidos (sem repetir).
  function workoutGroups(items) {
    const ids = [];
    items.forEach((item) => {
      const ex = findExercise(item.exerciseId);
      if (ex && !ids.includes(ex.group)) ids.push(ex.group);
    });
    return ids.map(findGroup).filter(Boolean);
  }

  /* ================= Utilidades de UI ================= */

  let toastTimer;
  function toast(message, type = "") {
    const el = $("toast");
    el.textContent = message;
    el.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
  }

  function setHeader(title, { back = null, action = "" } = {}) {
    $("app-title").textContent = title;
    document.title = title === "MegGym" ? "MegGym" : `${title} · MegGym`;
    const backBtn = $("back-btn");
    backBtn.classList.toggle("hidden", !back);
    backBtn.dataset.href = back || "";
    $("header-action").innerHTML = action;
  }

  function setTab(tab) {
    document.querySelectorAll(".bottom-nav [data-tab]").forEach((a) => {
      const active = a.dataset.tab === tab;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function groupChips(list) {
    return list
      .map((g) => `<span class="group-chip" style="--group-color:${safeColor(g.color)}">${icon(g.icon, "mi-inline")} ${escapeHtml(g.name)}</span>`)
      .join("");
  }

  function equipmentChips(list, any = []) {
    const chips = equipmentLabels(list).map((label) => `<span class="equip-chip">${escapeHtml(label)}</span>`);
    const options = equipmentLabels(any);
    if (options.length) chips.push(`<span class="equip-chip">${escapeHtml(options.join(" ou "))}</span>`);
    return chips.join("");
  }

  function setsReps(sets, reps) {
    return [sets, reps].filter(Boolean).join(" × ");
  }

  // "3 × 8-12 · 10 kg"
  function prescription(item) {
    return [setsReps(item.sets, item.reps), item.rir ? `RIR ${item.rir}` : "", item.load].filter(Boolean).join(" · ");
  }

  // Bloco "Minhas observações" (salvo só para o usuário, automaticamente).
  function personalNoteHtml(workoutId) {
    return `
      <section class="subsection my-note">
        <label class="subsection-title" for="my-note">${icon("edit_note", "mi-inline")} Minhas observações</label>
        <textarea class="textarea textarea-sm" id="my-note" data-note-workout="${escapeHtml(workoutId)}" maxlength="2000" placeholder="Ex.: aumentar carga da remada, sentir mais o peito no crucifixo…">${escapeHtml(Store.note(user.id, workoutId))}</textarea>
        <p class="meta" id="my-note-status">Só você vê. Salva automaticamente.</p>
      </section>`;
  }

  let noteTimer;
  function bindPersonalNote() {
    const area = $("my-note");
    if (!area) return;
    const save = () => {
      Store.saveNote(user.id, area.dataset.noteWorkout, area.value);
      const status = $("my-note-status");
      if (status) status.textContent = "Salvo. Só você vê.";
    };
    area.addEventListener("input", () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(save, 500);
    });
    area.addEventListener("blur", () => {
      clearTimeout(noteTimer);
      save();
    });
  }

  function capitalize(text) {
    return text ? text[0].toUpperCase() + text.slice(1) : text;
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatDuration(startIso, endIso) {
    const minutes = Math.max(1, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  }

  function empty(iconName, text, extra = "") {
    return `<div class="state">${icon(iconName, "state-icon")}${text}${extra}</div>`;
  }

  function fab(href, label) {
    return `<a class="fab" href="${href}">${icon("add", "mi-inline")} ${label}</a>`;
  }

  /* ================= Instalar o app ================= */

  const PWA = window.MegPWA;
  const DISMISS_KEY = "meggym.installDismissed";

  function installCard(context) {
    if (!PWA) return "";
    const status = PWA.status();
    if (status === "installed" || status === "unavailable") return "";
    let dismissed = false;
    try {
      dismissed = context === "home" && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* sem localStorage */
    }
    if (dismissed) return "";
    const body =
      status === "prompt"
        ? `<p>Instale no celular para abrir em tela cheia, direto da tela inicial, mesmo sem internet.</p>
           <div class="install-actions">
             <button class="btn btn-primary" type="button" data-install>Instalar app</button>
             ${context === "home" ? `<button class="btn btn-ghost" type="button" data-install-dismiss>Agora não</button>` : ""}
           </div>`
        : `<p>Para instalar no iPhone, no <strong>Safari</strong>:</p>
           <ol class="install-steps">
             <li>Toque em <strong>Compartilhar</strong> <span class="ios-share" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span> na barra do navegador.</li>
             <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
             <li>Toque em <strong>Adicionar</strong>.</li>
           </ol>
           ${context === "home" ? `<div class="install-actions"><button class="btn btn-ghost" type="button" data-install-dismiss>Entendi</button></div>` : ""}`;
    return `
      <section class="install-card">
        <img src="assets/icons/icon-192.png" alt="" width="48" height="48">
        <div class="install-body">
          <h2>Instale o MegGym</h2>
          ${body}
        </div>
      </section>`;
  }

  function refreshInstallSlot() {
    const slot = $("install-slot");
    if (slot) slot.innerHTML = installCard(slot.dataset.context);
  }

  if (PWA) PWA.onChange(refreshInstallSlot);

  app.addEventListener("click", async (e) => {
    if (e.target.closest("[data-install]")) {
      const accepted = await PWA.install();
      if (accepted) toast("App instalado!", "success");
      refreshInstallSlot();
    }
    if (e.target.closest("[data-install-dismiss]")) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* sem localStorage */
      }
      refreshInstallSlot();
    }
  });

  /* ================= Início ================= */

  const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Segunda-feira da semana atual, 00:00.
  function startOfWeek(date = new Date()) {
    const d = startOfDay(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function dayKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function durationMs(h) {
    return Math.max(0, new Date(h.finishedAt) - new Date(h.startedAt));
  }

  function formatTotal(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return { value: String(minutes), unit: "min" };
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`, unit: "" };
  }

  // Dias seguidos com treino, terminando hoje (ou ontem, se ainda não treinou hoje).
  function streak(history) {
    const days = new Set(history.map((h) => dayKey(h.finishedAt)));
    const cursor = startOfDay(new Date());
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (days.has(dayKey(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function motivation({ weekCount, trainedToday, streakDays, todayIndex, firstName }) {
    if (trainedToday && streakDays >= 3) return { emoji: "local_fire_department", title: `${streakDays} dias seguidos!`, text: "Que sequência! Continue assim, a constância é o que traz resultado." };
    if (trainedToday) return { emoji: "task_alt", title: "Treino de hoje feito!", text: "Missão cumprida. Agora é descansar, se hidratar e voltar amanhã." };
    if (weekCount === 0 && todayIndex === 0) return { emoji: "rocket_launch", title: `Semana nova, ${firstName}!`, text: "Que tal começar com o pé direito e fazer o primeiro treino hoje?" };
    if (weekCount === 0) return { emoji: "alarm", title: "Bora começar a semana?", text: "Ainda dá tempo! Um treino hoje já faz diferença." };
    if (streakDays >= 2) return { emoji: "local_fire_department", title: `${streakDays} dias seguidos`, text: "Não deixe a sequência parar. Treine hoje!" };
    if (weekCount >= 4) return { emoji: "emoji_events", title: "Semana de campeão!", text: `Você já treinou ${weekCount} vezes nesta semana. Incrível!` };
    return { emoji: "bolt", title: `Já são ${weekCount} ${weekCount === 1 ? "treino" : "treinos"} na semana`, text: "Bom ritmo! Que tal mais um hoje?" };
  }

  function renderHome() {
    setHeader("MegGym");
    setTab("inicio");
    const history = Store.history(user.id);
    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const week = history.filter((h) => {
      const t = new Date(h.finishedAt);
      return t >= weekStart && t < weekEnd;
    });
    const trainedDays = new Set(week.map((h) => dayKey(h.finishedAt)));
    const today = startOfDay(new Date());
    const todayIndex = (today.getDay() + 6) % 7;
    const total = formatTotal(week.reduce((sum, h) => sum + durationMs(h), 0));
    const streakDays = streak(history);
    const firstName = user.name.split(" ")[0];
    const msg = motivation({ weekCount: week.length, trainedToday: trainedDays.has(dayKey(today)), streakDays, todayIndex, firstName });

    const days = WEEKDAYS.map((label, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const done = trainedDays.has(dayKey(date));
      const isToday = i === todayIndex;
      const future = i > todayIndex;
      const count = week.filter((h) => dayKey(h.finishedAt) === dayKey(date)).length;
      const state = done ? "done" : future ? "future" : isToday ? "today" : "missed";
      const title = `${date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" })}: ${done ? `${count} treino${count > 1 ? "s" : ""}` : future ? "ainda não chegou" : "sem treino"}`;
      return `
        <li class="week-day ${state} ${isToday ? "is-today" : ""}" title="${escapeHtml(title)}">
          <span class="week-day-label">${label}</span>
          <span class="week-day-dot" aria-hidden="true">${done ? icon("check") : date.getDate()}</span>
          <span class="visually-hidden">${escapeHtml(title)}</span>
        </li>`;
    }).join("");

    const last = history[0];
    const lastWorkout = last && Store.getWorkout(last.workoutId);
    const session = Store.session(user.id);
    const activeWorkout = session && Store.getWorkout(session.workoutId);

    const bgSrc = window.MEGGYM_CONFIG?.HOME_BACKGROUND;
    const bg = bgSrc && /^(https:\/\/|assets\/)/.test(bgSrc) ? bgSrc : "";
    app.innerHTML = `
      <div class="home-hero ${bg ? "has-image" : ""}" ${bg ? `style="--hero-image:url('${escapeHtml(bg.replace(/'/g, "%27"))}')"` : ""}>
        <div class="hello">
          <p class="page-subtitle">Olá,</p>
          <h2 class="page-title">${escapeHtml(user.name)} 👋</h2>
        </div>
      </div>

      ${
        activeWorkout
          ? `<a class="resume-banner" href="#/treinos/${encodeURIComponent(activeWorkout.id)}/executar">
              <span>${icon("play_arrow", "mi-inline")} Continuar <strong>${escapeHtml(activeWorkout.name)}</strong></span><span aria-hidden="true">›</span>
            </a>`
          : ""
      }

      <section class="motivation">
        ${icon(msg.emoji, "motivation-emoji")}
        <div>
          <h2>${escapeHtml(msg.title)}</h2>
          <p>${escapeHtml(msg.text)}</p>
        </div>
      </section>

      <section class="week-card" aria-labelledby="week-title">
        <div class="week-head">
          <h2 id="week-title">Sua semana</h2>
          <span class="meta">${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${new Date(weekEnd - 1).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
        </div>
        <div class="week-stats">
          <div class="week-stat">
            <span class="week-stat-value">${week.length}</span>
            <span class="week-stat-label">${week.length === 1 ? "treino" : "treinos"}</span>
          </div>
          <div class="week-stat">
            <span class="week-stat-value">${total.value}<small>${total.unit}</small></span>
            <span class="week-stat-label">de treino</span>
          </div>
          <div class="week-stat">
            <span class="week-stat-value">${trainedDays.size}<small>/7</small></span>
            <span class="week-stat-label">dias ativos</span>
          </div>
        </div>
        <ol class="week-days" aria-label="Dias da semana">${days}</ol>
      </section>

      <section class="subsection">
        <h2 class="subsection-title">Último treino</h2>
        ${
          last
            ? `<div class="last-workout">
                <span class="history-icon">${icon("check_circle")}</span>
                <a class="item-main item-link-plain" href="#/atividade/historico/${encodeURIComponent(last.id)}">
                  <div class="item-title">${escapeHtml(last.workoutName)}</div>
                  <div class="meta">${escapeHtml(formatDateTime(last.finishedAt))} · ${formatDuration(last.startedAt, last.finishedAt)} · ${last.exerciseCount} exercícios</div>
                  <div class="meta link-text">Ver detalhes ›</div>
                </a>
                ${lastWorkout ? `<a class="btn btn-sm btn-primary" href="#/treinos/${encodeURIComponent(lastWorkout.id)}">Fazer de novo</a>` : ""}
              </div>`
            : empty("flag", "Você ainda não terminou nenhum treino.", `<br><a class="btn btn-primary" style="margin-top:12px" href="#/treinos">Escolher um treino</a>`)
        }
      </section>

      <div id="install-slot" data-context="home">${installCard("home")}</div>`;
  }

  /* ================= Exercícios ================= */

  function renderExerciseGroups() {
    setHeader("Lista de exercícios", { action: `<a class="btn btn-sm btn-primary" href="#/exercicios/novo">${icon("add", "mi-inline")} Novo</a>` });
    setTab("exercicios");
    filters.search = "";
    filters.difficulty = "";
    const all = exercises();
    const cards = groups()
      .map((g) => {
        const count = all.filter((e) => inGroup(e, g.id) && available(e)).length;
        return `
          <a class="group-card" href="#/exercicios/grupo/${encodeURIComponent(g.id)}" style="--group-color:${safeColor(g.color)}">
            <span class="group-icon">${icon(g.icon || "fitness_center")}</span>
            <span>
              <span class="group-name">${escapeHtml(g.name)}</span><br>
              <span class="group-count">${count} ${count === 1 ? "exercício" : "exercícios"}</span>
            </span>
          </a>`;
      })
      .join("");
    const hidden = all.filter((e) => !available(e)).length;
    app.innerHTML = `
      ${equipFilterHtml(hidden)}
      <p class="page-subtitle section-intro">Escolha um grupo muscular.</p>
      <nav class="group-grid" aria-label="Grupos musculares">${cards}</nav>`;
  }

  function exerciseCard(ex) {
    const img = safeUrl(ex.image);
    const stats = [
      ["Séries", ex.sets],
      ["Repetições", ex.reps],
      ["Descanso", ex.rest],
    ]
      .filter(([, v]) => v)
      .map(([label, v]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${escapeHtml(v)}</span></div>`)
      .join("");
    const equip = equipmentChips(ex.equipment, ex.equipmentAny);
    const hasVideo = Boolean(youtubeId(ex.video) || safeUrl(ex.video));
    return `
      <article class="exercise-card tappable" data-exercise-page="${escapeHtml(ex.id)}" tabindex="0" role="link" aria-label="Ver detalhes de ${escapeHtml(ex.name)}">
        ${img ? `<div class="exercise-media"><img src="${escapeHtml(img)}" alt="" loading="lazy"></div>` : ""}
        <div class="exercise-body">
          <div class="exercise-title">
            <h3>${escapeHtml(ex.name)}</h3>
            ${difficultyBadge(ex.difficulty)}
          </div>
          ${stats ? `<div class="stats">${stats}</div>` : ""}
          ${equip ? `<div class="equip-chips">${equip}</div>` : ""}
          ${
            missingEquipment(ex).length
              ? `<p class="missing">Você não marcou: ${escapeHtml(missingEquipment(ex).join(", "))}</p>`
              : ""
          }
          ${ex.description ? `<p class="exercise-desc clamp-2">${escapeHtml(ex.description)}</p>` : ""}
          <div class="card-foot">
            <span class="meta">${hasVideo ? `${icon("smart_display", "mi-inline")} Tem vídeo · ` : ""}Toque para ver detalhes</span>
            ${ex.custom ? `<a class="btn btn-sm" href="#/exercicios/editar/${encodeURIComponent(ex.id)}">Editar</a>` : ""}
          </div>
        </div>
      </article>`;
  }

  function renderExerciseList(group) {
    const list = $("exercise-list");
    const q = normalizeText(filters.search.trim());
    const all = exercises().filter((e) => inGroup(e, group.id));
    const hidden = all.filter((e) => !available(e)).length;
    const items = all.filter(
      (e) =>
        available(e) &&
        (!filters.difficulty || e.difficulty === filters.difficulty) &&
        (!q || normalizeText(e.name).includes(q) || normalizeText(e.description).includes(q))
    );
    if (!all.length) {
      list.innerHTML = empty("edit_note", `Ainda não há exercícios de ${escapeHtml(group.name)}.`);
    } else if (!items.length) {
      list.innerHTML = empty(
        "search_off",
        hidden && equipFilter
          ? `Nenhum exercício com os seus equipamentos aqui.`
          : "Nenhum exercício encontrado com esses filtros.",
        hidden && equipFilter ? `<br><button class="btn" style="margin-top:12px" type="button" data-equip-filter="off">Mostrar todos (${hidden})</button>` : ""
      );
    } else {
      list.innerHTML = `<div class="exercise-grid">${items.map(exerciseCard).join("")}</div>`;
    }
  }

  function renderExerciseGroup(groupId) {
    const group = findGroup(groupId);
    setTab("exercicios");
    if (!group) {
      setHeader("Exercícios", { back: "#/exercicios" });
      app.innerHTML = empty("help", "Grupo muscular não encontrado.");
      return;
    }
    setHeader(group.name, {
      back: "#/exercicios",
      action: `<a class="btn btn-sm btn-primary" href="#/exercicios/novo?grupo=${encodeURIComponent(group.id)}">${icon("add", "mi-inline")} Novo</a>`,
    });
    const chips = [["", "Todos"], ...Object.entries(DIFFICULTIES)]
      .map(([value, label]) => `<button class="chip" type="button" data-difficulty="${value}" aria-pressed="${filters.difficulty === value}">${label}</button>`)
      .join("");
    app.innerHTML = `
      ${equipFilterHtml(0)}
      <div class="toolbar">
        <label class="search">
          <span class="visually-hidden">Buscar exercício</span>
          <input class="input" id="search" type="search" placeholder="Buscar exercício…" value="${escapeHtml(filters.search)}">
        </label>
        <div class="chips chips-scroll" role="group" aria-label="Filtrar por dificuldade">${chips}</div>
      </div>
      <div id="exercise-list"></div>`;
    $("search").addEventListener("input", (e) => {
      filters.search = e.target.value;
      renderExerciseList(group);
    });
    app.querySelectorAll("[data-difficulty]").forEach((btn) =>
      btn.addEventListener("click", () => {
        filters.difficulty = btn.dataset.difficulty;
        app.querySelectorAll("[data-difficulty]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        renderExerciseList(group);
      })
    );
    renderExerciseList(group);
  }

  function renderExercisePage(id) {
    setTab("exercicios");
    const ex = findExercise(id);
    if (!ex) {
      setHeader("Exercício", { back: "#/exercicios" });
      app.innerHTML = empty("help", "Exercício não encontrado.");
      return;
    }
    setHeader(ex.name, {
      back: `#/exercicios/grupo/${encodeURIComponent(ex.group)}`,
      action: ex.custom ? `<a class="btn btn-sm" href="#/exercicios/editar/${encodeURIComponent(ex.id)}">Editar</a>` : "",
    });
    app.innerHTML = `<article class="exercise-page">${exerciseDetailHtml(ex, {}, { titleId: "exercise-page-title" })}</article>`;
  }

  function renderExerciseForm(editId, presetGroup) {
    setTab("exercicios");
    const editing = editId ? Store.customExercises().find((e) => e.id === editId) : null;
    if (editId && !editing) {
      setHeader("Exercício", { back: "#/exercicios" });
      app.innerHTML = empty("help", "Exercício não encontrado.");
      return;
    }
    const ex = editing || { group: presetGroup || groups()[0]?.id || "" };
    const back = ex.group ? `#/exercicios/grupo/${encodeURIComponent(ex.group)}` : "#/exercicios";
    setHeader(editing ? "Editar exercício" : "Novo exercício", { back });
    const options = groups()
      .map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === ex.group ? "selected" : ""}>${escapeHtml(g.name)}</option>`)
      .join("");
    const diffOptions = [["", "—"], ...Object.entries(DIFFICULTIES)]
      .map(([v, l]) => `<option value="${v}" ${ex.difficulty === v ? "selected" : ""}>${l}</option>`)
      .join("");
    app.innerHTML = `
      <form class="form-stack" id="exercise-form" novalidate>
        <div class="field">
          <label for="ex-group">Grupo muscular <span class="req">*</span></label>
          <select class="select" id="ex-group">${options}</select>
        </div>
        <div class="field">
          <label for="ex-name">Nome <span class="req">*</span></label>
          <input class="input" id="ex-name" maxlength="80" value="${escapeHtml(ex.name || "")}" placeholder="Ex.: Supino com halteres">
        </div>
        <div class="field">
          <label for="ex-description">Descrição / execução <span class="req">*</span></label>
          <textarea class="textarea" id="ex-description" maxlength="1500" placeholder="Como executar, postura, dicas…">${escapeHtml(ex.description || "")}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ex-sets">Séries</label>
            <input class="input" id="ex-sets" maxlength="20" inputmode="numeric" value="${escapeHtml(ex.sets || "")}" placeholder="4">
          </div>
          <div class="field">
            <label for="ex-reps">Repetições <span class="req">*</span></label>
            <input class="input" id="ex-reps" maxlength="30" value="${escapeHtml(ex.reps || "")}" placeholder="8-12">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ex-rest">Descanso</label>
            <input class="input" id="ex-rest" maxlength="20" value="${escapeHtml(ex.rest || "")}" placeholder="60s">
          </div>
          <div class="field">
            <label for="ex-difficulty">Dificuldade</label>
            <select class="select" id="ex-difficulty">${diffOptions}</select>
          </div>
        </div>
        <fieldset class="field fieldset">
          <legend>Equipamentos</legend>
          <div class="check-chips">
            ${Object.entries(EQUIPMENT)
              .map(
                ([id, label]) => `
                <label class="check-chip">
                  <input type="checkbox" name="ex-equipment" value="${id}" ${(ex.equipment || []).includes(id) ? "checked" : ""}>
                  <span>${label}</span>
                </label>`
              )
              .join("")}
          </div>
          <span class="hint">Marque todos que forem usados. Deixe em branco se for só com o peso do corpo.</span>
        </fieldset>
        <div class="field">
          <label for="ex-image">Link de imagem ou GIF</label>
          <input class="input" id="ex-image" inputmode="url" value="${escapeHtml(ex.image || "")}" placeholder="https://…">
        </div>
        <div class="field">
          <label for="ex-video">Link de vídeo</label>
          <input class="input" id="ex-video" inputmode="url" value="${escapeHtml(ex.video || "")}" placeholder="https://youtube.com/…">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-block btn-lg" type="submit">${editing ? "Salvar alterações" : "Cadastrar exercício"}</button>
          ${editing ? `<button class="btn btn-danger btn-block" type="button" id="ex-delete">Excluir exercício</button>` : ""}
        </div>
      </form>`;

    $("exercise-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const values = {};
      ["group", "name", "description", "sets", "reps", "rest", "difficulty", "image", "video"].forEach(
        (f) => (values[f] = $(`ex-${f}`).value.trim())
      );
      values.equipment = [...document.querySelectorAll('input[name="ex-equipment"]:checked')].map((c) => c.value);
      const errors = [];
      if (!values.name) errors.push(["name", "Informe o nome."]);
      if (!values.description) errors.push(["description", "Informe a descrição."]);
      if (!values.reps) errors.push(["reps", "Informe as repetições."]);
      if (values.image && !safeUrl(values.image)) errors.push(["image", "Use um link começando com https://"]);
      if (values.video && !safeUrl(values.video)) errors.push(["video", "Use um link começando com https://"]);
      showErrors(event.target, errors.map(([f, m]) => [`ex-${f}`, m]));
      if (errors.length) return;
      Store.saveExercise(editing ? { ...values, id: editing.id } : values, user);
      toast(editing ? "Exercício atualizado!" : "Exercício cadastrado!", "success");
      location.hash = editing
        ? `#/exercicios/ver/${encodeURIComponent(editing.id)}`
        : `#/exercicios/grupo/${encodeURIComponent(values.group)}`;
    });

    if (editing) {
      $("ex-delete").addEventListener("click", () => {
        const used = Store.workouts().filter((w) => w.items.some((i) => i.exerciseId === editing.id));
        const warn = used.length ? `\n\nEle está em ${used.length} treino(s) e será removido deles.` : "";
        if (!confirm(`Excluir "${editing.name}"?${warn}`)) return;
        used.forEach((w) => Store.saveWorkout({ ...w, items: w.items.filter((i) => i.exerciseId !== editing.id) }, user));
        Store.deleteExercise(editing.id);
        toast("Exercício excluído.");
        location.hash = back;
      });
    }
  }

  function showErrors(form, errors) {
    form.querySelectorAll(".field-error:not([id])").forEach((el) => el.remove());
    errors.forEach(([id, message]) => {
      const el = document.createElement("span");
      el.className = "field-error";
      el.textContent = message;
      $(id).closest(".field").appendChild(el);
    });
    if (errors.length) $(errors[0][0]).focus();
  }

  /* ================= Treinos ================= */

  function workoutCard(w) {
    const gs = workoutGroups(w.items);
    const active = Store.session(user.id)?.workoutId === w.id;
    return `
      <a class="workout-card" href="#/treinos/${encodeURIComponent(w.id)}">
        <div class="workout-card-head">
          <h3>${escapeHtml(w.name)}</h3>
          ${active ? `<span class="badge badge-live">Em andamento</span>` : ""}
        </div>
        ${w.description ? `<p class="exercise-desc clamp-2">${escapeHtml(w.description)}</p>` : ""}
        <div class="group-chips">${groupChips(gs)}</div>
        <p class="meta">${w.items.length} ${w.items.length === 1 ? "exercício" : "exercícios"}${w.createdBy ? ` · por ${escapeHtml(w.createdBy)}` : ""}</p>
      </a>`;
  }

  function renderWorkouts() {
    setHeader("Treinos", { action: `<a class="btn btn-sm btn-primary" href="#/treinos/novo">${icon("add", "mi-inline")} Novo</a>` });
    setTab("treinos");
    const list = Store.workouts();
    const session = Store.session(user.id);
    const activeWorkout = session && Store.getWorkout(session.workoutId);
    app.innerHTML = `
      ${
        activeWorkout
          ? `<a class="resume-banner" href="#/treinos/${encodeURIComponent(activeWorkout.id)}/executar">
              <span>${icon("play_arrow", "mi-inline")} Continuar <strong>${escapeHtml(activeWorkout.name)}</strong></span><span aria-hidden="true">›</span>
            </a>`
          : ""
      }
      ${
        list.length
          ? `<div class="workout-list">${list.map(workoutCard).join("")}</div>`
          : empty("fitness_center", "Nenhum treino criado ainda.", `<br><a class="btn btn-primary" style="margin-top:12px" href="#/treinos/novo">Criar meu primeiro treino</a>`)
      }`;
  }

  function renderWorkoutDetail(id) {
    setTab("treinos");
    const w = Store.getWorkout(id);
    if (!w) {
      setHeader("Treino", { back: "#/treinos" });
      app.innerHTML = empty("help", "Treino não encontrado.");
      return;
    }
    setHeader(w.name, { back: "#/treinos", action: `<a class="btn btn-sm" href="#/treinos/${encodeURIComponent(w.id)}/editar">Editar</a>` });
    const session = Store.session(user.id);
    const activeHere = session?.workoutId === w.id;
    const items = w.items
      .map((item, i) => {
        const ex = findExercise(item.exerciseId);
        const g = ex && findGroup(ex.group);
        return `
          <li class="item-row ${ex ? "tappable" : ""}" ${ex ? `data-exercise="${escapeHtml(ex.id)}" data-sets="${escapeHtml(item.sets)}" data-reps="${escapeHtml(item.reps)}" data-load="${escapeHtml(item.load || "")}" data-rir="${escapeHtml(item.rir || "")}" data-rest="${escapeHtml(item.rest || "")}"` : ""}>
            <span class="item-index">${i + 1}</span>
            <div class="item-main">
              <div class="item-title">${ex ? escapeHtml(ex.name) : "<em>Exercício removido</em>"}</div>
              <div class="meta">${g ? `${icon(g.icon, "mi-inline")} ${escapeHtml(g.name)} · ` : ""}${escapeHtml(prescription(item))}</div>
            </div>
            ${ex ? `<span class="chevron" aria-hidden="true">›</span>` : ""}
          </li>`;
      })
      .join("");
    const doneCount = Store.history(user.id).filter((h) => h.workoutId === w.id).length;
    app.innerHTML = `
      ${w.description ? `<p class="lead">${escapeHtml(w.description)}</p>` : ""}
      <div class="group-chips">${groupChips(workoutGroups(w.items))}</div>
      <p class="meta">${w.items.length} exercícios · você fez este treino ${doneCount} ${doneCount === 1 ? "vez" : "vezes"}</p>
      <ol class="item-list">${items || `<li class="state">Nenhum exercício.</li>`}</ol>
      ${w.notes ? `<section class="workout-notes">${icon("info", "mi-inline")} <p>${escapeHtml(w.notes)}</p></section>` : ""}
      ${personalNoteHtml(w.id)}
      <div class="sticky-cta">
        <button class="btn btn-primary btn-block btn-lg" type="button" id="start-btn" ${w.items.length ? "" : "disabled"}>
          ${icon("play_arrow", "mi-inline")} ${activeHere ? "Continuar treino" : "Iniciar treino"}
        </button>
      </div>`;
    bindPersonalNote();
    $("start-btn").addEventListener("click", () => {
      const current = Store.session(user.id);
      if (current && current.workoutId !== w.id) {
        const other = Store.getWorkout(current.workoutId);
        if (!confirm(`Você tem o treino "${other?.name || "anterior"}" em andamento. Descartar e iniciar este?`)) return;
        Store.cancelSession(user.id);
      }
      if (!Store.session(user.id)) Store.startSession(user.id, w.id);
      location.hash = `#/treinos/${encodeURIComponent(w.id)}/executar`;
    });
  }

  /* ---------- Criar / editar treino ---------- */

  function renderWorkoutForm(editId) {
    setTab("treinos");
    const editing = editId ? Store.getWorkout(editId) : null;
    if (editId && !editing) {
      setHeader("Treino", { back: "#/treinos" });
      app.innerHTML = empty("help", "Treino não encontrado.");
      return;
    }
    if (!draft || draft.id !== (editing?.id || null)) {
      draft = editing
        ? {
            id: editing.id,
            name: editing.name,
            description: editing.description || "",
            notes: editing.notes || "",
            items: editing.items.map((i) => ({ load: "", rir: "", rest: "", ...i })),
          }
        : { id: null, name: "", description: "", notes: "", items: [] };
    }
    const back = editing ? `#/treinos/${encodeURIComponent(editing.id)}` : "#/treinos";
    setHeader(editing ? "Editar treino" : "Novo treino", { back });

    const groupOptions = groups()
      .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`)
      .join("");

    app.innerHTML = `
      <form class="form-stack" id="workout-form" novalidate>
        <div class="field">
          <label for="w-name">Nome do treino <span class="req">*</span></label>
          <input class="input" id="w-name" maxlength="60" value="${escapeHtml(draft.name)}" placeholder="Ex.: Treino A — Peito e tríceps">
        </div>
        <div class="field">
          <label for="w-description">Descrição</label>
          <textarea class="textarea textarea-sm" id="w-description" maxlength="500" placeholder="Objetivo, observações…">${escapeHtml(draft.description)}</textarea>
        </div>
        <div class="field">
          <label for="w-notes">Observações do treino</label>
          <textarea class="textarea textarea-sm" id="w-notes" maxlength="1000" placeholder="Descanso, progressão, dicas… (todos veem)">${escapeHtml(draft.notes || "")}</textarea>
        </div>
        <div class="field">
          <span class="label">Grupos musculares trabalhados</span>
          <div class="group-chips" id="w-groups"></div>
        </div>

        <section class="subsection">
          <h2 class="subsection-title">Exercícios do treino <span class="meta" id="w-count"></span></h2>
          <ol class="item-list" id="w-items"></ol>
          <span class="field-error hidden" id="w-items-error"></span>
        </section>

        <section class="subsection">
          <h2 class="subsection-title">Adicionar da lista de exercícios</h2>
          <div class="toolbar">
            <label class="search">
              <span class="visually-hidden">Buscar</span>
              <input class="input" id="picker-search" type="search" placeholder="Buscar exercício…">
            </label>
            <label>
              <span class="visually-hidden">Grupo muscular</span>
              <select class="select" id="picker-group"><option value="">Todos os grupos</option>${groupOptions}</select>
            </label>
          </div>
          <div id="picker-filter"></div>
          <ul class="item-list" id="picker-list"></ul>
        </section>

        <div class="sticky-cta">
          <button class="btn btn-primary btn-block btn-lg" type="submit">${editing ? "Salvar treino" : "Criar treino"}</button>
          ${editing ? `<button class="btn btn-danger btn-block" type="button" id="w-delete">Excluir treino</button>` : ""}
        </div>
      </form>`;

    $("w-name").addEventListener("input", (e) => (draft.name = e.target.value));
    $("w-description").addEventListener("input", (e) => (draft.description = e.target.value));
    $("w-notes").addEventListener("input", (e) => (draft.notes = e.target.value));
    $("picker-search").addEventListener("input", renderPicker);
    $("picker-group").addEventListener("change", renderPicker);

    $("w-items").addEventListener("input", (e) => {
      const row = e.target.closest("[data-index]");
      if (!row) return;
      const item = draft.items[Number(row.dataset.index)];
      if (e.target.dataset.field) item[e.target.dataset.field] = e.target.value;
    });
    $("w-items").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-item-action]");
      if (!btn) return;
      const i = Number(btn.closest("[data-index]").dataset.index);
      const action = btn.dataset.itemAction;
      if (action === "remove") draft.items.splice(i, 1);
      if (action === "up" && i > 0) [draft.items[i - 1], draft.items[i]] = [draft.items[i], draft.items[i - 1]];
      if (action === "down" && i < draft.items.length - 1) [draft.items[i + 1], draft.items[i]] = [draft.items[i], draft.items[i + 1]];
      renderDraftItems();
      renderPicker();
    });
    $("picker-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (!btn) return;
      const ex = findExercise(btn.dataset.add);
      if (!ex) return;
      draft.items.push({ exerciseId: ex.id, sets: ex.sets || "", reps: ex.reps || "", load: "", rir: "", rest: ex.rest || "" });
      renderDraftItems();
      renderPicker();
      toast(`${ex.name} adicionado`);
    });

    $("workout-form").addEventListener("submit", (event) => {
      event.preventDefault();
      draft.name = $("w-name").value.trim();
      draft.description = $("w-description").value.trim();
      showErrors(event.target, draft.name ? [] : [["w-name", "Dê um nome ao treino."]]);
      const itemsError = $("w-items-error");
      itemsError.textContent = draft.items.length ? "" : "Adicione pelo menos um exercício.";
      itemsError.classList.toggle("hidden", Boolean(draft.items.length));
      if (!draft.name) return;
      if (!draft.items.length) {
        itemsError.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const saved = Store.saveWorkout(
        {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description,
          notes: String(draft.notes || "").trim(),
          items: draft.items.map(({ exerciseId, sets, reps, load, rir, rest }) => ({
            exerciseId,
            sets: String(sets).trim(),
            reps: String(reps).trim(),
            load: String(load || "").trim(),
            rir: String(rir || "").trim(),
            rest: String(rest || "").trim(),
          })),
          groups: workoutGroups(draft.items).map((g) => g.id),
        },
        user
      );
      draft = null;
      toast(editing ? "Treino salvo!" : "Treino criado!", "success");
      location.hash = `#/treinos/${encodeURIComponent(saved.id)}`;
    });

    if (editing) {
      $("w-delete").addEventListener("click", () => {
        if (!confirm(`Excluir o treino "${editing.name}"? O histórico de quem já fez continua guardado.`)) return;
        if (Store.session(user.id)?.workoutId === editing.id) Store.cancelSession(user.id);
        Store.deleteWorkout(editing.id);
        draft = null;
        toast("Treino excluído.");
        location.hash = "#/treinos";
      });
    }

    renderDraftItems();
    renderPicker();
  }

  function renderDraftItems() {
    $("w-groups").innerHTML = groupChips(workoutGroups(draft.items)) || `<span class="meta">Aparecem conforme você adiciona exercícios.</span>`;
    $("w-count").textContent = draft.items.length ? `(${draft.items.length})` : "";
    if (draft.items.length) $("w-items-error").classList.add("hidden");
    $("w-items").innerHTML = draft.items.length
      ? draft.items
          .map((item, i) => {
            const ex = findExercise(item.exerciseId);
            const g = ex && findGroup(ex.group);
            return `
              <li class="item-row item-row-edit" data-index="${i}">
                <span class="item-index">${i + 1}</span>
                <div class="item-main">
                  <div class="item-title">${ex ? escapeHtml(ex.name) : "<em>Exercício removido</em>"}</div>
                  <div class="meta">${g ? `${icon(g.icon, "mi-inline")} ${escapeHtml(g.name)}` : ""}</div>
                  <div class="sets-reps">
                    <label><span>Séries</span><input class="input input-sm" data-field="sets" inputmode="numeric" maxlength="10" value="${escapeHtml(item.sets)}"></label>
                    <span aria-hidden="true">×</span>
                    <label><span>Repetições</span><input class="input input-sm" data-field="reps" maxlength="20" value="${escapeHtml(item.reps)}"></label>
                  </div>
                  <div class="extra-fields">
                    <label><span>Carga</span><input class="input input-sm" data-field="load" maxlength="30" placeholder="10 kg" value="${escapeHtml(item.load || "")}"></label>
                    <label><span>RIR</span><input class="input input-sm" data-field="rir" maxlength="10" placeholder="1-2" value="${escapeHtml(item.rir || "")}"></label>
                    <label><span>Descanso</span><input class="input input-sm" data-field="rest" maxlength="20" placeholder="60s" value="${escapeHtml(item.rest || "")}"></label>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="icon-btn icon-btn-sm" type="button" data-item-action="up" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${icon("arrow_upward")}</button>
                  <button class="icon-btn icon-btn-sm" type="button" data-item-action="down" aria-label="Descer" ${i === draft.items.length - 1 ? "disabled" : ""}>${icon("arrow_downward")}</button>
                  <button class="icon-btn icon-btn-sm icon-btn-danger" type="button" data-item-action="remove" aria-label="Remover">${icon("close")}</button>
                </div>
              </li>`;
          })
          .join("")
      : `<li class="state state-sm">Nenhum exercício ainda. Adicione da lista abaixo.</li>`;
  }

  function renderPicker() {
    const q = normalizeText($("picker-search").value.trim());
    const groupFilter = $("picker-group").value;
    const chosen = new Set(draft.items.map((i) => i.exerciseId));
    const list = exercises().filter(
      (e) => available(e) && (!groupFilter || inGroup(e, groupFilter)) && (!q || normalizeText(e.name).includes(q))
    );
    const hiddenCount = exercises().filter((e) => !available(e)).length;
    $("picker-filter").innerHTML = equipFilterHtml(hiddenCount);
    $("picker-list").innerHTML = list.length
      ? list
          .map((ex) => {
            const g = findGroup(ex.group);
            const added = chosen.has(ex.id);
            return `
              <li class="item-row">
                <span class="group-icon group-icon-sm" style="--group-color:${safeColor(g?.color)}">${icon(g?.icon || "fitness_center")}</span>
                <div class="item-main tappable" data-exercise="${escapeHtml(ex.id)}">
                  <div class="item-title">${escapeHtml(ex.name)}</div>
                  <div class="meta">${escapeHtml(g?.name || "")}${ex.sets || ex.reps ? ` · ${escapeHtml(setsReps(ex.sets, ex.reps))}` : ""}</div>
                </div>
                <button class="btn btn-sm ${added ? "" : "btn-primary"}" type="button" data-add="${escapeHtml(ex.id)}">${icon("add", "mi-inline")} ${added ? "De novo" : "Adicionar"}</button>
              </li>`;
          })
          .join("")
      : `<li class="state state-sm">Nenhum exercício encontrado.</li>`;
  }

  /* ---------- Executar treino ---------- */

  function renderWorkoutRun(id) {
    setTab("treinos");
    const w = Store.getWorkout(id);
    let session = Store.session(user.id);
    if (!w) {
      setHeader("Treino", { back: "#/treinos" });
      app.innerHTML = empty("help", "Treino não encontrado.");
      return;
    }
    if (!session || session.workoutId !== w.id) {
      location.replace(`#/treinos/${encodeURIComponent(w.id)}`);
      return;
    }
    setHeader(w.name, { back: `#/treinos/${encodeURIComponent(w.id)}` });

    const items = w.items
      .map((item, i) => {
        const ex = findExercise(item.exerciseId);
        if (!ex) return "";
        const g = findGroup(ex.group);
        const done = Boolean(session.done[i]);
        return `
          <li class="run-item ${done ? "done" : ""}" data-index="${i}">
            <button class="run-check" type="button" data-toggle="${i}" aria-pressed="${done}" aria-label="${done ? "Desmarcar" : "Concluir"} ${escapeHtml(ex.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            </button>
            <div class="item-main tappable" data-exercise="${escapeHtml(ex.id)}" data-sets="${escapeHtml(item.sets)}" data-reps="${escapeHtml(item.reps)}" data-load="${escapeHtml(item.load || "")}" data-rir="${escapeHtml(item.rir || "")}" data-rest="${escapeHtml(item.rest || "")}">
              <div class="item-title">${escapeHtml(ex.name)}</div>
              <div class="run-sets">${escapeHtml(setsReps(item.sets, item.reps)) || "—"}${item.load ? `<span class="run-load">${icon("fitness_center", "mi-inline")} ${escapeHtml(item.load)}</span>` : ""}</div>
              <div class="meta">${g ? `${icon(g.icon, "mi-inline")} ${escapeHtml(g.name)}` : ""}${item.rir ? ` · RIR ${escapeHtml(item.rir)}` : ""}${item.rest || ex.rest ? ` · descanso ${escapeHtml(item.rest || ex.rest)}` : ""}</div>
              <div class="meta link-text">Ver execução ›</div>
            </div>
          </li>`;
      })
      .join("");

    app.innerHTML = `
      <div class="run-progress">
        <div class="run-timer" aria-label="Tempo de treino">
          <span class="run-timer-value" id="run-timer">00:00</span>
          <span class="meta">desde ${new Date(session.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div class="run-progress-text"><span id="run-count"></span></div>
        <div class="progress"><div class="progress-bar" id="run-bar"></div></div>
      </div>
      <ol class="run-list">${items}</ol>
      ${w.notes ? `<section class="workout-notes">${icon("info", "mi-inline")} <p>${escapeHtml(w.notes)}</p></section>` : ""}
      ${personalNoteHtml(w.id)}
      <div class="sticky-cta">
        <button class="btn btn-primary btn-block btn-lg" type="button" id="finish-btn"></button>
        <button class="btn btn-ghost btn-block" type="button" id="cancel-run">Cancelar treino</button>
      </div>`;

    bindPersonalNote();
    const valid = w.items.map((item, i) => (findExercise(item.exerciseId) ? i : null)).filter((i) => i !== null);

    function updateProgress() {
      const done = valid.filter((i) => session.done[i]).length;
      const total = valid.length;
      $("run-count").textContent = `${done} de ${total} exercícios`;
      $("run-bar").style.width = `${total ? (done / total) * 100 : 0}%`;
      const btn = $("finish-btn");
      const complete = total > 0 && done === total;
      btn.disabled = !complete;
      btn.innerHTML = complete ? `${icon("flag", "mi-inline")} Terminar treino` : `Faltam ${total - done}`;
    }

    app.querySelector(".run-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-toggle]");
      if (!btn) return;
      const i = Number(btn.dataset.toggle);
      session = Store.toggleDone(user.id, i);
      const row = btn.closest(".run-item");
      const done = Boolean(session.done[i]);
      row.classList.toggle("done", done);
      btn.setAttribute("aria-pressed", String(done));
      if (navigator.vibrate && done) navigator.vibrate(30);
      updateProgress();
    });

    $("finish-btn").addEventListener("click", () => {
      const snapshot = valid.map((i) => {
        const item = w.items[i];
        const ex = findExercise(item.exerciseId);
        return { exerciseId: ex.id, name: ex.name, group: ex.group, sets: item.sets, reps: item.reps, load: item.load || "", rir: item.rir || "", rest: item.rest || "" };
      });
      const area = $("my-note");
      if (area) Store.saveNote(user.id, w.id, area.value);
      const record = Store.finishSession(user, w, valid.length, snapshot);
      if (!record) return;
      toast("Treino concluído!", "success");
      location.hash = `#/atividade?feito=${encodeURIComponent(record.id)}`;
    });

    $("cancel-run").addEventListener("click", () => {
      if (!confirm("Cancelar este treino? O progresso não será registrado.")) return;
      Store.cancelSession(user.id);
      location.hash = `#/treinos/${encodeURIComponent(w.id)}`;
    });

    const started = new Date(session.startedAt).getTime();
    const tick = () => {
      const el = $("run-timer");
      if (el) el.textContent = formatClock(Date.now() - started);
    };
    tick();
    timer = setInterval(tick, 1000);

    updateProgress();
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  /* ================= Atividade ================= */

  function renderActivity(params) {
    setHeader("Atividade", {
      action: `<a class="icon-btn" href="#/atividade/configuracoes" aria-label="Configurações" title="Configurações">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
      </a>`,
    });
    setTab("atividade");
    const history = Store.history(user.id);
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = history.filter((h) => new Date(h.finishedAt).getTime() >= weekAgo).length;
    const highlight = params.get("feito");
    const initials = user.name
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

    app.innerHTML = `
      <section class="profile">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
        <div>
          <h2 class="page-title">${escapeHtml(user.name)}</h2>
          <p class="meta">${[user.age ? `${user.age} anos` : "", SEXES.find(([id]) => id === user.sex)?.[1] || ""].filter(Boolean).join(" · ")}</p>
          <a class="link-btn" href="#/atividade/perfil">Editar perfil</a>
        </div>
      </section>
      <div id="install-slot" data-context="activity">${installCard("activity")}</div>
      <div class="stat-tiles">
        <div class="stat-tile"><span class="stat-tile-value">${history.length}</span><span class="stat-tile-label">treinos feitos</span></div>
        <div class="stat-tile"><span class="stat-tile-value">${thisWeek}</span><span class="stat-tile-label">últimos 7 dias</span></div>
      </div>
      <section class="subsection">
        <div class="subsection-head">
          <h2 class="subsection-title">Meus equipamentos</h2>
          <a class="btn btn-sm" href="#/atividade/equipamentos">Editar</a>
        </div>
        ${
          (user.equipment || []).length
            ? `<div class="equip-chips">${(user.equipment || []).map((id) => `<span class="equip-chip">${icon(EQUIPMENT_ICONS[id] || "fitness_center", "mi-inline")} ${escapeHtml(EQUIPMENT[id] || id)}</span>`).join("")}</div>`
            : `<p class="meta">Nenhum marcado — mostramos exercícios com o peso do corpo.</p>`
        }
      </section>
      <section class="subsection">
        <h2 class="subsection-title">Histórico</h2>
        ${
          history.length
            ? `<ul class="item-list">${history
                .map(
                  (h) => `
                  <li><a class="item-row item-link ${h.id === highlight ? "highlight" : ""}" href="#/atividade/historico/${encodeURIComponent(h.id)}">
                    <span class="history-icon">${icon("check_circle")}</span>
                    <div class="item-main">
                      <div class="item-title">${escapeHtml(h.workoutName)}</div>
                      <div class="meta">${escapeHtml(formatDateTime(h.finishedAt))} · ${formatDuration(h.startedAt, h.finishedAt)} · ${h.exerciseCount} exercícios</div>
                    </div>
                    <span class="chevron" aria-hidden="true">›</span>
                  </a></li>`
                )
                .join("")}</ul>`
            : empty("event_busy", "Nenhum treino registrado ainda.", `<br><a class="btn btn-primary" style="margin-top:12px" href="#/treinos">Ver treinos</a>`)
        }
      </section>`;
  }

  function renderHistoryDetail(id) {
    setTab("atividade");
    const h = Store.getHistory(id);
    if (!h || h.userId !== user.id) {
      setHeader("Treino feito", { back: "#/atividade" });
      app.innerHTML = empty("help", "Registro não encontrado.");
      return;
    }
    setHeader("Treino feito", { back: "#/atividade" });
    const start = new Date(h.startedAt);
    const end = new Date(h.finishedAt);
    const time = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const workout = Store.getWorkout(h.workoutId);
    // Registros antigos não têm a lista: usa a do treino atual, avisando.
    const fromSnapshot = Array.isArray(h.exercises) && h.exercises.length;
    const list = fromSnapshot
      ? h.exercises
      : (workout?.items || []).map((item) => {
          const ex = findExercise(item.exerciseId);
          return ex ? { exerciseId: ex.id, name: ex.name, group: ex.group, sets: item.sets, reps: item.reps, load: item.load || "", rir: item.rir || "" } : null;
        }).filter(Boolean);
    const groupsDone = [...new Set(list.map((e) => e.group))].map(findGroup).filter(Boolean);
    const totalSets = list.reduce((sum, e) => sum + (parseInt(e.sets, 10) || 0), 0);
    const sameWorkoutCount = Store.history(user.id).filter((x) => x.workoutId === h.workoutId).length;

    app.innerHTML = `
      <section class="history-hero">
        <span class="history-hero-icon">${icon("flag")}</span>
        <div>
          <h2>${escapeHtml(h.workoutName)}</h2>
          <p class="meta">${escapeHtml(capitalize(end.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })))}</p>
        </div>
      </section>
      ${h.workoutDescription ? `<p class="lead">${escapeHtml(h.workoutDescription)}</p>` : ""}

      <div class="detail-grid">
        <div class="stat-tile"><span class="stat-tile-value">${formatDuration(h.startedAt, h.finishedAt)}</span><span class="stat-tile-label">duração</span></div>
        <div class="stat-tile"><span class="stat-tile-value">${time(start)}–${time(end)}</span><span class="stat-tile-label">início e fim</span></div>
        <div class="stat-tile"><span class="stat-tile-value">${h.exerciseCount}</span><span class="stat-tile-label">exercícios</span></div>
        <div class="stat-tile"><span class="stat-tile-value">${totalSets || "—"}</span><span class="stat-tile-label">séries no total</span></div>
      </div>

      ${groupsDone.length ? `<section class="subsection"><h2 class="subsection-title">Músculos trabalhados</h2><div class="group-chips" style="margin-top:10px">${groupChips(groupsDone)}</div></section>` : ""}

      <section class="subsection">
        <h2 class="subsection-title">Exercícios feitos</h2>
        ${!fromSnapshot && list.length ? `<p class="meta">Registro antigo: mostrando os exercícios atuais do treino.</p>` : ""}
        ${
          list.length
            ? `<ol class="item-list">${list
                .map((e, i) => {
                  const g = findGroup(e.group);
                  const exists = findExercise(e.exerciseId);
                  return `
                    <li class="item-row ${exists ? "tappable" : ""}" ${exists ? `data-exercise="${escapeHtml(e.exerciseId)}" data-sets="${escapeHtml(e.sets)}" data-reps="${escapeHtml(e.reps)}" data-load="${escapeHtml(e.load || "")}"` : ""}>
                      <span class="item-index done-index">${icon("check")}</span>
                      <div class="item-main">
                        <div class="item-title">${escapeHtml(e.name)}</div>
                        <div class="meta">${g ? `${icon(g.icon, "mi-inline")} ${escapeHtml(g.name)} · ` : ""}${escapeHtml(prescription(e)) || "—"}</div>
                      </div>
                      ${exists ? `<span class="chevron" aria-hidden="true">›</span>` : ""}
                    </li>`;
                })
                .join("")}</ol>`
            : `<p class="meta">A lista de exercícios deste registro não está disponível.</p>`
        }
      </section>

      ${h.note ? `<section class="subsection"><h2 class="subsection-title">${icon("edit_note", "mi-inline")} Minhas observações</h2><p class="note-box">${escapeHtml(h.note)}</p></section>` : ""}

      <p class="meta">Você já fez este treino ${sameWorkoutCount} ${sameWorkoutCount === 1 ? "vez" : "vezes"}.</p>
      ${
        workout
          ? `<div class="sticky-cta"><a class="btn btn-primary btn-block btn-lg" href="#/treinos/${encodeURIComponent(workout.id)}">${icon("replay", "mi-inline")} Fazer este treino de novo</a></div>`
          : `<p class="meta">Este treino foi excluído.</p>`
      }`;
  }

  function renderSettings() {
    setTab("atividade");
    setHeader("Configurações", { back: "#/atividade" });
    const theme = window.MegTheme ? window.MegTheme.get() : "auto";
    app.innerHTML = `
      <section class="settings-group">
        <h2 class="settings-title">Aparência</h2>
        <div class="segmented" role="radiogroup" aria-label="Tema" id="theme-picker">
          ${[
            ["auto", "brightness_auto", "Automático"],
            ["light", "light_mode", "Claro"],
            ["dark", "dark_mode", "Escuro"],
          ]
            .map(
              ([value, iconName, label]) =>
                `<button type="button" role="radio" data-theme-choice="${value}" aria-checked="${theme === value}">${icon(iconName)}${label}</button>`
            )
            .join("")}
        </div>
        <p class="meta">${theme === "auto" ? "Segue o tema do seu celular." : "Escolhido por você neste aparelho."}</p>
      </section>

      <section class="settings-group">
        <h2 class="settings-title">Conta</h2>
        <div class="settings-list">
          <a class="settings-item" href="#/atividade/perfil">
            <span class="settings-icon">${icon("person")}</span>
            <span class="item-main"><span class="item-title">Editar perfil</span><br><span class="meta">Nome, idade e sexo</span></span>
            <span class="chevron" aria-hidden="true">›</span>
          </a>
          <a class="settings-item" href="#/atividade/equipamentos">
            <span class="settings-icon">${icon("fitness_center")}</span>
            <span class="item-main"><span class="item-title">Meus equipamentos</span><br><span class="meta">${(user.equipment || []).length} selecionados</span></span>
            <span class="chevron" aria-hidden="true">›</span>
          </a>
          <button class="settings-item settings-danger" type="button" id="logout-btn">
            <span class="settings-icon">${icon("logout")}</span>
            <span class="item-main"><span class="item-title">Sair</span><br><span class="meta">Trocar de perfil neste aparelho</span></span>
          </button>
        </div>
      </section>`;

    $("theme-picker").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-choice]");
      if (!btn || !window.MegTheme) return;
      window.MegTheme.set(btn.dataset.themeChoice);
      renderSettings();
    });
    $("logout-btn").addEventListener("click", () => {
      if (!confirm("Sair deste perfil?")) return;
      Store.logout();
      user = null;
      location.hash = "#/inicio";
      showLogin();
    });
  }

  function renderEditProfile() {
    setTab("atividade");
    setHeader("Editar perfil", { back: "#/atividade/configuracoes" });
    app.innerHTML = `
      <form class="form-stack" id="profile-form" novalidate>
        ${profileFieldsHtml(user)}
        <div class="sticky-cta"><button class="btn btn-primary btn-block btn-lg" type="submit">Salvar</button></div>
      </form>`;
    $("profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const { values, errors } = readProfileFields(e.target);
      const duplicate = Store.findByName(values.name);
      if (!errors.length && duplicate && duplicate.id !== user.id) errors.push(["pf-name", "Já existe outro perfil com esse nome neste aparelho."]);
      showFieldErrors(e.target, errors);
      if (errors.length) return;
      user = Store.updateUser(user.id, values);
      toast("Perfil atualizado!", "success");
      location.hash = "#/atividade/configuracoes";
    });
  }

  function renderEditEquipment() {
    setTab("atividade");
    setHeader("Meus equipamentos", { back: "#/atividade/configuracoes" });
    app.innerHTML = `
      <form class="form-stack" id="equipment-form" novalidate>
        <p class="page-subtitle" style="margin:0">Marque o que você tem em casa. A lista de exercícios e a montagem de treinos mostram o que dá para fazer.</p>
        ${equipmentPickerHtml(user.equipment || [])}
        <div class="sticky-cta"><button class="btn btn-primary btn-block btn-lg" type="submit">Salvar</button></div>
      </form>`;
    $("equipment-form").addEventListener("submit", (e) => {
      e.preventDefault();
      user = Store.updateUser(user.id, { equipment: readEquipment(e.target) });
      toast("Equipamentos atualizados!", "success");
      location.hash = "#/atividade";
    });
  }

  /* ================= Rotas ================= */

  function route() {
    clearInterval(timer);
    timer = null;
    closeSheet(true);
    if (!user) return;
    const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    if (!(parts[0] === "treinos" && (parts[1] === "novo" || parts[2] === "editar"))) draft = null;

    switch (parts[0]) {
      case "treinos":
        if (parts[1] === "novo") renderWorkoutForm(null);
        else if (parts[1] && parts[2] === "editar") renderWorkoutForm(parts[1]);
        else if (parts[1] && parts[2] === "executar") renderWorkoutRun(parts[1]);
        else if (parts[1]) renderWorkoutDetail(parts[1]);
        else renderWorkouts();
        break;
      case "exercicios":
        if (parts[1] === "novo") renderExerciseForm(null, params.get("grupo"));
        else if (parts[1] === "editar") renderExerciseForm(parts[2]);
        else if (parts[1] === "grupo") renderExerciseGroup(parts[2]);
        else if (parts[1] === "ver") renderExercisePage(parts[2]);
        else renderExerciseGroups();
        break;
      case "atividade":
        if (parts[1] === "configuracoes") renderSettings();
        else if (parts[1] === "perfil") renderEditProfile();
        else if (parts[1] === "historico" && parts[2]) renderHistoryDetail(parts[2]);
        else if (parts[1] === "equipamentos") renderEditEquipment();
        else renderActivity(params);
        break;
      case "inicio":
        renderHome();
        break;
      default:
        location.replace("#/inicio");
        return;
    }
    window.scrollTo(0, 0);
  }

  /* ================= Perfil: campos reutilizados (onboarding e edição) ================= */

  const SEXES = [
    ["feminino", "Feminino"],
    ["masculino", "Masculino"],
    ["outro", "Outro"],
    ["nao-informar", "Prefiro não dizer"],
  ];

  function profileFieldsHtml(values = {}) {
    return `
      <div class="field">
        <label for="pf-name">Nome</label>
        <input class="input input-lg" id="pf-name" maxlength="40" autocomplete="given-name" placeholder="Seu nome" value="${escapeHtml(values.name || "")}">
      </div>
      <div class="field">
        <label for="pf-age">Idade</label>
        <input class="input input-lg" id="pf-age" type="number" inputmode="numeric" min="10" max="100" placeholder="Ex.: 30" value="${escapeHtml(values.age ?? "")}">
      </div>
      <fieldset class="field fieldset">
        <legend>Sexo</legend>
        <div class="check-chips" role="radiogroup">
          ${SEXES.map(
            ([id, label]) => `
            <label class="check-chip radio-chip">
              <input type="radio" name="pf-sex" value="${id}" ${values.sex === id ? "checked" : ""}>
              <span>${label}</span>
            </label>`
          ).join("")}
        </div>
      </fieldset>`;
  }

  // Lê e valida os campos de perfil. Devolve { values } ou { errors }.
  function readProfileFields(container) {
    const name = $("pf-name").value.trim().replace(/\s+/g, " ");
    const ageRaw = $("pf-age").value.trim();
    const age = Number(ageRaw);
    const sex = container.querySelector('input[name="pf-sex"]:checked')?.value || "";
    const errors = [];
    if (name.length < 2) errors.push(["pf-name", "Digite seu nome (pelo menos 2 letras)."]);
    if (!ageRaw || !Number.isInteger(age) || age < 10 || age > 100) errors.push(["pf-age", "Informe uma idade entre 10 e 100."]);
    if (!sex) errors.push(["pf-sex", "Escolha uma opção."]);
    return { values: { name, age, sex }, errors };
  }

  function showFieldErrors(container, errors) {
    container.querySelectorAll(".field-error:not([id])").forEach((el) => el.remove());
    errors.forEach(([id, message]) => {
      const target = id === "pf-sex" ? container.querySelector('input[name="pf-sex"]') : $(id);
      const el = document.createElement("span");
      el.className = "field-error";
      el.textContent = message;
      target.closest(".field").appendChild(el);
    });
    if (errors.length) {
      const first = errors[0][0] === "pf-sex" ? container.querySelector('input[name="pf-sex"]') : $(errors[0][0]);
      first.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.type !== "radio") first.focus({ preventScroll: true });
    }
  }

  function equipmentPickerHtml(selected = []) {
    return `
      <div class="equip-grid">
        ${Object.entries(EQUIPMENT)
          .map(
            ([id, label]) => `
            <label class="equip-option">
              <input type="checkbox" name="pf-equipment" value="${id}" ${selected.includes(id) ? "checked" : ""}>
              <span>${icon(EQUIPMENT_ICONS[id] || "fitness_center", "equip-option-icon")}${escapeHtml(label)}</span>
            </label>`
          )
          .join("")}
      </div>`;
  }

  function readEquipment(container) {
    return [...container.querySelectorAll('input[name="pf-equipment"]:checked')].map((c) => c.value);
  }

  /* ================= Onboarding ================= */

  // Estado do onboarding: step 1..3 e dados preenchidos. "existing" = perfil antigo completando dados.
  let onboarding = null;

  function showLogin() {
    clearInterval(timer);
    $("app-shell").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
    onboarding = { step: 1, values: { equipment: [] }, existing: null };
    renderOnboarding();
  }

  function startProfileCompletion(existingUser) {
    $("app-shell").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
    onboarding = {
      step: 2,
      values: { name: existingUser.name, age: existingUser.age, sex: existingUser.sex, equipment: existingUser.equipment || [] },
      existing: existingUser,
    };
    renderOnboarding();
  }

  function stepDots(step) {
    return `<div class="steps" aria-label="Passo ${step} de 3">${[1, 2, 3]
      .map((n) => `<span class="step-dot ${n === step ? "active" : n < step ? "done" : ""}"></span>`)
      .join("")}</div>`;
  }

  function renderOnboarding() {
    const box = $("onboarding");
    const { step, values, existing } = onboarding;

    if (step === 1) {
      const profiles = Store.users();
      box.innerHTML = `
        <div class="onboarding-step onboarding-welcome">
          <img class="brand-logo brand-logo-xl" src="assets/icons/icon-192.png" alt="" width="96" height="96">
          <h1>Seja bem-vindo ao <span class="accent">MegGym</span></h1>
          <p class="lead">Um aplicativo de treinos em casa. Monte seus treinos com o que você tem e acompanhe sua evolução.</p>
          <button class="btn btn-primary btn-block btn-lg" type="button" data-ob="next">Começar</button>
          ${
            profiles.length
              ? `<div class="profiles">
                  <p class="page-subtitle">Já tem perfil neste aparelho?</p>
                  <div class="chips">${profiles
                    .map((u) => `<button class="chip" type="button" data-profile="${escapeHtml(u.id)}">${escapeHtml(u.name)}</button>`)
                    .join("")}</div>
                </div>`
              : ""
          }
        </div>`;
      return;
    }

    if (step === 2) {
      box.innerHTML = `
        <form class="onboarding-step form-stack" id="ob-profile" novalidate>
          ${stepDots(2)}
          <div>
            <h1>${existing ? "Complete seu perfil" : "Vamos nos conhecer"}</h1>
            <p class="page-subtitle">${existing ? "Precisamos de mais alguns dados." : "Conta um pouco sobre você."}</p>
          </div>
          ${profileFieldsHtml(values)}
          <div class="onboarding-actions">
            ${existing ? "" : `<button class="btn btn-ghost" type="button" data-ob="back">Voltar</button>`}
            <button class="btn btn-primary btn-lg" type="submit">Continuar</button>
          </div>
        </form>`;
      const form = $("ob-profile");
      if (!values.name) $("pf-name").focus();
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const { values: read, errors } = readProfileFields(form);
        const duplicate = Store.findByName(read.name);
        if (!errors.length && duplicate && duplicate.id !== existing?.id)
          errors.push(["pf-name", "Já existe um perfil com esse nome neste aparelho. Use outro nome ou volte e toque nele."]);
        showFieldErrors(form, errors);
        if (errors.length) return;
        Object.assign(values, read);
        onboarding.step = 3;
        renderOnboarding();
      });
      return;
    }

    // step 3
    box.innerHTML = `
      <form class="onboarding-step form-stack" id="ob-equipment" novalidate>
        ${stepDots(3)}
        <div>
          <h1>Quais equipamentos você tem em casa?</h1>
          <p class="page-subtitle">Marque todos que tiver. Vamos mostrar os exercícios que você consegue fazer.</p>
        </div>
        ${equipmentPickerHtml(values.equipment)}
        <p class="meta">Não tem nenhum? Sem problema: exercícios com o peso do corpo sempre aparecem.</p>
        <div class="onboarding-actions">
          <button class="btn btn-ghost" type="button" data-ob="back">Voltar</button>
          <button class="btn btn-primary btn-lg" type="submit">Concluir</button>
        </div>
      </form>`;
    $("ob-equipment").addEventListener("submit", (e) => {
      e.preventDefault();
      values.equipment = readEquipment(e.target);
      if (existing) {
        user = Store.updateUser(existing.id, { name: values.name, age: values.age, sex: values.sex, equipment: values.equipment, onboarded: true });
      } else {
        user = Store.createUser(values);
      }
      onboarding = null;
      toast(`Tudo pronto, ${user.name.split(" ")[0]}!`, "success");
      if (!location.hash || location.hash === "#/") location.replace("#/inicio");
      enterApp();
    });
  }

  $("onboarding").addEventListener("click", (e) => {
    const nav = e.target.closest("[data-ob]");
    if (nav && onboarding) {
      if (nav.dataset.ob === "back") {
        const form = $("onboarding").querySelector("form");
        if (onboarding.step === 3 && form) onboarding.values.equipment = readEquipment(form);
        onboarding.step = Math.max(1, onboarding.step - 1);
      } else {
        onboarding.step = Math.min(3, onboarding.step + 1);
      }
      renderOnboarding();
      return;
    }
    const profile = e.target.closest("[data-profile]");
    if (profile) {
      user = Store.loginById(profile.dataset.profile);
      if (user) enterApp();
    }
  });

  function enterApp() {
    if (!user.onboarded) {
      startProfileCompletion(user);
      return;
    }
    $("login-screen").classList.add("hidden");
    $("onboarding").innerHTML = ""; // evita campos com o mesmo id escondidos na página
    $("app-shell").classList.remove("hidden");
    route();
  }

  $("back-btn").addEventListener("click", () => {
    const href = $("back-btn").dataset.href;
    if (href) location.hash = href;
  });

  /* ================= Detalhes do exercício (bottom sheet) ================= */

  const sheet = $("sheet");
  let sheetReturnFocus = null;

  // Conteúdo de detalhes do exercício (usado na tela cheia e no bottom sheet).
  function exerciseDetailHtml(ex, prescription = {}, { titleId = "sheet-title" } = {}) {
    const g = findGroup(ex.group);
    const img = safeUrl(ex.image);
    const ytId = youtubeId(ex.video);
    const videoUrl = safeUrl(ex.video);
    const sets = prescription.sets || ex.sets;
    const reps = prescription.reps || ex.reps;
    const stats = [
      ["Séries", sets],
      ["Repetições", reps],
      ["Descanso", prescription.rest || ex.rest],
      ["RIR", prescription.rir],
      ["Carga", prescription.load],
    ]
      .filter(([, v]) => v)
      .map(([label, v]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${escapeHtml(v)}</span></div>`)
      .join("");
    const equip = equipmentChips(ex.equipment, ex.equipmentAny);
    const groupCount = g ? exercises().filter((e) => inGroup(e, g.id)).length : 0;

    return `
      ${img ? `<img class="sheet-image" src="${escapeHtml(img)}" alt="Demonstração: ${escapeHtml(ex.name)}">` : ""}
      <div class="sheet-head">
        <h2 id="${titleId}">${escapeHtml(ex.name)}</h2>
        ${difficultyBadge(ex.difficulty)}
      </div>
      ${stats ? `<div class="stats">${stats}</div>` : ""}

      <section class="sheet-section">
        <h3>Execução</h3>
        ${
          ytId
            ? `<div class="video-wrap"><iframe class="video-frame" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?rel=0&playsinline=1" title="Vídeo: ${escapeHtml(ex.name)}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
            : videoUrl
              ? `<a class="btn btn-sm" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">${icon("smart_display", "mi-inline")} Abrir vídeo</a>`
              : ""
        }
        ${ex.description ? `<p class="exercise-desc">${escapeHtml(ex.description)}</p>` : `<p class="meta">Sem descrição.</p>`}
      </section>

      <section class="sheet-section">
        <h3>Equipamentos</h3>
        ${equip ? `<div class="equip-chips">${equip}</div>` : `<p class="meta">Nenhum — peso do corpo.</p>`}
      </section>

      ${
        g
          ? `<section class="sheet-section">
              <h3>Grupo muscular</h3>
              <a class="group-detail" href="#/exercicios/grupo/${encodeURIComponent(g.id)}" style="--group-color:${safeColor(g.color)}">
                <span class="group-icon">${icon(g.icon || "fitness_center")}</span>
                <span class="item-main">
                  <span class="item-title">${escapeHtml(g.name)}</span><br>
                  <span class="meta">${groupCount} ${groupCount === 1 ? "exercício" : "exercícios"} neste grupo · ver todos</span>
                </span>
                <span class="chevron" aria-hidden="true">›</span>
              </a>
            </section>`
          : ""
      }
      ${ex.custom && ex.createdBy ? `<p class="meta">Cadastrado por ${escapeHtml(ex.createdBy)}</p>` : ""}`;
  }

  function openSheet(exerciseId, prescription = {}) {
    const ex = findExercise(exerciseId);
    if (!ex) return;
    $("sheet-content").innerHTML = exerciseDetailHtml(ex, prescription);

    sheetReturnFocus = document.activeElement;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    $("sheet-close").focus({ preventScroll: true });
    $("sheet-content").scrollTop = 0;
  }

  function closeSheet(immediate = false) {
    if (sheet.classList.contains("hidden")) return;
    sheet.classList.remove("open");
    document.body.classList.remove("sheet-open");
    const finish = () => {
      sheet.classList.add("hidden");
      $("sheet-content").innerHTML = ""; // para o vídeo
    };
    if (immediate) finish();
    else setTimeout(finish, 220);
    if (!immediate && sheetReturnFocus) sheetReturnFocus.focus?.({ preventScroll: true });
  }

  app.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-equip-filter]");
    if (toggle) {
      equipFilter = toggle.dataset.equipFilter === "on";
      if ($("picker-list")) renderPicker();
      else route();
      return;
    }
  });

  app.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input, select, label, textarea")) return;
    const page = e.target.closest("[data-exercise-page]");
    if (page) {
      location.hash = `#/exercicios/ver/${encodeURIComponent(page.dataset.exercisePage)}`;
      return;
    }
    const target = e.target.closest("[data-exercise]");
    if (target)
      openSheet(target.dataset.exercise, {
        sets: target.dataset.sets,
        reps: target.dataset.reps,
        load: target.dataset.load,
        rir: target.dataset.rir,
        rest: target.dataset.rest,
      });
  });
  app.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest("[data-exercise-page][tabindex]");
    if (!target || e.target !== target) return;
    e.preventDefault();
    location.hash = `#/exercicios/ver/${encodeURIComponent(target.dataset.exercisePage)}`;
  });
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("#sheet-close")) closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  // Arrastar para baixo fecha o painel.
  let dragStart = null;
  $("sheet-handle").addEventListener("touchstart", (e) => (dragStart = e.touches[0].clientY), { passive: true });
  $("sheet-handle").addEventListener(
    "touchend",
    (e) => {
      if (dragStart !== null && e.changedTouches[0].clientY - dragStart > 60) closeSheet();
      dragStart = null;
    },
    { passive: true }
  );

  /* ================= Início ================= */

  window.addEventListener("hashchange", route);

  const seedWorkouts = fetch("data/workouts.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  Promise.all([loadData(), seedWorkouts])
    .then(([d, seed]) => {
      base = d;
      Store.applySeed(seed);
      user = Store.currentUser();
      if (user) enterApp();
      else showLogin();
    })
    .catch((err) => {
      document.body.innerHTML = `<div class="state" style="margin:24px">${icon("error", "state-icon")}${escapeHtml(err.message)}<br><button class="btn" type="button" onclick="location.reload()">Tentar novamente</button></div>`;
    });
})();
