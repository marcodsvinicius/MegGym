/* Dados salvos no próprio aparelho (localStorage): perfis, exercícios criados pelos
   usuários, treinos, treino em andamento e histórico. Depois isso vai para o Supabase. */
(function () {
  "use strict";

  const KEY = {
    users: "meggym.users",
    currentUser: "meggym.currentUser",
    customExercises: "meggym.customExercises",
    workouts: "meggym.workouts",
    history: "meggym.history",
    session: "meggym.session.", // + id do usuário
    seed: "meggym.workoutsSeed",
    notes: "meggym.notes.", // (antigo) + id do usuário → { [workoutId]: texto }
    exerciseNotes: "meggym.exnotes.", // + id do usuário → { [exerciseId]: texto }
    exerciseLoads: "meggym.exloads.", // + id do usuário → { [exerciseId]: { weight, band } }
    weightLog: "meggym.wlog.", // + id do usuário → { [exerciseId]: [{ date: "AAAA-MM-DD", weight }] }
    structures: "meggym.structures",
    rest: "meggym.rest.", // + id do usuário → fim do descanso em andamento { end, total }
    saved: "meggym.saved.", // + id do usuário → { workouts: [ids], structures: [ids] }
    plan: "meggym.plan.", // + id do usuário → { structureId, startedAt }
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Armazenamento cheio ou bloqueado: avisa o app para mostrar um alerta.
      try { window.dispatchEvent(new CustomEvent("meggym:storage-error")); } catch {}
      return false;
    }
  }

  function newId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${rand}`;
  }

  // Prepara tudo antes de gravar e desfaz as gravações anteriores se alguma falhar.
  function writeBatch(entries) {
    const previous = [];
    try {
      const prepared = entries.map(([key, value]) => [key, value == null ? null : JSON.stringify(value)]);
      const originals = prepared.map(([key]) => localStorage.getItem(key));
      prepared.forEach(([key, raw], i) => {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
        previous.push([key, originals[i]]);
      });
      return true;
    } catch {
      previous.reverse().forEach(([key, raw]) => {
        try {
          if (raw === null) localStorage.removeItem(key);
          else localStorage.setItem(key, raw);
        } catch { /* mantém o aviso de falha; nunca informa sucesso */ }
      });
      try { window.dispatchEvent(new CustomEvent("meggym:storage-error")); } catch {}
      return false;
    }
  }

  /* ---------- Usuários ---------- */

  function users() {
    return read(KEY.users, []);
  }

  function currentUser() {
    const id = read(KEY.currentUser, null);
    return users().find((u) => u.id === id) || null;
  }

  function findByName(name) {
    const clean = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
    return users().find((u) => u.name.toLowerCase() === clean) || null;
  }

  // Cria um perfil (fim do onboarding) e entra com ele.
  function createUser(profile) {
    const list = users();
    const user = {
      id: newId("u"),
      name: String(profile.name).trim().replace(/\s+/g, " "),
      age: profile.age ?? null,
      sex: profile.sex || "",
      equipment: profile.equipment || [],
      style: ["energia", "esportivo", "pink-money", "arcade"].includes(profile.style) ? profile.style : "energia",
      onboarded: true,
      createdAt: new Date().toISOString(),
    };
    list.push(user);
    write(KEY.users, list);
    write(KEY.currentUser, user.id);
    return user;
  }

  function updateUser(id, changes) {
    const list = users();
    const user = list.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, changes);
    if (changes.name) user.name = String(changes.name).trim().replace(/\s+/g, " ");
    write(KEY.users, list);
    return user;
  }

  function loginById(id) {
    if (!users().some((u) => u.id === id)) return null;
    write(KEY.currentUser, id);
    return currentUser();
  }

  function renameUser(id, name) {
    updateUser(id, { name });
  }

  function logout() {
    write(KEY.currentUser, null);
  }

  /* ---------- Exercícios criados pelos usuários ---------- */

  function customExercises() {
    return read(KEY.customExercises, []);
  }

  function saveExercise(exercise, user) {
    const list = customExercises();
    const index = list.findIndex((e) => e.id === exercise.id);
    if (index >= 0) {
      list[index] = { ...list[index], ...exercise, updatedAt: new Date().toISOString() };
    } else {
      list.push({
        ...exercise,
        id: newId("ex"),
        custom: true,
        createdBy: user?.name || "",
        createdAt: new Date().toISOString(),
      });
    }
    write(KEY.customExercises, list);
  }

  function deleteExercise(id) {
    write(KEY.customExercises, customExercises().filter((e) => e.id !== id));
  }

  /* ---------- Treinos (compartilhados entre os perfis do aparelho) ---------- */

  function workouts() {
    return read(KEY.workouts, []);
  }

  function getWorkout(id) {
    return workouts().find((w) => w.id === id) || null;
  }

  /* Dono e visibilidade: "meus treinos" (privados ou públicos) e "comunidade" (públicos dos outros).
     Treinos antigos sem dono: os de fábrica são do MegGym; os criados no app ficam do perfil com o
     mesmo nome de quem criou e continuam públicos (antes todos eram compartilhados). */
  const MEGGYM = "meggym";

  function ownerOf(w) {
    if (w.ownerId) return w.ownerId;
    if (!w.createdBy || w.createdBy === "MegGym") return MEGGYM;
    return users().find((u) => u.name === w.createdBy)?.id || MEGGYM;
  }

  function visibilityOf(w) {
    return w.visibility === "private" ? "private" : "public";
  }

  function canSeeWorkout(w, userId) {
    return ownerOf(w) === userId || visibilityOf(w) === "public";
  }

  function visibleWorkouts(userId) {
    return workouts().filter((w) => canSeeWorkout(w, userId));
  }

  // Copia um treino (da comunidade) para os treinos do usuário, como privado.
  function copyWorkout(id, user) {
    const src = getWorkout(id);
    if (!src) return null;
    const { id: _id, ownerId, createdBy, createdAt, updatedAt, ...data } = src;
    return saveWorkout({ ...data, visibility: "private", copiedFrom: src.id, copiedFromName: src.name, copiedFromAuthor: createdBy || "MegGym" }, user);
  }

  function saveWorkout(workout, user) {
    const list = workouts();
    const index = list.findIndex((w) => w.id === workout.id);
    let saved;
    if (index >= 0) {
      // Sessões anteriores à v57 também precisam congelar a ficha antes de editá-la.
      for (const u of users()) {
        const active = read(KEY.session + u.id, null);
        if (active?.workoutId === workout.id && !active.workout) {
          if (!write(KEY.session + u.id, { ...active, workout: list[index] })) return null;
        }
      }
      saved = list[index] = { ...list[index], ...workout, updatedAt: new Date().toISOString() };
    } else {
      saved = { visibility: "private", ...workout, id: newId("w"), ownerId: user?.id || MEGGYM, createdBy: user?.name || "", createdAt: new Date().toISOString() };
      list.push(saved);
    }
    return write(KEY.workouts, list) ? saved : null;
  }

  // Treinos que vêm com o app (data/workouts.json). Aplicado uma vez por versão.
  // replaceExisting: apaga os treinos salvos no aparelho e deixa só os do arquivo.
  function applySeed(seed) {
    if (!seed || !Array.isArray(seed.workouts)) return false;
    if (read(KEY.seed, 0) >= seed.version) return false;
    const now = new Date().toISOString();
    const current = workouts();
    // Sem replaceExisting: só adiciona os treinos que ainda não existem (não mexe nos já salvos/editados).
    const fresh = seed.workouts
      .filter((w) => seed.replaceExisting || !current.some((c) => c.id === w.id))
      .map((w) => ({ ...w, createdBy: w.createdBy || "MegGym", createdAt: now }));
    write(KEY.workouts, seed.replaceExisting ? fresh : [...current, ...fresh]);
    if (Array.isArray(seed.structures)) {
      const currentStructures = structures();
      // "update": atualiza a estrutura de fábrica se o usuário ainda não a editou.
      const updated = currentStructures.map((c) => {
        const fromSeed = seed.structures.find((st) => st.id === c.id);
        if (!fromSeed?.update || c.updatedAt) return c;
        const { update, ...data } = fromSeed;
        return { ...c, ...data };
      });
      const newStructures = seed.structures
        .filter((st) => !currentStructures.some((c) => c.id === st.id))
        .map(({ update, ...st }) => ({ ...st, createdBy: st.createdBy || "MegGym", createdAt: now }));
      write(KEY.structures, [...updated, ...newStructures]);
    }
    if (seed.replaceExisting) {
      // Treino em andamento de um treino apagado não faz mais sentido.
      users().forEach((u) => {
        const s = session(u.id);
        if (s && !fresh.some((f) => f.id === s.workoutId)) write(KEY.session + u.id, null);
      });
    }
    write(KEY.seed, seed.version);
    return true;
  }

  function deleteWorkout(id) {
    write(KEY.workouts, workouts().filter((w) => w.id !== id));
  }

  /* ---------- Treino em andamento (um por usuário) ---------- */

  function session(userId) {
    const value = read(KEY.session + userId, null);
    if (value && !value.workout) {
      const workout = getWorkout(value.workoutId);
      if (workout) {
        value.workout = workout;
        write(KEY.session + userId, value);
      }
    }
    return value;
  }

  function sessionWorkout(userId, workoutId) {
    const active = session(userId);
    return active && (!workoutId || active.workoutId === workoutId)
      ? active.workout || getWorkout(active.workoutId)
      : getWorkout(workoutId);
  }

  function startSession(userId, workoutId) {
    const workout = getWorkout(workoutId);
    if (!workout) return null;
    const value = { id: newId("session"), workoutId, workout, startedAt: new Date().toISOString(), done: {} };
    return write(KEY.session + userId, value) ? value : null;
  }

  function toggleDone(userId, index) {
    const value = session(userId);
    if (!value) return null;
    if (value.done[index]) delete value.done[index];
    else value.done[index] = true;
    write(KEY.session + userId, value);
    return value;
  }

  // Séries registradas durante o treino: sets[index do item] = [{ reps, weight, done }].
  function saveSets(userId, index, sets) {
    const value = session(userId);
    if (!value) return null;
    value.sets = { ...(value.sets || {}), [index]: sets };
    write(KEY.session + userId, value);
    return value;
  }

  function setDone(userId, index, done) {
    const value = session(userId);
    if (!value) return null;
    if (done) value.done[index] = true;
    else delete value.done[index];
    write(KEY.session + userId, value);
    return value;
  }

  // Ordem, pulos e trocas do treino em andamento (chaves = índice original do item).
  function updateSession(userId, changes) {
    const value = session(userId);
    if (!value) return null;
    Object.assign(value, changes);
    write(KEY.session + userId, value);
    return value;
  }

  function restState(userId) {
    return read(KEY.rest + userId, null);
  }

  function saveRest(userId, value) {
    write(KEY.rest + userId, value);
  }

  function cancelSession(userId) {
    write(KEY.session + userId, null);
  }

  /* ---------- Estruturas de treino (compartilhadas) ---------- */

  function structures() {
    return read(KEY.structures, []);
  }

  function getStructure(id) {
    return structures().find((st) => st.id === id) || null;
  }

  function saveStructure(structure, user) {
    const list = structures();
    const index = list.findIndex((st) => st.id === structure.id);
    let saved;
    if (index >= 0) {
      saved = list[index] = { ...list[index], ...structure, updatedAt: new Date().toISOString() };
    } else {
      saved = { visibility: "private", ...structure, id: newId("st"), ownerId: user?.id || MEGGYM, createdBy: user?.name || "", createdAt: new Date().toISOString() };
      list.push(saved);
    }
    write(KEY.structures, list);
    return saved;
  }

  function deleteStructure(id) {
    write(KEY.structures, structures().filter((st) => st.id !== id));
    users().forEach((u) => {
      if (plan(u.id)?.structureId === id) write(KEY.plan + u.id, null);
    });
  }

  /* ---------- Estrutura que o usuário está seguindo ---------- */

  function plan(userId) {
    return read(KEY.plan + userId, null);
  }

  // Seguir um treino avulso (sem divisão) como "Meu Treino".
  function followWorkout(userId, workoutId) {
    const value = { workoutId, startedAt: new Date().toISOString() };
    write(KEY.plan + userId, value);
    return value;
  }

  function visibleStructures(userId) {
    return structures().filter((st) => canSeeWorkout(st, userId));
  }

  function copyStructure(id, user) {
    const src = getStructure(id);
    if (!src) return null;
    const { id: _id, ownerId, createdBy, createdAt, updatedAt, ...data } = src;
    return saveStructure({ ...data, visibility: "private", copiedFrom: src.id, copiedFromName: src.name, copiedFromAuthor: createdBy || "MegGym" }, user);
  }

  /* ---------- Salvos (favoritos do usuário) ---------- */

  function saved(userId) {
    const v = read(KEY.saved + userId, null) || {};
    return { workouts: v.workouts || [], structures: v.structures || [] };
  }

  function isSaved(userId, kind, id) {
    return saved(userId)[kind].includes(id);
  }

  function toggleSaved(userId, kind, id) {
    const v = saved(userId);
    v[kind] = v[kind].includes(id) ? v[kind].filter((x) => x !== id) : [id, ...v[kind]];
    write(KEY.saved + userId, v);
    return v[kind].includes(id);
  }

  function followStructure(userId, structureId) {
    const value = { structureId, startedAt: new Date().toISOString() };
    write(KEY.plan + userId, value);
    return value;
  }

  function unfollowStructure(userId) {
    write(KEY.plan + userId, null);
  }

  /* ---------- Observações pessoais (só do usuário) ---------- */

  function note(userId, workoutId) {
    return read(KEY.notes + userId, {})[workoutId] || "";
  }

  function saveNote(userId, workoutId, text) {
    const all = read(KEY.notes + userId, {});
    const clean = String(text || "").trim();
    if (clean) all[workoutId] = clean;
    else delete all[workoutId];
    write(KEY.notes + userId, all);
  }

  function exerciseNote(userId, exerciseId) {
    return read(KEY.exerciseNotes + userId, {})[exerciseId] || "";
  }

  function saveExerciseNote(userId, exerciseId, text) {
    const all = read(KEY.exerciseNotes + userId, {});
    const clean = String(text || "").trim();
    if (clean) all[exerciseId] = clean;
    else delete all[exerciseId];
    write(KEY.exerciseNotes + userId, all);
  }

  // Histórico de pesos: um registro por dia (fica o maior peso do dia; replace troca o do dia).
  function weightLog(userId, exerciseId) {
    const stored = read(KEY.weightLog + userId, {})[exerciseId] || [];
    const byDay = new Map(stored.map((e) => [e.date, { date: e.date, weight: e.weight }]));
    history(userId).forEach((h) => (h.exercises || []).filter((e) => e.exerciseId === exerciseId).forEach((e) => {
      const kg = Math.max(0, ...(e.setLog || []).filter((s) => s.done !== false).map((s) => Number(String(s.weight || "").replace(",", ".")) || 0));
      if (!kg) return;
      const date = localDay(h.finishedAt);
      byDay.set(date, { date, weight: Math.max(byDay.get(date)?.weight || 0, kg) });
    }));
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function localDay(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Antes da v57, cargas manuais e resultados de sessões ocupavam a mesma lista.
  // Remove somente entradas legadas que correspondem ao máximo realizado naquele dia.
  function manualWeightLog(userId, oldHistory) {
    const all = read(KEY.weightLog + userId, {});
    const performed = {};
    oldHistory.filter((h) => h.userId === userId).forEach((h) => (h.exercises || []).forEach((e) => {
      const day = localDay(h.finishedAt);
      const key = `${e.exerciseId}:${day}`;
      performed[key] = Math.max(performed[key] || 0, ...(e.setLog || []).map((s) => Number(String(s.weight || "").replace(",", ".")) || 0));
    }));
    Object.keys(all).forEach((id) => {
      all[id] = all[id].filter((e) => e.source === "manual" || e.weight !== performed[`${id}:${e.date}`]);
    });
    return all;
  }

  function logWeight(userId, exerciseId, weight, { replace = false, date = new Date() } = {}) {
    const kg = Math.round(parseFloat(String(weight || "").replace(",", ".")) * 10) / 10;
    if (!(kg > 0)) return;
    const day = localDay(date);
    const all = read(KEY.weightLog + userId, {});
    const list = all[exerciseId] || [];
    const entry = list.find((e) => e.date === day);
    if (entry) Object.assign(entry, { weight: replace ? kg : Math.max(entry.weight, kg), source: "manual" });
    else list.push({ date: day, weight: kg, source: "manual" });
    list.sort((a, b) => a.date.localeCompare(b.date));
    all[exerciseId] = list;
    write(KEY.weightLog + userId, all);
  }

  // Carga que o usuário usa em cada exercício: peso (kg) e/ou cor do elástico.
  function exerciseLoad(userId, exerciseId) {
    return read(KEY.exerciseLoads + userId, {})[exerciseId] || { weight: "", band: "" };
  }

  function saveExerciseLoad(userId, exerciseId, changes) {
    const all = read(KEY.exerciseLoads + userId, {});
    const next = { ...(all[exerciseId] || { weight: "", band: "" }), ...changes };
    next.weight = String(next.weight || "").trim();
    if (!next.weight && !next.band) delete all[exerciseId];
    else all[exerciseId] = { ...next, updatedAt: new Date().toISOString() };
    write(KEY.exerciseLoads + userId, all);
  }

  /* ---------- Histórico ---------- */

  function history(userId) {
    return read(KEY.history, [])
      .filter((h) => !userId || h.userId === userId)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  }

  function getHistory(id) {
    return read(KEY.history, []).find((h) => h.id === id) || null;
  }

  function updateHistory(id, changes) {
    const list = read(KEY.history, []);
    const record = list.find((h) => h.id === id);
    if (!record) return null;
    const manual = manualWeightLog(record.userId, list);
    Object.assign(record, changes, { updatedAt: new Date().toISOString() });
    return writeBatch([[KEY.weightLog + record.userId, manual], [KEY.history, list]]) ? record : null;
  }

  function deleteHistory(id) {
    const list = read(KEY.history, []);
    const record = list.find((h) => h.id === id);
    if (!record) return false;
    return writeBatch([[KEY.weightLog + record.userId, manualWeightLog(record.userId, list)], [KEY.history, list.filter((h) => h.id !== id)]]);
  }

  // snapshot: lista dos exercícios feitos (nome, grupo, séries, repetições) no momento do treino.
  function finishSession(user, workout, exerciseCount, snapshot = []) {
    const current = session(user.id);
    if (!current) return null;
    const record = {
      id: newId("h"),
      sessionId: current.id || `${user.id}:${current.startedAt}`,
      userId: user.id,
      userName: user.name,
      workoutId: workout.id,
      workoutName: workout.name,
      exerciseCount,
      workoutDescription: workout.description || "",
      exercises: snapshot,
      startedAt: current.startedAt,
      finishedAt: new Date().toISOString(),
    };
    const list = read(KEY.history, []);
    const existing = list.find((h) => h.sessionId === record.sessionId);
    if (existing) return write(KEY.session + user.id, null) ? existing : null;
    list.push(record);
    const loads = read(KEY.exerciseLoads + user.id, {});
    snapshot.forEach((e) => {
      const max = Number(String(e.setLog?.[0]?.weight || "").replace(",", ".")) || Math.max(0, ...(e.setLog || []).map((s) => Number(String(s.weight || "").replace(",", ".")) || 0));
      if (max) loads[e.exerciseId] = { ...(loads[e.exerciseId] || {}), weight: String(Math.round(max * 10) / 10).replace(".", ","), updatedAt: record.finishedAt };
    });
    return writeBatch([[KEY.history, list], [KEY.exerciseLoads + user.id, loads], [KEY.session + user.id, null]]) ? record : null;
  }

  /* ---------- Backup (arquivo .json com tudo do usuário) ---------- */

  const PER_USER = ["session", "notes", "exerciseNotes", "exerciseLoads", "weightLog", "plan", "rest", "saved"];

  function exportBackup(userId) {
    const user = users().find((u) => u.id === userId);
    if (!user) return null;
    const perUser = {};
    PER_USER.forEach((k) => (perUser[k] = read(KEY[k] + userId, null)));
    const createdAt = new Date().toISOString();
    updateUser(userId, { lastBackupAt: createdAt });
    return {
      app: "MegGym",
      kind: "backup",
      version: 1,
      createdAt,
      user: { ...user, lastBackupAt: createdAt },
      history: read(KEY.history, []).filter((h) => h.userId === userId),
      perUser,
      // Treinos, estruturas e exercícios criados ficam junto para o histórico fazer sentido em outro aparelho.
      workouts: workouts(),
      structures: structures(),
      customExercises: customExercises(),
    };
  }

  function isBackup(data) {
    return Boolean(data && data.app === "MegGym" && data.kind === "backup" && data.user && data.user.id && data.user.name);
  }

  function validateBackup(data) {
    const fail = () => { throw new Error("Backup inválido ou incompatível. Os dados deste aparelho não foram alterados."); };
    const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    const text = (v) => typeof v === "string";
    const id = (v) => text(v) && v.length > 0 && !["__proto__", "constructor", "prototype"].includes(v);
    const date = (v) => {
      if (!text(v) || !/^\d{4}-\d\d-\d\dT/.test(v) || !Number.isFinite(Date.parse(v))) return false;
      const day = v.slice(0, 10);
      return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
    };
    const strings = (v) => Array.isArray(v) && v.every(text);
    const optionalText = (v) => v == null || text(v);
    const sets = (v) => Array.isArray(v) && v.every((s) => object(s) && optionalText(s.reps) && optionalText(s.weight) && (s.done == null || typeof s.done === "boolean"));
    const collection = (v, check) => {
      if (v == null) return;
      if (!Array.isArray(v)) fail();
      const ids = new Set();
      v.forEach((x) => {
        if (!object(x) || !id(x.id) || ids.has(x.id) || !check(x)) fail();
        ids.add(x.id);
      });
    };
    const item = (x) => object(x) && id(x.exerciseId) && [x.sets, x.reps, x.load, x.rir, x.rest].every(optionalText);
    const workout = (w) => id(w.id) && text(w.name) && Array.isArray(w.items) && w.items.every(item);
    if (!isBackup(data) || !object(data.user) || !id(data.user.id) || !text(data.user.name) || !data.user.name.trim()) fail();
    if (data.version != null && data.version !== 1) fail();
    if (data.createdAt != null && !date(data.createdAt)) fail();
    if (data.user.equipment != null && !strings(data.user.equipment)) fail();
    collection(data.workouts, workout);
    collection(data.structures, (st) => text(st.name) && strings(st.workoutIds) && (st.duration == null || Number.isFinite(Number(st.duration))));
    collection(data.customExercises, (ex) => text(ex.name) && id(ex.group) && (ex.equipment == null || strings(ex.equipment)) && (ex.equipmentAny == null || strings(ex.equipmentAny)));
    collection(data.history, (h) => h.userId === data.user.id && id(h.workoutId) && text(h.workoutName) && date(h.startedAt) && date(h.finishedAt)
      && Date.parse(h.startedAt) <= Date.parse(h.finishedAt) && Number.isInteger(h.exerciseCount) && h.exerciseCount >= 0
      && (h.exercises == null || (Array.isArray(h.exercises) && h.exercises.every((e) => item(e) && text(e.name) && id(e.group) && (e.setLog == null || sets(e.setLog))))));
    const p = data.perUser ?? {};
    if (!object(p)) fail();
    PER_USER.forEach((k) => { if (p[k] != null && !object(p[k])) fail(); });
    for (const k of ["notes", "exerciseNotes"]) {
      if (p[k] && !Object.entries(p[k]).every(([key, value]) => id(key) && text(value))) fail();
    }
    if (p.exerciseLoads && !Object.entries(p.exerciseLoads).every(([key, v]) => id(key) && object(v) && optionalText(v.weight) && optionalText(v.band))) fail();
    if (p.weightLog && !Object.entries(p.weightLog).every(([key, rows]) => id(key) && Array.isArray(rows) && rows.every((r) => {
      if (!object(r) || !text(r.date) || !/^\d{4}-\d\d-\d\d$/.test(r.date) || !Number.isFinite(r.weight) || r.weight <= 0) return false;
      const d = new Date(`${r.date}T00:00:00Z`);
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === r.date;
    }))) fail();
    if (p.saved && [p.saved.workouts, p.saved.structures].some((v) => v != null && !strings(v))) fail();
    if (p.plan && (!date(p.plan.startedAt) || (!id(p.plan.workoutId) && !id(p.plan.structureId)))) fail();
    if (p.rest && (!Number.isFinite(p.rest.end) || !Number.isFinite(p.rest.total) || p.rest.total <= 0)) fail();
    if (p.session) {
      const s = p.session;
      const w = s.workout || (data.workouts || []).find((x) => x.id === s.workoutId) || getWorkout(s.workoutId);
      if (!id(s.workoutId) || !date(s.startedAt) || !w || !workout(w) || w.id !== s.workoutId || !object(s.done)) fail();
      const index = (k) => /^(0|[1-9]\d*)$/.test(k) && Number(k) < w.items.length;
      if (!Object.entries(s.done).every(([k, v]) => index(k) && typeof v === "boolean")) fail();
      for (const k of ["sets", "swaps", "skipped"]) if (s[k] != null && !object(s[k])) fail();
      if (s.sets && !Object.entries(s.sets).every(([k, v]) => index(k) && sets(v))) fail();
      if (s.swaps && !Object.entries(s.swaps).every(([k, v]) => index(k) && id(v))) fail();
      if (s.skipped && !Object.entries(s.skipped).every(([k, v]) => index(k) && typeof v === "boolean")) fail();
      if (s.order != null && (!Array.isArray(s.order) || new Set(s.order).size !== s.order.length || !s.order.every((n) => Number.isInteger(n) && n >= 0 && n < w.items.length))) fail();
    }
    return true;
  }

  // Restaura: o perfil e os dados dele são substituídos pelos do arquivo; treinos/estruturas/exercícios
  // que não existem no aparelho são adicionados (os que já existem ficam como estão).
  function importBackup(data) {
    validateBackup(data);
    const u = data.user;
    const list = users().filter((x) => x.id !== u.id);
    list.push({ ...u, onboarded: u.onboarded !== false });
    const others = read(KEY.history, []).filter((h) => h.userId !== u.id);
    const entries = [[KEY.users, list], [KEY.history, [...others, ...(data.history || [])]]];
    PER_USER.forEach((k) => entries.push([KEY[k] + u.id, data.perUser?.[k] ?? null]));
    const merge = (key, items) => {
      if (!Array.isArray(items)) return;
      const current = read(key, []);
      const ids = new Set(current.map((x) => x.id));
      entries.push([key, [...current, ...items.filter((x) => !ids.has(x.id))]]);
    };
    merge(KEY.workouts, data.workouts);
    merge(KEY.structures, data.structures);
    merge(KEY.customExercises, data.customExercises);

    entries.push([KEY.currentUser, u.id]);
    if (!writeBatch(entries)) throw new Error("Não foi possível restaurar o backup. Libere espaço e tente novamente.");
    return currentUser();
  }

  window.MegStore = {
    exportBackup,
    importBackup,
    isBackup,
    validateBackup,
    users,
    currentUser,
    findByName,
    createUser,
    updateUser,
    loginById,
    renameUser,
    logout,
    customExercises,
    saveExercise,
    deleteExercise,
    workouts,
    getWorkout,
    saveWorkout,
    ownerOf,
    visibilityOf,
    canSeeWorkout,
    visibleWorkouts,
    copyWorkout,
    deleteWorkout,
    structures,
    getStructure,
    saveStructure,
    deleteStructure,
    plan,
    followStructure,
    followWorkout,
    visibleStructures,
    copyStructure,
    saved,
    isSaved,
    toggleSaved,
    unfollowStructure,
    applySeed,
    session,
    sessionWorkout,
    startSession,
    toggleDone,
    saveSets,
    updateSession,
    restState,
    saveRest,
    setDone,
    cancelSession,
    history,
    note,
    saveNote,
    exerciseNote,
    saveExerciseNote,
    exerciseLoad,
    weightLog,
    logWeight,
    saveExerciseLoad,
    getHistory,
    updateHistory,
    deleteHistory,
    finishSession,
  };
})();

