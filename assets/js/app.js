/* Site público: cards de grupos musculares e lista de exercícios. */
(function () {
  "use strict";

  const { loadData, escapeHtml, safeUrl, safeColor, youtubeId, difficultyBadge, normalizeText, DIFFICULTIES } = window.MegGym;

  const app = document.getElementById("app");
  const modal = document.getElementById("video-modal");
  const frame = document.getElementById("video-frame");
  const modalTitle = document.getElementById("video-title");

  let data = { groups: [], exercises: [] };
  const filters = { search: "", difficulty: "" };

  function exercisesOf(groupId) {
    return data.exercises.filter((e) => e.group === groupId);
  }

  function renderHome() {
    document.title = "MegGym — Exercícios por grupo muscular";
    filters.search = "";
    filters.difficulty = "";

    if (!data.groups.length) {
      app.innerHTML = `<div class="state"><span class="state-emoji">📭</span>Nenhum grupo muscular cadastrado ainda.</div>`;
      return;
    }

    const cards = data.groups
      .map((g) => {
        const count = exercisesOf(g.id).length;
        return `
          <a class="group-card" href="#/grupo/${encodeURIComponent(g.id)}" style="--group-color:${safeColor(g.color)}">
            <span class="group-icon" aria-hidden="true">${escapeHtml(g.icon || "💪")}</span>
            <span>
              <span class="group-name">${escapeHtml(g.name)}</span><br>
              <span class="group-count">${count} ${count === 1 ? "exercício" : "exercícios"}</span>
            </span>
          </a>`;
      })
      .join("");

    app.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">Qual músculo vamos treinar hoje?</h1>
        <p class="page-subtitle">Escolha um grupo muscular para ver os exercícios sugeridos.</p>
      </div>
      <nav class="group-grid" aria-label="Grupos musculares">${cards}</nav>`;
  }

  function exerciseCard(ex) {
    const img = safeUrl(ex.image);
    const video = safeUrl(ex.video);
    const media = img
      ? `<img src="${escapeHtml(img)}" alt="Demonstração: ${escapeHtml(ex.name)}" loading="lazy">`
      : `<span aria-hidden="true">🏋️</span>`;

    const stats = [
      ["Séries", ex.sets],
      ["Repetições", ex.reps],
      ["Descanso", ex.rest],
    ]
      .filter(([, v]) => v)
      .map(([label, v]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${escapeHtml(v)}</span></div>`)
      .join("");

    let action = "";
    if (video) {
      action = youtubeId(video)
        ? `<button class="btn btn-primary" type="button" data-video="${escapeHtml(video)}" data-title="${escapeHtml(ex.name)}">▶ Ver vídeo</button>`
        : `<a class="btn btn-primary" href="${escapeHtml(video)}" target="_blank" rel="noopener noreferrer">▶ Ver vídeo</a>`;
    }

    return `
      <article class="exercise-card">
        <div class="exercise-media${img ? "" : " exercise-media--empty"}">${media}</div>
        <div class="exercise-body">
          <div class="exercise-title">
            <h3>${escapeHtml(ex.name)}</h3>
            ${difficultyBadge(ex.difficulty)}
          </div>
          ${stats ? `<div class="stats">${stats}</div>` : ""}
          ${ex.description ? `<p class="exercise-desc">${escapeHtml(ex.description)}</p>` : ""}
          ${action ? `<div class="exercise-actions">${action}</div>` : ""}
        </div>
      </article>`;
  }

  function renderExerciseList(group) {
    const list = document.getElementById("exercise-list");
    const q = normalizeText(filters.search.trim());
    const items = exercisesOf(group.id).filter(
      (e) =>
        (!filters.difficulty || e.difficulty === filters.difficulty) &&
        (!q || normalizeText(e.name).includes(q) || normalizeText(e.description).includes(q))
    );

    if (!exercisesOf(group.id).length) {
      list.innerHTML = `<div class="state"><span class="state-emoji">📝</span>Ainda não há exercícios para ${escapeHtml(group.name)}.<br><a href="admin.html">Cadastrar o primeiro</a></div>`;
    } else if (!items.length) {
      list.innerHTML = `<div class="state"><span class="state-emoji">🔍</span>Nenhum exercício encontrado com esses filtros.</div>`;
    } else {
      list.innerHTML = `<div class="exercise-grid">${items.map(exerciseCard).join("")}</div>`;
    }
  }

  function renderGroup(groupId) {
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) {
      app.innerHTML = `<a class="back-link" href="#/">← Grupos</a><div class="state"><span class="state-emoji">🤔</span>Grupo muscular não encontrado.</div>`;
      return;
    }
    document.title = `${group.name} — MegGym`;

    const chips = [["", "Todos"], ...Object.entries(DIFFICULTIES)]
      .map(([value, label]) => `<button class="chip" type="button" data-difficulty="${value}" aria-pressed="${filters.difficulty === value}">${label}</button>`)
      .join("");

    app.innerHTML = `
      <a class="back-link" href="#/">← Grupos</a>
      <div class="group-head" style="--group-color:${safeColor(group.color)}">
        <span class="group-icon" aria-hidden="true">${escapeHtml(group.icon || "💪")}</span>
        <div>
          <h1 class="page-title">${escapeHtml(group.name)}</h1>
          <p class="page-subtitle">${exercisesOf(group.id).length} exercícios</p>
        </div>
      </div>
      <div class="toolbar">
        <label class="search">
          <span class="visually-hidden">Buscar exercício</span>
          <input class="input" id="search" type="search" placeholder="Buscar exercício…" value="${escapeHtml(filters.search)}">
        </label>
        <div class="chips" role="group" aria-label="Filtrar por dificuldade">${chips}</div>
      </div>
      <div id="exercise-list"></div>`;

    document.getElementById("search").addEventListener("input", (e) => {
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

  function route() {
    const match = location.hash.match(/^#\/grupo\/([^/?]+)/);
    if (match) {
      renderGroup(decodeURIComponent(match[1]));
    } else {
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- Modal de vídeo ---------- */
  function openVideo(url, title) {
    const id = youtubeId(url);
    if (!id) return;
    modalTitle.textContent = title || "Vídeo";
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
    modal.classList.remove("hidden");
    modal.querySelector("[data-close-modal]").focus();
  }

  function closeVideo() {
    frame.src = "about:blank";
    modal.classList.add("hidden");
  }

  app.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-video]");
    if (btn) openVideo(btn.dataset.video, btn.dataset.title);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close-modal]")) closeVideo();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeVideo();
  });

  /* ---------- Início ---------- */
  loadData()
    .then((d) => {
      data = d;
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((err) => {
      app.innerHTML = `<div class="state"><span class="state-emoji">⚠️</span>${escapeHtml(err.message)}<br><button class="btn" type="button" onclick="location.reload()">Tentar novamente</button></div>`;
    });
})();
