/* MegGym — app (mobile first): Início, Treinos, Exercícios e Atividade. */
(function () {
  "use strict";

  const { loadData, escapeHtml, safeUrl, safeColor, youtubeId, difficultyBadge, normalizeText, DIFFICULTIES, EQUIPMENT, EQUIPMENT_ICONS, equipmentLabels, canDo, icon, BAND_COLORS, usesWeight, usesBand, loadText, slugify, EXERCISE_TYPES, exerciseType, groupIcon } =
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
    el.className = "toast hidden";
    void el.offsetWidth;
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
      .map((g) => `<span class="group-chip" style="--group-color:${safeColor(g.color)}">${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)}</span>`)
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

  // "Minhas observações" de um exercício: salvas só para o usuário, automaticamente.
  function personalNoteHtml(exerciseId) {
    return `
      <section class="sheet-section my-note">
        <h3><label for="ex-note">Minhas observações</label></h3>
        <textarea class="textarea textarea-sm" id="ex-note" data-note-exercise="${escapeHtml(exerciseId)}" maxlength="1000" placeholder="Ex.: usei 12 kg, subir para 14 na próxima; sentir mais o peito…">${escapeHtml(Store.exerciseNote(user.id, exerciseId))}</textarea>
        <p class="meta" id="ex-note-status">Só você vê. Salva automaticamente.</p>
      </section>`;
  }

  // "Minha carga": peso (kg) e/ou cor do elástico, quando o exercício usa esses equipamentos.
  function loadFieldsHtml(ex) {
    const weight = usesWeight(ex);
    const band = usesBand(ex);
    if (!weight && !band) return "";
    const load = Store.exerciseLoad(user.id, ex.id);
    return `
      <section class="sheet-section my-load" data-load-exercise="${escapeHtml(ex.id)}">
        <h3>Minha carga</h3>
        ${
          weight
            ? `<label class="weight-field">
                <span class="visually-hidden">Peso em kg</span>
                <input class="input" id="ex-weight" type="text" inputmode="decimal" maxlength="12" placeholder="0" value="${escapeHtml(load.weight)}">
                <span class="weight-unit">kg</span>
              </label>
              <p class="meta">Peso que você usa${(ex.equipment || []).includes("halter") || (ex.equipmentAny || []).includes("halter") ? " (por halter)" : ""}.</p>`
            : ""
        }
        ${
          band
            ? `<p class="meta band-label">Cor do elástico</p>
              <div class="band-colors" role="radiogroup" aria-label="Cor do elástico">
                ${Object.entries(BAND_COLORS)
                  .map(
                    ([id, [label, color]]) => `
                    <button type="button" class="band" role="radio" data-band="${id}" aria-checked="${load.band === id}" title="${label}">
                      <span class="band-dot" style="background:${color}"></span><span>${label}</span>
                    </button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        <p class="meta" id="ex-load-status">Só você vê. Salva automaticamente.</p>
      </section>`;
  }

  function loadPreview(ex) {
    const text = loadText(Store.exerciseLoad(user.id, ex.id), ex);
    return `<div class="ex-load-preview ${text ? "" : "hidden"}" data-load-preview="${escapeHtml(ex.id)}">${icon("person", "mi-inline")} <small>Sua carga:</small> <span>${escapeHtml(text)}</span></div>`;
  }

  function refreshLoadPreviews(exerciseId) {
    const ex = findExercise(exerciseId);
    const text = ex ? loadText(Store.exerciseLoad(user.id, exerciseId), ex) : "";
    document.querySelectorAll(`[data-load-preview="${CSS.escape(exerciseId)}"]`).forEach((el) => {
      el.classList.toggle("hidden", !text);
      el.querySelector("span:not(.mi)").textContent = text;
    });
  }

  let weightLogTimer;
  function bindLoadFields() {
    const box = document.querySelector("[data-load-exercise]");
    if (!box) return;
    const id = box.dataset.loadExercise;
    const status = $("ex-load-status");
    const saved = () => {
      if (status) status.textContent = "Salvo. Só você vê.";
      refreshLoadPreviews(id);
    };
    const weight = $("ex-weight");
    if (weight) {
      weight.addEventListener("input", () => {
        weight.value = weight.value.replace(/[^\d.,]/g, "");
        Store.saveExerciseLoad(user.id, id, { weight: weight.value.replace(".", ",") });
        saved();
        clearTimeout(weightLogTimer);
        weightLogTimer = setTimeout(() => {
          Store.logWeight(user.id, id, weight.value, { replace: true });
          refreshWeightChart(id);
        }, 800);
      });
    }
    box.querySelectorAll("[data-band]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const already = btn.getAttribute("aria-checked") === "true";
        box.querySelectorAll("[data-band]").forEach((b) => b.setAttribute("aria-checked", "false"));
        if (!already) btn.setAttribute("aria-checked", "true");
        Store.saveExerciseLoad(user.id, id, { band: already ? "" : btn.dataset.band });
        saved();
      })
    );
  }

  // Prévia da observação embaixo do exercício (detalhe do treino e execução).
  function notePreview(exerciseId) {
    const text = Store.exerciseNote(user.id, exerciseId);
    return `<div class="ex-note-preview ${text ? "" : "hidden"}" data-note-preview="${escapeHtml(exerciseId)}">${icon("edit_note", "mi-inline")} <span>${escapeHtml(text)}</span></div>`;
  }

  let noteTimer;
  function bindPersonalNote() {
    const area = $("ex-note");
    if (!area) return;
    const save = () => {
      const id = area.dataset.noteExercise;
      Store.saveExerciseNote(user.id, id, area.value);
      const status = $("ex-note-status");
      if (status) status.textContent = "Salvo. Só você vê.";
      document.querySelectorAll(`[data-note-preview="${CSS.escape(id)}"]`).forEach((el) => {
        const text = Store.exerciseNote(user.id, id);
        el.classList.toggle("hidden", !text);
        el.querySelector("span:not(.mi)").textContent = text;
      });
    };
    area.addEventListener("input", () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(save, 400);
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

  // Estado vazio: ícone em destaque, mensagem e (opcional) ação.
  function empty(iconName, text, extra = "") {
    return `<div class="state"><span class="state-badge">${icon(iconName, "state-icon")}</span><p class="state-text">${text}</p>${extra ? `<div class="state-actions">${extra}</div>` : ""}</div>`;
  }

  function fab(href, label) {
    return `<a class="fab" href="${href}">${icon("add", "mi-inline")} ${label}</a>`;
  }

  /* ================= Instalar o app ================= */

  const PWA = window.MegPWA;

  // Fechar o cartão vale para o aparelho; depois disso, instalar fica só em Configurações.
  const INSTALL_DISMISSED = "meggym.installCardClosed";
  function installDismissed() {
    try {
      return localStorage.getItem(INSTALL_DISMISSED) === "1";
    } catch {
      return false;
    }
  }

  function installCard() {
    if (!PWA || PWA.status() === "installed" || installDismissed()) return "";
    return `
      <section class="install-card">
        <button class="icon-btn install-close" type="button" data-install-dismiss aria-label="Fechar">${icon("close")}</button>
        <img src="assets/icons/icon-192.png" alt="" width="52" height="52">
        <div class="install-body">
          <h2>Instale o MegGym</h2>
          <p>Abra direto da tela inicial, em tela cheia e até sem internet.</p>
          <div class="install-actions">
            <button class="btn btn-primary" type="button" data-install>${icon("install_mobile", "mi-inline")} Instalar app</button>
          </div>
        </div>
      </section>`;
  }

  // Passo a passo para quando o navegador não oferece a instalação com um toque.
  function installSteps() {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const share = `<span class="ios-share" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>`;
    if (ios && /CriOS|FxiOS|EdgiOS/i.test(ua))
      return { title: "Abra no Safari", steps: ["No iPhone, a instalação só funciona pelo <strong>Safari</strong>.", "Copie o endereço do app e abra no Safari.", "Depois toque em <strong>Compartilhar</strong> " + share + " → <strong>Adicionar à Tela de Início</strong>."] };
    if (ios)
      return { title: "Instalar no iPhone", steps: ["Toque em <strong>Compartilhar</strong> " + share + " na barra do Safari.", "Role e escolha <strong>Adicionar à Tela de Início</strong>.", "Toque em <strong>Adicionar</strong>. O ícone do MegGym aparece na sua tela inicial."] };
    if (/SamsungBrowser/i.test(ua))
      return { title: "Instalar no Samsung Internet", steps: ["Toque no menu <strong>☰</strong> no canto inferior.", "Escolha <strong>Adicionar página a</strong> → <strong>Tela inicial</strong>.", "Confirme em <strong>Adicionar</strong>."] };
    if (/android/i.test(ua))
      return { title: "Instalar no Android", steps: ["Toque no menu <strong>⋮</strong> no canto superior direito do Chrome.", "Escolha <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).", "Confirme em <strong>Instalar</strong>."] };
    return { title: "Instalar no computador", steps: ["No Chrome ou Edge, clique no ícone de instalar na barra de endereço.", "Ou abra o menu <strong>⋮</strong> → <strong>Instalar MegGym</strong>.", "No celular, abra este endereço e use o menu do navegador."] };
  }

  function showInstallHelp() {
    const { title, steps } = installSteps();
    $("sheet-content").innerHTML = `
      <div class="install-help">
        <img src="assets/icons/icon-192.png" alt="" width="64" height="64">
        <h2 id="sheet-title">${title}</h2>
        <ol class="install-steps">${steps.map((st) => `<li>${st}</li>`).join("")}</ol>
        <button class="btn btn-primary btn-block" type="button" id="sheet-close-ok">Entendi</button>
      </div>`;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    $("sheet-close-ok").addEventListener("click", () => closeSheet());
  }

  function refreshInstallSlot() {
    const slot = $("install-slot");
    if (slot) slot.innerHTML = installCard();
  }

  if (PWA) PWA.onChange(refreshInstallSlot);

  // Aviso de versão nova: aparece quando o service worker baixou uma atualização.
  const updateBar = document.createElement("div");
  updateBar.className = "update-bar hidden";
  updateBar.setAttribute("role", "status");
  updateBar.innerHTML = `
    <span class="update-icon">${icon("system_update")}</span>
    <span class="update-text"><strong>Nova versão disponível</strong><br><span>Seus dados continuam salvos.</span></span>
    <button class="btn btn-primary btn-sm" type="button" id="update-apply">Atualizar</button>
    <button class="icon-btn" type="button" id="update-later" aria-label="Agora não">${icon("close")}</button>`;
  document.body.appendChild(updateBar);
  let updateDismissed = false;
  function refreshUpdateBar() {
    updateBar.classList.toggle("hidden", !PWA?.updateAvailable() || updateDismissed);
  }
  $("update-apply").addEventListener("click", () => {
    $("update-apply").disabled = true;
    $("update-apply").textContent = "Atualizando…";
    if (!PWA.applyUpdate()) location.reload();
  });
  $("update-later").addEventListener("click", () => {
    updateDismissed = true;
    refreshUpdateBar();
    toast("Tudo bem. A versão nova entra na próxima vez que você abrir o app.");
  });
  if (PWA) PWA.onUpdate(() => ((updateDismissed = false), refreshUpdateBar()));

  app.addEventListener("click", async (e) => {
    const close = e.target.closest("[data-install-dismiss]");
    if (close) {
      try {
        localStorage.setItem(INSTALL_DISMISSED, "1");
      } catch {}
      const card = close.closest(".install-card");
      card.classList.add("closing");
      setTimeout(refreshInstallSlot, reduceMotion() ? 0 : 250);
      toast("Você pode instalar depois em Configurações.");
      return;
    }
    if (e.target.closest("[data-install]")) {
      if (!PWA) return;
      if (PWA.status() === "installed") {
        toast("O MegGym já está instalado neste aparelho.", "success");
      } else if (PWA.status() === "prompt") {
        const accepted = await PWA.install();
        if (accepted) toast("App instalado!", "success");
        refreshInstallSlot();
        if ($("install-setting")) renderSettings();
      } else {
        showInstallHelp();
      }
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

  // "2026-10-07" (data local)
  function isoDay(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    return {
      emoji: "bolt",
      title: weekCount === 1 ? "Primeiro treino da semana feito" : `Já são ${weekCount} treinos na semana`,
      text: "Bom ritmo! Que tal mais um hoje?",
    };
  }

  function homeStructureCard() {
    const plan = Store.plan(user.id);
    const st = plan && Store.getStructure(plan.structureId);
    if (!st) return "";
    const pr = structureProgress(st);
    const trainedToday = Store.history(user.id).some((h) => dayKey(h.finishedAt) === dayKey(new Date()));
    if (!pr.completed && !trainedToday && !Store.session(user.id)) return ""; // o Treino de hoje já mostra o próximo e o progresso
    return `
      <section class="home-structure">
        <a class="home-structure-head" href="#/estruturas/${encodeURIComponent(st.id)}">
          <span>
            <span class="meta">Sua divisão</span><br>
            <strong>${escapeHtml(st.name)}</strong>
          </span>
          <span class="home-structure-count"><strong>${pr.done}</strong>/${pr.duration}</span>
        </a>
        <div class="progress"><div class="progress-bar" style="width:${pr.percent}%"></div></div>
        ${
          pr.completed
            ? `<p class="meta">${icon("emoji_events", "mi-inline")} Divisão concluída!</p>`
            : pr.next
              ? `<p class="meta">Próximo: Treino ${pr.next.letter} — ${escapeHtml(shortName(pr.next.workout.name))}</p>`
              : ""
        }
      </section>`;
  }

  // Sugestão do treino de hoje: próximo da estrutura seguida; senão, o que vem depois do último feito.
  function todaySuggestion(history) {
    const plan = Store.plan(user.id);
    const st = plan && Store.getStructure(plan.structureId);
    if (st) {
      const pr = structureProgress(st);
      if (pr.next && !pr.completed) return { workout: pr.next.workout, reason: `Treino ${pr.next.letter} · ${st.name}`, progress: pr };
    }
    const single = plan?.workoutId && Store.getWorkout(plan.workoutId);
    if (single) return { workout: single, reason: "Seu treino atual" };
    const list = Store.visibleWorkouts(user.id).filter((w) => w.items?.length);
    if (!list.length) return null;
    const last = history.find((h) => list.some((w) => w.id === h.workoutId));
    if (!last) return { workout: list[0], reason: "Bom para começar" };
    const i = list.findIndex((w) => w.id === last.workoutId);
    return { workout: list[(i + 1) % list.length], reason: `Depois de ${last.workoutName}` };
  }

  function todayCardHtml(history, trainedToday) {
    if (Store.session(user.id)) return "";
    if (trainedToday) {
      const h = history[0];
      return `
        <section class="today-card done">
          <span class="today-icon">${icon("check_circle")}</span>
          <div class="item-main">
            <span class="meta">Treino de hoje</span>
            <h2>${escapeHtml(h.workoutName)}</h2>
            <p class="meta">Feito às ${new Date(h.finishedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Descanse bem!</p>
          </div>
        </section>`;
    }
    const sug = todaySuggestion(history);
    if (!sug) return "";
    const w = sug.workout;
    const rest = restSecondsOf(w);
    const sets = w.items.reduce((sum, it) => sum + (parseInt(it.sets, 10) || 3), 0);
    const minutes = Math.max(10, Math.round((sets * (45 + rest)) / 60 / 5) * 5);
    return `
      <section class="today-card">
        <span class="meta">${icon("today", "mi-inline")} Treino de hoje · ${escapeHtml(sug.reason)}</span>
        <h2>${escapeHtml(w.name)}</h2>
        <div class="group-chips">${groupChips(workoutGroups(w.items))}</div>
        <p class="meta">${w.items.length} exercícios · ${sets} séries · cerca de ${minutes} min</p>
        ${
          sug.progress
            ? `<div class="progress" role="progressbar" aria-label="Progresso da divisão" aria-valuemin="0" aria-valuemax="${sug.progress.duration}" aria-valuenow="${sug.progress.done}"><div class="progress-bar" style="width:${sug.progress.percent}%"></div></div>
               <p class="meta">${sug.progress.done} de ${sug.progress.duration} sessões da divisão</p>`
            : ""
        }
        <div class="today-actions">
          <button class="btn btn-primary btn-lg" type="button" data-start-workout="${escapeHtml(w.id)}">${icon("play_arrow", "mi-inline")} Começar</button>
          <a class="btn btn-lg" href="#/treinos/${encodeURIComponent(w.id)}">Ver treino</a>
        </div>
      </section>`;
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

      ${todayCardHtml(history, trainedDays.has(dayKey(today)))}

      ${homeStructureCard()}

      <section class="week-card" aria-labelledby="week-title">
        <div class="week-head">
          <h2 id="week-title">Sua semana</h2>
          <span class="meta">${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${new Date(weekEnd - 1).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
        </div>
        <p class="week-motivation">${icon(msg.emoji, "mi-inline")} <strong>${escapeHtml(msg.title)}</strong> ${escapeHtml(msg.text)}</p>
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

      <div id="install-slot" data-context="home">${installCard()}</div>

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
            : empty("flag", "Você ainda não terminou nenhum treino.", `<a class="btn btn-primary" href="#/treinos">Escolher um treino</a>`)
        }
      </section>

`;
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
            <span class="group-icon">${groupIcon(g)}</span>
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

  // Etiqueta do tipo (só quando não é o padrão "repetições").
  function typeTag(ex) {
    const t = exerciseType(ex);
    if (t === "reps") return "";
    const [label, ic] = EXERCISE_TYPES[t];
    return `<span class="type-tag type-${t}">${icon(ic, "mi-inline")} ${label}</span>`;
  }

  // "10-12 cada lado" → "10-12" quando o tipo já é "por lado" (o rótulo diz Reps/lado).
  function repsShort(ex, reps) {
    const t = String(reps || "");
    return exerciseType(ex) === "unilateral" ? t.replace(/\s*(cada|por)\s+(lado|braço|perna)s?$/i, "") : t;
  }

  function exerciseCard(ex) {
    const img = safeUrl(ex.image);
    const stats = [
      ["Séries", ex.sets],
      [exerciseType(ex) === "tempo" ? "Tempo" : exerciseType(ex) === "unilateral" ? "Reps/lado" : "Reps", repsShort(ex, ex.reps)],
      ["Descanso", ex.rest],
    ]
      .filter(([, v]) => v)
      .map(([label, v]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${escapeHtml(v)}</span></div>`)
      .join("");
    const equip = equipmentChips(ex.equipment, ex.equipmentAny);
    const hasVideo = Boolean(youtubeId(ex.video) || safeUrl(ex.video));
    return `
      <div class="exercise-card tappable" data-exercise-page="${escapeHtml(ex.id)}" tabindex="0" role="link" aria-label="Ver detalhes de ${escapeHtml(ex.name)}">
        ${img ? `<div class="exercise-media"><img src="${escapeHtml(img)}" alt="" loading="lazy"></div>` : ""}
        <div class="exercise-body">
          <div class="exercise-title">
            <h2 class="exercise-name">${escapeHtml(ex.name)}</h2>
            ${difficultyBadge(ex.difficulty)}
          </div>
          ${typeTag(ex)}
          ${stats ? `<div class="stats">${stats}</div>` : ""}
          ${equip ? `<div class="equip-chips">${equip}</div>` : ""}
          ${
            missingEquipment(ex).length
              ? `<p class="missing">Você não marcou: ${escapeHtml(missingEquipment(ex).join(", "))}</p>`
              : ""
          }
          ${ex.description ? `<p class="exercise-desc clamp-2">${escapeHtml(ex.description)}</p>` : ""}
          <div class="card-foot">
            ${hasVideo ? `<span class="meta">${icon("smart_display", "mi-inline")} Tem vídeo</span>` : ""}
            ${ex.custom ? `<a class="btn btn-sm" href="#/exercicios/editar/${encodeURIComponent(ex.id)}">Editar</a>` : ""}
          </div>
        </div>
      </div>`;
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
        hidden && equipFilter ? `<button class="btn" type="button" data-equip-filter="off">Mostrar todos (${hidden})</button>` : ""
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
    bindPersonalNote();
    bindLoadFields();
    bindSetsTable();
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
            <label for="ex-reps">Repetições ou tempo <span class="req">*</span></label>
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
        <div class="field">
          <label for="ex-type">Tipo</label>
          <select class="select" id="ex-type">${Object.entries(EXERCISE_TYPES)
            .map(([id, [label]]) => `<option value="${id}" ${exerciseType(ex) === id ? "selected" : ""}>${label}</option>`)
            .join("")}</select>
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
      ["group", "name", "description", "sets", "reps", "rest", "difficulty", "image", "video", "type"].forEach(
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

  const isMine = (w) => Store.ownerOf(w) === user.id;
  // Autor para mostrar: "MegGym", o nome de quem criou, ou "você".
  const authorOf = (w) => (isMine(w) ? "você" : Store.ownerOf(w) === "meggym" ? "MegGym" : w.createdBy || "alguém");

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
        <p class="meta">${w.items.length} ${w.items.length === 1 ? "exercício" : "exercícios"}</p>
        <p class="meta card-owner">${ownerTag(w)}${Store.isSaved(user.id, "workouts", w.id) ? ` · ${icon("bookmark", "mi-inline")} Salvo` : ""}</p>
      </a>`;
  }

  /* ================= Treinos: Meu Treino · Explorar · Salvos ================= */

  // Abas do topo; a aba fica no endereço (#/treinos?aba=explorar) para o "voltar" funcionar.
  const TRAIN_TABS = [
    ["meu", "Meu Treino"],
    ["explorar", "Explorar"],
    ["salvos", "Salvos"],
  ];
  let exploreState = { kind: "divisoes", q: "", group: "", equip: false, days: "" };

  const divisionLetters = (st) =>
    (st.workoutIds || []).map((id, i) => (Store.getWorkout(id) ? `<span class="letter-chip">${letter(i)}</span>` : "")).join("");

  function ownerTag(item) {
    if (isMine(item)) return Store.visibilityOf(item) === "public" ? `${icon("public", "mi-inline")} Seu · público` : `${icon("lock", "mi-inline")} Seu · privado`;
    return `${icon("person", "mi-inline")} por ${escapeHtml(authorOf(item))}`;
  }

  function divisionCard(st) {
    const pr = structureProgress(st);
    const n = (st.workoutIds || []).length;
    const saved = Store.isSaved(user.id, "structures", st.id);
    return `
      <a class="structure-card ${pr.following ? "following" : ""}" href="#/estruturas/${encodeURIComponent(st.id)}">
        <div class="workout-card-head">
          <h3>${escapeHtml(st.name)}</h3>
          ${pr.following ? `<span class="badge badge-live">Seguindo</span>` : saved ? `<span class="badge">${icon("bookmark", "mi-inline")} Salva</span>` : ""}
        </div>
        ${st.description ? `<p class="exercise-desc clamp-2">${escapeHtml(st.description)}</p>` : ""}
        <div class="structure-meta">
          <span class="letters">${divisionLetters(st)}</span>
          <span class="meta">${n} ${n === 1 ? "treino" : "treinos"} · ${pr.duration} sessões</span>
        </div>
        <p class="meta card-owner">${ownerTag(st)}</p>
      </a>`;
  }

  function renderWorkouts(params = new URLSearchParams()) {
    const tab = TRAIN_TABS.some(([id]) => id === params.get("aba")) ? params.get("aba") : "meu";
    setHeader("Treinos", { action: `<button class="btn btn-sm btn-primary" type="button" id="new-train">${icon("add", "mi-inline")} Novo</button>` });
    setTab("treinos");
    app.innerHTML = `
      <nav class="top-tabs" role="tablist" aria-label="Treinos">
        ${TRAIN_TABS.map(([id, label]) => `<a role="tab" href="#/treinos?aba=${id}" aria-selected="${id === tab}" ${id === tab ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      <div id="train-tab">${tab === "meu" ? myTrainingHtml() : tab === "explorar" ? exploreHtml() : savedHtml()}</div>`;
    $("new-train").addEventListener("click", async () => {
      const choice = await actionSheet({
        title: "Criar",
        actions: [
          { id: "treino", icon: "fitness_center", label: "Novo treino", hint: "Uma sessão com exercícios, séries e repetições" },
          { id: "divisao", icon: "view_week", label: "Nova divisão", hint: "Conjunto de treinos em sequência (A, B, C…)" },
        ],
      });
      if (choice === "treino") location.hash = "#/treinos/novo";
      if (choice === "divisao") location.hash = "#/estruturas/novo";
    });
    if (tab === "explorar") bindExplore();
    $("mt-start")?.addEventListener("click", (e) => {
      const w = Store.getWorkout(e.currentTarget.dataset.workout);
      if (w) startWorkout(w);
    });
    $("mt-unfollow")?.addEventListener("click", async () => {
      const ok = await confirmSheet({ icon: "flag", title: "Parar de seguir?", text: "O progresso da divisão será zerado. Seu histórico continua.", confirmLabel: "Parar de seguir", cancelLabel: "Voltar", danger: true });
      if (!ok) return;
      Store.unfollowStructure(user.id);
      renderWorkouts(params);
    });
  }

  // Meu Treino: a divisão (ou treino) que o usuário está seguindo.
  function myTrainingHtml() {
    const session = Store.session(user.id);
    const activeWorkout = session && Store.getWorkout(session.workoutId);
    const resume = activeWorkout
      ? `<a class="resume-banner" href="#/treinos/${encodeURIComponent(activeWorkout.id)}/executar">
          <span>${icon("play_arrow", "mi-inline")} Continuar <strong>${escapeHtml(activeWorkout.name)}</strong></span><span aria-hidden="true">›</span>
        </a>`
      : "";
    const plan = Store.plan(user.id);
    const st = plan?.structureId && Store.getStructure(plan.structureId);
    const single = plan?.workoutId && Store.getWorkout(plan.workoutId);

    if (st) {
      const pr = structureProgress(st);
      const items = (st.workoutIds || [])
        .map((wid, i) => {
          const w = Store.getWorkout(wid);
          if (!w) return "";
          const isNext = !pr.completed && pr.next?.workout.id === w.id && pr.next.letter === letter(i);
          return `
            <li><a class="item-row item-link ${isNext ? "highlight-next" : ""}" href="#/treinos/${encodeURIComponent(w.id)}">
              <span class="item-index letter-index">${letter(i)}</span>
              <div class="item-main">
                <div class="item-title">${escapeHtml(shortName(w.name))}</div>
                <div class="meta">${w.items.length} exercícios${isNext ? " · <strong>próximo</strong>" : ""}</div>
              </div>
              <span class="chevron" aria-hidden="true">›</span>
            </a></li>`;
        })
        .join("");
      return `
        ${resume}
        <section class="my-plan">
          <p class="eyebrow-text">${icon("flag", "mi-inline")} Divisão que você segue</p>
          <a class="my-plan-title" href="#/estruturas/${encodeURIComponent(st.id)}"><h2>${escapeHtml(st.name)}</h2><span class="chevron" aria-hidden="true">›</span></a>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.duration}" aria-valuenow="${pr.done}" aria-label="Progresso da divisão"><div class="progress-bar" style="width:${pr.percent}%"></div></div>
          <p class="meta">${pr.done} de ${pr.duration} sessões · desde ${new Date(plan.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
          ${
            pr.completed
              ? `<p class="meta">${icon("emoji_events", "mi-inline")} Divisão concluída! Escolha outra em Explorar ou recomece.</p>`
              : pr.next && !activeWorkout
                ? `<button class="btn btn-primary btn-block btn-lg" type="button" id="mt-start" data-workout="${escapeHtml(pr.next.workout.id)}">${icon("play_arrow", "mi-inline")} Começar Treino ${pr.next.letter} — ${escapeHtml(shortName(pr.next.workout.name))}</button>`
                : ""
          }
        </section>
        <section class="subsection">
          <h2 class="subsection-title">Treinos da divisão</h2>
          <ol class="item-list">${items}</ol>
        </section>
        <button class="btn btn-ghost btn-block" type="button" id="mt-unfollow">Parar de seguir esta divisão</button>`;
    }

    if (single) {
      return `
        ${resume}
        <section class="my-plan">
          <p class="eyebrow-text">${icon("flag", "mi-inline")} Treino que você segue</p>
          <a class="my-plan-title" href="#/treinos/${encodeURIComponent(single.id)}"><h2>${escapeHtml(single.name)}</h2><span class="chevron" aria-hidden="true">›</span></a>
          <div class="group-chips">${groupChips(workoutGroups(single.items))}</div>
          <p class="meta">${single.items.length} exercícios</p>
          ${activeWorkout ? "" : `<button class="btn btn-primary btn-block btn-lg" type="button" id="mt-start" data-workout="${escapeHtml(single.id)}">${icon("play_arrow", "mi-inline")} Começar treino</button>`}
        </section>
        <button class="btn btn-ghost btn-block" type="button" id="mt-unfollow">Parar de seguir</button>`;
    }

    return `
      ${resume}
      ${empty(
        "flag",
        "Você ainda não segue nenhum treino. Escolha uma divisão pronta (como ABC) ou monte a sua.",
        `<a class="btn btn-primary" href="#/treinos?aba=explorar">${icon("explore", "mi-inline")} Explorar</a><a class="btn" href="#/treinos?aba=salvos">Meus salvos</a>`
      )}`;
  }

  // Explorar: divisões e treinos públicos da comunidade, com filtros.
  function exploreHtml() {
    const f = exploreState;
    const groupOptions = groups().map((g) => `<option value="${escapeHtml(g.id)}" ${f.group === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("");
    return `
      <div class="explore-filters">
        <div class="seg" role="tablist" aria-label="Tipo">
          <button type="button" role="tab" data-ex-kind="divisoes" aria-selected="${f.kind === "divisoes"}">Divisões</button>
          <button type="button" role="tab" data-ex-kind="treinos" aria-selected="${f.kind === "treinos"}">Treinos</button>
        </div>
        <label class="search"><span class="visually-hidden">Buscar</span><input class="input" id="ex-q" type="search" placeholder="Buscar por nome…" value="${escapeHtml(f.q)}"></label>
        <div class="filter-row">
          <label><span class="visually-hidden">Grupo muscular</span><select class="select" id="ex-group"><option value="">Todos os grupos</option>${groupOptions}</select></label>
          <button class="chip" type="button" id="ex-equip" aria-pressed="${f.equip}">${icon("home", "mi-inline")} Com meus equipamentos</button>
        </div>
        <div class="filter-row ${f.kind === "divisoes" ? "" : "hidden"}" id="ex-days" role="group" aria-label="Treinos por divisão">
          ${["", "2", "3", "4", "5"].map((d) => `<button class="chip" type="button" data-ex-days="${d}" aria-pressed="${f.days === d}">${d ? (d === "5" ? "5+ treinos" : `${d} treinos`) : "Qualquer tamanho"}</button>`).join("")}
        </div>
      </div>
      <div id="ex-results" aria-live="polite">${exploreResults()}</div>`;
  }

  const canDoWorkout = (w) => w.items.every((it) => {
    const ex = findExercise(it.exerciseId);
    return !ex || available(ex);
  });

  function exploreResults() {
    const f = exploreState;
    const q = normalizeText(f.q.trim());
    const matchWorkout = (w) =>
      (!f.group || workoutGroups(w.items).some((g) => g.id === f.group)) && (!f.equip || canDoWorkout(w));
    if (f.kind === "treinos") {
      const list = Store.visibleWorkouts(user.id).filter((w) => !isMine(w) && Store.visibilityOf(w) === "public" && (!q || normalizeText(w.name).includes(q)) && matchWorkout(w));
      return list.length ? `<div class="workout-list">${list.map(workoutCard).join("")}</div>` : empty("search_off", "Nenhum treino com esses filtros.");
    }
    const list = Store.visibleStructures(user.id).filter((st) => {
      if (isMine(st) || Store.visibilityOf(st) !== "public") return false;
      const ws = (st.workoutIds || []).map((id) => Store.getWorkout(id)).filter(Boolean);
      const n = ws.length;
      return (
        (!q || normalizeText(st.name).includes(q)) &&
        (!f.days || (f.days === "5" ? n >= 5 : n === Number(f.days))) &&
        (!f.group || ws.some((w) => workoutGroups(w.items).some((g) => g.id === f.group))) &&
        (!f.equip || ws.every(canDoWorkout))
      );
    });
    return list.length ? `<div class="workout-list">${list.map(divisionCard).join("")}</div>` : empty("search_off", "Nenhuma divisão com esses filtros.");
  }

  function bindExplore() {
    const refresh = () => ($("ex-results").innerHTML = exploreResults());
    app.querySelectorAll("[data-ex-kind]").forEach((b) =>
      b.addEventListener("click", () => {
        exploreState.kind = b.dataset.exKind;
        app.querySelectorAll("[data-ex-kind]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        $("ex-days").classList.toggle("hidden", exploreState.kind !== "divisoes");
        refresh();
      })
    );
    $("ex-q").addEventListener("input", (e) => ((exploreState.q = e.target.value), refresh()));
    $("ex-group").addEventListener("change", (e) => ((exploreState.group = e.target.value), refresh()));
    $("ex-equip").addEventListener("click", (e) => {
      exploreState.equip = !exploreState.equip;
      e.currentTarget.setAttribute("aria-pressed", String(exploreState.equip));
      refresh();
    });
    app.querySelectorAll("[data-ex-days]").forEach((b) =>
      b.addEventListener("click", () => {
        exploreState.days = b.dataset.exDays;
        app.querySelectorAll("[data-ex-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        refresh();
      })
    );
  }

  // Salvos: o que o usuário salvou da comunidade + o que ele criou.
  function savedHtml() {
    const sv = Store.saved(user.id);
    const plan = Store.plan(user.id);
    const divisions = Store.visibleStructures(user.id).filter((st) => isMine(st) || sv.structures.includes(st.id) || plan?.structureId === st.id);
    const workouts = Store.visibleWorkouts(user.id).filter((w) => isMine(w) || sv.workouts.includes(w.id) || plan?.workoutId === w.id);
    return `
      <section class="subsection">
        <h2 class="subsection-title">Divisões</h2>
        ${divisions.length ? `<div class="workout-list">${divisions.map(divisionCard).join("")}</div>` : `<p class="meta">Salve uma divisão em Explorar ou crie a sua no botão Novo.</p>`}
      </section>
      <section class="subsection">
        <h2 class="subsection-title">Treinos</h2>
        ${workouts.length ? `<div class="workout-list">${workouts.map(workoutCard).join("")}</div>` : `<p class="meta">Salve treinos em Explorar ou crie o seu no botão Novo.</p>`}
      </section>`;
  }

  function renderWorkoutDetail(id) {
    setTab("treinos");
    const w = Store.getWorkout(id);
    if (!w || !Store.canSeeWorkout(w, user.id)) {
      setHeader("Treino", { back: "#/treinos" });
      app.innerHTML = empty("help", "Treino não encontrado.");
      return;
    }
    const mine = isMine(w);
    const savedThis = Store.isSaved(user.id, "workouts", w.id);
    const followingThis = Store.plan(user.id)?.workoutId === w.id;
    setHeader(w.name, { back: "#/treinos", action: mine ? `<a class="btn btn-sm" href="#/treinos/${encodeURIComponent(w.id)}/editar">Editar</a>` : "" });
    const session = Store.session(user.id);
    const activeHere = session?.workoutId === w.id;
    const ssDetail = supersets(w.items);
    const items = w.items
      .map((item, i) => {
        const ex = findExercise(item.exerciseId);
        const g = ex && findGroup(ex.group);
        return `
          <li class="item-row ${supersetClass(ssDetail[i])} ${ex ? "tappable" : ""}" ${ex ? `data-exercise="${escapeHtml(ex.id)}" data-sets="${escapeHtml(item.sets)}" data-reps="${escapeHtml(item.reps)}" data-load="${escapeHtml(item.load || "")}" data-rir="${escapeHtml(item.rir || "")}" data-rest="${escapeHtml(item.rest || "")}"` : ""}>
            <span class="item-index">${i + 1}</span>
            <div class="item-main">
              <div class="item-title">${ex ? escapeHtml(ex.name) : "<em>Exercício removido</em>"}</div>
              <div class="meta">${g ? `${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)} · ` : ""}${escapeHtml(prescription(item))}</div>
              ${supersetTag(ssDetail[i])}
              ${ex ? loadPreview(ex) : ""}
              ${ex ? notePreview(ex.id) : ""}
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
      <p class="workout-owner">${
        mine
          ? Store.visibilityOf(w) === "public"
            ? `${icon("public", "mi-inline")} Público: aparece em Explorar`
            : `${icon("lock", "mi-inline")} Privado: só você vê`
          : `${icon("groups", "mi-inline")} Da comunidade · por ${escapeHtml(authorOf(w))}`
      }${w.copiedFromName ? ` · copiado de “${escapeHtml(w.copiedFromName)}”` : ""}</p>
      <div class="action-row">
        ${followingThis ? `<span class="chip is-on">${icon("flag", "mi-inline")} Seu treino atual</span>` : `<button class="chip" type="button" id="follow-w">${icon("flag", "mi-inline")} Seguir</button>`}
        ${mine ? "" : `<button class="chip ${savedThis ? "is-on" : ""}" type="button" id="save-w" aria-pressed="${savedThis}">${icon(savedThis ? "bookmark_added" : "bookmark_add", "mi-inline")} ${savedThis ? "Salvo" : "Salvar"}</button>`}
        ${mine ? "" : `<button class="chip" type="button" id="copy-btn">${icon("content_copy", "mi-inline")} Copiar para editar</button>`}
      </div>
      <ol class="item-list">${items || `<li class="state">Nenhum exercício.</li>`}</ol>
      ${w.notes ? `<section class="workout-notes">${icon("info", "mi-inline")} <p>${escapeHtml(w.notes)}</p></section>` : ""}
      <div class="sticky-cta">
        <button class="btn btn-primary btn-block btn-lg" type="button" id="start-btn" ${w.items.length ? "" : "disabled"}>
          ${icon("play_arrow", "mi-inline")} ${activeHere ? "Continuar treino" : "Iniciar treino"}
        </button>
      </div>`;
    $("start-btn").addEventListener("click", () => startWorkout(w));
    $("save-w")?.addEventListener("click", () => {
      const on = Store.toggleSaved(user.id, "workouts", w.id);
      toast(on ? "Treino salvo." : "Removido dos salvos.");
      renderWorkoutDetail(w.id);
    });
    $("follow-w")?.addEventListener("click", async () => {
      const plan = Store.plan(user.id);
      if (plan) {
        const ok = await confirmSheet({ icon: "flag", title: "Trocar seu treino atual?", text: "Você vai parar de seguir o atual e o progresso dele recomeça. O histórico continua.", confirmLabel: "Seguir este treino", cancelLabel: "Voltar" });
        if (!ok) return;
      }
      Store.followWorkout(user.id, w.id);
      toast("Agora este é o seu treino.", "success");
      location.hash = "#/treinos?aba=meu";
    });
    $("copy-btn")?.addEventListener("click", () => {
      const copy = Store.copyWorkout(w.id, user);
      toast("Cópia criada em Salvos. Agora você pode editar.", "success");
      location.hash = `#/treinos/${encodeURIComponent(copy.id)}`;
    });
  }

  // Inicia (ou continua) um treino e abre a tela de execução.
  function startWorkout(w) {
    const current = Store.session(user.id);
    if (current && current.workoutId !== w.id) {
      const other = Store.getWorkout(current.workoutId);
      if (!confirm(`Você tem o treino "${other?.name || "anterior"}" em andamento. Descartar e iniciar este?`)) return;
      Store.cancelSession(user.id);
    }
    if (!Store.session(user.id)) Store.startSession(user.id, w.id);
    location.hash = `#/treinos/${encodeURIComponent(w.id)}/executar`;
  }

  /* ================= Estruturas de treino ================= */

  const letter = (i) => String.fromCharCode(65 + (i % 26));
  // "Treino — Peito + Ombros" → "Peito + Ombros" (para não repetir "Treino A — Treino — …").
  const shortName = (name) => String(name || "").replace(/^treino\s*[—–-]\s*/i, "");

  // Progresso do usuário numa estrutura: treinos dela feitos desde que começou a seguir.
  function structureProgress(st) {
    const plan = Store.plan(user.id);
    const following = plan?.structureId === st.id;
    const ids = st.workoutIds || [];
    const done = following
      ? Store.history(user.id).filter((h) => h.finishedAt >= plan.startedAt && ids.includes(h.workoutId)).length
      : 0;
    const duration = Number(st.duration) || 0;
    const valid = ids.map((id, i) => ({ i, workout: Store.getWorkout(id) })).filter((x) => x.workout);
    const next = valid.length ? valid[done % valid.length] : null;
    return {
      following,
      done,
      duration,
      completed: following && duration > 0 && done >= duration,
      next: next ? { workout: next.workout, letter: letter(next.i) } : null,
      percent: duration ? Math.min(100, Math.round((done / duration) * 100)) : 0,
    };
  }

  function renderStructureDetail(id) {
    setTab("treinos");
    const st = Store.getStructure(id);
    if (!st || !Store.canSeeWorkout(st, user.id)) {
      setHeader("Divisão", { back: "#/treinos" });
      app.innerHTML = empty("help", "Divisão não encontrada.");
      return;
    }
    const mine = isMine(st);
    const savedThis = Store.isSaved(user.id, "structures", st.id);
    setHeader(st.name, { back: "#/treinos", action: mine ? `<a class="btn btn-sm" href="#/estruturas/${encodeURIComponent(st.id)}/editar">Editar</a>` : "" });
    const pr = structureProgress(st);
    const plan = Store.plan(user.id);
    const items = (st.workoutIds || [])
      .map((wid, i) => {
        const w = Store.getWorkout(wid);
        if (!w) return `<li class="item-row"><span class="item-index">${letter(i)}</span><div class="item-main"><em>Treino removido</em></div></li>`;
        const isNext = pr.following && !pr.completed && pr.next?.workout.id === w.id && pr.next.letter === letter(i);
        return `
          <li><a class="item-row item-link ${isNext ? "highlight-next" : ""}" href="#/treinos/${encodeURIComponent(w.id)}">
            <span class="item-index letter-index">${letter(i)}</span>
            <div class="item-main">
              <div class="item-title">Treino ${letter(i)} — ${escapeHtml(shortName(w.name))}</div>
              <div class="group-chips" style="margin-top:6px">${groupChips(workoutGroups(w.items))}</div>
              <div class="meta">${w.items.length} exercícios${isNext ? " · <strong>próximo</strong>" : ""}</div>
            </div>
            <span class="chevron" aria-hidden="true">›</span>
          </a></li>`;
      })
      .join("");

    // O progresso fica em Treinos › Meu Treino; aqui só um aviso curto com o atalho.
    const progressHtml = pr.following
      ? `<a class="following-note" href="#/treinos?aba=meu">${icon("flag", "mi-inline")} ${pr.completed ? "Você concluiu esta divisão" : `Você segue esta divisão · ${pr.done} de ${pr.duration} sessões`}<span class="chevron" aria-hidden="true">›</span></a>`
      : "";

    app.innerHTML = `
      ${st.description ? `<p class="lead">${escapeHtml(st.description)}</p>` : ""}
      <div class="structure-facts">
        <span class="fact">${icon("format_list_numbered", "mi-inline")} ${(st.workoutIds || []).length} treinos (${(st.workoutIds || []).map((_, i) => letter(i)).join(", ")})</span>
        <span class="fact">${icon("event_repeat", "mi-inline")} Duração: ${pr.duration} sessões</span>
      </div>
      <p class="workout-owner">${
        mine
          ? Store.visibilityOf(st) === "public" ? `${icon("public", "mi-inline")} Pública: aparece em Explorar` : `${icon("lock", "mi-inline")} Privada: só você vê`
          : `${icon("groups", "mi-inline")} Da comunidade · por ${escapeHtml(authorOf(st))}`
      }${st.copiedFromName ? ` · copiada de “${escapeHtml(st.copiedFromName)}”` : ""}</p>
      ${
        mine && !pr.following
          ? ""
          : `<div class="action-row">
              ${mine ? "" : `<button class="chip ${savedThis ? "is-on" : ""}" type="button" id="st-save" aria-pressed="${savedThis}">${icon(savedThis ? "bookmark_added" : "bookmark_add", "mi-inline")} ${savedThis ? "Salva" : "Salvar"}</button>`}
              ${mine ? "" : `<button class="chip" type="button" id="st-copy">${icon("content_copy", "mi-inline")} Copiar para editar</button>`}
              ${pr.following ? `<button class="chip" type="button" id="st-unfollow">${icon("close", "mi-inline")} Parar de seguir</button>` : ""}
            </div>`
      }
      ${progressHtml}
      <section class="subsection">
        <h2 class="subsection-title">Treinos da divisão</h2>
        <ol class="item-list">${items || `<li class="state state-sm">Nenhum treino.</li>`}</ol>
      </section>
      <div class="sticky-cta">
        ${
          pr.following && !pr.completed && pr.next
            ? `<button class="btn btn-primary btn-block btn-lg" type="button" id="st-start">${icon("play_arrow", "mi-inline")} Iniciar Treino ${pr.next.letter}</button>`
            : pr.completed
              ? `<button class="btn btn-primary btn-block btn-lg" type="button" id="st-follow">${icon("replay", "mi-inline")} Recomeçar divisão</button>`
              : `<button class="btn btn-primary btn-block btn-lg" type="button" id="st-follow" ${pr.next ? "" : "disabled"}>${icon("flag", "mi-inline")} Seguir esta divisão</button>`
        }
      </div>`;

    $("st-start")?.addEventListener("click", () => startWorkout(pr.next.workout));
    $("st-save")?.addEventListener("click", () => {
      const on = Store.toggleSaved(user.id, "structures", st.id);
      toast(on ? "Divisão salva." : "Removida dos salvos.");
      renderStructureDetail(st.id);
    });
    $("st-copy")?.addEventListener("click", () => {
      const copy = Store.copyStructure(st.id, user);
      toast("Cópia criada em Salvos. Agora você pode editar.", "success");
      location.hash = `#/estruturas/${encodeURIComponent(copy.id)}`;
    });
    $("st-follow")?.addEventListener("click", () => {
      const current = plan && plan.structureId !== st.id ? Store.getStructure(plan.structureId) || Store.getWorkout(plan.workoutId) : null;
      if (current && !confirm(`Você está seguindo "${current.name}". Trocar para "${st.name}"? O progresso recomeça.`)) return;
      Store.followStructure(user.id, st.id);
      toast(`Agora você segue ${st.name}!`, "success");
      location.hash = "#/treinos?aba=meu";
    });
    $("st-unfollow")?.addEventListener("click", () => {
      if (!confirm("Parar de seguir esta divisão? O progresso será zerado.")) return;
      Store.unfollowStructure(user.id);
      renderStructureDetail(st.id);
    });
  }

  let structureDraft = null;

  function renderStructureForm(editId) {
    setTab("treinos");
    const editing = editId ? Store.getStructure(editId) : null;
    if (editId && (!editing || !isMine(editing))) {
      if (editing && Store.canSeeWorkout(editing, user.id)) return location.replace(`#/estruturas/${encodeURIComponent(editing.id)}`);
      setHeader("Divisão", { back: "#/treinos" });
      app.innerHTML = empty("help", "Divisão não encontrada.");
      return;
    }
    if (!structureDraft || structureDraft.id !== (editing?.id || null)) {
      structureDraft = editing
        ? { id: editing.id, name: editing.name, description: editing.description || "", duration: editing.duration || "", workoutIds: [...(editing.workoutIds || [])], visibility: Store.visibilityOf(editing) }
        : { id: null, name: "", description: "", duration: 30, workoutIds: [], visibility: "private" };
    }
    const d = structureDraft;
    const back = editing ? `#/estruturas/${encodeURIComponent(editing.id)}` : "#/treinos";
    setHeader(editing ? "Editar divisão" : "Nova divisão", { back });
    app.innerHTML = `
      <form class="form-stack" id="structure-form" novalidate>
        <div class="field">
          <label for="st-name">Nome <span class="req">*</span></label>
          <input class="input" id="st-name" maxlength="60" value="${escapeHtml(d.name)}" placeholder="Ex.: Push/Pull (ABC)">
        </div>
        <div class="field">
          <label for="st-description">Descrição</label>
          <textarea class="textarea textarea-sm" id="st-description" maxlength="600" placeholder="Objetivo, como alternar os treinos…">${escapeHtml(d.description)}</textarea>
        </div>
        <div class="field">
          <label for="st-duration">Duração (quantas sessões até concluir) <span class="req">*</span></label>
          <input class="input" id="st-duration" type="number" inputmode="numeric" min="1" max="365" value="${escapeHtml(d.duration)}">
        </div>
        <fieldset class="field fieldset">
          <legend>Quem pode ver</legend>
          <div class="visibility-options">
            <label class="vis-option">
              <input type="radio" name="st-visibility" value="private" ${d.visibility !== "public" ? "checked" : ""}>
              <span>${icon("lock")}<strong>Privada</strong><small>Só você vê, em Salvos.</small></span>
            </label>
            <label class="vis-option">
              <input type="radio" name="st-visibility" value="public" ${d.visibility === "public" ? "checked" : ""}>
              <span>${icon("public")}<strong>Pública</strong><small>Aparece em Explorar; outros podem seguir e salvar.</small></span>
            </label>
          </div>
        </fieldset>
        <section class="subsection">
          <h2 class="subsection-title">Treinos da divisão (A, B, C…)</h2>
          <ol class="item-list" id="st-items"></ol>
          <span class="field-error hidden" id="st-items-error"></span>
        </section>
        <section class="subsection">
          <h2 class="subsection-title">Adicionar treino</h2>
          <ul class="item-list" id="st-picker"></ul>
        </section>
        <div class="sticky-cta">
          <button class="btn btn-primary btn-block btn-lg" type="submit">${editing ? "Salvar divisão" : "Criar divisão"}</button>
          ${editing ? `<button class="btn btn-danger btn-block" type="button" id="st-delete">Excluir divisão</button>` : ""}
        </div>
      </form>`;

    const renderItems = () => {
      $("st-items").innerHTML = d.workoutIds.length
        ? d.workoutIds
            .map((wid, i) => {
              const w = Store.getWorkout(wid);
              return `
                <li class="item-row" data-index="${i}">
                  <span class="item-index letter-index">${letter(i)}</span>
                  <div class="item-main"><div class="item-title">${w ? escapeHtml(w.name) : "<em>Treino removido</em>"}</div>
                  ${w ? `<div class="meta">${w.items.length} exercícios</div>` : ""}</div>
                  <div class="item-actions item-actions-row">
                    <button class="icon-btn icon-btn-sm" type="button" data-st-action="up" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${icon("arrow_upward")}</button>
                    <button class="icon-btn icon-btn-sm" type="button" data-st-action="down" aria-label="Descer" ${i === d.workoutIds.length - 1 ? "disabled" : ""}>${icon("arrow_downward")}</button>
                    <button class="icon-btn icon-btn-sm icon-btn-danger" type="button" data-st-action="remove" aria-label="Remover">${icon("close")}</button>
                  </div>
                </li>`;
            })
            .join("")
        : `<li class="state state-sm">Adicione os treinos na ordem em que devem ser feitos (A, B, C…).</li>`;
      if (d.workoutIds.length) $("st-items-error").classList.add("hidden");
      const all = Store.visibleWorkouts(user.id);
      $("st-picker").innerHTML = all.length
        ? all
            .map(
              (w) => `
              <li class="item-row">
                <div class="item-main"><div class="item-title">${escapeHtml(w.name)}</div>
                <div class="group-chips" style="margin-top:6px">${groupChips(workoutGroups(w.items))}</div></div>
                <button class="btn btn-sm ${d.workoutIds.includes(w.id) ? "" : "btn-primary"}" type="button" data-st-add="${escapeHtml(w.id)}">${icon("add", "mi-inline")} ${d.workoutIds.includes(w.id) ? "De novo" : "Adicionar"}</button>
              </li>`
            )
            .join("")
        : `<li class="state state-sm">Crie treinos primeiro.</li>`;
    };

    $("st-name").addEventListener("input", (e) => (d.name = e.target.value));
    $("st-description").addEventListener("input", (e) => (d.description = e.target.value));
    $("st-duration").addEventListener("input", (e) => (d.duration = e.target.value));
    document.querySelectorAll('input[name="st-visibility"]').forEach((r) => r.addEventListener("change", () => (d.visibility = r.value)));
    $("st-items").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-st-action]");
      if (!btn) return;
      const i = Number(btn.closest("[data-index]").dataset.index);
      const a = btn.dataset.stAction;
      if (a === "remove") d.workoutIds.splice(i, 1);
      if (a === "up" && i > 0) [d.workoutIds[i - 1], d.workoutIds[i]] = [d.workoutIds[i], d.workoutIds[i - 1]];
      if (a === "down" && i < d.workoutIds.length - 1) [d.workoutIds[i + 1], d.workoutIds[i]] = [d.workoutIds[i], d.workoutIds[i + 1]];
      renderItems();
    });
    $("st-picker").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-st-add]");
      if (!btn) return;
      d.workoutIds.push(btn.dataset.stAdd);
      renderItems();
    });
    $("structure-form").addEventListener("submit", (e) => {
      e.preventDefault();
      d.name = $("st-name").value.trim();
      const duration = Number($("st-duration").value);
      const errors = [];
      if (!d.name) errors.push(["st-name", "Dê um nome à divisão."]);
      if (!Number.isInteger(duration) || duration < 1 || duration > 365) errors.push(["st-duration", "Informe de 1 a 365 treinos."]);
      showErrors(e.target, errors);
      const itemsError = $("st-items-error");
      itemsError.textContent = d.workoutIds.length ? "" : "Adicione pelo menos um treino.";
      itemsError.classList.toggle("hidden", Boolean(d.workoutIds.length));
      if (errors.length || !d.workoutIds.length) return;
      const saved = Store.saveStructure(
        { ...(d.id ? { id: d.id } : {}), name: d.name, description: $("st-description").value.trim(), duration, workoutIds: [...d.workoutIds], visibility: d.visibility === "public" ? "public" : "private" },
        user
      );
      structureDraft = null;
      toast(editing ? "Divisão salva!" : "Divisão criada!", "success");
      location.hash = `#/estruturas/${encodeURIComponent(saved.id)}`;
    });
    $("st-delete")?.addEventListener("click", () => {
      if (!confirm(`Excluir a divisão "${editing.name}"? Os treinos continuam existindo.`)) return;
      Store.deleteStructure(editing.id);
      structureDraft = null;
      toast("Divisão excluída.");
      location.hash = "#/treinos";
    });
    renderItems();
  }

  /* ---------- Criar / editar treino ---------- */

  function renderWorkoutForm(editId) {
    setTab("treinos");
    const editing = editId ? Store.getWorkout(editId) : null;
    if (editId && (!editing || !isMine(editing))) {
      // Só o dono edita; os outros podem copiar o treino.
      if (editing && Store.canSeeWorkout(editing, user.id)) return location.replace(`#/treinos/${encodeURIComponent(editing.id)}`);
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
            restSeconds: restSecondsOf(editing),
            visibility: Store.visibilityOf(editing),
            items: editing.items.map((i) => ({ load: "", rir: "", rest: "", ...i })),
          }
        : { id: null, name: "", description: "", notes: "", restSeconds: DEFAULT_REST, visibility: "private", items: [] };
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

        <section class="subsection">
          <h2 class="subsection-title">Exercícios <span class="meta" id="w-count"></span></h2>
          <div class="group-chips" id="w-groups"></div>
          <ol class="item-list" id="w-items"></ol>
          <span class="field-error hidden" id="w-items-error"></span>
          <button class="add-exercises" type="button" id="open-picker">${icon("add_circle")} Adicionar exercícios</button>
        </section>

        <fieldset class="field fieldset">
          <legend>Quem pode ver</legend>
          <div class="visibility-options">
            <label class="vis-option">
              <input type="radio" name="w-visibility" value="private" ${draft.visibility !== "public" ? "checked" : ""}>
              <span>${icon("lock")}<strong>Privado</strong><small>Só você vê, em Salvos.</small></span>
            </label>
            <label class="vis-option">
              <input type="radio" name="w-visibility" value="public" ${draft.visibility === "public" ? "checked" : ""}>
              <span>${icon("public")}<strong>Público</strong><small>Aparece em Explorar; outros podem fazer, salvar e copiar.</small></span>
            </label>
          </div>
        </fieldset>

        <details class="more-options" ${draft.description || draft.notes || Number(draft.restSeconds) !== DEFAULT_REST ? "open" : ""}>
          <summary>${icon("tune", "mi-inline")} Mais opções <span class="meta">descrição, observações e descanso</span></summary>
          <div class="form-stack">
            <div class="field">
              <label for="w-description">Descrição</label>
              <textarea class="textarea textarea-sm" id="w-description" maxlength="500" placeholder="Objetivo, observações…">${escapeHtml(draft.description)}</textarea>
            </div>
            <div class="field">
              <label for="w-notes">Observações do treino</label>
              <textarea class="textarea textarea-sm" id="w-notes" maxlength="1000" placeholder="Descanso, progressão, dicas…">${escapeHtml(draft.notes || "")}</textarea>
            </div>
            <div class="field">
              <label for="w-rest">Descanso entre séries (segundos)</label>
              <input class="input" id="w-rest" type="number" inputmode="numeric" min="10" max="600" step="5" value="${escapeHtml(draft.restSeconds || DEFAULT_REST)}">
              <p class="meta">O temporizador começa ao marcar cada série. Padrão: 60s. Se um exercício tiver descanso próprio, vale o dele.</p>
            </div>
          </div>
        </details>

        <div class="sticky-cta">
          <button class="btn btn-primary btn-block btn-lg" type="submit">${editing ? "Salvar treino" : "Criar treino"}</button>
          ${editing ? `<button class="btn btn-danger btn-block" type="button" id="w-delete">Excluir treino</button>` : ""}
        </div>
      </form>`;

    $("w-name").addEventListener("input", (e) => (draft.name = e.target.value));
    $("w-description").addEventListener("input", (e) => (draft.description = e.target.value));
    $("w-notes").addEventListener("input", (e) => (draft.notes = e.target.value));
    $("w-rest").addEventListener("input", (e) => (draft.restSeconds = e.target.value));
    document.querySelectorAll('input[name="w-visibility"]').forEach((r) => r.addEventListener("change", () => (draft.visibility = r.value)));
    $("open-picker").addEventListener("click", openPicker);

    $("w-items").addEventListener("input", (e) => {
      const row = e.target.closest("[data-index]");
      if (!row) return;
      const item = draft.items[Number(row.dataset.index)];
      if (e.target.dataset.field) item[e.target.dataset.field] = e.target.value;
    });
    $("w-items").addEventListener("click", (e) => {
      const linkBtn = e.target.closest("[data-link]");
      if (linkBtn) {
        const item = draft.items[Number(linkBtn.dataset.link)];
        item.linkNext = !item.linkNext;
        renderDraftItems();
        return;
      }
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
          restSeconds: Math.min(Math.max(parseInt(draft.restSeconds, 10) || DEFAULT_REST, 10), 600),
          visibility: draft.visibility === "public" ? "public" : "private",
          items: draft.items.map(({ exerciseId, sets, reps, load, rir, rest, linkNext }, i, all) => ({
            exerciseId,
            ...(linkNext && i < all.length - 1 ? { linkNext: true } : {}),
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
  }

  // Seletor de exercícios em painel: busca, grupo e equipamentos; adiciona sem sair do formulário.
  function openPicker() {
    const groupOptions = groups().map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
    $("sheet-content").innerHTML = `
      <div class="picker-sheet">
        <h2 id="sheet-title">Adicionar exercícios</h2>
        <div class="toolbar">
          <label class="search"><span class="visually-hidden">Buscar</span><input class="input" id="picker-search" type="search" placeholder="Buscar exercício…"></label>
          <label><span class="visually-hidden">Grupo muscular</span><select class="select" id="picker-group"><option value="">Todos os grupos</option>${groupOptions}</select></label>
        </div>
        <div id="picker-filter"></div>
        <ul class="item-list" id="picker-list"></ul>
        <div class="picker-done"><button class="btn btn-primary btn-block btn-lg" type="button" id="picker-done">Concluir</button></div>
      </div>`;
    const content = $("sheet-content");
    $("picker-search").addEventListener("input", renderPicker);
    $("picker-group").addEventListener("change", renderPicker);
    $("picker-done").addEventListener("click", () => closeSheet());
    content.onclick = (e) => {
      const toggle = e.target.closest("[data-equip-filter]");
      if (toggle) {
        equipFilter = toggle.dataset.equipFilter === "on";
        return renderPicker();
      }
      const btn = e.target.closest("[data-add]");
      if (!btn || !draft) return;
      const ex = findExercise(btn.dataset.add);
      if (!ex) return;
      draft.items.push({ exerciseId: ex.id, sets: ex.sets || "", reps: ex.reps || "", load: "", rir: "", rest: ex.rest || "" });
      renderDraftItems();
      renderPicker();
      pop(content.querySelector(`[data-add="${CSS.escape(ex.id)}"]`));
    };
    sheetReturnFocus = $("open-picker");
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    renderPicker();
  }

  // Bi-set / super-série: item.linkNext = feito em sequência com o próximo, sem descanso entre eles.
  // Devolve, por índice, { letter: "A", pos: 1, size: 2, name: "Bi-set", last }.
  function supersets(items) {
    const info = {};
    let block = 0;
    for (let i = 0; i < items.length; ) {
      let j = i;
      while (j < items.length - 1 && items[j].linkNext) j++;
      if (j > i) {
        const size = j - i + 1;
        const letter = String.fromCharCode(65 + (block++ % 26));
        const name = size === 2 ? "Bi-set" : size === 3 ? "Tri-set" : "Circuito";
        for (let k = i; k <= j; k++) info[k] = { letter, pos: k - i + 1, size, name, last: k === j, first: k === i };
      }
      i = j + 1;
    }
    return info;
  }

  function supersetTag(ss) {
    return ss ? `<span class="ss-tag">${icon("link", "mi-inline")} ${ss.name} ${ss.letter}${ss.pos}</span>` : "";
  }

  function supersetClass(ss) {
    return ss ? `in-ss ${ss.first ? "ss-first" : ""} ${ss.last ? "ss-last" : ""}` : "";
  }

  function renderDraftItems() {
    $("w-groups").innerHTML = groupChips(workoutGroups(draft.items));
    $("w-count").textContent = draft.items.length ? `(${draft.items.length})` : "";
    if (draft.items.length) $("w-items-error").classList.add("hidden");
    const ss = supersets(draft.items);
    $("w-items").innerHTML = draft.items.length
      ? draft.items
          .map((item, i) => {
            const ex = findExercise(item.exerciseId);
            const g = ex && findGroup(ex.group);
            const linked = Boolean(item.linkNext) && i < draft.items.length - 1;
            const link =
              i < draft.items.length - 1
                ? `<li class="link-row ${linked ? "linked" : ""}">
                    <button class="link-btn" type="button" data-link="${i}" aria-pressed="${linked}">
                      ${icon(linked ? "link_off" : "link", "mi-inline")} ${linked ? "Separar" : "Juntar em bi-set com o próximo"}
                    </button>
                  </li>`
                : "";
            return `
              <li class="item-row item-row-edit ${supersetClass(ss[i])}" data-index="${i}">
                <span class="item-index">${i + 1}</span>
                <div class="item-main">
                  <div class="item-title">${ex ? escapeHtml(ex.name) : "<em>Exercício removido</em>"}</div>
                  <div class="meta">${g ? `${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)}` : ""}</div>
                  ${supersetTag(ss[i])}
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
              </li>${link}`;
          })
          .join("")
      : `<li class="state state-sm">Nenhum exercício ainda. Toque em Adicionar exercícios.</li>`;
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
                <span class="group-icon group-icon-sm" style="--group-color:${safeColor(g?.color)}">${groupIcon(g)}</span>
                <div class="item-main">
                  <div class="item-title">${escapeHtml(ex.name)}</div>
                  <div class="meta">${escapeHtml(g?.name || "")}${ex.sets || ex.reps ? ` · ${escapeHtml(setsReps(ex.sets, ex.reps))}` : ""}</div>
                </div>
                <button class="btn btn-sm ${added ? "" : "btn-primary"}" type="button" data-add="${escapeHtml(ex.id)}" aria-label="Adicionar ${escapeHtml(ex.name)}">${icon(added ? "check" : "add", "mi-inline")} ${added ? "Mais 1" : "Adicionar"}</button>
              </li>`;
          })
          .join("")
      : `<li class="state state-sm">Nenhum exercício encontrado.</li>`;
    const n = draft?.items.length || 0;
    if ($("picker-done")) $("picker-done").textContent = n ? `Concluir (${n} ${n === 1 ? "exercício" : "exercícios"})` : "Concluir";
  }

  /* ---------- Executar treino ---------- */

  // Itens do treino em andamento, já com ordem, trocas e pulos da sessão (chaves = índice original).
  function runItems(w, session) {
    const valid = w.items.map((_, i) => i).filter((i) => findExercise(session.swaps?.[i] || w.items[i].exerciseId));
    const order = (session.order || []).filter((i) => valid.includes(i));
    valid.forEach((i) => !order.includes(i) && order.push(i));
    return order.map((i) => {
      const item = w.items[i];
      const swappedTo = session.swaps?.[i];
      return { i, item, ex: findExercise(swappedTo || item.exerciseId), swapped: Boolean(swappedTo), skipped: Boolean(session.skipped?.[i]), done: Boolean(session.done[i]) };
    });
  }

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

    app.innerHTML = `
      <div class="run-progress">
        <div class="run-timer" aria-label="Tempo de treino">
          <span class="run-timer-value" id="run-timer">00:00</span>
          <span class="meta">desde ${new Date(session.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div class="run-progress-text"><span id="run-count"></span></div>
        <div class="progress"><div class="progress-bar" id="run-bar"></div></div>
      </div>
      <p class="meta run-rest-info">${icon("timer", "mi-inline")} Descanso padrão: ${restSecondsOf(w)}s · toque em ${icon("more_vert", "mi-inline")} para pular, trocar ou mudar a ordem</p>
      <ol class="run-list" id="run-list"></ol>
      ${w.notes ? `<section class="workout-notes">${icon("info", "mi-inline")} <p>${escapeHtml(w.notes)}</p></section>` : ""}
      <section class="finish-card" id="finish-card" aria-labelledby="finish-title">
        <span class="finish-icon" id="finish-icon">${icon("flag")}</span>
        <h2 id="finish-title"></h2>
        <p class="meta" id="finish-text"></p>
        <button class="btn btn-primary btn-block btn-lg" type="button" id="finish-btn"></button>
        <button class="btn btn-ghost btn-block finish-discard" type="button" id="cancel-run">${icon("delete", "mi-inline")} Descartar treino</button>
      </section>`;

    const ssRun = supersets(w.items);
    function itemHtml({ i, item, ex, swapped, skipped, done }, pos, total) {
      const g = findGroup(ex.group);
      const ss = ssRun[i];
      const original = swapped ? findExercise(item.exerciseId) : null;
      return `
        <li class="run-item ${done ? "done" : ""} ${skipped ? "skipped" : ""} ${supersetClass(ss)}" data-index="${i}">
          ${
            skipped
              ? `<span class="run-check run-skip-icon" aria-hidden="true">${icon("redo")}</span>`
              : `<button class="run-check" type="button" data-toggle="${i}" aria-pressed="${done}" aria-label="${done ? "Desmarcar" : "Concluir"} ${escapeHtml(ex.name)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                </button>`
          }
          <div class="item-main ${skipped ? "" : "tappable"}" ${skipped ? "" : `data-exercise="${escapeHtml(ex.id)}" data-sets="${escapeHtml(item.sets)}" data-reps="${escapeHtml(item.reps)}" data-load="${escapeHtml(item.load || "")}" data-rir="${escapeHtml(item.rir || "")}" data-rest="${escapeHtml(item.rest || "")}"`}>
            <div class="item-title">${escapeHtml(ex.name)}</div>
            ${supersetTag(ss)}
            ${original ? `<div class="run-tag">${icon("swap_horiz", "mi-inline")} no lugar de ${escapeHtml(original.name)}</div>` : ""}
            ${
              skipped
                ? `<div class="run-tag">Pulado</div>`
                : `<div class="run-sets">${escapeHtml(setsReps(item.sets, item.reps)) || "—"}${item.load ? `<span class="run-load" title="Carga sugerida pelo treino">${icon("fitness_center", "mi-inline")} meta ${escapeHtml(item.load)}</span>` : ""}</div>
                  <div class="meta">${g ? `${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)}` : ""}${item.rir ? ` · RIR ${escapeHtml(item.rir)}` : ""}</div>
                  ${loadPreview(ex)}
                  ${notePreview(ex.id)}
                  <div class="run-sets-done" data-sets-summary="${i}" data-type="${exerciseType(ex)}">${escapeHtml(setsSummary(session.sets?.[i], exerciseType(ex)))}</div>
                  <div class="meta link-text">Registrar séries ›</div>`
            }
          </div>
          ${
            skipped
              ? `<button class="btn btn-sm" type="button" data-unskip="${i}">Fazer</button>`
              : `<button class="icon-btn run-menu" type="button" data-menu="${i}" aria-label="Opções de ${escapeHtml(ex.name)} (${pos + 1} de ${total})">${icon("more_vert")}</button>`
          }
        </li>`;
    }

    function renderList() {
      const list = runItems(w, session);
      $("run-list").innerHTML = list.map((x, pos) => itemHtml(x, pos, list.length)).join("");
      updateProgress();
    }

    function updateProgress() {
      const list = runItems(w, session).filter((x) => !x.skipped);
      const done = list.filter((x) => x.done).length;
      const total = list.length;
      $("run-count").textContent = `${done} de ${total} exercícios`;
      $("run-bar").style.width = `${total ? (done / total) * 100 : 0}%`;
      // Cartão no fim da lista (não fica fixo): terminar quando quiser ou descartar.
      const complete = total > 0 && done === total;
      $("finish-card").classList.toggle("complete", complete);
      $("finish-title").textContent = complete ? "Tudo feito!" : done ? "Quer terminar agora?" : "Fim da lista";
      $("finish-text").textContent = complete
        ? "Todos os exercícios concluídos. Registre o treino no seu histórico."
        : `Você fez ${done} de ${total} exercícios. Pode terminar antes e registrar só o que fez.`;
      const btn = $("finish-btn");
      btn.disabled = done === 0;
      btn.innerHTML = complete ? `${icon("flag", "mi-inline")} Terminar treino` : `${icon("flag", "mi-inline")} Terminar com ${done} de ${total}`;
    }

    const save = (changes) => (session = Store.updateSession(user.id, changes));

    function move(i, to) {
      const order = runItems(w, session).map((x) => x.i).filter((x) => x !== i);
      order.splice(Math.max(0, Math.min(to, order.length)), 0, i);
      save({ order });
      renderList();
    }

    async function openMenu(i) {
      const list = runItems(w, session);
      const pos = list.findIndex((x) => x.i === i);
      const cur = list[pos];
      const firstPending = list.findIndex((x) => !x.done && !x.skipped);
      const choice = await actionSheet({
        title: cur.ex.name,
        actions: [
          firstPending >= 0 && firstPending < pos && !cur.done ? { id: "now", icon: "bolt", label: "Fazer agora", hint: "Coloca como o próximo da lista" } : null,
          pos > 0 ? { id: "up", icon: "arrow_upward", label: "Mover para cima" } : null,
          pos < list.length - 1 ? { id: "down", icon: "arrow_downward", label: "Mover para baixo" } : null,
          { id: "swap", icon: "swap_horiz", label: "Trocar exercício", hint: "Equipamento ocupado ou quer variar" },
          cur.swapped ? { id: "original", icon: "undo", label: "Voltar ao exercício original" } : null,
          { id: "skip", icon: "redo", label: "Pular exercício", hint: "Não conta para terminar o treino", danger: true },
        ].filter(Boolean),
      });
      if (choice === "now") move(i, firstPending);
      if (choice === "up") move(i, pos - 1);
      if (choice === "down") move(i, pos + 1);
      if (choice === "skip") {
        save({ skipped: { ...(session.skipped || {}), [i]: true } });
        renderList();
        toast("Exercício pulado. Toque em Fazer para voltar.");
      }
      if (choice === "original") replaceExercise(i, null);
      if (choice === "swap") {
        await new Promise((r) => setTimeout(r, 260)); // espera o painel anterior fechar
        const alt = await pickAlternative(cur.ex, w.items[i].exerciseId);
        if (alt) replaceExercise(i, alt === w.items[i].exerciseId ? null : alt);
      }
    }

    function replaceExercise(i, exerciseId) {
      const swaps = { ...(session.swaps || {}) };
      if (exerciseId) swaps[i] = exerciseId;
      else delete swaps[i];
      const sets = { ...(session.sets || {}) };
      delete sets[i];
      const done = { ...session.done };
      delete done[i];
      save({ swaps, sets, done });
      renderList();
      toast(exerciseId ? `Trocado por ${findExercise(exerciseId).name}.` : "Exercício original de volta.", "success");
    }

    const onRunChanged = (e) => {
      if (!$("run-list")) return document.removeEventListener("meggym:run-changed", onRunChanged);
      session = e.detail.session || Store.session(user.id);
      app.querySelectorAll(".run-item").forEach((row) => {
        const i = Number(row.dataset.index);
        const done = Boolean(session.done[i]);
        row.classList.toggle("done", done);
        row.querySelector("[data-toggle]")?.setAttribute("aria-pressed", String(done));
        const sum = row.querySelector("[data-sets-summary]");
        if (sum) sum.textContent = setsSummary(session.sets?.[i], sum.dataset.type);
      });
      updateProgress();
    };
    document.addEventListener("meggym:run-changed", onRunChanged);

    $("run-list").addEventListener("click", (e) => {
      const menu = e.target.closest("[data-menu]");
      if (menu) return openMenu(Number(menu.dataset.menu));
      const unskip = e.target.closest("[data-unskip]");
      if (unskip) {
        const skipped = { ...(session.skipped || {}) };
        delete skipped[unskip.dataset.unskip];
        save({ skipped });
        return renderList();
      }
      const btn = e.target.closest("[data-toggle]");
      if (!btn) return;
      const i = Number(btn.dataset.toggle);
      session = Store.toggleDone(user.id, i);
      const row = btn.closest(".run-item");
      const done = Boolean(session.done[i]);
      row.classList.toggle("done", done);
      btn.setAttribute("aria-pressed", String(done));
      if (navigator.vibrate && done) navigator.vibrate(30);
      if (done) pop(btn);
      updateProgress();
    });

    $("finish-btn").addEventListener("click", async () => {
      const all = runItems(w, session).filter((x) => !x.skipped);
      // Terminar antes: registra só os exercícios marcados como feitos.
      const list = all.filter((x) => x.done);
      if (!list.length) return;
      if (list.length < all.length) {
        const ok = await confirmSheet({
          icon: "flag",
          title: "Terminar antes?",
          text: `Você fez ${list.length} de ${all.length} exercícios. Só os feitos vão para o histórico.`,
          confirmLabel: "Terminar e registrar",
          cancelLabel: "Continuar treinando",
        });
        if (!ok) return;
      }
      const snapshot = list.map(({ i, item, ex, swapped }) => ({
        exerciseId: ex.id,
        name: ex.name,
        group: ex.group,
        sets: item.sets,
        reps: item.reps,
        load: item.load || "",
        rir: item.rir || "",
        rest: item.rest || "",
        swappedFrom: swapped ? item.exerciseId : "",
        note: Store.exerciseNote(user.id, ex.id),
        myLoad: loadText(Store.exerciseLoad(user.id, ex.id), ex),
        setLog: (session.sets?.[i] || []).filter((s) => s.done),
        type: exerciseType(ex),
      }));
      const before = Store.history(user.id);
      snapshot.forEach((e) => {
        const ex = findExercise(e.exerciseId);
        const pr = ex && recordOf(ex, e.setLog, bestOf(e.exerciseId, before));
        if (pr) e.pr = pr;
        const max = Math.max(0, ...e.setLog.map((s) => parseFloat(String(s.weight || "").replace(",", ".")) || 0));
        if (max) Store.logWeight(user.id, e.exerciseId, max);
      });
      const prCount = snapshot.filter((e) => e.pr).length;
      const record = Store.finishSession(user, w, list.length, snapshot);
      if (!record) return;
      stopRest();
      toast(prCount ? `Treino concluído com ${prCount} ${prCount === 1 ? "novo recorde" : "novos recordes"}!` : "Treino concluído!", "success");
      celebrate();
      location.hash = `#/atividade/historico/${encodeURIComponent(record.id)}?novo=1`;
    });

    $("cancel-run").addEventListener("click", async () => {
      const list = runItems(w, session).filter((x) => !x.skipped);
      const done = list.filter((x) => x.done).length;
      const ok = await confirmSheet({
        icon: "cancel",
        title: "Descartar treino?",
        text: `Você fez ${done} de ${list.length} exercícios em ${$("run-timer").textContent}. Ao descartar, este treino não será registrado no seu histórico.`,
        confirmLabel: "Descartar treino",
        cancelLabel: "Continuar treinando",
        danger: true,
      });
      if (!ok) return;
      Store.cancelSession(user.id);
      stopRest();
      toast("Treino descartado.");
      location.hash = `#/treinos/${encodeURIComponent(w.id)}`;
    });

    const started = new Date(session.startedAt).getTime();
    const tick = () => {
      const el = $("run-timer");
      if (el) el.textContent = formatClock(Date.now() - started);
    };
    tick();
    timer = setInterval(tick, 1000);
    keepScreenOn();

    renderList();
  }

  // Alternativas para trocar: mesmo grupo muscular, que dá para fazer com os equipamentos do usuário.
  async function pickAlternative(current, originalId) {
    const options = exercises()
      .filter((e) => e.id !== current.id && inGroup(e, current.group) && available(e))
      .sort((a, b) => (a.id === originalId ? -1 : b.id === originalId ? 1 : a.name.localeCompare(b.name)));
    if (!options.length) {
      toast("Nenhuma alternativa do mesmo grupo com seus equipamentos.");
      return null;
    }
    const g = findGroup(current.group);
    return actionSheet({
      title: "Trocar por…",
      text: `Exercícios de ${g ? g.name : "mesmo grupo"} que você consegue fazer.`,
      actions: options.map((e) => ({ id: e.id, icon: e.id === originalId ? "undo" : "fitness_center", label: e.name, hint: e.id === originalId ? "Original do treino" : setsReps(e.sets, e.reps) })),
    });
  }

  // "3 séries: 12×10 kg · 10×10 kg · 8×10 kg"
  function unitOf(type) {
    return type === "tempo" ? "s" : type === "unilateral" ? "reps/lado" : "reps";
  }

  function setsSummary(sets, type = "reps") {
    const done = (sets || []).filter((s) => s.done);
    if (!done.length) return "";
    const unit = unitOf(type);
    const parts = done.map((s) => [s.reps ? (unit === "s" ? `${s.reps}s` : `${s.reps} ${unit}`) : "", s.weight ? `${s.weight} kg` : ""].filter(Boolean).join(" × ")).filter(Boolean);
    const label = `${done.length} ${done.length === 1 ? "série feita" : "séries feitas"}`;
    return parts.length ? `${label}: ${parts.join(" · ")}` : label;
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

  /* ---------- Painel de evolução (Atividade) ---------- */

  let activityMetric = "treinos";
  const METRICS = {
    treinos: ["Treinos", "treinos", (list) => list.length],
    tempo: ["Tempo", "min", (list) => Math.round(list.reduce((sum, h) => sum + durationMs(h), 0) / 60000)],
    volume: ["Volume", "kg", (list) => Math.round(list.reduce((sum, h) => sum + workoutVolume(h), 0))],
  };

  // Volume = soma de repetições × peso das séries registradas.
  function workoutVolume(h) {
    return (h.exercises || []).reduce(
      (sum, e) => sum + (e.setLog || []).reduce((s2, x) => s2 + (parseInt(x.reps, 10) || 0) * (parseFloat(String(x.weight || "").replace(",", ".")) || 0), 0),
      0
    );
  }

  function evolutionHtml(history, metric) {
    const [label, unit, calc] = METRICS[metric];
    const weeks = Array.from({ length: 8 }, (_, n) => {
      const start = startOfWeek();
      start.setDate(start.getDate() - 7 * (7 - n));
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const list = history.filter((h) => {
        const t = new Date(h.finishedAt);
        return t >= start && t < end;
      });
      return { date: isoDay(start), value: calc(list) };
    });
    const total = weeks.reduce((sum, w) => sum + w.value, 0);
    const thisWeek = weeks[7].value;
    const prev = weeks[6].value;
    const fmt = (n) => n.toLocaleString("pt-BR");
    const tabs = Object.entries(METRICS)
      .map(([id, [l]]) => `<button type="button" role="tab" data-metric="${id}" aria-selected="${id === metric}">${l}</button>`)
      .join("");
    return `
      <div class="chart-head">
        <h2 class="subsection-title">Evolução</h2>
        <div class="seg" role="tablist" aria-label="Métrica">${tabs}</div>
      </div>
      <p class="meta">Últimas 8 semanas · ${fmt(total)} ${unit} no total · esta semana ${fmt(thisWeek)} ${unit}${
        prev ? ` (${thisWeek >= prev ? "+" : ""}${Math.round(((thisWeek - prev) / prev) * 100)}% vs. anterior)` : ""
      }</p>
      ${total ? barsHtml(weeks, unit, `${label} por semana`) : `<p class="meta">${metric === "volume" ? "Registre peso e repetições nas séries para ver o volume." : "Termine um treino para começar o gráfico."}</p>`}
      <p class="meta chart-note">Cada barra é uma semana (data = segunda-feira).</p>`;
  }

  // Séries por grupo muscular nos últimos 30 dias.
  function muscleBalanceHtml(history) {
    const since = Date.now() - 30 * 86400000;
    const count = {};
    history
      .filter((h) => new Date(h.finishedAt).getTime() >= since)
      .forEach((h) =>
        (h.exercises || []).forEach((e) => {
          count[e.group] = (count[e.group] || 0) + (e.setLog?.length || parseInt(e.sets, 10) || 1);
        })
      );
    const rows = Object.entries(count)
      .map(([id, n]) => ({ g: findGroup(id), n }))
      .filter((x) => x.g)
      .sort((a, b) => b.n - a.n);
    if (!rows.length) return "";
    const max = rows[0].n;
    const missing = groups().filter((g) => !count[g.id] && g.id !== "cardio");
    return `
      <section class="subsection">
        <h2 class="subsection-title">Músculos trabalhados</h2>
        <p class="meta">Séries nos últimos 30 dias</p>
        <ul class="hbars">${rows
          .map(
            ({ g, n }) => `
          <li style="--group-color:${safeColor(g.color)}">
            <span class="hbar-label">${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)}</span>
            <span class="hbar-track"><span class="hbar-fill" style="width:${(n / max) * 100}%"></span></span>
            <span class="hbar-value">${n}</span>
          </li>`
          )
          .join("")}</ul>
        ${missing.length ? `<p class="meta">Sem treino no período: ${missing.map((g) => escapeHtml(g.name)).join(", ")}.</p>` : ""}
      </section>`;
  }

  // Exercícios com peso registrado: primeiro → último.
  function exerciseProgressHtml() {
    const rows = exercises()
      .map((ex) => ({ ex, log: Store.weightLog(user.id, ex.id) }))
      .filter((x) => x.log.length)
      .sort((a, b) => b.log[b.log.length - 1].date.localeCompare(a.log[a.log.length - 1].date));
    if (!rows.length) return "";
    const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
    return `
      <section class="subsection">
        <h2 class="subsection-title">Cargas por exercício</h2>
        <ul class="item-list loads-list ${rows.length > 5 ? "collapsed" : ""}">${rows
          .map(({ ex, log }) => {
            const first = log[0].weight;
            const last = log[log.length - 1].weight;
            const diff = last - first;
            return `
            <li><a class="item-row item-link" href="#/exercicios/ver/${encodeURIComponent(ex.id)}">
              <div class="item-main">
                <div class="item-title">${escapeHtml(ex.name)}</div>
                <div class="meta">${log.length} ${log.length === 1 ? "registro" : "registros"} · último em ${log[log.length - 1].date.split("-").reverse().join("/")}</div>
              </div>
              <span class="progress-pill ${diff > 0 ? "up" : ""}">${fmt(last)} kg${log.length > 1 ? `<small>${diff > 0 ? "+" : ""}${fmt(diff)}</small>` : ""}</span>
              <span class="chevron" aria-hidden="true">›</span>
            </a></li>`;
          })
          .join("")}</ul>
        ${rows.length > 5 ? `<button class="btn btn-ghost btn-block" type="button" data-show-loads>Ver todas (${rows.length})</button>` : ""}
      </section>`;
  }

  app.addEventListener("click", (e) => {
    const more = e.target.closest("[data-show-loads]");
    if (more) {
      app.querySelector(".loads-list")?.classList.remove("collapsed");
      more.remove();
      return;
    }
    const btn = e.target.closest("[data-metric]");
    if (!btn || !$("evolution")) return;
    activityMetric = btn.dataset.metric;
    $("evolution").innerHTML = evolutionHtml(Store.history(user.id), activityMetric);
  });

  // Atividade sem nenhum treino: passos para começar, no lugar de gráficos zerados.
  function firstStepsHtml() {
    const hasLoad = exercises().some((ex) => Store.exerciseLoad(user.id, ex.id).weight || Store.exerciseLoad(user.id, ex.id).band);
    const started = Boolean(Store.session(user.id));
    const steps = [
      [true, "Criar seu perfil", "Feito! Seus equipamentos filtram os exercícios."],
      [started, "Começar um treino", "Escolha o Treino de hoje no Início ou qualquer um em Treinos."],
      [hasLoad, "Registrar suas cargas", "Anote peso e repetições em cada série."],
      [false, "Terminar e ver sua evolução", "Gráficos, recordes e músculos trabalhados aparecem aqui."],
    ];
    return `
      <section class="first-steps">
        <h2 class="subsection-title">Seus primeiros passos</h2>
        <ol class="steps-list">${steps
          .map(
            ([done, title, text]) => `
          <li class="${done ? "done" : ""}">
            <span class="step-mark" aria-hidden="true">${done ? icon("check") : ""}</span>
            <span><strong>${title}</strong>${done ? '<span class="visually-hidden"> (feito)</span>' : ""}<br><span class="meta">${text}</span></span>
          </li>`
          )
          .join("")}</ol>
        <a class="btn btn-primary btn-block" href="#/inicio">${icon("play_arrow", "mi-inline")} Ver treino de hoje</a>
      </section>`;
  }

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

    const tabs = [["resumo", "Resumo"], ["evolucao", "Evolução"], ["historico", "Histórico"]];
    const tab = tabs.some(([id]) => id === params.get("aba")) ? params.get("aba") : highlight ? "historico" : "resumo";
    const historyRow = (h) => `
      <li><a class="item-row item-link ${h.id === highlight ? "highlight" : ""}" href="#/atividade/historico/${encodeURIComponent(h.id)}">
        <span class="history-icon">${icon("check_circle")}</span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(h.workoutName)}</div>
          <div class="meta">${escapeHtml(formatDateTime(h.finishedAt))} · ${formatDuration(h.startedAt, h.finishedAt)} · ${h.exerciseCount} exercícios</div>
        </div>
        <span class="chevron" aria-hidden="true">›</span>
      </a></li>`;
    const noHistory = empty("event_busy", "Nenhum treino registrado ainda.", `<a class="btn btn-primary" href="#/treinos">Ver treinos</a>`);

    let body = "";
    if (tab === "resumo") {
      const totalMs = history.reduce((sum, h) => sum + durationMs(h), 0);
      const total = formatTotal(totalMs);
      body = `
        <section class="profile">
          <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
          <div>
            <h2 class="page-title">${escapeHtml(user.name)}</h2>
            <p class="meta">${[user.age ? `${user.age} anos` : "", SEXES.find(([id]) => id === user.sex)?.[1] || ""].filter(Boolean).join(" · ")}</p>
            <a class="link-btn" href="#/atividade/perfil">Editar perfil</a>
          </div>
        </section>
        <div class="stat-tiles">
          <div class="stat-tile"><span class="stat-tile-value">${history.length}</span><span class="stat-tile-label">treinos feitos</span></div>
          <div class="stat-tile"><span class="stat-tile-value">${thisWeek}</span><span class="stat-tile-label">últimos 7 dias</span></div>
          <div class="stat-tile"><span class="stat-tile-value">${total.value}<small>${total.unit}</small></span><span class="stat-tile-label">de treino no total</span></div>
          <div class="stat-tile"><span class="stat-tile-value">${streak(history)}</span><span class="stat-tile-label">dias seguidos</span></div>
        </div>
        ${
          history.length
            ? `<section class="subsection">
                <div class="subsection-head"><h2 class="subsection-title">Últimos treinos</h2><a class="btn btn-sm" href="#/atividade?aba=historico">Ver todos</a></div>
                <ul class="item-list">${history.slice(0, 3).map(historyRow).join("")}</ul>
              </section>`
            : firstStepsHtml()
        }
        <div id="install-slot" data-context="activity">${installCard()}</div>`;
    } else if (tab === "evolucao") {
      body = history.length
        ? `<section class="subsection evolution" id="evolution">${evolutionHtml(history, activityMetric)}</section>
           ${muscleBalanceHtml(history)}
           ${exerciseProgressHtml()}`
        : empty("insights", "Sua evolução aparece aqui depois do primeiro treino: semanas, músculos trabalhados e cargas.", `<a class="btn btn-primary" href="#/treinos">Ver treinos</a>`);
    } else {
      // Histórico agrupado por mês.
      const byMonth = [];
      history.forEach((h) => {
        const label = capitalize(new Date(h.finishedAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
        const last = byMonth[byMonth.length - 1];
        if (last && last.label === label) last.items.push(h);
        else byMonth.push({ label, items: [h] });
      });
      body = history.length
        ? byMonth
            .map(
              (m) => `
          <section class="subsection">
            <h2 class="subsection-title">${escapeHtml(m.label)} <span class="meta">${m.items.length} ${m.items.length === 1 ? "treino" : "treinos"}</span></h2>
            <ul class="item-list">${m.items.map(historyRow).join("")}</ul>
          </section>`
            )
            .join("")
        : noHistory;
    }

    app.innerHTML = `
      <nav class="top-tabs" role="tablist" aria-label="Atividade">
        ${tabs.map(([id, label]) => `<a role="tab" href="#/atividade?aba=${id}" aria-selected="${id === tab}" ${id === tab ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      ${body}`;
  }

  /* ---------- Resumo para compartilhar (imagem gerada no aparelho) ---------- */

  async function shareSummary(h) {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fb) => css.getPropertyValue(name).trim() || fb;
    const c = { bg: v("--bg", "#111"), surface: v("--surface", "#1b1b1b"), tint: v("--tint", "#222"), text: v("--text", "#fff"), muted: v("--text-muted", "#aaa"), accent: v("--accent", "#ff5a1f"), onAccent: v("--accent-contrast", "#fff") };
    const display = v("--font-display", "sans-serif");
    const body = v("--font-body", "sans-serif");
    const upper = v("--display-transform", "none") === "uppercase";
    await document.fonts.ready;

    const W = 1080, H = 1350, P = 72;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");
    const font = (size, weight, fam = body) => (g.font = `${weight} ${size}px ${fam}`);
    const T = (t) => (upper ? String(t).toUpperCase() : String(t));
    const fit = (text, max) => {
      let t = String(text);
      while (g.measureText(t).width > max && t.length > 3) t = t.slice(0, -2);
      return t === String(text) ? t : t.trim() + "…";
    };
    const R = Math.min(32, (parseFloat(v("--radius", "16")) || 0) * 1.6);
    const round = (x, y, w, hh) => { g.beginPath(); g.roundRect(x, y, w, hh, R); g.fill(); };

    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = c.accent; g.fillRect(0, 0, W, 14);

    const end = new Date(h.finishedAt);
    font(30, 700); g.fillStyle = c.accent; g.fillText(T("MegGym · treino concluído"), P, 110);
    font(84, 800, display); g.fillStyle = c.text;
    const title = T(h.workoutName.replace(/^treino\s*[—–-]\s*/i, ""));
    const words = title.split(" "); let line = "", y = 210;
    for (const word of words) {
      if (g.measureText(line + word).width > W - 2 * P && line) { g.fillText(line.trim(), P, y); y += 92; line = ""; }
      line += word + " ";
    }
    g.fillText(line.trim(), P, y);
    font(32, 500); g.fillStyle = c.muted;
    g.fillText(capitalize(end.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })), P, y + 60);

    const list = h.exercises || [];
    const sets = list.reduce((sum, e) => sum + (e.setLog?.length || 0), 0);
    const vol = Math.round(workoutVolume(h));
    const tiles = [
      [formatDuration(h.startedAt, h.finishedAt), "duração"],
      [String(h.exerciseCount), "exercícios"],
      [String(sets || "—"), "séries"],
      [vol ? `${vol.toLocaleString("pt-BR")} kg` : "—", "volume"],
    ];
    const ty = y + 110, tw = (W - 2 * P - 24) / 2, th = 170;
    tiles.forEach(([val, label], i) => {
      const x = P + (i % 2) * (tw + 24), yy = ty + Math.floor(i / 2) * (th + 24);
      g.fillStyle = c.surface; round(x, yy, tw, th);
      font(64, 800, display); g.fillStyle = c.text; g.fillText(fit(T(val), tw - 64), x + 32, yy + 92);
      font(28, 600); g.fillStyle = c.muted; g.fillText(label, x + 32, yy + 138);
    });

    let ly = ty + 2 * (th + 24) + 40;
    const prs = list.filter((e) => e.pr);
    if (prs.length) {
      g.fillStyle = c.accent; round(P, ly, W - 2 * P, 70 + prs.slice(0, 3).length * 46);
      font(32, 800); g.fillStyle = c.onAccent; g.fillText(`${prs.length} ${prs.length === 1 ? "novo recorde" : "novos recordes"}!`, P + 32, ly + 52);
      font(28, 600);
      prs.slice(0, 3).forEach((e, i) => g.fillText(fit(`${e.name}: ${e.pr.text}`, W - 2 * P - 64), P + 32, ly + 100 + i * 46));
      ly += 70 + prs.slice(0, 3).length * 46 + 30;
    }
    ly += 40;
    font(30, 700); g.fillStyle = c.text;
    const room = Math.max(0, Math.floor((H - 120 - ly) / 54));
    list.slice(0, room).forEach((e, i) => {
      g.fillStyle = c.accent; g.beginPath(); g.arc(P + 6, ly + i * 54 - 10, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = c.text; font(30, 700); g.fillText(fit(e.name, 600), P + 28, ly + i * 54);
      g.fillStyle = c.muted; font(26, 500);
      // Resumo curto: "3 séries · até 12 kg" (ou reps/segundos quando não há peso).
      const done = e.setLog || [];
      const maxW = Math.max(0, ...done.map((x) => num(x.weight)));
      const maxR = Math.max(0, ...done.map((x) => num(x.reps)));
      const best = maxW ? `até ${fmtNum(maxW)} kg` : maxR ? `até ${fmtNum(maxR)}${e.type === "tempo" ? "s" : " reps"}` : "";
      const sum = done.length ? [`${done.length} ${done.length === 1 ? "série" : "séries"}`, best].filter(Boolean).join(" · ") : "";
      g.textAlign = "right";
      if (sum) g.fillText(sum, W - P, ly + i * 54);
      g.textAlign = "left";
    });
    if (list.length > room && room) { font(26, 600); g.fillStyle = c.muted; g.fillText(`+ ${list.length - room} exercícios`, P + 28, ly + room * 54); }
    font(26, 600); g.fillStyle = c.muted; g.fillText("Feito com o MegGym", P, H - 56);

    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = new File([blob], `meggym-${isoDay(end)}.png`, { type: "image/png" });
    const text = `Treino concluído: ${h.workoutName} (${formatDuration(h.startedAt, h.finishedAt)})`;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Meu treino no MegGym", text });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Imagem do resumo salva.", "success");
  }

  function renderHistoryDetail(id, params = new URLSearchParams()) {
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
    const totalSets = list.reduce((sum, e) => sum + (e.setLog?.length || parseInt(e.sets, 10) || 0), 0);
    const sameWorkoutCount = Store.history(user.id).filter((x) => x.workoutId === h.workoutId).length;

    const fresh = params.get("novo") === "1";
    const prs = list.filter((e) => e.pr);
    app.innerHTML = `
      ${fresh ? `<p class="eyebrow-text">${icon("celebration", "mi-inline")} Treino concluído${prs.length ? ` · ${prs.length} ${prs.length === 1 ? "recorde" : "recordes"}` : ""}</p>` : ""}
      <section class="history-hero">
        <span class="history-hero-icon">${icon("flag")}</span>
        <div>
          <h2>${escapeHtml(h.workoutName)}</h2>
          <p class="meta">${escapeHtml(capitalize(end.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })))}</p>
        </div>
      </section>
      ${h.workoutDescription ? `<p class="lead">${escapeHtml(h.workoutDescription)}</p>` : ""}
      <button class="btn ${fresh ? "btn-primary btn-lg" : ""} btn-block" type="button" id="share-btn">${icon("ios_share", "mi-inline")} Compartilhar resumo</button>

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
                        <div class="meta">${g ? `${groupIcon(g, "mi-inline")} ${escapeHtml(g.name)} · ` : ""}${escapeHtml(prescription(e)) || "—"}</div>
                        ${e.pr ? `<div class="pr-badge">${icon("emoji_events", "mi-inline")} Recorde: ${escapeHtml(e.pr.text)}</div>` : ""}
                        ${e.setLog?.length ? `<div class="run-sets-done">${escapeHtml(setsSummary(e.setLog, e.type))}</div>` : ""}
                        ${e.myLoad ? `<div class="ex-load-preview">${icon("fitness_center", "mi-inline")} <span>${escapeHtml(e.myLoad)}</span></div>` : ""}
                        ${e.note ? `<div class="ex-note-preview">${icon("edit_note", "mi-inline")} <span>${escapeHtml(e.note)}</span></div>` : ""}
                      </div>
                      ${exists ? `<span class="chevron" aria-hidden="true">›</span>` : ""}
                    </li>`;
                })
                .join("")}</ol>`
            : `<p class="meta">A lista de exercícios deste registro não está disponível.</p>`
        }
      </section>

      ${h.note ? `<section class="subsection"><h2 class="subsection-title">${icon("edit_note", "mi-inline")} Observações do treino</h2><p class="note-box">${escapeHtml(h.note)}</p></section>` : ""}

      <p class="meta">Você já fez este treino ${sameWorkoutCount} ${sameWorkoutCount === 1 ? "vez" : "vezes"}.</p>
      ${
        workout
          ? `<div class="sticky-cta"><a class="btn btn-primary btn-block btn-lg" href="#/treinos/${encodeURIComponent(workout.id)}">${icon("replay", "mi-inline")} Fazer este treino de novo</a></div>`
          : `<p class="meta">Este treino foi excluído.</p>`
      }`;
    $("share-btn").addEventListener("click", () => shareSummary(h));
  }

  function renderSettings() {
    setTab("atividade");
    setHeader("Configurações", { back: "#/atividade" });
    const theme = window.MegTheme ? window.MegTheme.get() : "auto";
    app.innerHTML = `
      <section class="settings-group">
        <h2 class="settings-title">Personalização</h2>
        <p class="meta" style="margin:0 0 10px">Estilo do app</p>
        <form id="style-form">${stylePickerHtml(user.style || "suave", "set")}</form>
        <p class="meta" style="margin:16px 0 10px">Modo</p>
        ${modePickerHtml(theme, "theme-picker")}
        <p class="meta">${theme === "auto" ? "Segue o tema do seu celular." : "Escolhido por você neste aparelho."}</p>
      </section>

      <section class="settings-group">
        <h2 class="settings-title">App</h2>
        <div class="settings-list">
          <button class="settings-item" type="button" id="install-setting" data-install>
            <span class="settings-icon">${icon("install_mobile")}</span>
            <span class="item-main"><span class="item-title">Instalar app</span><br><span class="meta">${
              PWA?.status() === "installed" ? "Já instalado neste aparelho" : "Abrir pela tela inicial, em tela cheia e sem internet"
            }</span></span>
            <span class="chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section class="settings-group">
        <h2 class="settings-title">Backup</h2>
        <p class="meta" style="margin:0 0 10px">Seus dados ficam só neste aparelho. Salve um arquivo de backup para não perder histórico, pesos e anotações, ou para levar para outro celular.</p>
        <div class="settings-list">
          <button class="settings-item" type="button" id="backup-export">
            <span class="settings-icon">${icon("download")}</span>
            <span class="item-main"><span class="item-title">Exportar backup</span><br><span class="meta">${user.lastBackupAt ? `Último: ${escapeHtml(formatDateTime(user.lastBackupAt))}` : "Nenhum backup feito ainda"}</span></span>
          </button>
          <button class="settings-item" type="button" id="backup-import">
            <span class="settings-icon">${icon("upload")}</span>
            <span class="item-main"><span class="item-title">Importar backup</span><br><span class="meta">Restaurar a partir de um arquivo</span></span>
          </button>
        </div>
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
          <button class="settings-item" type="button" id="tour-again">
            <span class="settings-icon">${icon("lightbulb")}</span>
            <span class="item-main"><span class="item-title">Ver dicas de novo</span><br><span class="meta">Como registrar séries, descanso e opções</span></span>
          </button>
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
    $("style-form").addEventListener("change", (e) => {
      if (e.target.name !== "set-style-choice") return;
      user = Store.updateUser(user.id, { style: e.target.value });
      window.MegTheme?.setStyle(e.target.value);
      toast(`Estilo ${STYLE_INFO.find(([id]) => id === e.target.value)[1]} aplicado.`, "success");
    });
    $("backup-export").addEventListener("click", () => {
      downloadBackup();
      renderSettings();
    });
    $("backup-import").addEventListener("click", () => restoreFromFile());
    $("tour-again").addEventListener("click", showTour);
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

    if (!(parts[0] === "estruturas" && (parts[1] === "novo" || parts[2] === "editar"))) structureDraft = null;
    switch (parts[0]) {
      case "estruturas":
        if (parts[1] === "novo") renderStructureForm(null);
        else if (parts[1] && parts[2] === "editar") renderStructureForm(parts[1]);
        else if (parts[1]) renderStructureDetail(parts[1]);
        else location.replace("#/treinos");
        break;
      case "treinos":
        if (parts[1] === "novo") renderWorkoutForm(null);
        else if (parts[1] && parts[2] === "editar") renderWorkoutForm(parts[1]);
        else if (parts[1] && parts[2] === "executar") renderWorkoutRun(parts[1]);
        else if (parts[1]) renderWorkoutDetail(parts[1]);
        else renderWorkouts(params);
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
        else if (parts[1] === "historico" && parts[2]) renderHistoryDetail(parts[2], params);
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
    animatePage(parts);
  }

  /* ================= Animações ================= */

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastRoute = null;

  // Transição entre telas: entrar numa tela mais "funda" desliza da direita, voltar desliza da esquerda,
  // trocar de aba sobe suave. Depois os itens das listas aparecem em cascata.
  function animatePage(parts) {
    const tab = parts[0] || "inicio";
    const depth = parts.length;
    let dir = "fade";
    if (lastRoute && lastRoute.tab === tab) dir = depth > lastRoute.depth ? "forward" : depth < lastRoute.depth ? "back" : "fade";
    lastRoute = { tab, depth };
    if (reduceMotion()) return;
    app.classList.remove("page-forward", "page-back", "page-fade");
    void app.offsetWidth; // reinicia a animação
    app.classList.add(`page-${dir}`);
    stagger(app);
    countUp(app);
  }

  function stagger(root) {
    root
      .querySelectorAll(
        ".item-list > li, .run-list > li, .set-list > li, .group-grid > *, .card-grid > *, .stat-tiles > *, .detail-grid > *, .settings-group, .today-card, .home-structure, .motivation, .week-card, .subsection, .hbars > li, .exercise-grid > *, .equip-grid > *"
      )
      .forEach((el, i) => {
        el.classList.add("stagger");
        el.style.setProperty("--i", Math.min(i, 14));
      });
  }

  // Números grandes contam do zero até o valor.
  function countUp(root) {
    root.querySelectorAll(".stat-tile-value, .week-stat-value").forEach((el) => {
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && /^\s*\d+\s*$/.test(n.textContent));
      if (!node) return;
      const target = parseInt(node.textContent, 10);
      if (!(target > 1)) return;
      const start = performance.now();
      const dur = Math.min(900, 300 + target * 40);
      const step = (t) => {
        const k = Math.min(1, (t - start) / dur);
        node.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // Confete ao terminar o treino.
  function celebrate() {
    if (reduceMotion()) return;
    const colors = ["var(--accent)", "var(--success)", "#f2c500", "#1e66d0", "#e85a9b"];
    const box = document.createElement("div");
    box.className = "confetti";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = Array.from({ length: 40 }, (_, i) => {
      const x = Math.round(Math.random() * 100);
      const delay = Math.round(Math.random() * 300);
      const dur = 1400 + Math.round(Math.random() * 900);
      const rot = Math.round(Math.random() * 720 - 360);
      const drift = Math.round(Math.random() * 120 - 60);
      return `<i style="left:${x}%;background:${colors[i % colors.length]};animation-delay:${delay}ms;animation-duration:${dur}ms;--rot:${rot}deg;--drift:${drift}px"></i>`;
    }).join("");
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2800);
  }

  // "Pop" em botões de check.
  function pop(el) {
    if (!el || reduceMotion()) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
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

  /* ================= Backup ================= */

  function downloadBackup() {
    const data = Store.exportBackup(user.id);
    if (!data) return;
    user = Store.currentUser();
    const d = new Date(data.createdAt);
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meggym-backup-${slugify(user.name) || "perfil"}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Backup salvo!", "success");
  }

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", () => resolve(input.files[0] || null));
      input.click();
    });
  }

  // Abre o seletor de arquivo, mostra o resumo do backup, confirma e restaura.
  async function restoreFromFile() {
    const file = await pickFile();
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!Store.isBackup(data)) throw new Error();
    } catch {
      toast("Esse arquivo não é um backup do MegGym.", "error");
      return;
    }
    const exists = Store.users().some((u) => u.id === data.user.id);
    const ok = await confirmSheet({
      icon: "restore",
      title: `Restaurar ${data.user.name}?`,
      text: `Backup de ${formatDateTime(data.createdAt)} · ${(data.history || []).length} treinos no histórico.${exists ? " Os dados atuais deste perfil neste aparelho serão substituídos pelos do arquivo." : ""}`,
      confirmLabel: "Restaurar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    user = Store.importBackup(data);
    toast("Backup restaurado!", "success");
    location.hash = "#/inicio";
    enterApp();
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
    return `<div class="steps" aria-label="Passo ${step} de 4">${[1, 2, 3, 4]
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
          <div class="restore-box">
            <p class="page-subtitle">Já usou o MegGym antes?</p>
            <button class="btn btn-block" type="button" data-restore>${icon("restore", "mi-inline")} Restaurar um backup</button>
          </div>
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

    if (step === 3) {
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
            <button class="btn btn-primary btn-lg" type="submit">Continuar</button>
          </div>
        </form>`;
      $("ob-equipment").addEventListener("submit", (e) => {
        e.preventDefault();
        values.equipment = readEquipment(e.target);
        onboarding.step = 4;
        renderOnboarding();
      });
      return;
    }

    // step 4: personalização
    if (!values.style) values.style = window.MegTheme ? window.MegTheme.getStyle() : "suave";
    if (!values.mode) values.mode = window.MegTheme ? window.MegTheme.get() : "auto";
    box.innerHTML = `
      <form class="onboarding-step form-stack" id="ob-style" novalidate>
        ${stepDots(4)}
        <div>
          <p class="eyebrow-text">Personalização</p>
          <h1>Deixe a sua cara</h1>
          <p class="page-subtitle">Escolha o estilo do app. Dá para trocar depois em Configurações.</p>
        </div>
        ${stylePickerHtml(values.style, "ob")}
        <div class="field">
          <span class="label">Modo</span>
          ${modePickerHtml(values.mode, "ob-mode")}
        </div>
        <div class="onboarding-actions">
          <button class="btn btn-ghost" type="button" data-ob="back">Voltar</button>
          <button class="btn btn-primary btn-lg" type="submit">Concluir</button>
        </div>
      </form>`;
    const form = $("ob-style");
    form.addEventListener("change", (e) => {
      if (e.target.name === "ob-style-choice") {
        values.style = e.target.value;
        window.MegTheme?.setStyle(values.style); // prévia ao vivo
      }
    });
    $("ob-mode").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-choice]");
      if (!btn) return;
      values.mode = btn.dataset.themeChoice;
      window.MegTheme?.set(values.mode);
      $("ob-mode").querySelectorAll("[data-theme-choice]").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const profile = { name: values.name, age: values.age, sex: values.sex, equipment: values.equipment, style: values.style, onboarded: true };
      user = existing ? Store.updateUser(existing.id, profile) : Store.createUser(profile);
      onboarding = null;
      toast(`Tudo pronto, ${user.name.split(" ")[0]}!`, "success");
      if (!location.hash || location.hash === "#/") location.replace("#/inicio");
      enterApp();
    });
  }

  const STYLE_INFO = [
    ["suave", "Suave", "Claro, tons pastel, formas arredondadas"],
    ["energia", "Energia", "Escuro, números grandes, foco em performance"],
    ["esportivo", "Esportivo", "Pôster esportivo, linhas fortes"],
  ];

  function stylePickerHtml(selected, prefix) {
    return `
      <div class="style-options" role="radiogroup" aria-label="Estilo do app">
        ${STYLE_INFO.map(
          ([id, name, desc]) => `
          <label class="style-option">
            <input type="radio" name="${prefix}-style-choice" value="${id}" ${selected === id ? "checked" : ""}>
            <span class="style-card">
              <span class="mini mini-${id}" aria-hidden="true"><i class="t"></i><i class="h"></i><span class="r"><i></i><i></i></span><span class="n"><i></i><i></i><i></i><i></i></span></span>
              <span class="style-name">${name}${id === "suave" ? " (padrão)" : ""}</span>
              <span class="style-desc">${desc}</span>
            </span>
          </label>`
        ).join("")}
      </div>`;
  }

  function modePickerHtml(selected, id) {
    return `
      <div class="segmented" role="radiogroup" aria-label="Modo claro ou escuro" id="${id}">
        ${[
          ["auto", "brightness_auto", "Automático"],
          ["light", "light_mode", "Claro"],
          ["dark", "dark_mode", "Escuro"],
        ]
          .map(
            ([value, iconName, label]) =>
              `<button type="button" role="radio" data-theme-choice="${value}" aria-checked="${selected === value}">${icon(iconName)}${label}</button>`
          )
          .join("")}
      </div>`;
  }

  $("onboarding").addEventListener("click", (e) => {
    const nav = e.target.closest("[data-ob]");
    if (nav && onboarding) {
      if (nav.dataset.ob === "back") {
        const form = $("onboarding").querySelector("form");
        if (onboarding.step === 3 && form) onboarding.values.equipment = readEquipment(form);
        if (onboarding.step === 4 && form) {
          const chosen = form.querySelector('input[name="ob-style-choice"]:checked');
          if (chosen) onboarding.values.style = chosen.value;
        }
        onboarding.step = Math.max(1, onboarding.step - 1);
      } else {
        onboarding.step = Math.min(4, onboarding.step + 1);
      }
      renderOnboarding();
      return;
    }
    if (e.target.closest("[data-restore]")) {
      restoreFromFile();
      return;
    }
    const profile = e.target.closest("[data-profile]");
    if (profile) {
      user = Store.loginById(profile.dataset.profile);
      if (user) enterApp();
    }
  });

  /* ---------- Primeiro uso: 3 dicas rápidas ---------- */

  const TOUR = [
    ["today", "Seu treino do dia", "No Início aparece o Treino de hoje. Toque em Começar para iniciar, ou escolha outro em Treinos."],
    ["check_circle", "Registre cada série", "Abra o exercício, anote repetições e peso e marque a série. O descanso começa sozinho, e o app compara com a última vez."],
    ["more_vert", "Do seu jeito", "No menu ⋮ de cada exercício dá para pular, trocar por outro do mesmo grupo ou mudar a ordem. Ao terminar, compartilhe o resumo."],
  ];

  function showTour() {
    let step = 0;
    const draw = () => {
      const [ic, title, text] = TOUR[step];
      const last = step === TOUR.length - 1;
      $("sheet-content").innerHTML = `
        <div class="tour" aria-live="polite">
          <span class="tour-icon">${icon(ic)}</span>
          <p class="eyebrow-text">Dica ${step + 1} de ${TOUR.length}</p>
          <h2 id="sheet-title">${title}</h2>
          <p class="tour-text">${text}</p>
          <div class="tour-dots" aria-hidden="true">${TOUR.map((_, i) => `<span class="${i === step ? "on" : ""}"></span>`).join("")}</div>
          <button class="btn btn-primary btn-block btn-lg" type="button" id="tour-next">${last ? "Começar a treinar" : "Próxima dica"}</button>
          ${last ? "" : `<button class="btn btn-ghost btn-block" type="button" id="tour-skip">Pular dicas</button>`}
        </div>`;
      $("tour-next").addEventListener("click", () => (last ? closeSheet() : (step++, draw())));
      $("tour-skip")?.addEventListener("click", () => closeSheet());
      $("tour-next").focus({ preventScroll: true });
    };
    draw();
    sheetReturnFocus = document.activeElement;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    user = Store.updateUser(user.id, { tourDone: true });
  }

  function enterApp() {
    if (!user.onboarded) {
      startProfileCompletion(user);
      return;
    }
    window.MegTheme?.setStyle(user.style || window.MegTheme.DEFAULT_STYLE);
    $("login-screen").classList.add("hidden");
    $("onboarding").innerHTML = ""; // evita campos com o mesmo id escondidos na página
    $("app-shell").classList.remove("hidden");
    route();
    resumeRest();
    if (!user.tourDone && !Store.history(user.id).length) setTimeout(showTour, reduceMotion() ? 0 : 500);
  }

  $("back-btn").addEventListener("click", () => {
    const href = $("back-btn").dataset.href;
    if (href) location.hash = href;
  });

  /* ================= Detalhes do exercício (bottom sheet) ================= */

  const sheet = $("sheet");
  let sheetReturnFocus = null;

  // Conteúdo de detalhes do exercício (usado na tela cheia e no bottom sheet).
  /* ---------- Evolução do peso (gráfico de barras por exercício) ---------- */

  // Repetições: maior número de repetições numa série, por dia (dos treinos terminados).
  function repsLog(exerciseId) {
    const byDay = {};
    Store.history(user.id).forEach((h) => {
      (h.exercises || [])
        .filter((e) => e.exerciseId === exerciseId)
        .forEach((e) => {
          const best = Math.max(0, ...(e.setLog || []).map((s) => parseInt(s.reps, 10) || 0));
          if (!best) return;
          const day = isoDay(h.finishedAt);
          byDay[day] = Math.max(byDay[day] || 0, best);
        });
    });
    return Object.entries(byDay)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Barras com valor em cima e data embaixo. list: [{ date: "AAAA-MM-DD", value }]
  function barsHtml(list, unit, label) {
    const max = Math.max(...list.map((e) => e.value));
    const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
    return `<ol class="wchart" aria-label="${escapeHtml(label)}">${list
      .map((e, i) => {
        const [y, m, d] = e.date.split("-");
        const lbl = `${d}/${m}${i === 0 || list[i - 1].date.slice(0, 4) !== y ? `/${y.slice(2)}` : ""}`;
        return `
          <li class="wbar ${i === list.length - 1 ? "latest" : ""} ${e.value ? "" : "zero"}" title="${fmt(e.value)} ${unit} em ${d}/${m}/${y}">
            <span class="wbar-value">${fmt(e.value)}</span>
            <span class="wbar-col"><span class="wbar-fill" style="height:${e.value ? Math.max(4, (e.value / max) * 100) : 0}%"></span></span>
            <span class="wbar-date">${lbl}</span>
          </li>`;
      })
      .join("")}</ol>`;
  }

  function weightChartHtml(exerciseId, mode) {
    const ex = findExercise(exerciseId);
    const canWeight = ex ? usesWeight(ex) : true;
    mode = mode || (canWeight ? "peso" : "reps");
    const isWeight = mode === "peso";
    const list = (isWeight ? Store.weightLog(user.id, exerciseId).map((e) => ({ date: e.date, value: e.weight })) : repsLog(exerciseId)).slice(-12);
    const unit = isWeight ? "kg" : "reps";
    const toggle = canWeight
      ? `<div class="seg" role="tablist" aria-label="Mostrar">
          <button type="button" role="tab" data-chart-mode="peso" aria-selected="${isWeight}">Peso</button>
          <button type="button" role="tab" data-chart-mode="reps" aria-selected="${!isWeight}">Repetições</button>
        </div>`
      : "";
    const best = bestOf(exerciseId);
    const logMax = Math.max(0, ...Store.weightLog(user.id, exerciseId).map((e) => e.weight));
    const recW = Math.max(best.weight, logMax);
    const recLine = isWeight
      ? recW ? `<p class="pr-line">${icon("emoji_events", "mi-inline")} Recorde: <strong>${fmtNum(recW)} kg</strong></p>` : ""
      : best.reps ? `<p class="pr-line">${icon("emoji_events", "mi-inline")} Recorde: <strong>${fmtNum(best.reps)}${ex && exerciseType(ex) === "tempo" ? "s" : " reps"}</strong>${best.repsDate ? ` em ${new Date(best.repsDate).toLocaleDateString("pt-BR")}` : ""}</p>` : "";
    const head = `<div class="chart-head"><h3>Evolução</h3>${toggle}</div>${recLine}`;
    if (!list.length)
      return `${head}<p class="meta">${
        isWeight
          ? "Registre o peso em Minha carga ou nas séries do treino para ver sua evolução aqui."
          : "Registre as repetições nas séries durante o treino para ver sua evolução aqui."
      }</p>`;
    const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
    const first = list[0].value;
    const last = list[list.length - 1].value;
    const diff = last - first;
    return `
      ${head}
      <p class="meta">${
        list.length === 1
          ? `Primeiro registro: ${fmt(last)} ${unit}`
          : `${diff > 0 ? "+" : ""}${fmt(diff)} ${unit} desde ${list[0].date.split("-").reverse().join("/")}`
      } · ${isWeight ? "peso por dia, em kg" : "melhor série do dia"}</p>
      ${barsHtml(list, unit, isWeight ? "Peso por data" : "Repetições por data")}`;
  }

  function refreshWeightChart(exerciseId) {
    document.querySelectorAll(`[data-weight-chart="${CSS.escape(exerciseId)}"]`).forEach((el) => (el.innerHTML = weightChartHtml(exerciseId, el.dataset.mode)));
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chart-mode]");
    const box = btn?.closest("[data-weight-chart]");
    if (!box) return;
    box.dataset.mode = btn.dataset.chartMode;
    box.innerHTML = weightChartHtml(box.dataset.weightChart, box.dataset.mode);
  });

  /* ---------- Séries e descanso (durante o treino) ---------- */

  const DEFAULT_REST = 60;

  function restSecondsOf(w) {
    const n = parseInt(w?.restSeconds, 10);
    return n > 0 ? n : DEFAULT_REST;
  }

  // Exercício aberto a partir da tela de execução: índice do item + treino em andamento.
  function runContext(prescription) {
    if (prescription.runIndex === undefined || prescription.runIndex === "") return null;
    const session = Store.session(user.id);
    const w = session && Store.getWorkout(session.workoutId);
    if (!w) return null;
    const index = Number(prescription.runIndex);
    return { index, workout: w, restSeconds: itemRestSeconds(w, index), sets: session.sets?.[index] || [] };
  }

  // Descanso do exercício: o que estiver no item ("90s", "60-90s", "2 min") vale mais que o padrão do treino.
  function itemRestSeconds(w, index) {
    const txt = String(w?.items?.[index]?.rest || "").toLowerCase();
    const n = parseInt(txt.match(/\d+/)?.[0], 10);
    if (n > 0) return /min/.test(txt) ? n * 60 : n;
    return restSecondsOf(w);
  }

  /* ---------- Recordes pessoais ---------- */

  const num = (v) => parseFloat(String(v ?? "").replace(",", ".")) || 0;

  // Melhor peso e melhor número (reps ou segundos) já registrados no histórico do usuário.
  function bestOf(exerciseId, history = Store.history(user.id)) {
    let weight = 0, reps = 0, weightDate = "", repsDate = "";
    history.forEach((h) =>
      (h.exercises || [])
        .filter((e) => e.exerciseId === exerciseId)
        .forEach((e) =>
          (e.setLog || []).forEach((st) => {
            if (num(st.weight) > weight) (weight = num(st.weight)), (weightDate = h.finishedAt);
            if (num(st.reps) > reps) (reps = num(st.reps)), (repsDate = h.finishedAt);
          })
        )
    );
    return { weight, reps, weightDate, repsDate, any: Boolean(weight || reps) };
  }

  // Recorde de uma lista de séries contra o melhor anterior (peso vale mais que reps).
  function recordOf(ex, sets, best) {
    if (!best.any) return null;
    const done = sets.filter((x) => x.done);
    const w = Math.max(0, ...done.map((x) => num(x.weight)));
    const r = Math.max(0, ...done.map((x) => num(x.reps)));
    const type = exerciseType(ex);
    if (usesWeight(ex) && w > best.weight && best.weight) return { kind: "peso", value: w, prev: best.weight, text: `${fmtNum(w)} kg (antes ${fmtNum(best.weight)} kg)` };
    if (r > best.reps && best.reps) {
      const u = type === "tempo" ? "s" : " reps";
      return { kind: type === "tempo" ? "tempo" : "reps", value: r, prev: best.reps, text: `${fmtNum(r)}${u} (antes ${fmtNum(best.reps)}${u})` };
    }
    return null;
  }

  const fmtNum = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

  // Séries feitas na última vez que o usuário terminou um treino com este exercício.
  function lastSets(exerciseId) {
    for (const h of Store.history(user.id)) {
      const e = (h.exercises || []).find((x) => x.exerciseId === exerciseId && x.setLog?.length);
      if (e) return { date: h.finishedAt, sets: e.setLog };
    }
    return null;
  }

  function setsTableHtml(ex, run, setsText, repsText) {
    const count = Math.min(Math.max(parseInt(setsText, 10) || 3, 1), 12);
    const weight = usesWeight(ex);
    const myWeight = Store.exerciseLoad(user.id, ex.id).weight;
    const last = lastSets(ex.id);
    const type = exerciseType(ex);
    const timed = type === "tempo";
    const unit = unitOf(type);
    const target = parseInt(String(repsText || "").match(/\d+/)?.[0], 10) || 30;
    const rows = Array.from({ length: Math.max(count, run.sets.length) }, (_, i) => {
      const s = run.sets[i] || {};
      const prev = last?.sets[i];
      const kg = (v) => String(Math.round(parseFloat(String(v).replace(",", ".")) * 10) / 10).replace(".", ",");
      const prevText = prev ? [prev.reps ? (timed ? `${prev.reps}s` : `${prev.reps} ${unit}`) : "", prev.weight ? `${kg(prev.weight)} kg` : ""].filter(Boolean).join(" × ") : "";
      const secs = parseInt(prev?.reps, 10) || target;
      return `
        <li class="set-row ${s.done ? "done" : ""} ${timed ? "timed" : ""} ${weight ? "weighted" : ""}" data-set="${i}">
          <span class="set-num" aria-hidden="true">${i + 1}</span>
          <label class="set-field"><span class="visually-hidden">${timed ? "Segundos" : "Repetições"} da série ${i + 1}</span>
            <input class="input input-sm" data-set-field="reps" inputmode="numeric" maxlength="4" placeholder="${escapeHtml(timed ? String(secs) : prev?.reps || repsText || "0")}" value="${escapeHtml(s.reps || "")}"><span class="set-unit">${unit === "reps/lado" ? "/lado" : unit}</span></label>
          ${
            weight
              ? `<label class="set-field"><span class="visually-hidden">Peso da série ${i + 1}</span>
                  <input class="input input-sm" data-set-field="weight" inputmode="decimal" maxlength="7" placeholder="${escapeHtml(myWeight || prev?.weight || "0")}" value="${escapeHtml(s.weight || "")}"><span class="set-unit">kg</span></label>`
              : ""
          }
          ${
            timed
              ? `<button type="button" class="set-timer" data-set-timer="${secs}" aria-label="Iniciar cronômetro de ${secs} segundos da série ${i + 1}">${icon("play_arrow", "mi-inline")}<span>${secs}s</span></button>`
              : ""
          }
          <button type="button" class="set-check" data-set-check aria-pressed="${Boolean(s.done)}" aria-label="Concluir série ${i + 1}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </button>
          ${last ? `<span class="set-prev">${prevText ? `Última vez: ${escapeHtml(prevText)}` : "Última vez: —"}</span>` : ""}
        </li>`;
    }).join("");
    return `
      <section class="sheet-section sets-log" data-sets-index="${run.index}" data-sets-exercise="${escapeHtml(ex.id)}">
        <h3>Séries</h3>
        ${last ? `<p class="meta">${icon("history", "mi-inline")} Comparando com ${escapeHtml(formatDateTime(last.date))}. Campos vazios usam o valor sugerido ao marcar.</p>` : ""}
        <ol class="set-list">${rows}</ol>
        <p class="meta">${timed ? `Toque em ${icon("play_arrow", "mi-inline")} para cronometrar a série; ao terminar ela é marcada e o descanso de ${run.restSeconds}s começa.` : `Marque a série ao terminar: o descanso de ${run.restSeconds}s começa sozinho.`}</p>
      </section>`;
  }

  function bindSetsTable() {
    document.querySelectorAll("[data-tip]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const tip = $(`tip-${btn.dataset.tip}`);
        const open = tip.classList.toggle("hidden") === false;
        btn.setAttribute("aria-expanded", String(open));
      })
    );
    document.querySelectorAll("[data-rest-start]").forEach((btn) =>
      btn.addEventListener("click", () => startRest(Number(btn.dataset.restStart)))
    );
    const box = $("sheet-content").querySelector("[data-sets-index]");
    if (!box) return;
    const index = Number(box.dataset.setsIndex);
    const exId = box.dataset.setsExercise;
    const read = () =>
      [...box.querySelectorAll("[data-set]")].map((row) => {
        const w = row.querySelector('[data-set-field="weight"]');
        return {
          reps: row.querySelector('[data-set-field="reps"]').value.trim(),
          weight: w ? w.value.trim().replace(".", ",") : "",
          done: row.classList.contains("done"),
        };
      });
    const save = () => {
      const sets = read();
      Store.saveSets(user.id, index, sets);
      // Todas as séries feitas → exercício concluído na lista.
      const session = Store.setDone(user.id, index, sets.every((s) => s.done));
      document.dispatchEvent(new CustomEvent("meggym:run-changed", { detail: { session, exerciseId: exId } }));
    };
    box.addEventListener("input", (e) => {
      if (e.target.dataset.setField === "reps") e.target.value = e.target.value.replace(/\D/g, "");
      if (e.target.dataset.setField === "weight") e.target.value = e.target.value.replace(/[^\d.,]/g, "");
      save();
    });
    box.addEventListener("click", (e) => {
      const timerBtn = e.target.closest("[data-set-timer]");
      if (timerBtn) return toggleSetTimer(timerBtn);
      const btn = e.target.closest("[data-set-check]");
      if (!btn) return;
      const row = btn.closest("[data-set]");
      const done = !row.classList.contains("done");
      row.classList.toggle("done", done);
      btn.setAttribute("aria-pressed", String(done));
      // Ao concluir com o campo vazio, usa o sugerido (se for um número).
      if (done) {
        row.querySelectorAll("[data-set-field]").forEach((input) => {
          if (!input.value && /^\d+([.,]\d+)?$/.test(input.placeholder) && input.placeholder !== "0") input.value = input.placeholder;
        });
        if (navigator.vibrate) navigator.vibrate(30);
        pop(btn);
      }
      save();
      if (done) {
        const ex = findExercise(exId);
        const sets = read();
        const pr = ex && recordOf(ex, [sets[Number(row.dataset.set)]], bestOf(exId));
        const already = box.querySelector(".set-pr");
        if (pr && !already) {
          row.insertAdjacentHTML("beforeend", `<span class="set-pr">${icon("emoji_events", "mi-inline")} Recorde!</span>`);
          toast(`Novo recorde: ${pr.text}`, "success");
        }
        const w = Store.getWorkout(Store.session(user.id)?.workoutId);
        const ss = w && supersets(w.items)[index];
        if (ss && !ss.last) {
          const next = findExercise(Store.session(user.id)?.swaps?.[index + 1] || w.items[index + 1]?.exerciseId);
          toast(`${ss.name}: sem descanso, vá para ${next ? next.name : "o próximo"}.`);
        } else startRest(itemRestSeconds(w, index));
      }
    });
  }

  // Cronômetro de série (exercícios de tempo): conta regressiva no botão; ao fim marca a série.
  let setTimer = null;
  function toggleSetTimer(btn) {
    const row = btn.closest("[data-set]");
    const input = row.querySelector('[data-set-field="reps"]');
    if (setTimer && setTimer.btn === btn) {
      // Parar antes: registra o tempo feito.
      const elapsed = Math.round((Date.now() - setTimer.start) / 1000);
      stopSetTimer();
      if (elapsed > 0) input.value = String(elapsed);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    stopSetTimer();
    const total = parseInt(input.value, 10) || Number(btn.dataset.setTimer);
    unlockAudio();
    keepScreenOn();
    setTimer = { btn, start: Date.now(), total };
    btn.classList.add("running");
    btn.setAttribute("aria-label", "Parar cronômetro e registrar o tempo feito");
    const label = btn.querySelector("span:not(.mi)");
    const iconEl = btn.querySelector(".mi");
    if (iconEl) iconEl.textContent = "stop";
    const tick = () => {
      if (!btn.isConnected) return stopSetTimer();
      const left = total - Math.floor((Date.now() - setTimer.start) / 1000);
      label.textContent = `${Math.max(left, 0)}s`;
      btn.style.setProperty("--p", `${Math.min(100, ((total - left) / total) * 100)}%`);
      if (left <= 0) {
        stopSetTimer();
        beep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        input.value = String(total);
        const check = row.querySelector("[data-set-check]");
        if (!row.classList.contains("done")) check.click();
      }
    };
    setTimer.id = setInterval(tick, 250);
    tick();
  }

  function stopSetTimer() {
    if (!setTimer) return;
    clearInterval(setTimer.id);
    const { btn, total } = setTimer;
    setTimer = null;
    if (!btn.isConnected) return;
    btn.classList.remove("running");
    btn.style.removeProperty("--p");
    btn.querySelector(".mi").textContent = "play_arrow";
    btn.querySelector("span:not(.mi)").textContent = `${total}s`;
    btn.setAttribute("aria-label", `Iniciar cronômetro de ${total} segundos`);
  }

  // Temporizador de descanso: barra fixa acima de tudo, continua com o painel fechado.
  let restEnd = 0;
  let restTotal = 0;
  let restTick = null;
  const restBar = document.createElement("div");
  restBar.className = "rest-bar hidden";
  restBar.setAttribute("role", "timer");
  restBar.innerHTML = `
    <div class="rest-fill" id="rest-fill"></div>
    <span class="rest-label">${icon("timer", "mi-inline")} Descanso</span>
    <span class="rest-time" id="rest-time">1:00</span>
    <button type="button" class="btn btn-sm" data-rest="-15" aria-label="Menos 15 segundos">−15</button>
    <button type="button" class="btn btn-sm" data-rest="15" aria-label="Mais 15 segundos">+15</button>
    <button type="button" class="btn btn-sm btn-primary" data-rest="skip">Pular</button>`;
  document.body.appendChild(restBar);
  restBar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rest]");
    if (!btn) return;
    if (btn.dataset.rest === "skip") return stopRest();
    const delta = Number(btn.dataset.rest) * 1000;
    restEnd = Math.max(Date.now() + 1000, restEnd + delta);
    restTotal = Math.max(restTotal + delta, 1000);
    if (user) Store.saveRest(user.id, { end: restEnd, total: restTotal });
    updateRest();
  });

  // O fim do descanso fica salvo: o tempo continua certo mesmo se a tela apagar ou o app fechar.
  function startRest(seconds, { end = Date.now() + seconds * 1000 } = {}) {
    restTotal = seconds * 1000;
    restEnd = end;
    if (user) Store.saveRest(user.id, { end: restEnd, total: restTotal });
    restBar.classList.remove("hidden");
    document.body.classList.add("resting");
    clearInterval(restTick);
    restTick = setInterval(updateRest, 250);
    unlockAudio();
    keepScreenOn();
    updateRest();
  }

  function resumeRest() {
    const saved = user && Store.restState(user.id);
    if (!saved || !Store.session(user.id)) return stopRest();
    if (saved.end > Date.now()) startRest(saved.total / 1000, { end: saved.end });
    else stopRest();
  }

  // Bipe curto no fim do descanso (o navegador só libera som depois de um toque).
  let audioCtx = null;
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {
      audioCtx = null;
    }
  }

  function beep() {
    if (!audioCtx) return;
    [0, 0.25, 0.5].forEach((t, n) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = n === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + t);
      osc.stop(audioCtx.currentTime + t + 0.2);
    });
  }

  // Mantém a tela acesa durante o treino (quando o navegador permite).
  let wakeLock = null;
  async function keepScreenOn() {
    if (!("wakeLock" in navigator) || wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } catch {
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !user) return;
    if (Store.session(user.id)) keepScreenOn();
    if (restTick) updateRest();
  });

  function updateRest() {
    const left = restEnd - Date.now();
    if (left <= 0) {
      const late = left < -3000;
      stopRest();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      if (!late) beep();
      toast(late ? "Seu descanso já acabou. Próxima série!" : "Descanso acabou! Próxima série.", "success");
      return;
    }
    const sec = Math.ceil(left / 1000);
    $("rest-time").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    $("rest-fill").style.width = `${Math.min(100, (left / restTotal) * 100)}%`;
  }

  function stopRest() {
    clearInterval(restTick);
    restTick = null;
    restBar.classList.add("hidden");
    document.body.classList.remove("resting");
    if (user) Store.saveRest(user.id, null);
  }

  function exerciseDetailHtml(ex, prescription = {}, { titleId = "sheet-title" } = {}) {
    const g = findGroup(ex.group);
    const img = safeUrl(ex.image);
    const ytId = youtubeId(ex.video);
    const videoUrl = safeUrl(ex.video);
    const sets = prescription.sets || ex.sets;
    const reps = prescription.reps || ex.reps;
    const run = runContext(prescription);
    const restLabel = run ? `${run.restSeconds}s` : prescription.rest || ex.rest;
    const stats = [
      ["Séries", sets],
      [exerciseType(ex) === "tempo" ? "Tempo" : exerciseType(ex) === "unilateral" ? "Reps/lado" : "Reps", repsShort(ex, reps)],
      ["Carga", prescription.load],
    ]
      .filter(([, v]) => v)
      .map(([label, v]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${escapeHtml(v)}</span></div>`)
      .concat(
        restLabel
          ? run
            ? `<button type="button" class="stat stat-btn" data-rest-start="${run.restSeconds}" aria-label="Iniciar descanso de ${run.restSeconds} segundos"><span class="stat-label">Descanso</span><span class="stat-value">${icon("timer", "mi-inline")} ${escapeHtml(restLabel)}</span></button>`
            : `<div class="stat"><span class="stat-label">Descanso</span><span class="stat-value">${icon("timer", "mi-inline")} ${escapeHtml(restLabel)}</span></div>`
          : "",
        prescription.rir
          ? `<div class="stat stat-rir"><span class="stat-label">RIR <button type="button" class="tip-btn" data-tip="rir" aria-expanded="false" aria-label="O que é RIR?">${icon("help", "mi-inline")}</button></span><span class="stat-value">${escapeHtml(prescription.rir)}</span></div>`
          : ""
      )
      .join("");
    const rirTip = prescription.rir
      ? `<p class="tip hidden" id="tip-rir" role="note"><strong>RIR (repetições na reserva):</strong> quantas repetições você ainda conseguiria fazer quando termina a série. RIR ${escapeHtml(prescription.rir)} = pare quando sentir que faltam cerca de ${escapeHtml(prescription.rir)} para não conseguir mais. RIR 0 = até a falha.</p>`
      : "";
    const equip = equipmentChips(ex.equipment, ex.equipmentAny);
    const groupCount = g ? exercises().filter((e) => inGroup(e, g.id)).length : 0;

    return `
      ${img ? `<img class="sheet-image" src="${escapeHtml(img)}" alt="Demonstração: ${escapeHtml(ex.name)}">` : ""}
      <div class="sheet-head">
        <h2 id="${titleId}">${escapeHtml(ex.name)}</h2>
        ${difficultyBadge(ex.difficulty)}
      </div>
      ${typeTag(ex)}
      ${stats ? `<div class="stats">${stats}</div>` : ""}
      ${rirTip}

      ${loadFieldsHtml(ex)}

      ${run ? setsTableHtml(ex, run, sets, reps) : ""}

      <section class="sheet-section" data-weight-chart="${escapeHtml(ex.id)}">${weightChartHtml(ex.id)}</section>

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

      ${personalNoteHtml(ex.id)}

      <section class="sheet-section">
        <h3>Equipamentos</h3>
        ${equip ? `<div class="equip-chips">${equip}</div>` : `<p class="meta">Nenhum — peso do corpo.</p>`}
      </section>

      ${
        g
          ? `<section class="sheet-section">
              <h3>Grupo muscular</h3>
              <a class="group-detail" href="#/exercicios/grupo/${encodeURIComponent(g.id)}" style="--group-color:${safeColor(g.color)}">
                <span class="group-icon">${groupIcon(g)}</span>
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
    bindPersonalNote();
    bindLoadFields();
    bindSetsTable();

    sheetReturnFocus = document.activeElement;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    $("sheet-close").focus({ preventScroll: true });
    $("sheet-content").scrollTop = 0;
  }

  // Confirmação em bottom sheet. Resolve true (confirmou) ou false.
  let pendingConfirm = null;
  function confirmSheet({ icon: iconName = "help", title, text = "", confirmLabel = "Confirmar", cancelLabel = "Voltar", danger = false }) {
    if (pendingConfirm) pendingConfirm(false);
    $("sheet-content").innerHTML = `
      <div class="confirm-sheet">
        <span class="confirm-icon ${danger ? "danger" : ""}">${icon(iconName)}</span>
        <h2 id="sheet-title">${escapeHtml(title)}</h2>
        ${text ? `<p>${escapeHtml(text)}</p>` : ""}
        <div class="confirm-actions">
          <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"} btn-block btn-lg" type="button" data-confirm="yes">${escapeHtml(confirmLabel)}</button>
          <button class="btn btn-block btn-lg" type="button" data-confirm="no">${escapeHtml(cancelLabel)}</button>
        </div>
      </div>`;
    sheetReturnFocus = document.activeElement;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    sheet.querySelector('[data-confirm="no"]').focus({ preventScroll: true });
    return new Promise((resolve) => {
      pendingConfirm = (value) => {
        pendingConfirm = null;
        resolve(value === "yes");
      };
    });
  }

  // Lista de ações em bottom sheet. Resolve com o id escolhido (ou null).
  function actionSheet({ title, text = "", actions }) {
    if (pendingConfirm) pendingConfirm(false);
    $("sheet-content").innerHTML = `
      <div class="action-sheet">
        <h2 id="sheet-title">${escapeHtml(title)}</h2>
        ${text ? `<p class="meta">${escapeHtml(text)}</p>` : ""}
        <div class="settings-list">
          ${actions
            .map(
              (a) => `
            <button class="settings-item ${a.danger ? "settings-danger" : ""}" type="button" data-confirm="${escapeHtml(a.id)}">
              <span class="settings-icon">${icon(a.icon)}</span>
              <span class="item-main"><span class="item-title">${escapeHtml(a.label)}</span>${a.hint ? `<br><span class="meta">${escapeHtml(a.hint)}</span>` : ""}</span>
            </button>`
            )
            .join("")}
        </div>
      </div>`;
    sheetReturnFocus = document.activeElement;
    sheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => sheet.classList.add("open"));
    $("sheet-content").scrollTop = 0;
    return new Promise((resolve) => {
      pendingConfirm = (value) => {
        pendingConfirm = null;
        resolve(value || null);
      };
    });
  }

  $("sheet-content").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-confirm]");
    if (!btn || !pendingConfirm) return;
    const answer = pendingConfirm;
    answer(btn.dataset.confirm);
    closeSheet();
  });

  function closeSheet(immediate = false) {
    if (sheet.classList.contains("hidden")) return;
    if (pendingConfirm) pendingConfirm(false);
    const area = $("ex-note");
    if (area && sheet.contains(area)) {
      clearTimeout(noteTimer);
      area.dispatchEvent(new Event("blur"));
    }
    sheet.classList.remove("open");
    document.body.classList.remove("sheet-open");
    const finish = () => {
      sheet.classList.add("hidden");
      $("sheet-content").innerHTML = ""; // para o vídeo
      $("sheet-content").onclick = null; // tira o clique do seletor de exercícios
    };
    if (immediate) finish();
    else setTimeout(finish, 220);
    if (!immediate && sheetReturnFocus) sheetReturnFocus.focus?.({ preventScroll: true });
  }

  app.addEventListener("click", (e) => {
    const start = e.target.closest("[data-start-workout]");
    if (start) {
      const w = Store.getWorkout(start.dataset.startWorkout);
      if (w) startWorkout(w);
      return;
    }
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
        runIndex: target.closest(".run-item")?.dataset.index,
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

  // Falha ao gravar no aparelho (espaço cheio/navegação privada): avisa no máximo 1x por minuto.
  let lastStorageWarn = 0;
  window.addEventListener("meggym:storage-error", () => {
    if (Date.now() - lastStorageWarn < 60000) return;
    lastStorageWarn = Date.now();
    toast("Não foi possível salvar no aparelho. Libere espaço ou faça um backup em Configurações.", "error");
  });

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
