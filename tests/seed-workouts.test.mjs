import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT, startServer, openApp, seedUser } from "./helpers.mjs";

const seed = JSON.parse(await readFile(join(ROOT, "data/workouts.json"), "utf8"));
const storeSource = await readFile(join(ROOT, "assets/js/store.js"), "utf8");

test("seed v5 acrescenta Treino GPT v1 sem perder treinos, histórico ou sessão", () => {
  const values = new Map();
  const context = { window: {}, localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) } };
  vm.runInNewContext(storeSource, context);
  const s = context.window.MegStore;
  const u = s.createUser({ name: "Teste migração", equipment: ["halter", "elastico"] });
  const previous = JSON.parse(JSON.stringify(seed));
  previous.version = 4;
  previous.workouts = previous.workouts.filter((w) => !w.id.startsWith("treino-gpt-v1"));
  previous.structures = previous.structures.filter((st) => st.id !== "treino-gpt-v1");
  s.applySeed(previous);
  const old = s.workouts()[0];
  s.saveWorkout({ ...old, name: "Meu ajuste anterior" }, u);
  const custom = s.saveWorkout({ name: "Meu treino particular", items: [{ exerciseId: "flexao", sets: "2", reps: "10" }] }, u);
  s.startSession(u.id, custom.id);
  s.finishSession(u, custom, 1, [{ exerciseId: "flexao", name: "Flexão", group: "peito", sets: "2", reps: "10" }]);
  s.startSession(u.id, custom.id);
  s.followWorkout(u.id, custom.id);
  s.saveExerciseNote(u.id, "flexao", "Minha anotação");
  const oldCount = s.workouts().length;
  assert.equal(s.applySeed(seed), true);
  assert.equal(s.workouts().length, oldCount + 4);
  assert.equal(s.getWorkout(old.id).name, "Meu ajuste anterior");
  assert.equal(s.getWorkout(custom.id).name, "Meu treino particular");
  assert.equal(s.history(u.id).length, 1);
  assert.equal(s.session(u.id).workoutId, custom.id);
  assert.equal(s.plan(u.id).workoutId, custom.id);
  assert.equal(s.exerciseNote(u.id, "flexao"), "Minha anotação");
  const division = s.getStructure("treino-gpt-v1");
  assert.equal(division.name, "Treino GPT v1");
  assert.equal(division.workoutIds.length, 4);
  assert.equal(division.workoutIds.reduce((n, id) => n + s.getWorkout(id).items.length, 0), 25);
  assert.equal(s.applySeed(seed), false);
  assert.equal(s.workouts().length, oldCount + 4, "não duplica ao reabrir");
});

test("Treino GPT v1 aparece em Explorar e permite registrar as variantes da planilha", async () => {
  const server = await startServer();
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page, { equipment: ["halter", "kettlebell", "elastico", "roldana", "step"] });
    await page.goto(server.url + "#/treinos?aba=explorar");
    await page.fill("#ex-q", "Treino GPT v1");
    assert.equal(await page.locator(".structure-card").count(), 1);
    await page.locator(".structure-card").click();
    await page.click("#st-follow");
    await page.waitForSelector("#mt-start");
    assert.match(await page.textContent("#mt-start"), /Treino A/);
    await page.click("#mt-start");
    await page.waitForSelector(".run-item");
    assert.equal(await page.locator(".run-item").count(), 6);
    await page.locator('.run-item[data-index="3"] .item-main').click();
    await page.waitForSelector(".set-row");
    assert.match(await page.textContent("#sheet-title"), /Extensão de joelho com elástico/);
    assert.equal(await page.locator(".set-row").count(), 3);
    await page.click("#sheet-close");
    await page.waitForSelector("#sheet", { state: "hidden" });
    await page.locator('.run-item[data-index="4"] .item-main').click();
    await page.locator('[data-set-field="reps"]').first().fill("12");
    await page.locator('[data-set-field="weight"]').first().fill("8");
    await page.locator("[data-set-check]").first().click();
    await page.waitForSelector(".rest-bar:not(.hidden)");
    const logged = await page.evaluate(() => MegStore.session(MegStore.currentUser().id).sets[4][0]);
    assert.equal(logged.weight, "8");
    assert.equal(logged.done, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
