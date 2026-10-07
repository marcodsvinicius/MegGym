/* Admin: cadastra exercícios e grupos gravando data/exercises.json no GitHub via API. */
(function () {
  "use strict";

  const { DATA_PATH, IMAGE_DIR, escapeHtml, safeUrl, safeColor, uniqueId, slugify, difficultyBadge, normalizeData, normalizeText } = window.MegGym;

  const STORAGE_KEY = "meggym.admin.config";
  const API = "https://api.github.com";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const state = {
    config: null,
    data: { groups: [], exercises: [] },
    sha: null,
    editingExerciseId: null,
    editingGroupId: null,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);

  /* ================= Configuração ================= */

  function defaultConfig() {
    // Em https://usuario.github.io/Repo/admin.html deduz usuario/Repo automaticamente.
    const host = location.hostname;
    if (host.endsWith(".github.io")) {
      const owner = host.replace(/\.github\.io$/, "");
      const first = location.pathname.split("/").filter(Boolean)[0];
      const repo = first && !first.endsWith(".html") ? first : host;
      return { owner, repo, branch: "main", token: "" };
    }
    return { owner: "marcodsvinicius", repo: "MegGym", branch: "main", token: "" };
  }

  function readConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") return { ...defaultConfig(), ...saved };
    } catch {
      /* localStorage indisponível ou corrompido */
    }
    return defaultConfig();
  }

  function writeConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      toast("Não foi possível salvar o token neste navegador (modo anônimo?). Ele vale só até fechar a aba.", "error");
    }
  }

  /* ================= Base64 / UTF-8 ================= */

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function utf8ToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  function base64ToUtf8(b64) {
    const binary = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function fileToBase64(file) {
    return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  }

  /* ================= API do GitHub ================= */

  class GitHubError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  async function gh(path, options = {}) {
    const { owner, repo, token } = state.config;
    const res = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).message || "";
      } catch {
        /* corpo vazio */
      }
      throw new GitHubError(res.status, friendlyError(res.status, detail));
    }
    return res.status === 204 ? null : res.json();
  }

  function friendlyError(status, detail) {
    switch (status) {
      case 401:
        return "Token inválido ou expirado. Gere um novo token e conecte de novo.";
      case 403:
        return "O token não tem permissão de escrita (Contents: Read and write) neste repositório.";
      case 404:
        return "Não encontrado. Confira usuário, repositório, branch e se o token tem acesso a esse repositório.";
      case 409:
      case 422:
        return "O arquivo foi alterado em outro lugar. Recarregue e tente de novo.";
      default:
        return `Erro do GitHub (${status})${detail ? `: ${detail}` : ""}.`;
    }
  }

  function contentPath(path) {
    return `/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async function getFile(path) {
    const ref = encodeURIComponent(state.config.branch);
    try {
      const file = await gh(`${contentPath(path)}?ref=${ref}`);
      let text;
      if (file.content && file.encoding === "base64") {
        text = base64ToUtf8(file.content);
      } else {
        // Arquivos acima de 1 MB vêm sem conteúdo; busca a versão "raw".
        const raw = await fetch(`${API}/repos/${encodeURIComponent(state.config.owner)}/${encodeURIComponent(state.config.repo)}${contentPath(path)}?ref=${ref}`, {
          headers: { Accept: "application/vnd.github.raw", Authorization: `Bearer ${state.config.token}` },
          cache: "no-store",
        });
        if (!raw.ok) throw new GitHubError(raw.status, friendlyError(raw.status, ""));
        text = await raw.text();
      }
      return { text, sha: file.sha };
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async function putFile(path, base64, message, sha) {
    const body = { message, content: base64, branch: state.config.branch };
    if (sha) body.sha = sha;
    const res = await gh(contentPath(path), { method: "PUT", body: JSON.stringify(body) });
    return res.content.sha;
  }

  /* ================= Carregar / salvar dados ================= */

  async function fetchRemoteData() {
    const file = await getFile(DATA_PATH);
    if (!file) {
      // Arquivo ainda não existe: garante que o repositório/branch são acessíveis.
      await gh(`/branches/${encodeURIComponent(state.config.branch)}`);
      return { data: { groups: [], exercises: [] }, sha: null };
    }
    let parsed;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      throw new Error(`O arquivo ${DATA_PATH} no GitHub não é um JSON válido. Corrija-o no GitHub antes de continuar.`);
    }
    return { data: normalizeData(parsed), sha: file.sha };
  }

  async function connect() {
    if (state.busy) return false;
    setStatus("Conectando…");
    setBusy(true);
    try {
      const { data, sha } = await fetchRemoteData();
      state.data = data;
      state.sha = sha;
      setStatus(`${state.config.owner}/${state.config.repo} · ${state.config.branch}`, "ok");
      $("config-panel").classList.add("hidden");
      $("config-toggle").classList.remove("hidden");
      $("editor").classList.remove("hidden");
      renderAll();
      if (!state.editingExerciseId) renderEquipmentChecks(readEquipmentChecks());
      return true;
    } catch (err) {
      setStatus("Erro de conexão", "err");
      toast(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Aplica `mutate` sobre uma cópia dos dados e grava. Se outra pessoa/aba alterou o
  // arquivo nesse meio tempo, recarrega e reaplica a mesma alteração uma vez.
  async function commit(mutate, message) {
    if (state.busy) return false;
    setBusy(true);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const draft = structuredClone(state.data);
        mutate(draft);
        const json = JSON.stringify(draft, null, 2) + "\n";
        try {
          state.sha = await putFile(DATA_PATH, utf8ToBase64(json), message, state.sha);
          state.data = draft;
          renderAll();
          toast("Salvo! O site atualiza em cerca de 1 minuto.", "success");
          return true;
        } catch (err) {
          if ((err.status === 409 || err.status === 422) && attempt === 0) {
            const fresh = await fetchRemoteData();
            state.data = fresh.data;
            state.sha = fresh.sha;
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      toast(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function uploadImage(file, exerciseName) {
    const ext = (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const name = `${slugify(exerciseName) || "exercicio"}-${Date.now().toString(36)}.${ext}`;
    const path = `${IMAGE_DIR}${name}`;
    await putFile(path, await fileToBase64(file), `Adiciona imagem ${name}`, null);
    return path;
  }

  /* ================= UI: utilidades ================= */

  let toastTimer;
  function toast(message, type = "") {
    const el = $("toast");
    el.textContent = message;
    el.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), type === "error" ? 7000 : 3500);
  }

  function setStatus(text, kind = "") {
    $("status-text").textContent = text;
    $("status-dot").className = `status-dot ${kind}`;
  }

  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll("button, input[type=submit]").forEach((b) => {
      if (busy) {
        b.dataset.wasDisabled = b.disabled ? "1" : "";
        b.disabled = true;
      } else if (b.dataset.wasDisabled !== undefined) {
        b.disabled = b.dataset.wasDisabled === "1";
        delete b.dataset.wasDisabled;
      }
    });
    document.body.style.cursor = busy ? "progress" : "";
  }

  function groupName(id) {
    return state.data.groups.find((g) => g.id === id)?.name || "Sem grupo";
  }

  /* ================= UI: renderização ================= */

  function renderGroupSelects() {
    const groupOptions = state.data.groups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");

    const exGroup = $("ex-group");
    const current = exGroup.value;
    exGroup.innerHTML = groupOptions || `<option value="">Cadastre um grupo primeiro</option>`;
    if (state.data.groups.some((g) => g.id === current)) exGroup.value = current;

    const listGroup = $("list-group");
    const currentFilter = listGroup.value;
    listGroup.innerHTML = `<option value="">Todos os grupos</option>${groupOptions}`;
    if (state.data.groups.some((g) => g.id === currentFilter)) listGroup.value = currentFilter;
  }

  function renderExerciseList() {
    const groupFilter = $("list-group").value;
    const q = normalizeText($("list-search").value.trim());
    const items = state.data.exercises.filter(
      (e) => (!groupFilter || e.group === groupFilter) && (!q || normalizeText(e.name).includes(q))
    );

    $("exercise-count").textContent = `(${state.data.exercises.length})`;
    $("exercise-list").innerHTML = items.length
      ? items
          .map((e) => {
            const g = state.data.groups.find((x) => x.id === e.group);
            const meta = [groupName(e.group), [e.sets, e.reps].filter(Boolean).join(" × ")].filter(Boolean).join(" · ");
            return `
              <li class="admin-item">
                <span class="group-icon" style="--group-color:${safeColor(g?.color)}" aria-hidden="true">${window.MegGym.icon(g?.icon || "fitness_center")}</span>
                <div class="admin-item-main">
                  <div class="admin-item-title"><span class="name">${escapeHtml(e.name)}</span>${difficultyBadge(e.difficulty)}</div>
                  <div class="admin-item-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="admin-item-actions">
                  <button class="btn btn-sm" type="button" data-edit-exercise="${escapeHtml(e.id)}">Editar</button>
                  <button class="btn btn-sm btn-danger" type="button" data-delete-exercise="${escapeHtml(e.id)}">Excluir</button>
                </div>
              </li>`;
          })
          .join("")
      : `<li class="state">Nenhum exercício encontrado.</li>`;
  }

  function renderGroupList() {
    $("group-list").innerHTML = state.data.groups.length
      ? state.data.groups
          .map((g) => {
            const count = state.data.exercises.filter((e) => e.group === g.id).length;
            return `
              <li class="admin-item">
                <span class="group-icon" style="--group-color:${safeColor(g.color)}" aria-hidden="true">${window.MegGym.icon(g.icon || "fitness_center")}</span>
                <div class="admin-item-main">
                  <div class="admin-item-title"><span class="name">${escapeHtml(g.name)}</span></div>
                  <div class="admin-item-meta">${count} ${count === 1 ? "exercício" : "exercícios"}</div>
                </div>
                <div class="admin-item-actions">
                  <button class="btn btn-sm" type="button" data-move-group="${escapeHtml(g.id)}" data-dir="-1" aria-label="Mover para cima">↑</button>
                  <button class="btn btn-sm" type="button" data-move-group="${escapeHtml(g.id)}" data-dir="1" aria-label="Mover para baixo">↓</button>
                  <button class="btn btn-sm" type="button" data-edit-group="${escapeHtml(g.id)}">Editar</button>
                  <button class="btn btn-sm btn-danger" type="button" data-delete-group="${escapeHtml(g.id)}">Excluir</button>
                </div>
              </li>`;
          })
          .join("")
      : `<li class="state">Nenhum grupo cadastrado.</li>`;
  }

  function renderAll() {
    renderGroupSelects();
    renderExerciseList();
    renderGroupList();
  }

  /* ================= Formulário de exercício ================= */

  const exFields = ["group", "name", "description", "sets", "reps", "rest", "difficulty", "type", "image", "video"];

  // Equipamentos: caixas de seleção montadas a partir da lista do app (common.js).
  function renderEquipmentChecks(selected = []) {
    const { EQUIPMENT } = window.MegGym;
    $("ex-equipment").innerHTML = Object.entries(EQUIPMENT)
      .map(([id, label]) => `<label class="check-chip"><input type="checkbox" name="ex-equipment" value="${id}" ${selected.includes(id) ? "checked" : ""}><span>${label}</span></label>`)
      .join("");
  }
  const readEquipmentChecks = () => [...document.querySelectorAll('input[name="ex-equipment"]:checked')].map((c) => c.value);

  function updateImagePreview() {
    const preview = $("ex-image-preview");
    const file = $("ex-image-file").files[0];
    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
      delete preview.dataset.objectUrl;
    }
    let src = "";
    if (file) {
      src = URL.createObjectURL(file);
      preview.dataset.objectUrl = src;
    } else {
      src = safeUrl($("ex-image").value);
    }
    preview.classList.toggle("hidden", !src);
    if (src) preview.src = src;
    else preview.removeAttribute("src");
  }

  function resetExerciseForm() {
    state.editingExerciseId = null;
    const keepGroup = $("ex-group").value;
    $("exercise-form").reset();
    $("ex-group").value = keepGroup;
    renderEquipmentChecks([]);
    $("exercise-form-title").textContent = "Novo exercício";
    $("exercise-submit").textContent = "Salvar exercício";
    $("exercise-cancel").classList.add("hidden");
    clearErrors($("exercise-form"));
    updateImagePreview();
  }

  function editExercise(id) {
    const ex = state.data.exercises.find((e) => e.id === id);
    if (!ex) return;
    state.editingExerciseId = id;
    exFields.forEach((f) => ($(`ex-${f}`).value = ex[f] || ""));
    if (!ex.type) $("ex-type").value = "reps";
    renderEquipmentChecks(ex.equipment || []);
    $("ex-image-file").value = "";
    $("exercise-form-title").textContent = `Editando: ${ex.name}`;
    $("exercise-submit").textContent = "Salvar alterações";
    $("exercise-cancel").classList.remove("hidden");
    clearErrors($("exercise-form"));
    updateImagePreview();
    $("exercise-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    $("ex-name").focus({ preventScroll: true });
  }

  function clearErrors(form) {
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
  }

  function fieldError(input, message) {
    const el = document.createElement("span");
    el.className = "field-error";
    el.textContent = message;
    input.closest(".field").appendChild(el);
  }

  function validateExercise(values, file) {
    const form = $("exercise-form");
    clearErrors(form);
    let ok = true;
    const fail = (field, msg) => {
      fieldError($(`ex-${field}`), msg);
      ok = false;
    };
    if (!state.data.groups.some((g) => g.id === values.group)) fail("group", "Escolha um grupo muscular.");
    if (!values.name) fail("name", "Informe o nome.");
    if (!values.description) fail("description", "Informe a descrição.");
    if (!values.reps) fail("reps", "Informe as repetições.");
    if (values.image && !safeUrl(values.image)) fail("image", "Use um link começando com https://");
    if (values.video && !safeUrl(values.video)) fail("video", "Use um link começando com https://");
    if (file) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) fail("image", "Formato não suportado (use PNG, JPG, GIF ou WEBP).");
      else if (file.size > MAX_IMAGE_BYTES) fail("image", "Arquivo maior que 5 MB.");
    }
    if (!ok) form.querySelector(".field-error")?.closest(".field")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return ok;
  }

  async function submitExercise(event) {
    event.preventDefault();
    if (state.busy) return;
    const values = {};
    exFields.forEach((f) => (values[f] = $(`ex-${f}`).value.trim()));
    values.equipment = readEquipmentChecks();
    const file = $("ex-image-file").files[0];
    if (!validateExercise(values, file)) return;

    if (file) {
      setBusy(true);
      try {
        values.image = await uploadImage(file, values.name);
      } catch (err) {
        toast(`Falha ao enviar a imagem: ${err.message}`, "error");
        return;
      } finally {
        setBusy(false);
      }
    }

    const editingId = state.editingExerciseId;
    const ok = await commit(
      (draft) => {
        if (editingId) {
          const target = draft.exercises.find((e) => e.id === editingId);
          if (!target) throw new Error("Esse exercício foi removido em outro lugar.");
          Object.assign(target, values);
        } else {
          const id = uniqueId(values.name, new Set(draft.exercises.map((e) => e.id)));
          draft.exercises.push({ id, ...values });
        }
      },
      editingId ? `Atualiza exercício: ${values.name}` : `Adiciona exercício: ${values.name}`
    );
    if (ok) resetExerciseForm();
  }

  async function deleteExercise(id) {
    const ex = state.data.exercises.find((e) => e.id === id);
    if (!ex || !confirm(`Excluir o exercício "${ex.name}"?`)) return;
    const ok = await commit((draft) => {
      draft.exercises = draft.exercises.filter((e) => e.id !== id);
    }, `Remove exercício: ${ex.name}`);
    if (ok && state.editingExerciseId === id) resetExerciseForm();
  }

  /* ================= Formulário de grupo ================= */

  function resetGroupForm() {
    state.editingGroupId = null;
    $("group-form").reset();
    $("gr-color").value = "#ff5a1f";
    $("group-form-title").textContent = "Novo grupo";
    $("group-cancel").classList.add("hidden");
    clearErrors($("group-form"));
  }

  function editGroup(id) {
    const g = state.data.groups.find((x) => x.id === id);
    if (!g) return;
    state.editingGroupId = id;
    $("gr-name").value = g.name || "";
    $("gr-icon").value = g.icon || "";
    $("gr-color").value = safeColor(g.color).length === 7 ? safeColor(g.color) : "#ff5a1f";
    $("group-form-title").textContent = `Editando: ${g.name}`;
    $("group-cancel").classList.remove("hidden");
    $("gr-name").focus();
  }

  async function submitGroup(event) {
    event.preventDefault();
    if (state.busy) return;
    clearErrors($("group-form"));
    const values = {
      name: $("gr-name").value.trim(),
      icon: $("gr-icon").value.trim() || "fitness_center",
      color: safeColor($("gr-color").value),
    };
    if (!values.name) {
      fieldError($("gr-name"), "Informe o nome.");
      return;
    }
    const editingId = state.editingGroupId;
    const ok = await commit(
      (draft) => {
        if (editingId) {
          const target = draft.groups.find((g) => g.id === editingId);
          if (!target) throw new Error("Esse grupo foi removido em outro lugar.");
          Object.assign(target, values);
        } else {
          const id = uniqueId(values.name, new Set(draft.groups.map((g) => g.id)));
          draft.groups.push({ id, ...values });
        }
      },
      editingId ? `Atualiza grupo: ${values.name}` : `Adiciona grupo: ${values.name}`
    );
    if (ok) resetGroupForm();
  }

  async function deleteGroup(id) {
    const g = state.data.groups.find((x) => x.id === id);
    if (!g) return;
    const count = state.data.exercises.filter((e) => e.group === id).length;
    if (count) {
      toast(`"${g.name}" tem ${count} exercício(s). Mova ou exclua os exercícios antes de excluir o grupo.`, "error");
      return;
    }
    if (!confirm(`Excluir o grupo "${g.name}"?`)) return;
    const ok = await commit((draft) => {
      draft.groups = draft.groups.filter((x) => x.id !== id);
    }, `Remove grupo: ${g.name}`);
    if (ok && state.editingGroupId === id) resetGroupForm();
  }

  async function moveGroup(id, dir) {
    const index = state.data.groups.findIndex((g) => g.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= state.data.groups.length) return;
    await commit((draft) => {
      const i = draft.groups.findIndex((g) => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= draft.groups.length) return;
      [draft.groups[i], draft.groups[j]] = [draft.groups[j], draft.groups[i]];
    }, `Reordena grupo: ${state.data.groups[index].name}`);
  }

  /* ================= Eventos ================= */

  function fillConfigForm(config) {
    $("cfg-owner").value = config.owner;
    $("cfg-repo").value = config.repo;
    $("cfg-branch").value = config.branch;
    $("cfg-token").value = config.token;
  }

  $("config-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.config = {
      owner: $("cfg-owner").value.trim(),
      repo: $("cfg-repo").value.trim(),
      branch: $("cfg-branch").value.trim() || "main",
      token: $("cfg-token").value.trim(),
    };
    if (await connect()) writeConfig(state.config);
  });

  $("cfg-forget").addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignorado */
    }
    state.config = defaultConfig();
    fillConfigForm(state.config);
    $("editor").classList.add("hidden");
    $("config-toggle").classList.add("hidden");
    $("config-panel").classList.remove("hidden");
    setStatus("Desconectado");
    toast("Token removido deste navegador.");
  });

  $("config-open").addEventListener("click", () => {
    $("config-panel").classList.remove("hidden");
    $("config-panel").scrollIntoView({ behavior: "smooth" });
  });
  $("config-toggle").addEventListener("click", () => $("config-panel").classList.add("hidden"));

  $("reload-btn").addEventListener("click", connect);

  document.querySelectorAll("[data-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll("[data-tab-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.tabPanel !== tab.dataset.tab));
    })
  );

  $("exercise-form").addEventListener("submit", submitExercise);
  $("exercise-cancel").addEventListener("click", resetExerciseForm);
  $("ex-image").addEventListener("input", updateImagePreview);
  $("ex-image-file").addEventListener("change", updateImagePreview);
  $("list-search").addEventListener("input", renderExerciseList);
  $("list-group").addEventListener("change", renderExerciseList);

  $("exercise-list").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit-exercise]");
    const del = e.target.closest("[data-delete-exercise]");
    if (edit) editExercise(edit.dataset.editExercise);
    if (del) deleteExercise(del.dataset.deleteExercise);
  });

  $("group-form").addEventListener("submit", submitGroup);
  $("group-cancel").addEventListener("click", resetGroupForm);
  $("group-list").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit-group]");
    const del = e.target.closest("[data-delete-group]");
    const move = e.target.closest("[data-move-group]");
    if (edit) editGroup(edit.dataset.editGroup);
    if (del) deleteGroup(del.dataset.deleteGroup);
    if (move) moveGroup(move.dataset.moveGroup, Number(move.dataset.dir));
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.busy) e.preventDefault();
  });

  /* ================= Início ================= */

  state.config = readConfig();
  fillConfigForm(state.config);
  if (state.config.token) connect();
})();
