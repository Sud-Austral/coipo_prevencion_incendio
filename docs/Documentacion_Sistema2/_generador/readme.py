# -*- coding: utf-8 -*-
"""Escribe README.md del paquete con cifras CALCULADAS (datos_doc + paginas de los PDF).

Uso: python readme.py <raiz_salida> <fecha>
"""
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos_doc as D  # noqa: E402

RAIZ, FECHA = sys.argv[1], sys.argv[2]
pdfs = {a: fitz.open(os.path.join(RAIZ, "_pdf", a)).page_count for a in sorted(os.listdir(os.path.join(RAIZ, "_pdf")))}
casos_func = {c["traz"][1] for c in D.C}
cub = sum(1 for f in D.F if f["nombre"] in casos_func)
L = [f"# Documentación del sistema · versión {D.VERSION}", "",
     f"{D.SISTEMA}. Generado el {FECHA}. Primera versión del paquete: en el repositorio no existía una anterior.", "",
     "## Qué leer primero", "",
     "1. `01_Manuales/Manual_Usuario.docx` (o su PDF): cómo se usa el visor.",
     "2. `00_Analisis/Analisis_Sistema.docx`: roles, reglas, estados, hallazgos y cobertura.",
     "3. `05_Problema_PlanMejora/PROBLEMAS.md` y `PLAN_MEJORA.md`.",
     f"4. `00_Analisis/INFORME_EJECUCION_{FECHA}.md`: qué se verificó y qué no.", "",
     "## Cifras (calculadas)", "", "| Concepto | Valor |", "|---|---|",
     "| Roles documentados | 1 (Usuario; el visor no tiene autenticación) |",
     f"| Funcionalidades | {len(D.F)} |", f"| Casos de uso | {len(D.C)} |",
     f"| Fichas de QA | {len(D.C)} + {len(D.PRUEBAS_EXTRA)} pruebas extra |",
     f"| Reglas | {len(D.REGLAS)} |", f"| Problemas abiertos | {len(D.PROBLEMAS)} |",
     f"| Capturas | {len(D.CAPTURAS)} |", f"| Cobertura funcionalidad → caso | {cub}/{len(D.F)} |"]
L += [f"| Páginas de {a} | {n} |" for a, n in pdfs.items()]
L += ["", "## Estructura", "", "```", "00_Analisis/            análisis e informe de ejecución",
      "01_Manuales/            manual del Usuario, guion y lista de capturas para el video",
      "02_Casos_de_Uso/        casos de uso del Usuario", "03_QA/                  checklist (todas las fichas en NOT TESTED)",
      "04_Trazabilidad/        planilla con trazabilidad, checklist, permisos, reglas, hallazgos, capturas y cobertura",
      "05_Problema_PlanMejora/ PROBLEMAS.md y PLAN_MEJORA.md", "_imagenes/              capturas (datos ficticios, sin red)",
      "_pdf/                   PDF con el índice calculado por Word", "_generador/             scripts que producen todo lo anterior", "```", "",
      "## Cómo se regenera", "",
      "Todo se genera en una copia en una carpeta temporal y después se copia aquí. Desde PowerShell, con un intérprete real "
      "de Python (no el alias de WindowsApps), con `python-docx`, `openpyxl`, `pymupdf`, `pillow` y `pywin32`:", "", "```powershell",
      "$py = 'C:\ProgramData\anaconda3\python.exe'; $G = 'docs\Documentacion_Sistema2\_generador'; $T = '<carpeta temporal>'",
      "# 1. build del frontend en una COPIA (sin npm install sobre el repo) y datos ficticios",
      "& $py -B $G\datos_ficticios.py $T\datos",
      "# 2. capturas sin red (puertos 18210 y 18211), copias de 1000 px a 144 dpi",
      "node $G\capturas.mjs $T\fe\dist $T\datos $T\png $T\perfil",
      "& $py -B $G\preparar_imagenes.py $T\png $T\img",
      "# 3. documentos, PDF (un proceso por documento), validación y README",
      "& $py -B $G\generar_documentacion.py $T\salida $T\img <AAAA-MM-DD>",
      "Get-ChildItem $T\salida -Recurse -Filter *.docx | % { & $py -B $G\exportar_pdf.py $_.FullName \"$T\salida\_pdf\$($_.BaseName).pdf\" }",
      "& $py -B $G\validar.py $T\salida; & $py -B $G\readme.py $T\salida <AAAA-MM-DD>", "```", "",
      "El PDF se obtiene imprimiendo con Word por COM a «Microsoft Print to PDF» (Word 2007 no exporta a PDF).", ""]
open(os.path.join(RAIZ, "README.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L))
print("README:", pdfs)
