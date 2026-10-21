import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startServer, openApp, seedUser } from "./helpers.mjs";
let server;
before(async () => { server = await startServer(); });
after(() => server.close());
async function withApp(fn) {
  const { browser, page, errors } = await openApp(server.url);
  try {
    await seedUser(page);
    await fn(page);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}
async function download(page,format) {
  const promise = page.waitForEvent("download");
  await page.click(`[data-analysis-format="${format}"]`);
  const file = await promise;
  assert.match(file.suggestedFilename(),new RegExp(`^meggym-analise-.*\\.${format}$`));
  return readFile(await file.path(),"utf8");
}

test("exporta TXT, JSON e CSV completos, sem alterar dados do usuário", () => withApp(async page => {
  await page.evaluate(() => {
    const u = MegStore.currentUser();
    const w = MegStore.saveWorkout({ name: "Treino exportável", items: [{ exerciseId: "goblet-squat", sets: "3", reps: "10", rir: "2" }] },u);
    MegStore.followWorkout(u.id,w.id);
    MegStore.startSession(u.id,w.id);
    MegStore.finishSession(u,w,1,[{ exerciseId:"goblet-squat",name:"Agachamento histórico",sets:"1",reps:"10",note:"Observação na sessão",type:"reps",setLog:[{reps:"10",weight:"14",done:true}] }]);
    MegStore.saveExerciseNote(u.id,"goblet-squat","Observação atual");
    MegStore.startSession(u.id,w.id);
    MegStore.saveSets(u.id,0,[{reps:"8",weight:"16",done:true}]);
  });
  await page.goto(server.url + "#/atividade");
  await page.getByRole("link",{name:"Exportar para análise",exact:true}).click();
  await page.waitForSelector("#analysis-export-form");
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  const json = JSON.parse(await download(page,"json"));
  assert.equal(json.tipo,"analise");
  assert.equal(json.resumo.sessoes,1);
  assert.equal(json.planoAtual.treinos[0].nome,"Treino exportável");
  assert.equal(json.treinoEmAndamento.exercicios[0].series[0].cargaKg,16);
  assert.equal(json.historico[0].exercicios[0].series[0].cargaKg,14);
  const txt = await download(page,"txt");
  assert.match(txt,/Treino exportável/);
  assert.match(txt,/Observação na sessão/);
  assert.match(txt,/Observação atual/);
  const csv = await download(page,"csv");
  assert.match(csv,/"Agachamento histórico"/);
  assert.match(csv,/"14";"10"/);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)),before);
  await page.uncheck("#analysis-profile");
  const noProfile = JSON.parse(await download(page,"json"));
  assert.equal(noProfile.perfil.nome,undefined);
  assert.equal(noProfile.perfil.idade,undefined);
}));

test("filtro de período e perfil sem histórico funcionam pelo atalho das configurações", () => withApp(async page => {
  await page.goto(server.url + "#/atividade/configuracoes");
  await page.getByRole("link",{ name:/Exportar para análise/ }).click();
  await page.selectOption("#analysis-period","30");
  assert.match(await page.locator("#analysis-export-summary").textContent(),/0 sessões concluídas/);
  const data = JSON.parse(await download(page,"json"));
  assert.equal(data.periodo.dias,30);
  assert.equal(data.historico.length,0);
  assert.match(await download(page,"txt"),/Nenhuma sessão concluída/);
}));

test("exportação disponível sem rede e interface cabe em celular estreito", () => withApp(async page => {
  await page.goto(server.url + "#/atividade/exportar");
  await page.waitForSelector("#analysis-export-form");
  await page.setViewportSize({width:320,height:568});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.context().setOffline(true);
  const data = JSON.parse(await download(page,"json"));
  assert.equal(data.app,"MegGym");
  await page.context().setOffline(false);
}));
