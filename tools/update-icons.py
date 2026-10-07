#!/usr/bin/env python3
"""Gera assets/fonts/material-symbols-rounded.woff2 só com os ícones usados no app.

Uso: python3 tools/update-icons.py  (precisa de internet)
Procura nomes em icon("..."), empty("..."), EQUIPMENT_ICONS, ícones dos grupos
(data/exercises.json) e na lista EXTRA abaixo.
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTRA = ["stop", "repeat"]  # ícones usados de outro jeito (ex.: digitados no admin)

names = set(EXTRA)
for f in ["assets/js/app.js", "assets/js/common.js"]:
    s = (ROOT / f).read_text(encoding="utf-8")
    names |= set(re.findall(r'(?:icon|empty)\(\s*"([a-z0-9_]+)"', s))
    names |= set(re.findall(r'(?:emoji|icon): "([a-z0-9_]+)"', s))
    names |= set(re.findall(r'\["(?:auto|light|dark)", "([a-z0-9_]+)"', s))
    names |= set(re.findall(r'^\s*"([a-z]+_[a-z_]+)",\s*$', s, re.M))
common = (ROOT / "assets/js/common.js").read_text(encoding="utf-8")
block = common[common.index("const EQUIPMENT_ICONS") : common.index("};", common.index("const EQUIPMENT_ICONS"))]
names |= set(re.findall(r':\s*"([a-z0-9_]+)"', block))
data = json.loads((ROOT / "data/exercises.json").read_text(encoding="utf-8"))
names |= {g["icon"] for g in data["groups"] if re.fullmatch(r"[a-z0-9_]+", g.get("icon", ""))}
names = sorted(names)

url = (
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,0"
    "&icon_names=" + ",".join(names) + "&display=block"
)
ua = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
css = urllib.request.urlopen(urllib.request.Request(url, headers=ua)).read().decode()
woff2 = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css).group(1)
out = ROOT / "assets/fonts/material-symbols-rounded.woff2"
out.write_bytes(urllib.request.urlopen(urllib.request.Request(woff2, headers=ua)).read())
(ROOT / "assets/fonts/icons.json").write_text(json.dumps(names), encoding="utf-8")
print(f"{len(names)} ícones -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
print("Lembre de aumentar VERSION no sw.js e o ?v= (incluindo o da fonte) para os celulares baixarem a fonte nova.")
