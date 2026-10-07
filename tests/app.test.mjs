// Fluxos principais do app num celular simulado.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startServer, openApp, seedUser } from "./helpers.mjs";

let server;
before(async () => (server = await startServer()));
after(() => server.close());

async function withApp(fn) {
  const app = await openApp(server.url);
  try {
    await fn(app);
    assert.deepEqual(app.errors, [], "erros de JavaScript na página");
  } finally {
    await app.browser.close();
  }
}

test("onboarding cria o perfil e mostra o início", () =>
  withApp(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('[data-ob="next"]');
    await page.fill("#pf-name", "Ana");
    await page.fill("#pf-age", "28");
    await page.check('input[name="pf-sex"][value="feminino"]', { force: true });
    await page.click('#ob-profile [type="submit"]');
    await page.check('input[name="pf-equipment"][value="halter"]', { force: true });
    await page.click('#ob-equipment [type="submit"]');
    await page.click('#ob-style [type="submit"]');
    await page.waitForSelector("#app-shell:not(.hidden)");
    assert.match(await page.textContent(".page-title"), /Ana/);
    assert.ok(await page.isVisible(".today-card"), "cartão Treino de hoje");
  }));

test("treino: séries, descanso, pular, trocar, reordenar e terminar", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.click(".today-card [data-start-workout]");
    await page.waitForSelector(".run-item");
    const total = await page.locator(".run-item").count();

    // Fazer agora: o 3º vira o 1º.
    const third = await page.locator(".run-item").nth(2).getAttribute("data-index");
    await page.locator(".run-item").nth(2).locator("[data-menu]").click();
    await page.click('[data-confirm="now"]');
    assert.equal(await page.locator(".run-item").first().getAttribute("data-index"), third);

    // Trocar o primeiro.
    await page.locator(".run-item").first().locator("[data-menu]").click();
    await page.click('[data-confirm="swap"]');
    await page.waitForSelector(".action-sheet h2:text('Trocar por…')");
    await page.locator(".action-sheet [data-confirm]").first().click();
    await page.waitForSelector(".run-tag");

    // Pular o último.
    await page.locator(".run-item").last().locator("[data-menu]").click();
    await page.click('[data-confirm="skip"]');
    assert.match(await page.textContent("#run-count"), new RegExp(`de ${total - 1} exercícios`));

    // Séries do primeiro: peso, check → descanso começa.
    await page.locator(".run-item").first().locator(".item-main").click();
    await page.waitForSelector(".set-row");
    const rows = await page.locator(".set-row").count();
    for (let i = 0; i < rows; i++) {
      await page.locator(".set-row").nth(i).locator('[data-set-field="reps"]').fill("10");
      const w = page.locator(".set-row").nth(i).locator('[data-set-field="weight"]');
      if (await w.count()) await w.fill("12");
      await page.locator(".set-row").nth(i).locator("[data-set-check]").click();
    }
    assert.ok(await page.isVisible(".rest-bar"), "barra de descanso");
    const saved = await page.evaluate(() => localStorage.getItem("meggym.rest." + MegStore.currentUser().id));
    assert.ok(saved, "descanso salvo");
    await page.click("#sheet-close");
    assert.match(await page.locator("[data-sets-summary]").first().textContent(), /séries feitas: 10 reps/);

    // Descanso continua depois de recarregar.
    await page.reload();
    await page.waitForSelector(".rest-bar:not(.hidden)");
    await page.click('[data-rest="skip"]');

    // Marca o resto e termina.
    while (await page.locator('[data-toggle][aria-pressed="false"]').count()) await page.locator('[data-toggle][aria-pressed="false"]').first().click();
    await page.click("#finish-btn");
    await page.waitForURL(/historico\/.+novo=1/);
    const [img] = await Promise.all([page.waitForEvent("download"), page.click("#share-btn")]);
    assert.match(img.suggestedFilename(), /^meggym-.*\.png$/, "resumo para compartilhar");
    await page.goto(server.url + "#/atividade");
    await page.waitForSelector("#evolution");
    const h = await page.evaluate(() => MegStore.history()[0]);
    assert.equal(h.exercises.length, total - 1);
    assert.ok(h.exercises.some((e) => e.swappedFrom), "troca registrada");
    assert.ok(h.exercises[0].setLog.length > 0, "séries registradas");
    await page.waitForSelector("#evolution .wchart"); // gráfico de evolução
    await page.click('[data-metric="volume"]');
    assert.match(await page.textContent("#evolution .meta"), /kg no total/);
  }));

test("última vez aparece na série do treino seguinte", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.evaluate(() => {
      const u = MegStore.currentUser();
      const w = MegStore.workouts()[0];
      MegStore.startSession(u.id, w.id);
      MegStore.finishSession(u, w, 1, [{ exerciseId: w.items[0].exerciseId, name: "x", group: "costas", sets: "3", reps: "10", setLog: [{ reps: "11", weight: "14", done: true }] }]);
      MegStore.startSession(u.id, w.id);
      location.hash = `#/treinos/${w.id}/executar`;
    });
    await page.waitForSelector(".run-item");
    await page.locator('.run-item[data-index="0"] .item-main').click();
    assert.match(await page.locator(".set-prev").first().textContent(), /11 reps(\/lado)? × 14 kg/);
  }));

test("gráfico do exercício alterna peso e repetições", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.goto(server.url + "#/exercicios/ver/arnold-press");
    await page.fill("#ex-weight", "10");
    await page.waitForSelector("[data-weight-chart] .wchart");
    await page.click('[data-chart-mode="reps"]');
    assert.match(await page.textContent("[data-weight-chart]"), /Registre as repetições/);
  }));

test("backup: exporta e restaura num aparelho limpo", () =>
  withApp(async ({ page }) => {
    await seedUser(page, { name: "Backup Teste" });
    await page.evaluate(() => MegStore.saveExerciseNote(MegStore.currentUser().id, "flexao", "nota secreta"));
    await page.goto(server.url + "#/atividade/configuracoes");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#backup-export")]);
    const path = await dl.path();
    const data = JSON.parse(await readFile(path, "utf8"));
    assert.equal(data.user.name, "Backup Teste");
    assert.ok(data.createdAt);

    await page.evaluate(() => localStorage.clear());
    await page.goto(server.url);
    await page.reload();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("[data-restore]")]);
    await chooser.setFiles(path);
    await page.click('[data-confirm="yes"]');
    await page.waitForSelector("#app-shell:not(.hidden)");
    const restored = await page.evaluate(() => [MegStore.currentUser().name, MegStore.exerciseNote(MegStore.currentUser().id, "flexao")]);
    assert.deepEqual(restored, ["Backup Teste", "nota secreta"]);
  }));

test("arquivo que não é backup mostra erro", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.goto(server.url + "#/atividade/configuracoes");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#backup-import")]);
    await chooser.setFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"oi":1}') });
    await page.waitForSelector(".toast.error");
  }));

test("todas as telas abrem sem erro", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    const ids = await page.evaluate(() => ({ w: MegStore.workouts()[0].id, s: MegStore.structures()[0]?.id }));
    for (const hash of ["#/inicio", "#/treinos", `#/treinos/${ids.w}`, `#/treinos/${ids.w}/editar`, "#/treinos/novo", "#/exercicios", "#/exercicios/grupo/peito", "#/exercicios/ver/flexao", "#/exercicios/novo", "#/atividade", "#/atividade/configuracoes", "#/atividade/perfil", "#/atividade/equipamentos", ids.s ? `#/estruturas/${ids.s}` : "#/inicio"]) {
      await page.goto(server.url + hash);
      await page.waitForTimeout(150);
      assert.ok((await page.locator("#app").innerHTML()).length > 50, `tela vazia: ${hash}`);
    }
  }));

test("cartão de instalar: fecha e continua em Configurações", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.waitForSelector(".install-card");
    await page.click("[data-install-dismiss]");
    await page.waitForSelector(".install-card", { state: "detached" });
    await page.reload();
    await page.waitForSelector("#app-shell:not(.hidden)");
    assert.equal(await page.locator(".install-card").count(), 0, "cartão continua fechado");
    await page.goto(server.url + "#/atividade");
    assert.equal(await page.locator(".install-card").count(), 0, "fechado também na Atividade");
    await page.goto(server.url + "#/atividade/configuracoes");
    await page.click("#install-setting");
    await page.waitForSelector(".install-help"); // sem instalação com 1 toque no teste → abre o passo a passo
  }));

test("terminar antes registra só os exercícios feitos; descartar não registra", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.click(".today-card [data-start-workout]");
    await page.waitForSelector("#finish-card");
    assert.ok(await page.locator("#finish-btn").isDisabled(), "sem nada feito não termina");
    await page.locator("[data-toggle]").first().click();
    await page.click("#finish-btn");
    await page.click('[data-confirm="yes"]');
    await page.waitForURL(/historico\/.+novo=1/);
    assert.equal(await page.evaluate(() => MegStore.history()[0].exercises.length), 1);

    await page.goto(server.url + "#/inicio");
    await page.waitForSelector(".today-card");
    const id = await page.evaluate(() => MegStore.workouts()[0].id);
    await page.evaluate((w) => MegStore.startSession(MegStore.currentUser().id, w), id);
    await page.goto(server.url + `#/treinos/${id}/executar`);
    await page.click("#cancel-run");
    await page.click('[data-confirm="yes"]');
    await page.waitForURL(new RegExp(`treinos/${id}$`));
    assert.equal(await page.evaluate(() => MegStore.history().length), 1, "descartado não vai pro histórico");
  }));

test("exercício de tempo: cronômetro marca a série; recorde e bi-set", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    await page.evaluate(() => {
      const u = MegStore.currentUser();
      const w = MegStore.saveWorkout({ name: "Core", items: [
        { exerciseId: "prancha", sets: "2", reps: "2s", linkNext: true },
        { exerciseId: "flexao", sets: "1", reps: "10" },
      ] }, u);
      // histórico anterior: melhor flexão = 10 reps
      MegStore.startSession(u.id, w.id);
      MegStore.finishSession(u, w, 1, [{ exerciseId: "flexao", name: "Flexão", group: "peito", sets: "1", reps: "10", setLog: [{ reps: "10", done: true }] }]);
      MegStore.startSession(u.id, w.id);
      location.hash = `#/treinos/${w.id}/executar`;
    });
    await page.waitForSelector(".run-item .ss-tag");
    // Prancha: cronômetro de 2s marca a série sozinho e, por ser bi-set, não inicia descanso.
    await page.locator('.run-item[data-index="0"] .item-main').click();
    await page.locator("[data-set-timer]").first().click();
    await page.waitForSelector('.set-row.done', { timeout: 6000 });
    assert.equal(await page.isVisible(".rest-bar"), false, "sem descanso no meio do bi-set");
    await page.click("#sheet-close");
    // Flexão com 12 reps = recorde.
    await page.locator('.run-item[data-index="1"] .item-main').click();
    await page.locator('[data-set-field="reps"]').first().fill("12");
    await page.locator("[data-set-check]").first().click();
    await page.waitForSelector(".set-pr");
    assert.ok(await page.isVisible(".rest-bar"), "descanso depois do último do bi-set");
  }));

test("monta bi-set no formulário do treino", () =>
  withApp(async ({ page }) => {
    await seedUser(page);
    const id = await page.evaluate(() => MegStore.workouts()[0].id);
    await page.goto(server.url + `#/treinos/${id}/editar`);
    await page.locator("[data-link]").first().click();
    assert.ok(await page.isVisible(".item-row .ss-tag"));
    await page.click('#workout-form [type="submit"]');
    await page.waitForURL(new RegExp(`treinos/${id}$`));
    assert.equal(await page.evaluate((w) => MegStore.getWorkout(w).items[0].linkNext, id), true);
    assert.equal(await page.locator(".item-row .ss-tag").count(), 2);
  }));
