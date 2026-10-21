import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const storeSource = await readFile(new URL("../assets/js/store.js", import.meta.url), "utf8");
const exportSource = await readFile(new URL("../assets/js/export.js", import.meta.url), "utf8");
const now = "2026-10-21T12:00:00Z";
const catalog = { groups: [{ id: "peito", name: "Peito" }], exercises: [{ id: "supino", name: "Supino", group: "peito", type: "reps" }, { id: "tempo", name: "Prancha", type: "tempo" }] };
function setup() {
  const values = new Map();
  const ctx = { window: { dispatchEvent() {} }, CustomEvent: class {}, localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) } };
  vm.runInNewContext(storeSource, ctx);
  vm.runInNewContext(exportSource, ctx);
  const s = ctx.window.MegStore, exporter = ctx.window.MegExport;
  const u = s.createUser({ name: "Perfil alvo", age: 30, sex: "feminino", equipment: ["halter"] });
  const w = s.saveWorkout({ name: "Ficha atual", items: [{ exerciseId: "supino", sets: "3", reps: "8-12", rir: "2", linkNext: true }, { exerciseId: "tempo", sets: "2", reps: "30" }] }, u);
  s.followWorkout(u.id, w.id);
  const h = { id: "h1", userId: u.id, workoutId: w.id, workoutName: "Ficha antiga", startedAt: "2026-10-20T10:00:00Z", finishedAt: "2026-10-20T11:00:00Z", exercises: [
    { exerciseId: "supino", name: "Nome na sessão", group: "peito", sets: "2", plannedSets: "3", reps: "8-12", type: "reps", partial: true, note: "Boa execução", setLog: [{ weight: "12,5", reps: "10", done: true }, { weight: "20", reps: "8", done: false }] },
    { exerciseId: "tempo", type: "tempo", setLog: [{ weight: "10", reps: "30", done: true }] },
  ] };
  values.set("meggym.history", JSON.stringify([h]));
  s.saveExerciseNote(u.id, "supino", "Observação atual");
  s.saveExerciseLoad(u.id, "supino", { weight: "16" });
  values.set(`meggym.wlog.${u.id}`, JSON.stringify({ supino: [{ date: "2026-10-19", weight: 14, source: "manual" }, { date: "2026-10-20", weight: 10 }] }));
  return { s, u, w, h, exporter, values, build: options => exporter.build(s.analysisData(u.id), catalog, { now, ...options }) };
}

test("exportação isola perfil e preserva armazenamento, backup e sessão legada", () => {
  const { s,u,w,values,build } = setup();
  const other = s.createUser({ name: "SEGREDO OUTRO PERFIL" });
  s.saveWorkout({ name: "FICHA PRIVADA ALHEIA", visibility: "private", items: [] }, other);
  s.saveExerciseNote(other.id, "supino", "NOTA PRIVADA ALHEIA");
  values.set("meggym.history", JSON.stringify([...JSON.parse(values.get("meggym.history")), { id: "outro", userId: other.id, workoutName: "HISTÓRICO ALHEIO", finishedAt: now }]));
  values.set(`meggym.session.${u.id}`, JSON.stringify({ workoutId: w.id, startedAt: now, done: {} }));
  const before = JSON.stringify([...values]);
  const text = JSON.stringify(build());
  assert.doesNotMatch(text, /SEGREDO|ALHEI/);
  assert.equal(JSON.stringify([...values]), before);
  assert.equal(s.users().find(x => x.id === u.id).lastBackupAt, undefined);
});

test("preserva prescrição atual, snapshot histórico e séries parciais sem inventar resultados", () => {
  const { build } = setup(); const data = build();
  assert.equal(data.planoAtual.treinos[0].nome, "Ficha atual");
  assert.equal(data.planoAtual.treinos[0].exercicios[0].seriesPlanejadas, "3");
  assert.equal(data.planoAtual.treinos[0].exercicios[0].ligadoAoProximo, true);
  assert.equal(data.historico[0].treino, "Ficha antiga");
  assert.equal(data.historico[0].exercicios[0].nome, "Nome na sessão");
  assert.equal(data.historico[0].exercicios[0].parcial, true);
  assert.equal(data.resumo.seriesRealizadasComDetalhes, 2);
  assert.equal(data.resumo.volumeRegistradoKgRepeticoes, 125);
  assert.equal(data.historico[0].duracaoMinutos, 60);
});

test("evolução usa máximos diários, distingue origem e separa preferência atual", () => {
  const { build,s,u } = setup(); const e = build().evolucao.find(e => e.exercicioId === "supino");
  assert.equal(e.cargasPorDia[0].cargaKg, 14);
  assert.equal(e.cargasPorDia[1].cargaKg, 12.5);
  assert.equal(e.cargaAtualKg, 16);
  assert.equal(e.variacaoKg, -1.5);
  assert.equal(e.cargasPorDia[0].origens[0], "registro manual");
  assert.equal(e.cargasPorDia[1].origens[0], "treino concluído");
  assert.deepEqual(Array.from(e.cargasPorDia, p => p.cargaKg), Array.from(s.weightLog(u.id, "supino"), p => p.weight));
});

test("período filtra histórico e cargas, mantém plano e não inclui sessão aberta nos totais", () => {
  const { build,s,u,w,h,values } = setup();
  values.set("meggym.history", JSON.stringify([h, { ...h, id: "old", finishedAt: "2026-09-01T12:00:00Z" }]));
  s.startSession(u.id,w.id);
  s.saveSets(u.id,0,[{ weight: "30", reps: "10", done: true }, { weight: "30", reps: "", done: false }]);
  s.updateSession(u.id,{ order: [1,0], skipped: { 1: true }, swaps: { 0: "tempo" } });
  const data = build({ days: 30, includeProfile: false });
  assert.equal(data.historico.length, 1);
  assert.equal(data.resumo.sessoes, 1);
  assert.equal(data.treinoEmAndamento.exercicios[0].pulado,true);
  assert.equal(data.treinoEmAndamento.exercicios[1].substituidoDe,"supino");
  assert.equal(data.treinoEmAndamento.exercicios[1].series[1].quantidade,null);
  assert.equal(data.perfil.nome,undefined);
  assert.equal(data.planoAtual.treinos.length,1);
});

test("divisão inteira é exportada; legado sem séries continua desconhecido e relatório é completo", () => {
  const { build,s,u,w,values,exporter } = setup();
  const st = s.saveStructure({ name: "Divisão AB", duration: 20, workoutIds: [w.id] },u);
  s.followStructure(u.id,st.id);
  values.set("meggym.history", JSON.stringify([{ id: "legado", userId: u.id, workoutName: "Antigo", finishedAt: now, exerciseCount: 4 }]));
  const data = build();
  assert.equal(data.planoAtual.divisao.nome,"Divisão AB");
  assert.equal(data.planoAtual.treinos.length,1);
  assert.equal(data.resumo.sessoesSemDetalhes,1);
  assert.equal(data.resumo.seriesRealizadasComDetalhes,0);
  assert.match(exporter.report(data),/Registro antigo sem lista de exercícios/);
  assert.match(exporter.report(data),/Observação atual/);
  assert.match(exporter.report(data),/COMO INTERPRETAR/);
});

test("CSV conserva vírgula, aspas e quebras de linha e neutraliza fórmulas", () => {
  const { build,exporter,h,values } = setup();
  h.workoutName = '=HYPERLINK("teste")';
  h.exercises[0].note = 'Texto; "entre aspas"\nnova linha';
  h.note = '  +cmd';
  values.set("meggym.history",JSON.stringify([h]));
  const csv = exporter.csv(build());
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv,/'=HYPERLINK\(""teste""\)/);
  assert.match(csv,/Texto; ""entre aspas""\nnova linha/);
  assert.match(csv,/'  \+cmd/);
  assert.match(csv,/"12.5"/);
});

test("perfil sem registros exporta arquivos válidos e nenhum dado inferido", () => {
  const { s,exporter } = setup();
  const empty = s.createUser({ name: "Vazio" });
  const data = exporter.build(s.analysisData(empty.id),catalog,{ now });
  assert.equal(data.resumo.sessoes,0);
  assert.equal(data.historico.length,0);
  assert.equal(data.evolucao.length,0);
  assert.match(exporter.report(data),/Nenhuma sessão concluída/);
  assert.equal(exporter.csv(data).split("\r\n").length,1);
});
