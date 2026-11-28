# -*- coding: utf-8 -*-
"""Actualiza el índice de UN .docx con Word por COM y lo imprime a PDF.

Uso (un proceso de Python por documento, desde PowerShell):
    & C:\\ProgramData\\anaconda3\\python.exe exportar_pdf.py <entrada.docx> <salida.pdf>

- Word 2007 no exporta a PDF: se imprime con PrintOut a «Microsoft Print to PDF», que
  ya es la impresora predeterminada del equipo. NO se cambia la predeterminada.
- Un Word NUEVO por documento (DispatchEx) y se cierra SU objeto COM, no un PID.
- Espera a que el PDF termine en %%EOF antes de salir.
"""
import os
import sys
import time

import pythoncom
import win32com.client

entrada, salida = (os.path.abspath(a) for a in sys.argv[1:3])
if os.path.exists(salida):
    os.remove(salida)
pythoncom.CoInitialize()
app = win32com.client.DispatchEx("Word.Application")
app.Visible = False
app.DisplayAlerts = 0
doc = None
try:
    doc = app.Documents.Open(entrada, False, False, False)
    for i in range(1, doc.TablesOfContents.Count + 1):
        doc.TablesOfContents(i).Update()
    doc.Repaginate()
    for i in range(1, doc.TablesOfContents.Count + 1):
        doc.TablesOfContents(i).UpdatePageNumbers()
    doc.Save()
    # PrintOut(Background, Append, Range, OutputFileName, From, To, Item, Copies, Pages,
    #          PageType, PrintToFile, Collate)
    doc.PrintOut(False, False, 0, salida, "", "", 0, 1, "", 0, True, True)
    paginas = doc.ComputeStatistics(2)  # wdStatisticPages
    fin = time.time() + 180
    while time.time() < fin:
        if os.path.exists(salida) and os.path.getsize(salida) > 0:
            with open(salida, "rb") as f:
                f.seek(max(0, os.path.getsize(salida) - 64))
                if b"%%EOF" in f.read():
                    break
        time.sleep(0.5)
    else:
        raise SystemExit(f"el PDF no terminó: {salida}")
    print(f"{os.path.basename(salida)}: {paginas} páginas según Word")
finally:
    if doc is not None:
        doc.Close(0)
    app.Quit()
    pythoncom.CoUninitialize()
