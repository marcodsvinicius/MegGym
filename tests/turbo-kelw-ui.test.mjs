import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, openApp, seedUser } from "./helpers.mjs";
let server;
before(async()=>{server=await startServer();}); after(()=>server.close());
async function withApp(fn) {
  const {browser,page,errors}=await openApp(server.url);
  try { await seedUser(page,{equipment:["halter","anilha","bola-suica"]}); await fn(page); assert.deepEqual(errors,[]); }
  finally {await browser.close();}
}

test("Turbo Kelw aparece em Explorar e inicia A com prescrições, observações e instruções próprias",()=>withApp(async page=>{
  await page.goto(server.url+"#/treinos?aba=explorar");
  await page.fill("#ex-q","Turbo Kelw");
  assert.equal(await page.locator(".structure-card").count(),1);
  await page.locator(".structure-card").click();
  assert.match(await page.locator("#app").textContent(),/segunda A · quarta B · sexta C/);
  await page.click("#st-follow");
  await page.waitForSelector("#mt-start"); await page.click("#mt-start");
  await page.waitForSelector(".run-item");
  assert.equal(await page.locator(".run-item").count(),7);
  assert.match(await page.locator(".workout-notes").textContent(),/Primeiras duas semanas/);
  await page.locator('.run-item[data-index="0"] .item-main').click();
  assert.equal(await page.locator("[data-set]").count(),2);
  assert.equal(await page.locator('[data-set-field="weight"]').first().inputValue(),"");
  await page.locator('[data-set-field="weight"]').first().fill("8");
  assert.equal(await page.locator('[data-set-field="weight"]').nth(1).inputValue(),"8");
  await page.click(".execution-preview");
  assert.match(await page.locator(".execution-instructions").textContent(),/pés totalmente apoiados/);
  await page.getByRole("button",{name:"Voltar às séries",exact:true}).click();
  await page.click("#sheet-close"); await page.waitForSelector("#sheet",{state:"hidden"});
  await page.locator('.run-item[data-index="6"] .item-main').click();
  assert.match(await page.locator(".stats").textContent(),/6 \(3s\)/);
}));

test("prancha lateral cronometra cada lado sem concluir série ou disparar descanso antes dos dois",()=>withApp(async page=>{
  await page.evaluate(()=>MegStore.startSession(MegStore.currentUser().id,"turbo-kelw-b"));
  await page.goto(server.url+"#/treinos/turbo-kelw-b/executar");
  await page.locator('.run-item[data-index="5"] .item-main').click();
  assert.equal(await page.locator("[data-set]").count(),2);
  assert.match(await page.locator(".type-tag").textContent(),/Tempo por lado/);
  assert.match(await page.locator(".sets-log").textContent(),/somente após completar os dois lados/);
  await page.locator('[data-set-field="reps"]').first().fill("1");
  await page.locator("[data-set-timer]").first().click();
  await page.waitForFunction(()=>!document.querySelector("[data-set-timer]").classList.contains("running"));
  assert.equal(await page.locator("[data-set-check]").first().getAttribute("aria-pressed"),"false");
  assert.equal(await page.locator(".rest-bar").isVisible(),false);
  await page.locator("[data-set-check]").first().click();
  assert.equal(await page.locator(".rest-bar").isVisible(),true);
}));

test("C mantém variante de tríceps no chão e pressões isométricas, inclusive na cópia editada",()=>withApp(async page=>{
  const id=await page.evaluate(()=>MegStore.copyWorkout("turbo-kelw-c",MegStore.currentUser()).id);
  await page.goto(server.url+`#/treinos/${id}/editar`);
  await page.fill("#w-name","Minha cópia Turbo C");
  await page.click('#workout-form [type="submit"]');
  await page.waitForSelector("#start-btn");
  const instructions=await page.evaluate(id=>MegStore.getWorkout(id).items[6].instructions,id);
  assert.match(instructions,/5 pressões de 5 segundos/);
  await page.click("#start-btn");
  await page.locator('.run-item[data-index="4"] .item-main').click();
  assert.match(await page.locator("#sheet-title").textContent(),/no chão/);
  assert.doesNotMatch(await page.locator(".exercise-equipment").textContent(),/Banco/);
  await page.click("#sheet-close"); await page.waitForSelector("#sheet",{state:"hidden"});
  await page.locator('.run-item[data-index="6"] .item-main').click();
  assert.match(await page.locator(".stats").textContent(),/5 × 5s/);
  await page.click(".execution-preview");
  assert.match(await page.locator(".execution-instructions").textContent(),/5 segundos de descanso entre pressões/);
}));
