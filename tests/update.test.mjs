// Aviso "Nova versão disponível": usa o service worker de verdade e simula uma versão nova publicada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startServer, openApp, seedUser, ROOT } from "./helpers.mjs";

const swSource = await readFile(join(ROOT, "sw.js"), "utf8");
const current = swSource.match(/VERSION = "(v\d+)"/)[1];

async function withSw(fn) {
  const server = await startServer();
  const app = await openApp(server.url, { serviceWorkers: true });
  try {
    await fn({ ...app, server });
    assert.deepEqual(app.errors.filter((e) => !/service worker/i.test(e)), []);
  } finally {
    await app.browser.close();
    server.close();
  }
}

const controlled = (page) => page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
const cacheNames = (page) => page.evaluate(() => caches.keys());

test("primeira visita: instala sem mostrar aviso e sem recarregar", () =>
  withSw(async ({ page }) => {
    await seedUser(page);
    await controlled(page);
    await page.evaluate(() => (window.__marca = 1));
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__marca), 1, "não recarregou");
    assert.equal(await page.isVisible(".update-bar"), false);
    assert.ok((await cacheNames(page)).includes(`meggym-${current}`));
  }));

test("versão nova publicada: mostra o aviso, atualiza, recarrega uma vez e mantém os dados", () =>
  withSw(async ({ page, server }) => {
    await seedUser(page, { name: "Atualiza" });
    await controlled(page);
    await page.evaluate(() => MegStore.saveExerciseNote(MegStore.currentUser().id, "flexao", "continua aqui"));

    server.override("sw.js", swSource.replace(`VERSION = "${current}"`, 'VERSION = "vTESTE"'));
    await page.evaluate(() => MegPWA.checkForUpdate());
    await page.waitForSelector(".update-bar:not(.hidden)", { timeout: 15000 });
    assert.match(await page.textContent(".update-bar"), /Nova versão disponível/);

    await page.evaluate(() => (window.__marca = 1));
    await Promise.all([page.waitForEvent("load", { timeout: 15000 }), page.click("#update-apply")]);
    await page.waitForSelector("#app-shell:not(.hidden)");
    assert.equal(await page.evaluate(() => window.__marca), undefined, "recarregou com a versão nova");

    const names = await cacheNames(page);
    assert.ok(names.includes("meggym-vTESTE"), "cache novo criado");
    assert.ok(!names.includes(`meggym-${current}`), "cache antigo apagado");
    assert.equal(await page.isVisible(".update-bar"), false, "aviso some depois de atualizar");
    const note = await page.evaluate(() => MegStore.exerciseNote(MegStore.currentUser().id, "flexao"));
    assert.equal(note, "continua aqui", "dados mantidos");

    // Não fica recarregando em loop.
    await page.evaluate(() => (window.__marca2 = 1));
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__marca2), 1);
  }));

test("'Agora não' esconde o aviso sem atualizar; reabrir o app volta a avisar", () =>
  withSw(async ({ page, server }) => {
    await seedUser(page);
    await controlled(page);
    server.override("sw.js", swSource.replace(`VERSION = "${current}"`, 'VERSION = "vDEPOIS"'));
    await page.evaluate(() => MegPWA.checkForUpdate());
    await page.waitForSelector(".update-bar:not(.hidden)", { timeout: 15000 });
    await page.evaluate(() => (window.__marca = 1));
    await page.click("#update-later");
    assert.equal(await page.isVisible(".update-bar"), false);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__marca), 1, "não recarregou");

    // Reabrindo (recarregar com a versão nova esperando): aviso aparece de novo.
    await page.reload();
    await page.waitForSelector(".update-bar:not(.hidden)", { timeout: 15000 });
  }));
