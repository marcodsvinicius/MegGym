import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CSS_MODULES, bundleCss } from "../tools/build-css.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CSS publicado é o bundle dos módulos e não deixa tokens sem definição", async () => {
  const css = await bundleCss();
  assert.equal(await read("assets/css/style.css"), css);
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  // Valores de dados, fornecidos pelo template/JS e nunca definidos como parte do tema.
  const runtime = new Set(["--group-color", "--hero-image", "--band-color", "--bar-value", "--progress", "--i", "--p", "--rot", "--drift", "--confetti-x", "--confetti-color", "--confetti-delay", "--confetti-duration"]);
  const missing = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]).filter((name) => !defined.has(name) && !runtime.has(name));
  assert.deepEqual([...new Set(missing)], []);
});

test("componentes usam tokens; templates só passam valores de dados por custom properties", async () => {
  for (const name of [...CSS_MODULES.filter((n) => !["tokens", "themes"].includes(n)), "design-system"]) {
    const css = (await read(`assets/css/${name}.css`)).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(/i, `${name}: cor fixa fora dos tokens`);
    assert.doesNotMatch(css, /font-size:\s*[\d.]+rem/, `${name}: tamanho de texto fora da escala`);
    assert.doesNotMatch(css, /z-index:\s*(?:[2-8]|\d{2,})\s*[;}]/, `${name}: camada sem token`);
  }
  for (const path of ["assets/js/app.js", "assets/js/common.js", "index.html", "admin.html", "design-system.html"]) {
    const source = await read(path);
    const inline = [...source.matchAll(/style="([^"\n]*)"/g)];
    for (const [, value] of inline) assert.match(value, /^--[\w-]+:/, `${path}: apresentação fixa no template`);
  }
});

test("fontes versionadas, galeria e aplicação usam a mesma versão de CSS", async () => {
  const versions = new Set();
  for (const path of ["index.html", "admin.html", "sw.js", "assets/css/base.css", "assets/css/style.css", "design-system.html"]) {
    for (const m of (await read(path)).matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
  }
  assert.equal(versions.size, 1);
  assert.doesNotMatch(await read("assets/css/style.css"), /@import\b/, "produção não depende dos módulos CSS em rede");
});
