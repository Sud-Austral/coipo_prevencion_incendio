# Documentación del sistema · versión 2

Visor de Prevención de Incendios Forestales (CONAF). Generado el 2026-11-15. Primera versión del paquete: en el repositorio no existía una anterior.

## Qué leer primero

1. `01_Manuales/Manual_Usuario.docx` (o su PDF): cómo se usa el visor.
2. `00_Analisis/Analisis_Sistema.docx`: roles, reglas, estados, hallazgos y cobertura.
3. `05_Problema_PlanMejora/PROBLEMAS.md` y `PLAN_MEJORA.md`.
4. `00_Analisis/INFORME_EJECUCION_2026-11-15.md`: qué se verificó y qué no.

## Cifras (calculadas)

| Concepto | Valor |
|---|---|
| Roles documentados | 1 (Usuario; el visor no tiene autenticación) |
| Funcionalidades | 15 |
| Casos de uso | 23 |
| Fichas de QA | 23 + 7 pruebas extra |
| Reglas | 17 |
| Problemas abiertos | 4 |
| Capturas | 23 |
| Cobertura funcionalidad → caso | 15/15 |
| Páginas de Analisis_Sistema.pdf | 5 |
| Páginas de Casos_de_Uso_Usuario.pdf | 15 |
| Páginas de Checklist_QA.pdf | 11 |
| Páginas de Manual_Usuario.pdf | 26 |

## Estructura

```
00_Analisis/            análisis e informe de ejecución
01_Manuales/            manual del Usuario, guion y lista de capturas para el video
02_Casos_de_Uso/        casos de uso del Usuario
03_QA/                  checklist (todas las fichas en NOT TESTED)
04_Trazabilidad/        planilla con trazabilidad, checklist, permisos, reglas, hallazgos, capturas y cobertura
05_Problema_PlanMejora/ PROBLEMAS.md y PLAN_MEJORA.md
_imagenes/              capturas (datos ficticios, sin red)
_pdf/                   PDF con el índice calculado por Word
_generador/             scripts que producen todo lo anterior
```

## Cómo se regenera

Todo se genera en una copia en una carpeta temporal y después se copia aquí. Desde PowerShell, con un intérprete real de Python (no el alias de WindowsApps), con `python-docx`, `openpyxl`, `pymupdf`, `pillow` y `pywin32`:

```powershell
$py = 'C:\ProgramDatanaconda3\python.exe'; $G = 'docs\Documentacion_Sistema2\_generador'; $T = '<carpeta temporal>'
# 1. build del frontend en una COPIA (sin npm install sobre el repo) y datos ficticios
& $py -B $G\datos_ficticios.py $T\datos
# 2. capturas sin red (puertos 18210 y 18211), copias de 1000 px a 144 dpi
node $G\capturas.mjs $Te\dist $T\datos $T\png $T\perfil
& $py -B $G\preparar_imagenes.py $T\png $T\img
# 3. documentos, PDF (un proceso por documento), validación y README
& $py -B $G\generar_documentacion.py $T\salida $T\img <AAAA-MM-DD>
Get-ChildItem $T\salida -Recurse -Filter *.docx | % { & $py -B $G\exportar_pdf.py $_.FullName "$T\salida\_pdf\$($_.BaseName).pdf" }
& $py -B $Galidar.py $T\salida; & $py -B $Geadme.py $T\salida <AAAA-MM-DD>
```

El PDF se obtiene imprimiendo con Word por COM a «Microsoft Print to PDF» (Word 2007 no exporta a PDF).
