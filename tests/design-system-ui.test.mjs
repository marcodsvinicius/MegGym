import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { startServer, openApp, seedUser } from "./helpers.mjs";

const axeSrc = await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let server;
before(async () => { server = await startServer(); });
after(() => server.close());
const styles = ["energia", "esportivo", "pink-money", "arcade"];

test("contrato de tokens resolve sem ciclos nos quatro temas, no app e no admin", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    for (const path of ["#/treinos/novo", "admin.html"]) {
      await page.goto(server.url + path);
      for (const style of styles) for (const mode of ["light", "dark"]) {
        const result = await page.evaluate(([st, md]) => {
          MegTheme.setStyle(st); MegTheme.set(md);
          const css = getComputedStyle(document.documentElement);
          const tokens = ["--bg", "--text", "--text-muted", "--accent", "--accent-ink", "--accent-contrast", "--success", "--on-success", "--danger", "--card-bg", "--card-border", "--card-shadow", "--field-bg", "--field-border", "--control-radius", "--system-bar", "--header-bg", "--nav-bg", "--button-shadow", "--space-4", "--fs-md", "--safe-bottom", "--ring", "--sheet-radius"];
          return { missing: tokens.filter((name) => !css.getPropertyValue(name).trim()), bar: document.querySelector('meta[name="theme-color"]').content, tokenBar: MegTheme.token("--system-bar"), effective: document.documentElement.dataset.colorScheme };
        }, [style, mode]);
        assert.deepEqual(result.missing, [], `${path}/${style}/${mode}`);
        assert.equal(result.bar, result.tokenBar);
        assert.equal(result.effective, mode);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("modo automático reage ao aparelho e não altera uma escolha explícita", async () => {
  const { browser, page } = await openApp(server.url);
  try {
    for (const style of styles) {
      await page.evaluate((s) => { MegTheme.setStyle(s); MegTheme.set("auto"); }, style);
      for (const mode of ["dark", "light"]) {
        await page.emulateMedia({ colorScheme: mode });
        await page.waitForFunction((m) => document.documentElement.dataset.colorScheme === m, mode);
        assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-theme")), false);
        assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content === MegTheme.token("--system-bar")), true);
      }
      await page.evaluate(() => MegTheme.set("light"));
      await page.emulateMedia({ colorScheme: "dark" });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), "light");
      await page.reload();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), "light");
    }
  } finally { await browser.close(); }
});

test("galeria usa componentes reais, respeita temas e funciona em celular com bottom sheet", async () => {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await page.goto(server.url + "design-system.html");
    const problems = [];
    for (const style of styles) for (const mode of ["light", "dark"]) {
      await page.selectOption("#ds-style", style);
      await page.selectOption("#ds-mode", mode);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      assert.equal(await page.locator(".ds-swatch").count(), 12);
      await page.addScriptTag({ content: axeSrc });
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
      violations.forEach((v) => problems.push(`${style}/${mode}: ${v}`));
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${style}/${mode}/${width}: overflow`);
      }
      await page.click("[data-ds-open]");
      const footer = await page.locator(".execution-sheet-footer").boundingBox();
      assert.ok(footer.y + footer.height <= 845);
      await page.getByRole("button", { name: "Voltar às séries", exact: true }).click();
      assert.equal(await page.locator("#ds-dialog").evaluate((el) => el.open), false);
    }
    await page.locator(".set-check").nth(1).click();
    assert.equal(await page.locator(".set-check").nth(1).getAttribute("aria-pressed"), "true");
    assert.deepEqual(problems, []);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => typeof window.MegStore), "undefined");
  } finally { await browser.close(); }
});
