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
    const fresh = seed.workouts.map((w) => ({ ...w, createdBy: w.createdBy || "MegGym", createdAt: now }));
    const kept = seed.replaceExisting ? [] : workouts().filter((w) => !fresh.some((f) => f.id === w.id));
    write(KEY.workouts, [...fresh, ...kept]);
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

  function cancelSession(userId) {
    write(KEY.session + userId, null);
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

  window.MegStore = {
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
    applySeed,
    session,
    startSession,
    toggleDone,
    cancelSession,
    history,
    getHistory,
    finishSession,
  };
})();
