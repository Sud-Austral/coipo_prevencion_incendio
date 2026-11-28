# Informe de ejecución · 2026-11-15

Generación de `docs/Documentacion_Sistema2` del Visor de Prevención de Incendios Forestales.
Método: `PROMPT_actualizar_documentacion_sistema.md`, sección 2 y apéndice C (no había paquete previo
ni `docs/prompt-documentacion-sistema.md`).

## Cifras

| Concepto | v1 | v2 |
|---|---|---|
| Roles | no existía | 1 (Usuario) |
| Funcionalidades | — | 15 |
| Casos de uso | — | 23 |
| Fichas de QA | — | 23 + 7 pruebas extra (todas NOT TESTED) |
| Reglas | — | 17 |
| Problemas | — | 4 abiertos (0 críticos, 0 altos, 2 medios, 2 bajos) |
| Capturas | — | 23 |
| Páginas PDF | — | Manual 26 · Casos 15 · QA 11 · Análisis 5 |

## Roles y autenticación

Un solo rol, **Usuario**. Verificado leyendo el código: no hay autenticación (sin login, token,
cookie ni proveedor de identidad; sitio estático, `frontend/vite.config.js`). El único almacenamiento
es la disposición de paneles en `localStorage` (`frontend/src/preferencias.js`).

## Qué verifiqué y cómo

- **Build en una copia** del frontend en el scratchpad (`vite build`, 0,8 s) porque `frontend/dist`
  era más viejo que `src/App.jsx`. `oxlint` en la copia: código de salida 0.
- **Capturas** con `capturas.mjs`: Chrome sin cabeza, `--host-resolver-rules` que no resuelve
  ningún host externo, teselas y Google interceptados por CDP, puertos 18210/18211, datos 100 %
  ficticios de `datos_ficticios.py` (incluye un escritor propio de PMTiles + MVT; la vista Riesgo
  dibujó las áreas y abrió la ficha de un área). Hosts externos interceptados: server.arcgisonline.com
  y www.google.com. Excepciones de página: ninguna.
- **Miré las 23 capturas** (y las versiones de 1000 px). Hashes SHA-256 distintos (el script falla
  si dos coinciden; lo hizo una vez: 11_indicadores era igual a 02 y se corrigió).
- **Validación por script** (`validar.py`): mapeo imagen-funcionalidad, casos-funcionalidades,
  reglas citadas, ids únicos, PROBLEMAS vs PLAN_MEJORA, 0 capturas faltantes, 0 palabras con dos
  tildes, 0 índices sin calcular en los PDF, XLSX con panel inmovilizado y autofiltro. **Prueba de
  mutación:** al quitar `14_compartir.png` el validador se puso rojo (2 fallos, código 1).
- **PDF**: Word 2007 por COM, un proceso por documento, índice actualizado y PrintOut a
  «Microsoft Print to PDF». Rasterizadas y miradas: índice, matriz de permisos, una ficha de QA
  (numeración reinicia en 1) y páginas del manual con capturas.

## Defectos y problemas (detalle en 05_Problema_PlanMejora)

1. **P-001 (media), verificado en el código:** `frontend/public/data/manifest.json` versionado
   (generado 2026-09-16T10:40:30) trae `capas.infra_puntos` sin `familias` ni `tablas` y con 696
   elementos de 3 comunas, mientras `ETL/build_infra_puntos.py:319` publica `familias` y
   `frontend/src/App.jsx:582-587` las lee; `config.js:385` no tiene color para `escuelas_prep`.
   El efecto en pantalla con esos datos y el estado del sitio publicado: **no lo comprobé**.
2. **P-002 (media), verificado:** sin aviso cívico ni contacto (`config.js:613` y `625`), decisión
   pendiente de la Unidad de Información y Análisis.
3. **P-003 (baja), observado:** `frontend/dist` local anterior a `src/App.jsx`.
4. **P-004 (baja), observado:** CLAUDE.md §3 cita una ruta de intérprete de otra estación.

Hallazgos de capturas: ninguno es defecto (página de líneas eléctricas oscura a propósito, fondo
liso y Google simulado por el entorno sin red).

## Lo que NO comprobé

- El sitio publicado y GitHub Actions (no se consultó producción, por regla).
- Los arneses `verify:*` y `ETL/verify.py`: usan puerto 0 o datos reales, fuera de lo autorizado.
- Descargas reales (CSV, GeoJSON, PNG, informe PDF) y «Compartir»: se capturaron los modales, no se
  pulsaron los botones.
- El caso CU-21 (región inexistente en la URL) y QA-N4 (servidor sin Range): quedan [POR VALIDAR].
- Ninguna ficha de QA se ejecutó: todas parten en NOT TESTED.

## Defectos de mi propio trabajo

- Primera corrida de capturas en blanco: el servidor comparaba rutas con barras mezcladas
  (`startsWith` con `/` contra `\`); corregido con `path.resolve`.
- `scrollIntoView` desplazaba el documento y dejaba una franja blanca que la app no muestra;
  se reemplazó por desplazar sólo el contenedor del panel.
- El índice se listaba a sí mismo; ahora es un párrafo y no un título.

## Archivos y procesos

- Creado sólo `docs/Documentacion_Sistema2/` (no existía). No se tocó código de la app, ni
  `coipo_prevension_ministerial`, ni se hizo npm install, commit ni push. Sin `.pyc` en el repo
  (todo con `python -B`).
- Procesos propios: servidores node (PID 22584, 27440, 24416, 9616) y Chrome (25248, 20144, 7444,
  20416), cerrados por el propio script (`Browser.close`); Word cerrado con `doc.Close()` y
  `app.Quit()`. Comprobado al final: ningún proceso con `u5_prevencion` en la línea de comandos.
  Los 5 WINWORD.EXE abiertos a las 18:22 son anteriores a esta sesión y no se tocaron.
