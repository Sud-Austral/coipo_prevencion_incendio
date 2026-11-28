# -*- coding: utf-8 -*-
"""Validacion por script del paquete generado (estructura y mapeos).

Uso: python validar.py <raiz_salida> [<carpeta_png_render>]
Sale con codigo 1 si alguna comprobacion falla.
"""
import os
import re
import sys
import unicodedata

import fitz
from docx import Document
from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos_doc as D  # noqa: E402

RAIZ = sys.argv[1]
RENDER = sys.argv[2] if len(sys.argv) > 2 else None
fallos = []


def ok(cond, msg):
    print(("OK   " if cond else "FALLA") + " " + msg)
    if not cond:
        fallos.append(msg)


img = set(os.listdir(os.path.join(RAIZ, "_imagenes")))
usadas = {i for f in D.F for i in f["imagenes"]}
ok(img == set(D.CAPTURAS), f"toda clave de CAPTURAS tiene archivo y viceversa ({len(img)})")
ok(usadas <= set(D.CAPTURAS), "toda imagen de una funcionalidad esta en CAPTURAS")
ok(set(D.CAPTURAS) <= usadas, "toda captura se usa en alguna funcionalidad")
nombres = {f["nombre"] for f in D.F}
ok(all(c["traz"][1] in nombres for c in D.C), "toda funcionalidad citada por un caso existe")
ids = [c["id"] for c in D.C]
ok(len(ids) == len(set(ids)), "sin ids de caso duplicados")
rn = [r[0] for r in D.REGLAS]
ok(len(rn) == len(set(rn)), "sin ids de regla duplicados")
ok(all(r in rn for c in D.C for r in c["rn"]), "toda regla citada esta definida")
claves = {"id", "nombre", "objetivo", "descripcion", "permisos", "precondiciones", "entradas", "flujo", "resultado",
          "fa", "fe", "rn", "validaciones", "datos", "traz", "verifica", "secundarios"}
ok(all(claves <= set(c) for c in D.C), "cada caso tiene todas las claves")
prob = open(os.path.join(RAIZ, "05_Problema_PlanMejora", "PROBLEMAS.md"), encoding="utf-8").read()
plan = open(os.path.join(RAIZ, "05_Problema_PlanMejora", "PLAN_MEJORA.md"), encoding="utf-8").read()
ip, il = set(re.findall(r"P-\d{3}", prob)), set(re.findall(r"P-\d{3}", plan))
ok(ip == il and ip, f"PROBLEMAS y PLAN_MEJORA tienen los mismos ids ({sorted(ip)})")
cap = open(os.path.join(RAIZ, "01_Manuales", "Usuario_capturas.txt"), encoding="utf-8").read().split()
ok(len(cap) == len(set(cap)) and set(cap) <= img, f"capturas del video distintas y existentes ({len(cap)})")
guion = open(os.path.join(RAIZ, "01_Manuales", "Usuario_guion.txt"), encoding="utf-8").read()
ok(130 <= len(guion.split()) <= 170 and not re.search(r"[•*#\-–—/\|<>]", guion), f"guion de {len(guion.split())} palabras sin viñetas ni símbolos")

doble = re.compile(r"\w*[áéíóú]\w*[áéíóú]\w*", re.I)
for raiz, _, archivos in os.walk(RAIZ):
    for a in archivos:
        if a.endswith(".docx"):
            doc = Document(os.path.join(raiz, a))
            texto = "\n".join(p.text for p in doc.paragraphs) + "\n".join(c.text for t in doc.tables for r in t.rows for c in r.cells)
            dobles = sorted(set(doble.findall(texto)))
            ok("CAPTURA FALTANTE" not in texto, f"{a}: 0 capturas faltantes")
            ok(not dobles, f"{a}: 0 palabras con dos tildes {dobles[:5]}")
            print(f"     {a}: {len(doc.tables)} tablas, {len(doc.inline_shapes)} imágenes")
for a in sorted(os.listdir(os.path.join(RAIZ, "_pdf"))):
    pdf = fitz.open(os.path.join(RAIZ, "_pdf", a))
    texto = "".join(p.get_text() for p in pdf)
    ok("Actualizar campo" not in texto, f"{a}: {pdf.page_count} páginas, índice calculado")
    if RENDER:
        os.makedirs(RENDER, exist_ok=True)
        for i in (1, pdf.page_count // 2, pdf.page_count - 1):
            pdf[i].get_pixmap(dpi=70).save(os.path.join(RENDER, f"{a[:-4]}_p{i + 1}.png"))
wb = load_workbook(os.path.join(RAIZ, "04_Trazabilidad", "Trazabilidad.xlsx"))
ok(all(ws.freeze_panes and ws.auto_filter.ref for ws in wb), f"xlsx: {len(wb.sheetnames)} hojas con panel inmovilizado y autofiltro")
print("FALLOS:", len(fallos))
sys.exit(1 if fallos else 0)
