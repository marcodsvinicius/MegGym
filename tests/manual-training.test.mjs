import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, openApp, seedUser } from "./helpers.mjs";

let server;
before(async () => (server = await startServer()));
after(() => server.close());

test("criação manual: treino, edição, divisão e acompanhamento", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    await page.goto(server.url + "#/treinos");
    await page.click("#new-train");
    assert.equal(await page.locator(".action-sheet [data-confirm]").count(), 2);
    await page.click('[data-confirm="treino"]');
    await page.waitForSelector("#workout-form");
    await page.fill("#w-name", "Meu treino manual");
    await page.click("#open-picker");
    await page.locator("[data-add]").first().click();
    await page.click("#picker-done");
    await page.waitForSelector("#sheet", { state: "hidden" });
    await page.fill('[data-field="sets"]', "2");
    await page.fill('[data-field="reps"]', "8-12");
    await page.click('#workout-form [type="submit"]');
    await page.waitForSelector("#start-btn");
    const workoutId = await page.evaluate(() => MegStore.workouts().find((w) => w.name === "Meu treino manual").id);
    await page.click('#header-action a');
    await page.fill("#w-name", "Meu treino ajustado");
    await page.click('#workout-form [type="submit"]');
    await page.waitForSelector("#start-btn");
    await page.goto(server.url + "#/treinos");
    await page.click("#new-train");
    await page.click('[data-confirm="divisao"]');
    await page.fill("#st-name", "Minha divisão manual");
    await page.click(`[data-st-add="${workoutId}"]`);
    await page.click('#structure-form [type="submit"]');
    await page.waitForSelector("#st-follow");
    await page.click("#st-follow");
    await page.waitForSelector("#mt-start");
    assert.match(await page.textContent("#train-tab"), /Minha divisão manual/);
    await page.click("#mt-start");
    await page.waitForSelector(".run-item");
    assert.equal(await page.locator(".run-item").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("treinador desativado: telas sem atalhos e links antigos abrem criação manual", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    for (const hash of ["#/inicio", "#/treinos", "#/treinos/novo", "#/atividade", "#/atividade/configuracoes"]) {
      await page.goto(server.url + hash);
      await page.waitForSelector("#app-shell:not(.hidden)");
      assert.doesNotMatch(await page.textContent("#app"), /treinador|assistente|beta|dores e limitações/i);
      assert.equal(await page.locator('a[href*="treinador"], a[href*="assistente"], [data-coach-begin], [data-beta]').count(), 0);
    }
    assert.equal(await page.evaluate(() => typeof window.MegCoach), "undefined");
    for (const hash of ["#/treinador", "#/assistente", "#/treinador?novo=1&divisao=1"]) {
      await page.goto(server.url + hash);
      await page.waitForURL(/#\/treinos\/novo$/);
      await page.waitForSelector("#workout-form");
    }
    await page.goto(server.url + "admin.html");
    assert.equal(await page.locator("#ex-pattern, #ex-complexity, #ex-position, #ex-impact, [data-joint]").count(), 0);
    assert.doesNotMatch(await page.textContent("body"), /treinador|beta/i);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("compatibilidade: histórico e backup antigos continuam utilizáveis", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    const original = await page.evaluate(() => {
      const u = MegStore.currentUser();
      MegStore.updateUser(u.id, { coachPrefs: { time: 30 }, limits: { regions: { lombar: "cuidado" }, conditions: [], flags: [] }, painLog: { flexao: { score: 5 } } });
      const w = MegStore.saveWorkout({ name: "Treino montado — Peito", assistant: true, items: [{ exerciseId: "flexao", sets: "2", reps: "10" }] }, u);
      MegStore.startSession(u.id, w.id);
      const h = MegStore.finishSession(u, w, 1, [{ exerciseId: "flexao", name: "Flexão", group: "peito", sets: "2", reps: "10", setLog: [{ reps: "10", done: true }, { reps: "10", done: true }] }]);
      return { workoutId: w.id, historyId: h.id, userId: u.id };
    });
    await page.reload();
    await page.goto(server.url + `#/atividade/historico/${original.historyId}`);
    await page.waitForSelector("#save-history-workout");
    assert.doesNotMatch(await page.textContent("#app"), /treinador|sentiu dor/i);
    await page.click("#save-history-workout");
    await page.waitForSelector("#start-btn");
    const saved = await page.evaluate(() => MegStore.workouts().find((w) => w.name === "Treino — Peito"));
    assert.ok(saved && !saved.assistant);
    await page.goto(server.url + "#/atividade");
    await page.waitForSelector(".week-muscles");
    const firstMuscle = await page.locator(".week-muscles .hbars li").first().textContent();
    assert.match(firstMuscle, /Peito/);
    assert.match(firstMuscle, /2/);
    const restored = await page.evaluate(() => {
      const backup = MegStore.exportBackup(MegStore.currentUser().id);
      localStorage.clear();
      MegStore.importBackup(backup);
      return { user: MegStore.currentUser(), history: MegStore.history(), workouts: MegStore.workouts() };
    });
    assert.equal(restored.user.coachPrefs.time, 30);
    assert.equal(restored.user.limits.regions.lombar, "cuidado");
    assert.ok(restored.history.some((h) => h.id === original.historyId));
    assert.ok(restored.workouts.some((w) => w.id === original.workoutId));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
