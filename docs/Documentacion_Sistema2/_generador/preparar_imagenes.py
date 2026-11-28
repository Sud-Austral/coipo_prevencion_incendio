# -*- coding: utf-8 -*-
"""Copias PNG de ~1000 px de ancho a 144 dpi para Word, y hash de cada captura.

Uso: python preparar_imagenes.py <png_crudos> <_imagenes destino>
Falla si dos capturas son identicas byte a byte (una navegacion que no ocurrio).
"""
import hashlib
import os
import sys

from PIL import Image

ORIG, DEST = sys.argv[1], sys.argv[2]
os.makedirs(DEST, exist_ok=True)
vistos = {}
for n in sorted(os.listdir(ORIG)):
    if not n.endswith(".png"):
        continue
    h = hashlib.sha256(open(os.path.join(ORIG, n), "rb").read()).hexdigest()[:16]
    if h in vistos:
        raise SystemExit(f"captura duplicada: {n} == {vistos[h]}")
    vistos[h] = n
    im = Image.open(os.path.join(ORIG, n)).convert("RGB")
    if im.width > 1000:
        im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
    im.save(os.path.join(DEST, n), dpi=(144, 144), optimize=True)
    print(n, im.size, h)
print(len(vistos), "capturas distintas")
