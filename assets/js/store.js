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

  // Entra com um nome. Se já existir um perfil com esse nome no aparelho, reaproveita.
  function login(name) {
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    const list = users();
    let user = list.find((u) => u.name.toLowerCase() === clean.toLowerCase());
    if (!user) {
      user = { id: newId("u"), name: clean, createdAt: new Date().toISOString() };
      list.push(user);
      write(KEY.users, list);
    }
    write(KEY.currentUser, user.id);
    return user;
  }

  function loginById(id) {
    if (!users().some((u) => u.id === id)) return null;
    write(KEY.currentUser, id);
    return currentUser();
  }

  function renameUser(id, name) {
    const list = users();
    const user = list.find((u) => u.id === id);
    if (!user) return;
    user.name = String(name).trim().replace(/\s+/g, " ");
    write(KEY.users, list);
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

  function finishSession(user, workout, exerciseCount) {
    const current = session(user.id);
    if (!current) return null;
    const record = {
      id: newId("h"),
      userId: user.id,
      userName: user.name,
      workoutId: workout.id,
      workoutName: workout.name,
      exerciseCount,
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
    login,
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
    session,
    startSession,
    toggleDone,
    cancelSession,
    history,
    finishSession,
  };
})();
