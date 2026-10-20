import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/store.js", import.meta.url), "utf8");

function setup() {
  const values = new Map();
  const blocked = new Set();
  let blockedRemove = "";
  const context = {
    window: { dispatchEvent() {} }, CustomEvent: class {},
    localStorage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => { if (blocked.has(k)) throw Error("QuotaExceededError"); values.set(k, v); },
      removeItem: (k) => { if (k === blockedRemove) throw Error("SecurityError"); values.delete(k); },
    },
  };
  vm.runInNewContext(source, context);
  const s = context.window.MegStore;
  const u = s.createUser({ name: "Teste integridade", equipment: ["halter"] });
  const w = s.saveWorkout({ name: "Ficha original", items: [
    { exerciseId: "goblet-squat", sets: "3", reps: "8-12", rest: "90s" },
    { exerciseId: "flexao", sets: "2", reps: "10", rest: "60s" },
  ] }, u);
  const snapshot = (weight = "20") => [{ exerciseId: "goblet-squat", name: "Agachamento", group: "quadriceps", sets: "1", reps: "10", setLog: [{ reps: "10", weight, done: true }] }];
  const finish = (weight = "20") => {
    s.startSession(u.id, w.id);
    return s.finishSession(u, w, 1, snapshot(weight));
  };
  return { s, u, w, values, blocked, snapshot, finish, blockRemoval: (k) => { blockedRemove = k; } };
}

for (const failure of ["history", "loads", "session-remove"]) {
  test(`finalização preserva séries e permite tentar novamente após falha em ${failure}`, () => {
    const x = setup();
    const { s, u, w, values, blocked, snapshot, blockRemoval } = x;
    s.startSession(u.id, w.id);
    s.saveSets(u.id, 0, snapshot()[0].setLog);
    s.setDone(u.id, 0, true);
    const before = JSON.stringify([...values]);
    if (failure === "session-remove") blockRemoval(`meggym.session.${u.id}`);
    else blocked.add(failure === "history" ? "meggym.history" : `meggym.exloads.${u.id}`);
    assert.equal(s.finishSession(u, w, 1, snapshot()), null);
    assert.equal(JSON.stringify([...values]), before, "nenhuma alteração parcial deve permanecer");
    assert.equal(s.session(u.id).sets[0][0].weight, "20");
    blocked.clear();
    blockRemoval("");
    const record = s.finishSession(u, w, 1, snapshot());
    assert.ok(record);
    assert.equal(s.history(u.id).length, 1);
    assert.equal(s.session(u.id), null);
    assert.equal(s.finishSession(u, w, 1, snapshot()), null);
    assert.equal(s.history(u.id).length, 1, "repetir não duplica");
  });
}

test("sessão mantém exercícios, repetições e descanso ao editar/reordenar a ficha", () => {
  const { s, u, w } = setup();
  s.startSession(u.id, w.id);
  s.saveSets(u.id, 0, [{ reps: "9", weight: "16", done: true }]);
  s.saveWorkout({ ...w, name: "Ficha nova", items: [{ ...w.items[1], rest: "30s" }, { ...w.items[0], reps: "20" }] }, u);
  const active = s.sessionWorkout(u.id);
  assert.equal(active.name, "Ficha original");
  assert.equal(active.items[0].exerciseId, "goblet-squat");
  assert.equal(active.items[0].reps, "8-12");
  assert.equal(active.items[0].rest, "90s");
  assert.equal(s.session(u.id).sets[0][0].weight, "16");
  s.cancelSession(u.id);
  s.startSession(u.id, w.id);
  assert.equal(s.sessionWorkout(u.id).items[0].exerciseId, "flexao");
});

test("sessão legada é congelada antes da primeira edição, inclusive de outro perfil", () => {
  const { s, u, w, values } = setup();
  values.set(`meggym.session.${u.id}`, JSON.stringify({ workoutId: w.id, startedAt: new Date().toISOString(), done: { 0: true }, sets: { 0: [{ reps: "9", done: true }] } }));
  const other = s.createUser({ name: "Outro perfil" });
  s.saveWorkout({ ...w, items: [w.items[1], w.items[0]] }, other);
  assert.equal(s.sessionWorkout(u.id).items[0].exerciseId, "goblet-squat");
  assert.equal(s.session(u.id).sets[0][0].reps, "9");
});

test("falha ao congelar sessão legada impede alterar a ficha original", () => {
  const { s, u, w, values, blocked } = setup();
  values.set(`meggym.session.${u.id}`, JSON.stringify({ workoutId: w.id, startedAt: new Date().toISOString(), done: {} }));
  blocked.add(`meggym.session.${u.id}`);
  assert.equal(s.saveWorkout({ ...w, items: [w.items[1], w.items[0]] }, u), null);
  assert.equal(s.getWorkout(w.id).items[0].exerciseId, "goblet-squat");
});

test("gráfico recalcula o máximo entre sessões do dia após editar e excluir", () => {
  const { s, u, finish } = setup();
  const first = finish("20");
  const second = finish("12");
  const e = first.exercises[0];
  s.updateHistory(first.id, { exercises: [{ ...e, setLog: [{ reps: "10", weight: "8", done: true }] }] });
  assert.equal(s.weightLog(u.id, "goblet-squat")[0].weight, 12);
  assert.equal(s.exerciseLoad(u.id, "goblet-squat").weight, "12", "editar passado não muda carga atual");
  assert.equal(s.deleteHistory(second.id), true);
  assert.equal(s.weightLog(u.id, "goblet-squat")[0].weight, 8);
  s.deleteHistory(first.id);
  assert.equal(s.weightLog(u.id, "goblet-squat").length, 0);
});

test("registros manuais e dados de outros perfis sobrevivem à exclusão", () => {
  const { s, u, finish } = setup();
  const record = finish("20");
  s.logWeight(u.id, "goblet-squat", 20, { date: record.finishedAt });
  const other = s.createUser({ name: "Outro" });
  s.logWeight(other.id, "goblet-squat", 30);
  s.deleteHistory(record.id);
  assert.equal(s.weightLog(u.id, "goblet-squat")[0].weight, 20);
  assert.equal(s.weightLog(other.id, "goblet-squat")[0].weight, 30);
});

test("peso legado atribuído à sessão excluída deixa o gráfico", () => {
  const { s, u, finish, values } = setup();
  const record = finish("20");
  const d = new Date(record.finishedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  values.set(`meggym.wlog.${u.id}`, JSON.stringify({ "goblet-squat": [{ date, weight: 20 }] }));
  s.deleteHistory(record.id);
  assert.equal(s.weightLog(u.id, "goblet-squat").length, 0);
});

test("erro ao editar/excluir mantém histórico e gráfico intactos", () => {
  const { s, u, finish, blocked, values } = setup();
  const record = finish();
  const before = JSON.stringify([...values]);
  blocked.add("meggym.history");
  assert.equal(s.deleteHistory(record.id), false);
  assert.equal(s.updateHistory(record.id, { note: "não deve salvar" }), null);
  assert.equal(JSON.stringify([...values]), before);
  assert.equal(s.weightLog(u.id, "goblet-squat")[0].weight, 20);
});

test("backup inválido é recusado integralmente antes de gravar", () => {
  const { s, u, finish, values } = setup();
  finish();
  const backup = JSON.parse(JSON.stringify(s.exportBackup(u.id)));
  const cases = [
    (b) => { b.history[0].finishedAt = null; },
    (b) => { b.history[0].startedAt = "não é data"; },
    (b) => { b.history[0].startedAt = "2026-02-31T00:00:00Z"; },
    (b) => { b.history[0].userId = "outro-perfil"; },
    (b) => { b.history.push(b.history[0]); },
    (b) => { b.version = 99; },
    (b) => { b.workouts[0].items = "inválido"; },
    (b) => { b.perUser.weightLog = { x: [{ date: "2026-02-31", weight: 10 }] }; },
    (b) => { b.perUser.exerciseLoads = { x: [] }; },
    (b) => { b.perUser.saved = { workouts: "inválido" }; },
    (b) => { b.perUser.session = { workoutId: b.workouts[0].id, startedAt: b.createdAt, done: {}, sets: { 999: [] } }; },
  ];
  const before = JSON.stringify([...values]);
  cases.forEach((mutate) => {
    const bad = JSON.parse(JSON.stringify(backup));
    mutate(bad);
    assert.throws(() => s.importBackup(bad), /inválido|incompatível/);
    assert.equal(JSON.stringify([...values]), before);
  });
});

test("restauração desfaz gravações se faltar espaço no meio da importação", () => {
  const { s, u, w, finish, values, blocked } = setup();
  finish();
  s.startSession(u.id, w.id);
  s.saveExerciseNote(u.id, "flexao", "Nota do backup");
  const backup = JSON.parse(JSON.stringify(s.exportBackup(u.id)));
  s.updateUser(u.id, { name: "Nome atual" });
  s.saveExerciseNote(u.id, "flexao", "Nota atual" );
  s.createUser({ name: "Outro perfil atual" });
  const before = JSON.stringify([...values]);
  blocked.add(`meggym.exnotes.${u.id}`);
  assert.throws(() => s.importBackup(backup), /Não foi possível restaurar/);
  assert.equal(JSON.stringify([...values]), before);
});

test("backup válido e legado preserva sessão congelada, histórico e cargas manuais", () => {
  const { s, u, w, values, finish } = setup();
  finish();
  s.startSession(u.id, w.id);
  s.saveSets(u.id, 1, [{ reps: "8", done: true }]);
  s.logWeight(u.id, "goblet-squat", 24);
  const backup = JSON.parse(JSON.stringify(s.exportBackup(u.id)));
  delete backup.version;
  values.clear();
  assert.equal(s.importBackup(backup).id, u.id);
  assert.equal(s.history(u.id).length, 1);
  assert.equal(s.sessionWorkout(u.id).items[1].exerciseId, "flexao");
  assert.equal(s.session(u.id).sets[1][0].reps, "8");
  assert.equal(s.weightLog(u.id, "goblet-squat")[0].weight, 24);
});
