import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const seed = JSON.parse(await read("data/workouts.json"));
const catalog = JSON.parse(await read("data/exercises.json"));
const storeSource = await read("assets/js/store.js");
const commonSource = await read("assets/js/common.js");
const exportSource = await read("assets/js/export.js");
function setup() {
  const values = new Map(), blocked = new Set();
  const ctx = { window: { dispatchEvent() {} }, CustomEvent: class {}, localStorage: {
    getItem: k => values.get(k) ?? null,
    setItem: (k,v) => { if (blocked.has(k)) throw Error("QuotaExceededError"); values.set(k,v); },
    removeItem: k => values.delete(k),
  } };
  vm.runInNewContext(storeSource, ctx);
  vm.runInNewContext(commonSource, ctx);
  vm.runInNewContext(exportSource, ctx);
  return { s:ctx.window.MegStore, common:ctx.window.MegGym, exporter:ctx.window.MegExport, values, blocked };
}
function version5() {
  const old = JSON.parse(JSON.stringify(seed));
  old.version = 5; old.renames = [];
  old.workouts = old.workouts.filter(w => !w.id.startsWith("turbo-kelw"));
  old.structures = old.structures.filter(st => st.id !== "turbo-kelw");
  [...old.workouts,...old.structures].filter(w => w.id.startsWith("treino-gpt-v1")).forEach(w => { w.name = w.name.replace("Hipertrofia Avançada","Treino GPT v1"); });
  return old;
}

test("migração v5 renomeia só os títulos originais e preserva ficha editada, sessão e dados pessoais", () => {
  const { s, values } = setup();
  const u = s.createUser({name:"Migração Kelw"});
  s.applySeed(version5());
  const a = s.getWorkout("treino-gpt-v1-a");
  s.startSession(u.id,a.id);
  s.saveWorkout({...a,items:a.items.map((e,i)=>i===0?{...e,sets:"7"}:e)},u);
  s.saveWorkout({...s.getWorkout("treino-gpt-v1-b"),name:"Minha ficha B"},u);
  s.followStructure(u.id,"treino-gpt-v1");
  s.saveExerciseNote(u.id,"goblet-squat","Minha observação");
  values.set("meggym.history", JSON.stringify([{id:"hist",userId:u.id,workoutName:"Treino GPT v1",finishedAt:"2026-10-01T10:00:00Z"}]));
  const protectedValues = [...values].filter(([k]) => !["meggym.workouts","meggym.structures","meggym.workoutsSeed"].includes(k));
  assert.equal(s.applySeed(seed),true);
  assert.match(s.getWorkout(a.id).name,/^Hipertrofia Avançada/);
  assert.equal(s.getWorkout(a.id).items[0].sets,"7");
  assert.equal(s.getWorkout("treino-gpt-v1-b").name,"Minha ficha B");
  assert.equal(s.getStructure("treino-gpt-v1").name,"Hipertrofia Avançada");
  for (const [k,v] of protectedValues) assert.equal(values.get(k),v,k);
  assert.equal(s.getStructure("turbo-kelw").workoutIds.length,3);
  assert.equal(s.applySeed(seed),false);
});

test("falha na migração desfaz nomes e novos cadastros e permite tentar novamente", () => {
  const { s,values,blocked } = setup();
  s.applySeed(version5());
  const before = JSON.stringify([...values]);
  blocked.add("meggym.structures");
  assert.equal(s.applySeed(seed),false);
  assert.equal(JSON.stringify([...values]),before);
  blocked.clear();
  assert.equal(s.applySeed(seed),true);
  assert.equal(s.getStructure("turbo-kelw").name,"Turbo Kelw");
});

test("Turbo Kelw conserva 20 exercícios, duas séries, cargas em branco e as orientações recebidas", () => {
  const workouts = seed.workouts.filter(w=>w.id.startsWith("turbo-kelw-"));
  assert.deepEqual(workouts.map(w=>w.items.length),[7,6,7]);
  workouts.forEach(w=>{
    w.items.forEach(e=>{ assert.equal(e.sets,"2"); assert.equal(e.load,""); assert.ok(e.instructions); assert.ok(catalog.exercises.some(ex=>ex.id===e.exerciseId)); });
    assert.match(w.notes,/Primeiras duas semanas/);
    assert.match(w.notes,/quatro primeiros exercícios/);
    assert.match(w.notes,/capacidade para fazer mais 3/);
    assert.match(w.notes,/fisioterapeuta ou médico/);
  });
  assert.equal(workouts[0].items[0].reps,"8-12");
  assert.equal(workouts[2].items[0].reps,"10-15");
  assert.equal(workouts[1].items[5].reps,"15-25s por lado");
  assert.match(workouts[2].items[6].instructions,/5 pressões de 5 segundos/);
  assert.match(workouts[0].items[3].instructions,/2 × 10–15/);
});

test("halter opcional permite registrar carga sem exigir equipamento para a versão livre", () => {
  const {common} = setup();
  for (const id of ["agachamento-dividido-apoio","ponte-gluteos-chao-opcional","panturrilha-em-pe-apoio"]) {
    const ex = catalog.exercises.find(e=>e.id===id);
    assert.equal(common.canDo(ex,[]),true);
    assert.equal(common.usesWeight(ex),true);
  }
  const triceps = catalog.exercises.find(e=>e.id==="triceps-testa-chao");
  assert.equal(common.canDo(triceps,["halter"]),true);
  assert.equal(triceps.equipment.includes("banco"),false);
});

test("exportação leva observações e execução do plano, com segundos por lado no histórico", () => {
  const {s,exporter,values} = setup();
  const u=s.createUser({name:"Kelw"}); s.applySeed(seed); s.followStructure(u.id,"turbo-kelw");
  values.set("meggym.history",JSON.stringify([{id:"h",userId:u.id,workoutName:"Turbo Kelw B",finishedAt:new Date().toISOString(),exercises:[{exerciseId:"prancha-lateral-joelhos",type:"tempo",timePerSide:true,setLog:[{reps:"20",done:true}]}]}]));
  const data=exporter.build(s.analysisData(u.id),catalog);
  assert.equal(data.planoAtual.treinos.length,3);
  assert.match(data.planoAtual.treinos[0].observacoes,/Aquecimento/);
  assert.match(data.planoAtual.treinos[0].exercicios[0].instrucoes,/pés totalmente apoiados/);
  assert.equal(data.historico[0].exercicios[0].series[0].unidade,"segundos por lado");
  assert.match(exporter.report(data),/sem piora da lombar/);
});
