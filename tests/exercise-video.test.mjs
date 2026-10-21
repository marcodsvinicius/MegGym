import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { startServer, openApp, seedUser } from "./helpers.mjs";

const axeSrc = await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let server;
before(async () => { server = await startServer(); });
after(() => server.close());

async function withApp(fn) {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    const id = await page.evaluate(() => {
      const u = MegStore.currentUser();
      const w = MegStore.saveWorkout({ name: "Player vertical", items: [{ exerciseId: "goblet-squat", sets: "3", reps: "8-12", rir: "2", rest: "90s" }] }, u);
      MegStore.startSession(u.id, w.id);
      return w.id;
    });
    await page.goto(server.url + `#/treinos/${id}/executar`);
    await page.locator(".run-item .item-main").click();
    await page.waitForSelector(".execution-preview");
    await fn(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function openVideo(page) {
  await page.click(".execution-preview");
  await page.waitForSelector(".execution-dialog[open] .exercise-video");
}

test("execução é o primeiro card, instruções ficam no painel e equipamentos após o grupo", () => withApp(async (page) => {
  const sequence = await page.evaluate(() => {
    const content = document.querySelector("#sheet-content");
    const selectors = [".execution-preview", ".stats", ".sets-log", ".my-load", ".my-note"];
    return selectors.map((selector) => [...content.children].indexOf(content.querySelector(selector)));
  });
  assert.ok(sequence.every((n) => n >= 0));
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b));
  assert.ok(sequence[0] < sequence[1]);
  assert.equal(await page.locator("#sheet-content .execution-instructions").count(), 0);
  assert.deepEqual(await page.locator("#sheet-content > .sheet-section > h3").allTextContents(), ["Séries", "Grupo muscular", "Equipamentos"]);
  const spacing = await page.evaluate(() => document.querySelector(".sets-table").getBoundingClientRect().top - document.querySelector(".sets-log > h3").getBoundingClientRect().bottom);
  assert.ok(spacing >= 14, `Espaço entre título e tabela: ${spacing}`);
  assert.match(await page.textContent(".stats"), /Séries[\s\S]*Reps[\s\S]*Descanso[\s\S]*RIR/);
  assert.equal(await page.locator(".exercise-video iframe").count(), 0);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const preview = await page.locator(".execution-preview").boundingBox();
    assert.ok(preview.height >= 44 && preview.height <= 96);
    await openVideo(page);
    assert.match(await page.locator(".execution-instructions").textContent(), /Execução/);
    assert.ok((await page.locator(".execution-instructions .exercise-desc").textContent()).length > 0);
    const box = await page.locator(".exercise-video").boundingBox();
    assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.01);
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
    const button = await page.locator("[data-video-fullscreen]").boundingBox();
    assert.ok(button.height >= 44);
    const back = await page.getByRole("button", { name: "Voltar às séries", exact: true }).boundingBox();
    assert.ok(back.y >= 0 && back.y + back.height <= viewport.height);
    await page.getByRole("button", { name: "Voltar às séries", exact: true }).click();
    assert.equal(await page.locator(".exercise-video iframe").count(), 0);
  }
  // A carga abaixo das séries continua alimentando a sugestão de peso.
  await page.click('[data-personal-card="load"]');
  await page.fill("#ex-weight", "14");
  assert.equal(await page.locator('[data-set-field="weight"]').first().getAttribute("placeholder"), "14");
  await page.getByRole("button", { name: "Voltar ao exercício", exact: true }).click();
  await page.click('[data-personal-card="note"]');
  await page.fill("#ex-note", "Apoio firme");
  await page.locator("#ex-note").blur();
  await page.getByRole("button", { name: "Voltar ao exercício", exact: true }).click();
  assert.equal(await page.evaluate(() => MegStore.exerciseNote(MegStore.currentUser().id, "goblet-squat")), "Apoio firme");
}));

test("exercício sem vídeo mantém card de execução e instruções acessíveis", () => withApp(async (page) => {
  const id = await page.evaluate(() => {
    MegStore.saveExercise({ name: "Exercício sem vídeo", group: "peito", description: "Instrução exclusiva sem vídeo", equipment: [] }, MegStore.currentUser());
    return MegStore.customExercises().find(e => e.name === "Exercício sem vídeo").id;
  });
  await page.goto(server.url + `#/exercicios/ver/${id}`);
  await page.click(".execution-preview");
  assert.equal(await page.locator(".exercise-video iframe").count(), 0);
  assert.equal(await page.locator(".execution-instructions .exercise-desc").textContent(), "Instrução exclusiva sem vídeo");
  await page.getByRole("button", { name: "Voltar às séries", exact: true }).click();
  assert.equal(await page.locator(".exercise-page .execution-preview").isVisible(), true);
}));

test("tela cheia expandida cobre a viewport, preserva o iframe e fecha antes do painel", () => withApp(async (page) => {
  await openVideo(page);
  await page.evaluate(() => { document.querySelector(".exercise-video").requestFullscreen = undefined; });
  const src = await page.locator(".exercise-video iframe").getAttribute("src");
  await page.locator(".exercise-video iframe").evaluate((el) => { el.dataset.preserved = "yes"; });
  await page.click("[data-video-fullscreen]");
  assert.equal(await page.locator("[data-video-fullscreen]").getAttribute("aria-expanded"), "true");
  await page.waitForFunction(() => {
    const box = document.querySelector(".exercise-video").getBoundingClientRect();
    return Math.abs(box.x) < 1 && Math.abs(box.y) < 1;
  });
  const box = await page.locator(".exercise-video").boundingBox();
  const size = page.viewportSize();
  const metrics = await page.locator(".exercise-video").evaluate((el) => {
    const css = getComputedStyle(el);
    return { width: css.width, height: css.height, boxSizing: css.boxSizing, dialog: getComputedStyle(el.closest("dialog")).width, innerWidth, innerHeight };
  });
  assert.ok(Math.abs(box.x) < 1 && Math.abs(box.y) < 1, JSON.stringify(box));
  assert.ok(Math.abs(box.width - size.width) < 1 && Math.abs(box.height - size.height) < 1, JSON.stringify({ box, size, metrics }));
  const frame = await page.locator(".exercise-video iframe").boundingBox();
  assert.ok(Math.abs(frame.width / frame.height - 9 / 16) < 0.01);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".exercise-video.video-expanded").count(), 0);
  assert.equal(await page.locator("#sheet").isVisible(), true);
  assert.equal(await page.locator(".execution-dialog:not(.personal-dialog)").evaluate(el => el.open), true);
  assert.equal(await page.locator(".exercise-video iframe").getAttribute("src"), src);
  assert.equal(await page.locator(".exercise-video iframe").getAttribute("data-preserved"), "yes");
  await page.click("[data-video-fullscreen]");
  await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
  assert.equal(await page.locator("body.video-fullscreen").count(), 0);
}));

test("botão solicita tela cheia nativa e trata a saída pelo navegador", () => withApp(async (page) => {
  await openVideo(page);
  await page.evaluate(() => {
    const video = document.querySelector(".exercise-video");
    video.requestFullscreen = async () => {
      window.__requestedVideoFullscreen = true;
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video });
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });
  await page.click("[data-video-fullscreen]");
  assert.equal(await page.evaluate(() => window.__requestedVideoFullscreen), true);
  await page.evaluate(() => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  assert.equal(await page.locator("body.video-fullscreen").count(), 0);
  assert.equal(await page.locator("[data-video-fullscreen]").getAttribute("aria-expanded"), "false");
}));

test("recusa da tela cheia nativa usa expansão e navegação limpa o estado", () => withApp(async (page) => {
  await openVideo(page);
  await page.evaluate(() => { document.querySelector(".exercise-video").requestFullscreen = async () => { throw Error("Não disponível"); }; });
  await page.click("[data-video-fullscreen]");
  assert.equal(await page.locator(".exercise-video.video-expanded").count(), 1);
  await page.goto(server.url + "#/inicio");
  await page.waitForSelector(".page-title");
  assert.equal(await page.locator("body.video-fullscreen").count(), 0);
  assert.equal(await page.locator("body.execution-video-open").count(), 0);
  assert.equal(await page.locator(".execution-dialog:not(.personal-dialog)").evaluate(el => el.open), false);
  assert.equal(await page.locator(".exercise-video iframe").count(), 0);
}));

test("fechar vídeo preserva campos, séries, descanso, rolagem e foco do treino", () => withApp(async (page) => {
  const weights = page.locator('[data-set-field="weight"]');
  await weights.first().fill("14");
  await page.locator('[data-set-field="reps"]').first().fill("12");
  await page.locator('[data-set-check]').first().click();
  await page.click('[data-personal-card="note"]');
  await page.locator("#ex-note").fill("Apoio firme");
  await page.getByRole("button", { name: "Voltar ao exercício", exact: true }).click();
  await page.locator(".execution-preview").scrollIntoViewIfNeeded();
  const scroll = await page.locator("#sheet-content").evaluate(el => el.scrollTop);
  const session = await page.evaluate(() => JSON.stringify(MegStore.session(MegStore.currentUser().id)));
  await openVideo(page);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#sheet").isVisible(), true);
  assert.equal(await page.locator(".execution-dialog:not(.personal-dialog)").evaluate(el => el.open), false);
  assert.equal(await weights.first().inputValue(), "14");
  assert.equal(await weights.nth(1).inputValue(), "14");
  assert.equal(await page.locator('[data-set-check]').first().getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#ex-note").inputValue(), "Apoio firme");
  assert.equal(await page.locator("#sheet-content").evaluate(el => el.scrollTop), scroll);
  assert.equal(await page.locator(".execution-preview").evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => JSON.stringify(MegStore.session(MegStore.currentUser().id))), session);
  assert.equal(await page.locator(".rest-bar").isVisible(), true);
  await openVideo(page);
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  assert.equal(await page.locator(".exercise-video iframe").count(), 0);
}));

test("catálogo também abre vídeo, fecha pelo fundo e conserva botão sem miniatura", () => withApp(async (page) => {
  await page.goto(server.url + "#/exercicios/ver/goblet-squat");
  await page.waitForSelector(".exercise-page .execution-preview");
  await page.locator("[data-video-thumbnail]").evaluate(el => el.dispatchEvent(new Event("error")));
  assert.equal(await page.locator("[data-video-thumbnail]").isVisible(), false);
  await openVideo(page);
  const bounds = await page.locator(".execution-dialog:not(.personal-dialog)").boundingBox();
  assert.ok(bounds.y > 4);
  await page.mouse.click(4, 4);
  assert.equal(await page.locator(".execution-dialog:not(.personal-dialog)").evaluate(el => el.open), false);
  assert.equal(await page.locator(".exercise-page .execution-preview").isVisible(), true);
}));

test("painel do vídeo é acessível nos quatro estilos, em claro e escuro", () => withApp(async (page) => {
  await page.addScriptTag({ content: axeSrc });
  const problems = [];
  for (const style of ["energia", "esportivo", "pink-money", "arcade"]) {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(([st, th]) => (MegTheme.setStyle(st), MegTheme.set(th)), [style, theme]);
      await openVideo(page);
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(v => `${v.id}: ${v.nodes[0]?.target.join(" ")}`));
      violations.forEach(v => problems.push(`${style}/${theme}: ${v}`));
      await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
    }
  }
  assert.deepEqual(problems, []);
}));
