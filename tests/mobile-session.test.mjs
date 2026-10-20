import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, openApp, seedUser } from "./helpers.mjs";

let server;
before(async () => { server = await startServer(); });
after(() => server.close());
async function withSession(fn) {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    const id = await page.evaluate(() => {
      const u = MegStore.currentUser();
      const w = MegStore.saveWorkout({ name: "Treino com nome longo para validar a barra de retomada mobile", items: [{ exerciseId: "goblet-squat", sets: "4", reps: "8-12", rest: "90s", rir: "2" }] }, u);
      MegStore.startSession(u.id, w.id);
      return w.id;
    });
    await page.goto(server.url + `#/treinos/${id}/executar`);
    await page.waitForSelector(".run-item");
    await fn(page, id);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test("retomada é única, fixa e acompanha as telas; desaparece ao retomar ou finalizar", () => withSession(async (page, id) => {
  assert.equal(await page.locator(".resume-dock").isVisible(), false);
  for (const hash of ["#/inicio", "#/treinos", "#/exercicios", "#/atividade", "#/atividade/configuracoes"]) {
    await page.goto(server.url + hash);
    await page.waitForSelector(".resume-dock:not(.hidden)");
    assert.equal(await page.locator(".resume-banner").count(), 1);
    assert.equal(await page.locator(".resume-dock").evaluate((el) => getComputedStyle(el).position), "fixed");
    const before = await page.locator(".resume-dock").boundingBox();
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const after = await page.locator(".resume-dock").boundingBox();
    assert.equal(before.y, after.y);
  }
  await page.click(".resume-dock");
  await page.waitForURL(/executar/);
  assert.equal(await page.locator(".resume-dock").isVisible(), false);
  await page.evaluate((workoutId) => {
    const u = MegStore.currentUser();
    MegStore.finishSession(u, MegStore.getWorkout(workoutId), 1, [{ exerciseId: "goblet-squat", name: "Agachamento", group: "quadriceps", sets: "1", reps: "10" }]);
  }, id);
  await page.goto(server.url + "#/atividade");
  await page.waitForSelector(".top-tabs");
  assert.equal(await page.locator(".resume-dock").isVisible(), false);
  assert.equal(await page.locator("body.has-resume").count(), 0);
}));

test("descanso, retomada e menu não se sobrepõem em celulares estreitos", () => withSession(async (page) => {
  await page.locator(".run-item .item-main").click();
  await page.locator('[data-set-field="reps"]').first().fill("10");
  await page.locator('[data-set-field="weight"]').first().fill("12");
  await page.locator("[data-set-check]").first().click();
  await page.click("#sheet-close");
  await page.waitForSelector("#sheet", { state: "hidden" });
  await page.goto(server.url + "#/exercicios");
  await page.waitForSelector(".resume-dock:not(.hidden)");
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const dock = await page.locator(".resume-dock").boundingBox();
    const rest = await page.locator(".rest-bar").boundingBox();
    const nav = await page.locator(".bottom-nav").boundingBox();
    assert.ok(rest.y + rest.height <= dock.y - 8, JSON.stringify({ rest, dock }));
    assert.ok(dock.y + dock.height <= nav.y - 8, JSON.stringify({ dock, nav }));
    assert.ok(dock.x >= 0 && dock.x + dock.width <= viewport.width);
  }
  await page.evaluate(() => document.querySelector(".update-bar").classList.remove("hidden"));
  const notice = await page.locator(".update-bar").boundingBox();
  const rest = await page.locator(".rest-bar").boundingBox();
  assert.ok(notice.y + notice.height < rest.y);
  await page.click('[data-rest="skip"]');
  assert.equal(await page.locator(".rest-bar").isVisible(), false);
  assert.equal(await page.locator(".resume-dock").isVisible(), true);
}));

test("peso da primeira série acompanha as seguintes após recarregar e preserva ajustes individuais", () => withSession(async (page) => {
  await page.locator(".run-item .item-main").click();
  const weights = page.locator('[data-set-field="weight"]');
  await weights.first().fill("12,5");
  assert.deepEqual(await weights.evaluateAll((inputs) => inputs.map((i) => i.value)), ["12,5", "12,5", "12,5", "12,5"]);
  assert.equal(await page.inputValue("#ex-weight"), "12,5");
  await page.reload();
  await page.waitForSelector(".run-item");
  await page.locator(".run-item .item-main").click();
  await weights.first().fill("16");
  assert.deepEqual(await weights.evaluateAll((inputs) => inputs.map((i) => i.value)), ["16", "16", "16", "16"]);
  await weights.nth(1).fill("18");
  await page.locator('[data-set-field="reps"]').nth(3).fill("10");
  await page.locator("[data-set-check]").nth(3).click();
  await weights.first().fill("14");
  assert.deepEqual(await weights.evaluateAll((inputs) => inputs.map((i) => i.value)), ["14", "18", "14", "16"]);
  assert.equal(await page.inputValue("#ex-weight"), "14");
  const stored = await page.evaluate(() => MegStore.session(MegStore.currentUser().id).sets[0]);
  assert.equal(stored[2].weightSource, "first");
  assert.equal(stored[1].weightSource, "manual");
  assert.equal(stored[3].done, true);
  await page.locator('[data-set-field="reps"]').first().fill("10");
  await page.locator("[data-set-check]").first().click();
  await page.locator('[data-set-field="reps"]').nth(1).fill("10");
  await page.locator("[data-set-check]").nth(1).click();
  await page.click("#sheet-close");
  await page.waitForSelector("#sheet", { state: "hidden" });
  await page.click("#finish-btn");
  await page.click('[data-confirm="yes"]');
  await page.waitForSelector(".history-hero");
  assert.equal(await page.evaluate(() => MegStore.exerciseLoad(MegStore.currentUser().id, "goblet-squat").weight), "14");
  assert.equal(await page.evaluate(() => MegStore.weightLog(MegStore.currentUser().id, "goblet-squat")[0].weight), 18);
}));

test("perfil Suave migra para Energia e as quatro opções de aparência persistem", () => withSession(async (page) => {
  await page.evaluate(() => MegStore.updateUser(MegStore.currentUser().id, { style: "suave" }));
  await page.reload();
  await page.waitForSelector(".run-item");
  assert.equal(await page.getAttribute("html", "data-style"), "energia");
  assert.equal(await page.evaluate(() => MegStore.currentUser().style), "energia");
  await page.goto(server.url + "#/atividade/configuracoes");
  assert.equal(await page.locator('input[name="set-style-choice"]').count(), 4);
  assert.equal(await page.locator('input[value="suave"]').count(), 0);
  for (const style of ["pink-money", "arcade", "esportivo", "energia"]) {
    await page.locator(".style-option").filter({ has: page.locator(`input[value="${style}"]`) }).click();
    assert.equal(await page.getAttribute("html", "data-style"), style);
    await page.reload();
    await page.waitForSelector("#style-form");
    assert.equal(await page.getAttribute("html", "data-style"), style);
    assert.equal(await page.evaluate(() => MegStore.currentUser().style), style);
  }
}));
