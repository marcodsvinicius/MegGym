import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../assets/js/theme.js", import.meta.url), "utf8");

test("Energia é padrão e estilos antigos ou inválidos migram sem erro antes da renderização", () => {
  for (const oldStyle of [null, "suave", "inexistente", "energia", "esportivo", "pink-money", "arcade"]) {
    const values = new Map(oldStyle ? [["meggym.style", oldStyle]] : []);
    const attrs = new Map();
    const meta = {};
    const context = { window: { matchMedia: () => ({ matches: false, addEventListener() {} }) }, localStorage: {
      getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k),
    }, document: { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) }, querySelector: () => meta } };
    vm.runInNewContext(source, context);
    const api = context.window.MegTheme;
    const expected = ["esportivo", "pink-money", "arcade"].includes(oldStyle) ? oldStyle : "energia";
    assert.equal(api.DEFAULT_STYLE, "energia");
    assert.equal(attrs.get("data-style"), expected);
    for (const style of ["energia", "esportivo", "pink-money", "arcade"]) {
      api.setStyle(style);
      api.set("dark");
      assert.equal(attrs.get("data-style"), style);
      assert.match(meta.content, /^#[a-f0-9]{6}$/);
      api.set("light");
      assert.match(meta.content, /^#[a-f0-9]{6}$/);
    }
  }
});
