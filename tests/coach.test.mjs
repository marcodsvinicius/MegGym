// Treinador: monta treinos em 1.728 combinações (foco, tempo, objetivo, equipamentos, limitações e nível)
// e confere as regras de cada um (tests/coach-rules.js).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startServer, openApp, seedUser, ROOT } from "./helpers.mjs";

let server;
before(async () => (server = await startServer()));
after(() => server.close());

test("treinador: regras de montagem valem em todas as combinações", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    const all = ["halter", "banco", "elastico", "barra-fixa", "kettlebell", "caneleira", "step", "bola-suica", "corda", "anilha", "estacao", "roldana"];
    await seedUser(page, { equipment: all });
    // Dor forte registrada na flexão: ela nunca pode entrar.
    await page.evaluate(() => MegStore.updateUser(MegStore.currentUser().id, { level: "intermediario", painLog: { flexao: { score: 8 } } }));
    await page.reload();
    await page.waitForSelector("#app-shell:not(.hidden)");
    await page.addScriptTag({ url: `${server.url}tests/coach-rules.js` });
    const data = JSON.parse(await readFile(join(ROOT, "data/exercises.json"), "utf8"));
    const result = await page.evaluate((d) => window.checkCoachRules(d), data);
    assert.ok(result.combos > 1000, "poucas combinações testadas");
    assert.deepEqual(result.errors.slice(0, 10), [], `${result.errors.length} violações`);
    assert.deepEqual(errors, [], "erros de JavaScript na página");
  } finally {
    await browser.close();
  }
});

test("treinador: limitações no perfil e no tour chegam ao treinador", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page, { equipment: ["halter", "banco"] });
    await page.evaluate(() => (location.hash = "#/atividade/limitacoes"));
    await page.click('[data-lim="region"][data-lim-id="joelho"]');
    await page.click('[data-lim="region"][data-lim-id="joelho"]');
    assert.match(await page.textContent('[data-lim="region"][data-lim-id="joelho"]'), /dói/);
    await page.click('#limits-form [type="submit"]');
    // Espera a tela de Configurações aparecer (o endereço muda antes de a tela ser desenhada).
    await page.waitForFunction(() => location.hash === "#/atividade/configuracoes" && /Joelho \(evitar\)/.test(document.querySelector("#app").textContent));
    const saved = await page.evaluate(() => MegStore.currentUser().limits);
    assert.equal(saved.regions.joelho, "evitar");
    // O treinador já começa com a limitação marcada.
    await page.evaluate(() => (location.hash = "#/treinador"));
    await page.click("[data-coach-begin]");
    await page.click('[data-coach-time="30"]');
    await page.click('[data-coach-focus="inferiores"]');
    await page.click("[data-coach-next]"); // grupos
    await page.click("[data-coach-next]"); // equipamentos
    await page.click('[data-coach-level="intermediario"]'); // nível (limitações já salvas: etapa pulada)
    await page.click("[data-coach-next]"); // objetivo
    await page.waitForSelector(".coach-result");
    assert.match(await page.textContent(".coach-summary"), /Joelho \(evitar\)/);
    assert.deepEqual(errors, [], "erros de JavaScript na página");
  } finally {
    await browser.close();
  }
});

test("treinador: divisão da semana sem exercício repetido entre os dias", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page, { equipment: ["halter", "banco", "elastico", "barra-fixa", "kettlebell"] });
    const result = await page.evaluate(() =>
      [2, 3, 4, 5, 6].map((days) => {
        const split = window.MegCoach.split({ days, time: 45, goal: "hipertrofia", level: "intermediario", limits: { regions: {}, conditions: [], flags: [] } });
        const main = split.flatMap((d) => d.items.filter((it) => !it.warmup).map((it) => it.exerciseId));
        return { days, n: split.length, empty: split.filter((d) => !d.items.some((it) => !it.warmup)).length, repeated: main.length - new Set(main).size };
      })
    );
    for (const r of result) {
      assert.equal(r.n, r.days, `${r.days} dias: número de treinos`);
      assert.equal(r.empty, 0, `${r.days} dias: treino vazio`);
      if (r.days <= 4) assert.equal(r.repeated, 0, `${r.days} dias: exercício repetido`);
    }
    assert.deepEqual(errors, [], "erros de JavaScript na página");
  } finally {
    await browser.close();
  }
});
