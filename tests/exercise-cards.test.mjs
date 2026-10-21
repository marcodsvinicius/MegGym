import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { startServer, openApp, seedUser } from "./helpers.mjs";

const axeSrc = await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let server;
before(async () => { server = await startServer(); });
after(() => server.close());
async function withExercise(fn) {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    const id = await page.evaluate(() => {
      const u = MegStore.currentUser();
      const w = MegStore.saveWorkout({ name: "Cards e tabela", items: [{ exerciseId: "goblet-squat", sets: "3", reps: "10", rest: "90s" }] }, u);
      MegStore.startSession(u.id, w.id);
      return w.id;
    });
    await page.goto(server.url + `#/treinos/${id}/executar`);
    await page.locator(".run-item .item-main").click();
    await page.waitForSelector(".exercise-summary");
    await fn(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test("card de carga acompanha a primeira série e abre gráfico sem perder os campos", () => withExercise(async page => {
  await page.locator('[data-set-field="weight"]').first().fill("14");
  assert.equal(await page.locator("[data-load-summary]").textContent(), "14 kg");
  assert.equal(await page.locator("#ex-weight").isVisible(), false);
  await page.locator('[data-personal-card="load"]').scrollIntoViewIfNeeded();
  const scroll = await page.locator("#sheet-content").evaluate(el => el.scrollTop);
  await page.click('[data-personal-card="load"]');
  assert.equal(await page.locator(".personal-dialog [data-weight-chart]").isVisible(), true);
  assert.equal(await page.inputValue("#ex-weight"), "14");
  await page.fill("#ex-weight", "16");
  await page.waitForSelector(".wchart");
  await page.click('[data-chart-mode="reps"]');
  assert.match(await page.locator("[data-weight-chart]").textContent(), /Registre as repetições/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#sheet").isVisible(), true);
  assert.equal(await page.locator("#sheet-content").evaluate(el => el.scrollTop), scroll);
  assert.equal(await page.locator("[data-load-summary]").textContent(), "16 kg");
  assert.equal(await page.locator('[data-set-field="weight"]').first().inputValue(), "14");
  assert.equal(await page.locator('[data-personal-card="load"]').evaluate(el => document.activeElement === el), true);
}));

test("card de observações salva ao fechar e preserva texto ao recarregar", () => withExercise(async page => {
  await page.click('[data-personal-card="note"]');
  await page.fill("#ex-note", "Manter o movimento controlado");
  await page.getByRole("button", { name: "Voltar ao exercício", exact: true }).click();
  assert.equal(await page.locator("[data-note-summary]").textContent(), "Manter o movimento controlado");
  await page.reload();
  await page.locator(".run-item .item-main").click();
  assert.equal(await page.locator("[data-note-summary]").textContent(), "Manter o movimento controlado");
  await page.click('[data-personal-card="note"]');
  assert.equal(await page.inputValue("#ex-note"), "Manter o movimento controlado");
  await page.fill("#ex-note", "");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-note-summary]").textContent(), "Adicionar observação");
}));

test("tabela alinha carga e repetições com controles de toque em telas pequenas", () => withExercise(async page => {
  assert.match(await page.locator(".sets-table-head").textContent(), /SérieCarga \(kg\)Reps/);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const row = page.locator(".sets-table .set-row").first();
    const weight = await row.locator('[data-set-field="weight"]').boundingBox();
    const reps = await row.locator('[data-set-field="reps"]').boundingBox();
    const check = await row.locator("[data-set-check]").boundingBox();
    assert.ok(weight.x < reps.x && reps.x < check.x);
    assert.ok(weight.height >= 44 && reps.height >= 44 && check.height >= 44);
    assert.ok(check.x + check.width <= viewport.width);
    const columns = await page.evaluate(() => [".sets-table-head", ".sets-table .set-row"].map(s => getComputedStyle(document.querySelector(s)).gridTemplateColumns));
    assert.equal(columns[0], columns[1]);
  }
}));

test("tempo e peso corporal mantêm colunas alinhadas; elástico mantém seleção única no painel", () => withExercise(async page => {
  const id = await page.evaluate(() => {
    const u = MegStore.currentUser();
    const w = MegStore.saveWorkout({ name: "Sem pesos", items: [{ exerciseId: "prancha", sets: "2", reps: "30" }, { exerciseId: "flexao", sets: "2", reps: "10" }] }, u);
    MegStore.startSession(u.id, w.id);
    return w.id;
  });
  await page.goto(server.url + `#/treinos/${id}/executar`);
  for (const index of [0, 1]) {
    await page.locator(`.run-item[data-index="${index}"] .item-main`).click();
    await page.setViewportSize({ width: 320, height: 568 });
    const columns = await page.evaluate(() => [".sets-table-head", ".sets-table .set-row"].map(s => getComputedStyle(document.querySelector(s)).gridTemplateColumns));
    assert.equal(columns[0], columns[1]);
    assert.equal(await page.locator('[data-set-field="weight"]').count(), 0);
    if (index === 0) assert.equal(await page.locator("[data-set-timer]").count(), 2);
    await page.click('[data-personal-card="load"]');
    assert.match(await page.locator("[data-weight-chart]").textContent(), /Evolução/);
    await page.keyboard.press("Escape");
    await page.click("#sheet-close");
    await page.waitForSelector("#sheet", { state: "hidden" });
  }
  await page.goto(server.url + "#/exercicios/ver/flexao-joelho-elastico");
  await page.click('[data-personal-card="load"]');
  const bands = page.locator("[data-band]");
  await bands.nth(0).click();
  await bands.nth(1).click();
  assert.equal(await page.locator('[data-band][aria-checked="true"]').count(), 1);
  assert.equal(await bands.nth(1).getAttribute("aria-checked"), "true");
}));

test("cards e painéis sem violações axe nos quatro temas e dois modos", () => withExercise(async page => {
  await page.addScriptTag({ content: axeSrc });
  const problems = [];
  for (const style of ["energia", "esportivo", "pink-money", "arcade"]) for (const mode of ["light", "dark"]) {
    await page.evaluate(([st, th]) => (MegTheme.setStyle(st), MegTheme.set(th)), [style, mode]);
    for (const panel of [null, "load", "note"]) {
      if (panel) await page.click(`[data-personal-card="${panel}"]`);
      const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(x => `${x.id}: ${x.nodes[0]?.target.join(" ")}`));
      v.forEach(x => problems.push(`${style}/${mode}/${panel}: ${x}`));
      if (panel) await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
    }
  }
  assert.deepEqual(problems, []);
}));
