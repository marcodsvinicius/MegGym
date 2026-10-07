// Acessibilidade automática (axe-core, WCAG A/AA) nas telas principais, nos 3 estilos e nos 2 modos.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { startServer, openApp, seedUser } from "./helpers.mjs";

const axeSrc = await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let server;
before(async () => (server = await startServer()));
after(() => server.close());

test("sem violações de acessibilidade (axe) nos 3 estilos, claro e escuro", async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await seedUser(page);
    const id = await page.evaluate(() => MegStore.workouts()[0].id);
    const screens = ["#/inicio", "#/treinos", "#/treinos?aba=explorar", `#/treinos/${id}`, "#/treinos/novo", "#/exercicios/grupo/peito", "#/exercicios/ver/prancha", "#/atividade", "#/atividade?aba=evolucao", "#/atividade?aba=historico", "#/atividade/configuracoes"];
    const problems = [];
    for (const style of ["suave", "energia", "esportivo"])
      for (const theme of ["light", "dark"]) {
        await page.evaluate(([st, th]) => (MegTheme.setStyle(st), MegTheme.set(th)), [style, theme]);
        for (const hash of screens) {
          await page.goto(server.url + hash);
          await page.waitForTimeout(150);
          await page.addScriptTag({ content: axeSrc });
          const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.target.join(" ")}`));
          v.forEach((x) => problems.push(`${style}/${theme} ${hash} → ${x}`));
        }
      }
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
