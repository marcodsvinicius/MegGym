import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, openApp, seedUser } from "./helpers.mjs";

let server;
before(async () => { server = await startServer(); });
after(() => server.close());

async function withApp(fn) {
  const app = await openApp(server.url);
  try {
    await seedUser(app.page);
    await fn(app.page);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
}

async function startManual(page) {
  const id = await page.evaluate(() => {
    const u = MegStore.currentUser();
    const w = MegStore.saveWorkout({ name: "Ficha protegida", items: [
      { exerciseId: "goblet-squat", sets: "3", reps: "8-12", rest: "90s" },
      { exerciseId: "flexao", sets: "2", reps: "10", rest: "60s" },
    ] }, u);
    MegStore.startSession(u.id, w.id);
    return w.id;
  });
  await page.goto(server.url + `#/treinos/${id}/executar`);
  await page.waitForSelector(".run-item");
  return id;
}

async function oneSet(page) {
  await page.locator('.run-item[data-index="0"] .item-main').click();
  await page.locator('[data-set-field="reps"]').first().fill("9");
  await page.locator('[data-set-field="weight"]').first().fill("16");
  await page.locator("[data-set-check]").first().click();
  await page.click("#sheet-close");
  await page.waitForSelector("#sheet", { state: "hidden" });
}

test("uma série parcial permite finalizar e mantém só o trabalho realizado", () => withApp(async (page) => {
  await startManual(page);
  await oneSet(page);
  assert.equal(await page.locator("#finish-btn").isEnabled(), true);
  await page.click("#finish-btn");
  await page.click('[data-confirm="yes"]');
  await page.waitForURL(/historico\/.+novo=1/);
  const h = await page.evaluate(() => MegStore.history(MegStore.currentUser().id)[0]);
  assert.equal(h.exerciseCount, 1);
  assert.equal(h.exercises[0].sets, "1");
  assert.equal(h.exercises[0].plannedSets, "3");
  assert.equal(h.exercises[0].partial, true);
  assert.deepEqual(h.exercises[0].setLog, [{ reps: "9", weight: "16", done: true }]);
  assert.match(await page.textContent("#app"), /Parcial: 1 de 3 séries/);
}));

test("falha ao terminar mantém sessão na tela; nova tentativa registra uma única vez", () => withApp(async (page) => {
  await startManual(page);
  await oneSet(page);
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "meggym.history") throw new DOMException("Sem espaço", "QuotaExceededError");
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await page.click("#finish-btn");
  await page.click('[data-confirm="yes"]');
  await page.waitForSelector("#sheet", { state: "hidden" });
  assert.match(await page.textContent("#toast"), /Seu treino continua em andamento/);
  assert.equal(await page.evaluate(() => MegStore.history().length), 0);
  assert.equal(await page.evaluate(() => MegStore.session(MegStore.currentUser().id).sets[0][0].reps), "9");
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
  await page.click("#finish-btn");
  await page.click('[data-confirm="yes"]');
  await page.waitForURL(/historico\/.+novo=1/);
  assert.equal(await page.evaluate(() => MegStore.history().length), 1);
}));

test("retomada e avanço entre exercícios usam a ficha congelada após edição", () => withApp(async (page) => {
  const id = await startManual(page);
  await oneSet(page);
  await page.goto(server.url + `#/treinos/${id}/editar`);
  await page.locator('[data-index="1"] [data-item-action="up"]').click();
  await page.fill('[data-index="0"] [data-field="rest"]', "30s");
  await page.click('#workout-form [type="submit"]');
  await page.waitForSelector("#start-btn");
  await page.goto(server.url + `#/treinos/${id}/executar`);
  await page.reload();
  await page.waitForSelector(".run-item");
  assert.match(await page.locator(".run-item .item-title").first().textContent(), /Agachamento goblet/);
  await page.locator('.run-item[data-index="0"] .item-main').click();
  assert.equal(await page.locator('[data-set-field="weight"]').first().inputValue(), "16");
  assert.equal(await page.locator('[data-rest-start="90"]').count(), 1);
  await page.click("[data-next-run]");
  assert.match(await page.textContent("#sheet-title"), /Flexão/);
  assert.equal(await page.locator('[data-rest-start="60"]').count(), 1);
}));

test("editar nota antiga preserva a carga atual; excluir corrige gráfico e recorde", () => withApp(async (page) => {
  const hId = await page.evaluate(() => {
    const u = MegStore.currentUser();
    const w = MegStore.workouts()[0];
    MegStore.startSession(u.id, w.id);
    const h = MegStore.finishSession(u, w, 1, [{ exerciseId: "goblet-squat", name: "Agachamento", group: "quadriceps", sets: "1", reps: "10", type: "reps", setLog: [{ reps: "10", weight: "20", done: true }] }]);
    MegStore.saveExerciseLoad(u.id, "goblet-squat", { weight: "30" });
    return h.id;
  });
  await page.goto(server.url + `#/atividade/historico/${hId}/editar`);
  await page.fill("#he-note", "Somente uma observação");
  await page.click('#history-edit-form [type="submit"]');
  await page.waitForSelector("#delete-history-btn");
  assert.equal(await page.evaluate(() => MegStore.exerciseLoad(MegStore.currentUser().id, "goblet-squat").weight), "30");
  await page.click("#delete-history-btn");
  await page.click('[data-confirm="yes"]');
  await page.waitForURL(/aba=historico/);
  await page.goto(server.url + "#/exercicios/ver/goblet-squat");
  await page.waitForSelector("[data-weight-chart]");
  assert.equal(await page.locator(".wbar").count(), 0);
  assert.equal(await page.locator(".pr-line").count(), 0);
}));

test("importação inválida explica o erro e mantém perfil e histórico", () => withApp(async (page) => {
  const backup = await page.evaluate(() => {
    const u = MegStore.currentUser();
    const b = MegStore.exportBackup(u.id);
    b.history = [{ id: "invalido", userId: u.id, finishedAt: null }];
    return b;
  });
  await page.goto(server.url + "#/atividade/configuracoes");
  const before = await page.evaluate(() => JSON.stringify({ users: MegStore.users(), history: MegStore.history() }));
  const chooser = page.waitForEvent("filechooser");
  await page.click("#backup-import");
  await (await chooser).setFiles({ name: "backup-invalido.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("não é um backup válido"));
  assert.equal(await page.evaluate(() => JSON.stringify({ users: MegStore.users(), history: MegStore.history() })), before);
  assert.equal(await page.locator(".confirm-sheet").count(), 0);
}));
