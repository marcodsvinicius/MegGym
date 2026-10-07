// Servidor estático + navegador para os testes (sem dependências além do Playwright).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// overrides: troca o conteúdo de um arquivo (ex.: simular uma versão nova do sw.js publicada).
export async function startServer() {
  const overrides = new Map();
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
    try {
      const body = overrides.has(path) ? overrides.get(path) : await readFile(join(ROOT, path));
      res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    override: (path, text) => overrides.set(path, text),
    close: () => (server.closeAllConnections(), server.close()),
  };
}

// Abre o app num celular simulado e junta qualquer erro de JavaScript da página.
export async function openApp(baseUrl, { serviceWorkers = false } = {}) {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: serviceWorkers ? "allow" : "block", reducedMotion: process.env.MOTION ? "no-preference" : "reduce" });
  // Sem internet nos testes: bloqueia o YouTube embutido.
  await context.route(/youtube/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(baseUrl);
  return { browser, page, errors };
}

// Cria um perfil direto no armazenamento (mais rápido que o onboarding).
export async function seedUser(page, profile = {}) {
  await page.evaluate((p) => {
    localStorage.clear();
    const u = window.MegStore.createUser({ name: "Teste", age: 30, sex: "masculino", equipment: ["halter", "banco", "elastico", "roldana"], ...p });
    window.MegStore.updateUser(u.id, { tourDone: p.tourDone ?? true }); // dicas do 1º uso já vistas (salvo se o teste pedir)
  }, profile);
  await page.reload();
  await page.waitForSelector("#app-shell:not(.hidden)");
}
