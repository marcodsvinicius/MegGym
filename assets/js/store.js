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
      return false;
    }
  }

  function newId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${rand}`;
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
      style: profile.style || "suave",
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

  function saveWorkout(workout, user) {
    const list = workouts();
    const index = list.findIndex((w) => w.id === workout.id);
    let saved;
    if (index >= 0) {
      saved = list[index] = { ...list[index], ...workout, updatedAt: new Date().toISOString() };
    } else {
      saved = { ...workout, id: newId("w"), createdBy: user?.name || "", createdAt: new Date().toISOString() };
      list.push(saved);
    }
    write(KEY.workouts, list);
    return saved;
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
    return read(KEY.session + userId, null);
  }

  function startSession(userId, workoutId) {
    const value = { workoutId, startedAt: new Date().toISOString(), done: {} };
    write(KEY.session + userId, value);
    return value;
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
      saved = { ...structure, id: newId("st"), createdBy: user?.name || "", createdAt: new Date().toISOString() };
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
    return read(KEY.weightLog + userId, {})[exerciseId] || [];
  }

  function logWeight(userId, exerciseId, weight, { replace = false, date = new Date() } = {}) {
    const kg = Math.round(parseFloat(String(weight || "").replace(",", ".")) * 10) / 10;
    if (!(kg > 0)) return;
    const d = new Date(date);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const all = read(KEY.weightLog + userId, {});
    const list = all[exerciseId] || [];
    const entry = list.find((e) => e.date === day);
    if (entry) entry.weight = replace ? kg : Math.max(entry.weight, kg);
    else list.push({ date: day, weight: kg });
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

  // snapshot: lista dos exercícios feitos (nome, grupo, séries, repetições) no momento do treino.
  function finishSession(user, workout, exerciseCount, snapshot = []) {
    const current = session(user.id);
    if (!current) return null;
    const record = {
      id: newId("h"),
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
    list.push(record);
    write(KEY.history, list);
    write(KEY.session + user.id, null);
    return record;
  }

  /* ---------- Backup (arquivo .json com tudo do usuário) ---------- */

  const PER_USER = ["session", "notes", "exerciseNotes", "exerciseLoads", "weightLog", "plan", "rest"];

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

  // Restaura: o perfil e os dados dele são substituídos pelos do arquivo; treinos/estruturas/exercícios
  // que não existem no aparelho são adicionados (os que já existem ficam como estão).
  function importBackup(data) {
    if (!isBackup(data)) throw new Error("Arquivo inválido: não é um backup do MegGym.");
    const u = data.user;
    const list = users().filter((x) => x.id !== u.id);
    list.push({ ...u, onboarded: u.onboarded !== false });
    write(KEY.users, list);

    const others = read(KEY.history, []).filter((h) => h.userId !== u.id);
    write(KEY.history, [...others, ...(Array.isArray(data.history) ? data.history : [])]);

    PER_USER.forEach((k) => write(KEY[k] + u.id, data.perUser?.[k] ?? null));

    const merge = (key, items) => {
      if (!Array.isArray(items)) return;
      const current = read(key, []);
      const ids = new Set(current.map((x) => x.id));
      write(key, [...current, ...items.filter((x) => x && x.id && !ids.has(x.id))]);
    };
    merge(KEY.workouts, data.workouts);
    merge(KEY.structures, data.structures);
    merge(KEY.customExercises, data.customExercises);

    write(KEY.currentUser, u.id);
    return currentUser();
  }

  window.MegStore = {
    exportBackup,
    importBackup,
    isBackup,
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
    deleteWorkout,
    structures,
    getStructure,
    saveStructure,
    deleteStructure,
    plan,
    followStructure,
    unfollowStructure,
    applySeed,
    session,
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
    finishSession,
  };
})();
