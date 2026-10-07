// Checagens rápidas dos arquivos de dados e das versões de cache.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const read = (p) => readFile(join(ROOT, p), "utf8");

test("exercises.json: ids únicos, grupos existentes e vídeos do YouTube válidos", async () => {
  const data = JSON.parse(await read("data/exercises.json"));
  const groups = new Set(data.groups.map((g) => g.id));
  const ids = new Set();
  for (const ex of data.exercises) {
    assert.ok(ex.id && ex.name, `exercício sem id/nome: ${JSON.stringify(ex).slice(0, 80)}`);
    assert.ok(!ids.has(ex.id), `id repetido: ${ex.id}`);
    ids.add(ex.id);
    assert.ok(groups.has(ex.group), `${ex.id}: grupo inexistente "${ex.group}"`);
    if (ex.video) assert.match(ex.video, /^https:\/\/(www\.)?(youtube\.com\/(shorts\/|watch\?v=)|youtu\.be\/)[\w-]{11}$/, `${ex.id}: link de vídeo inválido`);
  }
});

test("workouts.json: treinos e estruturas apontam para coisas que existem", async () => {
  const ex = new Set(JSON.parse(await read("data/exercises.json")).exercises.map((e) => e.id));
  const seed = JSON.parse(await read("data/workouts.json"));
  const workoutIds = new Set(seed.workouts.map((w) => w.id));
  for (const w of seed.workouts) for (const it of w.items) assert.ok(ex.has(it.exerciseId), `${w.id}: exercício inexistente ${it.exerciseId}`);
  for (const st of seed.structures || []) for (const id of st.workoutIds) assert.ok(workoutIds.has(id), `${st.id}: treino inexistente ${id}`);
});

test("versão de cache igual em index.html, admin.html e sw.js", async () => {
  const files = ["index.html", "admin.html", "sw.js"];
  const versions = new Set();
  for (const f of files) for (const m of (await read(f)).matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
  assert.equal(versions.size, 1, `?v= diferentes: ${[...versions].join(", ")}`);
  const sw = await read("sw.js");
  assert.equal(sw.match(/VERSION = "v(\d+)"/)[1], [...versions][0], "VERSION do sw.js diferente do ?v=");
});
