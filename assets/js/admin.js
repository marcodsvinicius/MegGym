/* Admin: login no Supabase e cadastro de exercícios e grupos. */
(function () {
  "use strict";

  const { escapeHtml, safeUrl, safeColor, uniqueId, slugify, difficultyBadge, normalizeText, loadFromSupabase } = window.MegGym;
  const { db, signIn, signOut, uploadImage: uploadToStorage, SupabaseError } = window.Supa;

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const state = {
    data: { groups: [], exercises: [] },
    editingExerciseId: null,
    editingGroupId: null,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);

  /* ================= Dados (Supabase) ================= */

  function friendlyError(err) {
    if (err instanceof TypeError) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    if (err.status === 401) return "Sessão expirada. Entre de novo.";
    if (err.status === 403 || err.code === "42501")
      return "Seu usuário não tem permissão para editar. Confira se o seu e-mail está na tabela admins do Supabase.";
    if (err.code === "23503") return "Esse grupo ainda tem exercícios. Mova ou exclua os exercícios antes.";
    if (err.code === "23505") return "Já existe um item com esse identificador. Tente outro nome.";
    if (err.code === "23514") return "Algum valor não é aceito pelo banco (confira a dificuldade).";
    return err.message || "Erro inesperado.";
  }

  // Com RLS, um UPDATE/DELETE sem permissão não dá erro: só não altera nenhuma linha.
  function expectRows(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new SupabaseError(403, "", "42501");
    return rows;
  }

  async function reload() {
    state.data = await loadFromSupabase();
    renderAll();
  }

  // Executa uma alteração, recarrega os dados e mostra o resultado.
  async function run(action, successMessage) {
    if (state.busy) return false;
    setBusy(true);
    try {
      await action();
      await reload();
      if (successMessage) toast(successMessage, "success");
      return true;
    } catch (err) {
      toast(friendlyError(err), "error");
      if (err.status === 401) showLogin();
      return false;
    } finally {
      setBusy(false);
    }
  }

  function nextPosition(items) {
    return items.reduce((max, item) => Math.max(max, Number(item.position) || 0), -1) + 1;
  }

  async function uploadImage(file, exerciseName) {
    const ext = (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const name = `${slugify(exerciseName) || "exercicio"}-${Date.now().toString(36)}.${ext}`;
    return uploadToStorage(name, file);
  }

  /* ================= Login ================= */

  function showLogin() {
    $("editor").classList.add("hidden");
    $("login-panel").classList.remove("hidden");
    setStatus("Desconectado");
  }

  async function enter() {
    setStatus("Conectando…");
    setBusy(true);
    try {
      const me = await db("admins?select=email", { auth: true });
      await reload();
      $("login-panel").classList.add("hidden");
      $("editor").classList.remove("hidden");
      const email = window.Supa.session?.email || "";
      if (me && me.length) {
        setStatus(email, "ok");
      } else {
        setStatus(`${email} (sem permissão)`, "err");
        toast("Você entrou, mas seu e-mail não está na tabela admins. Não será possível salvar.", "error");
      }
    } catch (err) {
      toast(friendlyError(err), "error");
      if (err.status === 401) await signOut();
      showLogin();
      setStatus("Erro de conexão", "err");
    } finally {
      setBusy(false);
    }
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
    const groupOptions = state.data.groups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.icon || "")} ${escapeHtml(g.name)}</option>`).join("");

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
                <span class="group-icon" style="--group-color:${safeColor(g?.color)}" aria-hidden="true">${escapeHtml(g?.icon || "💪")}</span>
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
                <span class="group-icon" style="--group-color:${safeColor(g.color)}" aria-hidden="true">${escapeHtml(g.icon || "💪")}</span>
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

  const exFields = ["group", "name", "description", "sets", "reps", "rest", "difficulty", "image", "video"];

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
    const row = {
      group_id: values.group,
      name: values.name,
      description: values.description,
      sets: values.sets || null,
      reps: values.reps,
      rest: values.rest || null,
      difficulty: values.difficulty || null,
      image: values.image || null,
      video: values.video || null,
    };
    const ok = await run(async () => {
      if (editingId) {
        expectRows(await db(`exercises?id=eq.${encodeURIComponent(editingId)}`, { method: "PATCH", body: row, auth: true }));
      } else {
        const id = uniqueId(values.name, new Set(state.data.exercises.map((e) => e.id)));
        await db("exercises", { method: "POST", body: { id, position: nextPosition(state.data.exercises), ...row }, auth: true });
      }
    }, editingId ? "Exercício atualizado!" : "Exercício cadastrado!");
    if (ok) resetExerciseForm();
  }

  async function deleteExercise(id) {
    const ex = state.data.exercises.find((e) => e.id === id);
    if (!ex || !confirm(`Excluir o exercício "${ex.name}"?`)) return;
    const ok = await run(async () => {
      expectRows(await db(`exercises?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", auth: true }));
    }, "Exercício excluído.");
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
      icon: $("gr-icon").value.trim() || "💪",
      color: safeColor($("gr-color").value),
    };
    if (!values.name) {
      fieldError($("gr-name"), "Informe o nome.");
      return;
    }
    const editingId = state.editingGroupId;
    const ok = await run(async () => {
      if (editingId) {
        expectRows(await db(`groups?id=eq.${encodeURIComponent(editingId)}`, { method: "PATCH", body: values, auth: true }));
      } else {
        const id = uniqueId(values.name, new Set(state.data.groups.map((g) => g.id)));
        await db("groups", { method: "POST", body: { id, position: nextPosition(state.data.groups), ...values }, auth: true });
      }
    }, editingId ? "Grupo atualizado!" : "Grupo criado!");
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
    const ok = await run(async () => {
      expectRows(await db(`groups?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", auth: true }));
    }, "Grupo excluído.");
    if (ok && state.editingGroupId === id) resetGroupForm();
  }

  async function moveGroup(id, dir) {
    const order = [...state.data.groups];
    const i = order.findIndex((g) => g.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    // Regrava a posição de todos os grupos de uma vez (upsert).
    const rows = order.map((g, position) => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, position }));
    await run(async () => {
      expectRows(await db("groups?on_conflict=id", { method: "POST", body: rows, auth: true, upsert: true }));
    });
  }

  /* ================= Eventos ================= */

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    try {
      await signIn($("login-email").value.trim(), $("login-password").value);
      $("login-password").value = "";
    } catch (err) {
      toast(friendlyError(err), "error");
      return;
    } finally {
      setBusy(false);
    }
    await enter();
  });

  $("logout-btn").addEventListener("click", async () => {
    await signOut();
    showLogin();
    toast("Você saiu.");
  });

  $("reload-btn").addEventListener("click", () => run(() => Promise.resolve(), "Dados atualizados."));

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

  if (window.Supa.session) enter();
  else showLogin();
})();
