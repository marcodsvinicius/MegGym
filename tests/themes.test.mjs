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
    const context = { window: { matchMedia: () => ({ matches: false, addEventListener() {} }), getComputedStyle: () => ({ getPropertyValue: () => "#123456" }) }, localStorage: {
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
      assert.equal(attrs.get("data-color-scheme"), "dark");
      assert.equal(meta.content, "#123456", "cor do sistema vem do token CSS");
      api.set("light");
      assert.equal(attrs.get("data-color-scheme"), "light");
      assert.equal(meta.content, "#123456");
    }
  }
});
