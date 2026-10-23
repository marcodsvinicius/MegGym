// Fontes em ordem explícita; o resultado é estático e continua funcionando offline.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const CSS_MODULES = [
  "tokens", "themes", "base", "layout", "controls", "cards", "training",
  "activity", "onboarding", "admin", "overlays", "motion", "utilities",
];
const cssRoot = new URL("../assets/css/", import.meta.url);
export async function bundleCss() {
  const sources = await Promise.all(CSS_MODULES.map((name) => readFile(new URL(`${name}.css`, cssRoot), "utf8")));
  return "/* GERADO por npm run css:build. Edite os módulos; veja docs/design-system.md. */\n\n"
    + sources.map((source, i) => `/* ===== ${CSS_MODULES[i]}.css ===== */\n${source.trim()}\n`).join("\n");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await bundleCss();
  const target = new URL("style.css", cssRoot);
  if (process.argv.includes("--check")) {
    if (await readFile(target, "utf8") !== result) {
      console.error("style.css está desatualizado. Rode npm run css:build e inclua o resultado no commit.");
      process.exitCode = 1;
    }
  } else {
    await writeFile(target, result);
    console.log("style.css gerado a partir de 13 módulos.");
  }
}
