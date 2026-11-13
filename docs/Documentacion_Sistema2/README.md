# Documentación del sistema — coipo_prevencion_incendio (visor de prevención de incendios forestales)

**Primera versión del paquete en este repositorio** (versión 1.0, generada el 2026-11-13). No hay
una versión anterior: no existía `docs/Documentacion_Sistema`. La carpeta se llama
`Documentacion_Sistema2` por la convención de la flota (prompt v4), no porque reemplace a otra.

Todo se **genera desde el código** con `scripts/generar_documentacion.py`; los DOCX son salida, no
fuente. Editarlos a mano y regenerar pisa el cambio.

## Qué leer primero

1. `00_Analisis/Analisis_y_Matriz_de_Roles.docx` — el sistema, el rol, reglas RN-01..16, hallazgos
   H-01..11, sondas ejecutadas y cobertura calculada.
2. `01_Manuales/Manual_Rol_Usuario_Visor.docx` — el manual de uso.
3. `02_Casos_de_Uso/Casos_Uso_Rol_Usuario_Visor.docx` y `03_QA/Checklist_QA_Casos_de_Uso.docx`
   (todas las fichas parten en NOT TESTED).
4. `04_Trazabilidad/Matriz_Trazabilidad.xlsx` — trazabilidad, checklist con desplegable,
   funcionalidades, archivos, reglas, hallazgos, sondas y roles.

`_imagenes/` tiene las capturas y `_pdf/` la copia en PDF con el índice calculado.

## Un solo rol

El visor es un sitio estático público, sin backend ni login: se documenta un rol, **Usuario del
visor**. El análisis explica por qué no hay otros.

## Cifras

Las escribe `scripts/exportar_pdf.py` al final de la exportación; no se editan a mano.

<!-- cifras -->
| Indicador | Valor |
|---|---|
| Versión | 1.0 (2026-11-13), primera del paquete en este repositorio |
| Roles documentados | 1 |
| Funcionalidades | 12 |
| Casos de uso (y fichas QA) | 20 |
| Funcionalidades con caso | 12 de 12 |
| Capturas | 13 |
| Páginas en PDF | 75 |
| &nbsp;&nbsp;Analisis_y_Matriz_de_Roles.pdf | 9 páginas |
| &nbsp;&nbsp;Casos_Uso_Rol_Usuario_Visor.pdf | 25 páginas |
| &nbsp;&nbsp;Checklist_QA_Casos_de_Uso.pdf | 17 páginas |
| &nbsp;&nbsp;Manual_Rol_Usuario_Visor.pdf | 24 páginas |
<!-- /cifras -->

## Cómo se regenera

Desde la raíz del repositorio, en Windows con Word instalado:

```
python scripts/generar_documentacion.py      # valida el mapeo y genera DOCX + XLSX
python scripts/exportar_pdf.py               # índice, PDF y cifras de este README
```

Capturas (nada sale a la red ni a producción; los datos son ficticios):

```
cd frontend && npx vite build --outDir <tmp>/demo/coipo_prevencion_incendio      # en PowerShell
# borrar <tmp>/demo/coipo_prevencion_incendio/data y luego, desde la raíz:
python scripts/demo_datos.py <tmp>/demo/coipo_prevencion_incendio/data
python scripts/demo_servidor.py <tmp>/demo <puerto libre>
python scripts/capturar_pantallas.py --url http://127.0.0.1:<puerto>/coipo_prevencion_incendio/ --perfil <carpeta vacía> --puerto-cdp <puerto libre>
```

`demo_datos.py` reemplaza predios, jefes de brigada, investigadores, responsables y operadores
por nombres de fantasía, desplaza los puntos y sortea causas y clases de riesgo. Las teselas de
rutas, red vial y manchas de riesgo por región se copian sin cambios (cartografía sin personas).
