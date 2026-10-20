import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, openApp, seedUser } from "./helpers.mjs";

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
    await page.waitForSelector(".exercise-video");
    await fn(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test("cards vêm antes do vídeo vertical, séries, carga e observações nas telas mobile", () => withApp(async (page) => {
  const sequence = await page.evaluate(() => {
    const content = document.querySelector("#sheet-content");
    const selectors = [".stats", ".exercise-video", ".sets-log", ".my-load", ".my-note"];
    return selectors.map((selector) => [...content.children].indexOf(content.querySelector(selector)));
  });
  assert.ok(sequence.every((n) => n >= 0));
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b));
  assert.ok(sequence[0] < sequence[1]);
  assert.match(await page.textContent(".stats"), /Séries[\s\S]*Reps[\s\S]*Descanso[\s\S]*RIR/);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const box = await page.locator(".exercise-video").boundingBox();
    assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.01);
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
    const button = await page.locator("[data-video-fullscreen]").boundingBox();
    assert.ok(button.height >= 44);
  }
  // A carga abaixo das séries continua alimentando a sugestão de peso.
  await page.fill("#ex-weight", "14");
  assert.equal(await page.locator('[data-set-field="weight"]').first().getAttribute("placeholder"), "14");
  await page.fill("#ex-note", "Apoio firme");
  await page.locator("#ex-note").blur();
  assert.equal(await page.evaluate(() => MegStore.exerciseNote(MegStore.currentUser().id, "goblet-squat")), "Apoio firme");
}));

test("tela cheia expandida cobre a viewport, preserva o iframe e fecha antes do painel", () => withApp(async (page) => {
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
    return { width: css.width, height: css.height, boxSizing: css.boxSizing, transform: getComputedStyle(el.closest(".sheet")).transform, innerWidth, innerHeight };
  });
  assert.ok(Math.abs(box.x) < 1 && Math.abs(box.y) < 1, JSON.stringify(box));
  assert.ok(Math.abs(box.width - size.width) < 1 && Math.abs(box.height - size.height) < 1, JSON.stringify({ box, size, metrics }));
  const frame = await page.locator(".exercise-video iframe").boundingBox();
  assert.ok(Math.abs(frame.width / frame.height - 9 / 16) < 0.01);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".exercise-video.video-expanded").count(), 0);
  assert.equal(await page.locator("#sheet").isVisible(), true);
  assert.equal(await page.locator(".exercise-video iframe").getAttribute("src"), src);
  assert.equal(await page.locator(".exercise-video iframe").getAttribute("data-preserved"), "yes");
  await page.click("[data-video-fullscreen]");
  await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
  assert.equal(await page.locator("body.video-fullscreen").count(), 0);
}));

test("botão solicita tela cheia nativa e trata a saída pelo navegador", () => withApp(async (page) => {
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
  await page.evaluate(() => { document.querySelector(".exercise-video").requestFullscreen = async () => { throw Error("Não disponível"); }; });
  await page.click("[data-video-fullscreen]");
  assert.equal(await page.locator(".exercise-video.video-expanded").count(), 1);
  await page.goto(server.url + "#/inicio");
  await page.waitForSelector(".page-title");
  assert.equal(await page.locator("body.video-fullscreen").count(), 0);
}));
