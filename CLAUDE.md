# CLAUDE.md

Notas para quien vaya a **modificar** este repo. Lo que ya se deduce leyendo el código no
está aquí; lo que costó una sesión averiguar, sí.

Verificado ejecutando el **2026-09-15**. Los números llevan fecha porque caducan.

---

## 1. Qué es y en qué estado está

Visor público de **prevención de incendios forestales** de CONAF, publicado en
<https://sud-austral.github.io/coipo_prevencion_incendio/>. Un mapa Leaflet con seis capas
sobre las 16 regiones: **14.705 incendios investigados** por las UAD en nueve temporadas,
las obras OECV planificadas y verificadas, los puntos stand-by, las rutas de despliegue y
la red vial MOP.

La segunda pestaña, **Riesgo**, muestra el nivel de riesgo de incendio forestal del modelo
nacional de `lab/priorizacion` (notebook 4): **110.708 manchas en 343 comunas**, publicadas
en **un archivo por comuna** que sólo se descarga al elegirla, con la infraestructura
crítica de 3 comunas encima. Reemplazó el 2026-09-15 a la pestaña «Priorización» de 3
comunas, y `?vista=priorizacion` sigue abriéndola. Es otro modelo, no una versión del
anterior: mide la amenaza y no la exposición. `DECISIONES.md` §S.

Además publica dos **derivados** del Excel de la UAD —`bbdd_uad_completa.geojson` (las 23
columnas con sus cabeceras reales) y `lineas_electricas.geojson`— y, por ahora, una página
aparte `lineas-electricas.html`. Esa página pasa a ser la tercera vista del visor en la fase
F5 y a redirección en F6: `mejoras.md` §0 y `DECISIONES.md` §R.

**Funciona y está verificado.** No es una demo ni le falta backend: no hay backend, y es
deliberado — el sitio es estático, las capas se precomputan y **se commitean** en
`frontend/public/data/`.

### Dos documentos mandan sobre este

- **`DECISIONES.md`** manda sobre los DATOS, la simbología y la interfaz. Veinte
  secciones (A–S, la Ñ incluida) con por qué cada decisión es como es, con las cifras
  medidas. §R fija la alineación de la interfaz con `coipo_vista_catastro` (acento azul,
  Líneas eléctricas como vista, orden F0→F6); §S, el riesgo nacional partido por comuna.
  **Léelo antes de
  tocar `ETL/` o `frontend/src/config.js`**: casi todo lo que parece un error ahí está
  explicado y medido.
- **`mejoras.md`** es el catálogo de mejoras pendientes y de hallazgos aún abiertos.

El **`README.md` no manda y no se edita a mano**: lo genera un bot
(`.github/workflows/readme.yml` llama a `Sud-Austral/coipo_aireadme@v1`, el generador
centralizado de la flota COIPO) y **`README_CANDIDATE.md` es su borrador**. Si el README
dice algo que no cuadra, se arregla el generador o se ignora; lo que vale está aquí y en
`DECISIONES.md`.

---

## 2. Estructura, y qué NO se edita a mano

```
ETL/                     produce las capas publicadas
  run.py                 punto de entrada UNICO: 6 capas en paralelo + manifest + verify
  cfg.py                 Cfg compartida. Aqui vive el arreglo de codificacion de Windows
  build_*.py             una capa cada uno, exponen build(cfg)
  shp_reader.py          lector SHP/DBF/PRJ/CPG en Python puro (no hay GDAL)
  kml_reader.py          KMZ/KML con zipfile + xml.etree
  geo.py                 reproyeccion, simplificacion, husos, nombres de region
  tiles.py               tippecanoe -> .pmtiles, con modo degradado
  build_riesgo.py        valida INSUMO_RIESGO y lo parte en un GeoJSON por comuna
  verify.py              D1-D20 y D16b sobre lo PUBLICADO (capas y derivados), con --negativas
  _build/                intermedio de tippecanoe. NO se versiona (ver §3)
frontend/
  src/config.js          LAS DECISIONES de simbologia y mapas base, con sus mediciones
  src/App.jsx            unico dueño del estado
  src/hooks/useDatos.js  manifest + carga perezosa con cache
  scripts/verify-*.mjs   los cuatro arneses de navegador (CDP): banner, panel,
                         priorizacion (mide la vista Riesgo; conserva el nombre) y electrico
  scripts/mutaciones.mjs los mutantes de los arneses de banner y panel
  lineas-electricas.html pagina aparte TEMPORAL (src/electrico/): vista en F5, redireccion en F6
  public/data/           GENERADO Y COMMITEADO (capas + derivados). No se edita a mano.
  public/data/riesgo/    343 GeoJSON por codigo CUT, 163 MiB. Tambien generado
  .verificacion/         salida de los arneses. NO se versiona
analisis/                contraparte Python del visor
  construir_notebook.py  GENERA el .ipynb. El notebook no se edita a mano
  leer_capas.py          valida el contrato y cruza con kpis.json
INSUMO_INCENDIO/         insumos crudos de las 16 regiones (~340 MB). Ver §7
INSUMO_ELECTRICO/        el Excel "(2)" (identico al de INSUMO_INCENDIO) y la vista de referencia
INSUMO_RIESGO/           salida del notebook 4 de lab/priorizacion: 16 GeoJSON regionales (la 12
                         simplificada, .json), el CSV y parametros.json. 188 MB
INSUMO_PRIORIZACION/     la infraestructura critica de 3 comunas (y un PDF que no lee nadie)
INSUMO_GRAFICO/          banners institucionales y sus capturas de verificacion
insumos/, readme_context/  GENERADOS por el bot del README. No se editan a mano
```

**`frontend/public/data/` es salida del ETL y está commiteada.** Es lo que despliega el
sitio, y **su único productor válido es el runner de GitHub Actions**. Ver §3 y
`DECISIONES.md` §L: en Windows no hay tippecanoe y el ETL cae en modo degradado, así que un
commit hecho desde un portátil cambia el formato publicado.

**`analisis/analisis_incendios.ipynb` se genera** con
`python analisis/construir_notebook.py`. No se edita a mano.

---

## 3. Comandos, con sus trampas

```bash
# --- ETL -------------------------------------------------------------------
python ETL/run.py -v                       # 6 capas en paralelo + manifest + verify
python ETL/verify.py                       # comprobaciones sobre lo publicado (~22 s)
python ETL/verify.py --negativas           # 31 mutaciones, cada una debe ponerse roja (~2 min)

# --- frontend --------------------------------------------------------------
cd frontend
npm install
npm run datos                              # baja las capas ya publicadas por Actions
npm run dev
npm run lint                               # oxlint. Verde en el estado base (0 avisos)
npm run build                              # ~1,3 s
npm run verify:banner                      # ~5 s, necesita Chrome
npm run verify:panel                       # ~1 min, necesita Chrome
npm run verify:priorizacion                # ~40 s, necesita Chrome (mide la vista Riesgo)
npm run verify:priorizacion -- --negativas # ~10 min, 21 mutaciones, PARCHEA 7 archivos de src/
npm run verify:electrico                   # ~15 s, pagina de lineas electricas
npm run verify:electrico -- --negativas    # ~1 min, 6 mutaciones, PARCHEA src/electrico/
npm run verify:mutantes                    # ~16 min, 17 mutantes, PARCHEA 7 archivos de src/
```

- **LOS ARNESES NO CONSTRUYEN: sirven `dist/` tal como esté.** Medido el 2026-09-10 (a
  base de perder un rato): tras editar `App.css` el arnés del banner seguía midiendo el
  artefacto anterior y daba un rojo que no correspondía al código en el editor. **`npm run
  build` antes de cada `verify:*`**, siempre.

- **`python ETL/run.py --layers X` REESCRIBE el manifest sólo con X.** No lo fusiona con lo
  que ya había: las otras capas desaparecen del contrato y el visor deja de verlas. Para
  regenerar una sola capa sin romper `frontend/public/data/`, se emite a otro sitio con
  `--out` y se copia sólo el `.geojson`, fusionando el manifest a mano.

**Trampas que cuestan tiempo si no las sabes:**

- **`capas.riesgo` no tiene `archivo`: tiene 343 `partes`.** Todo lo que recorra
  `manifest.capas` leyendo `c.archivo` tiene que contemplarlo; hoy lo hacen `verify.py`, el
  job `humo`, `npm run datos` y `analisis/leer_capas.py`. `npm run datos` baja ~163 MB más
  que antes, y `npm run build` los copia a `dist/`.

- **La comuna de riesgo se cruza por código CUT, nunca por nombre.** El modelo escribe
  «Coihaique» y «Mulchén»; la infraestructura, «Coyhaique» y «Mulchen». Por nombre, elegir
  esas comunas dejaba 0 íconos. `?comuna=` acepta el CUT, el nombre con o sin tildes y los
  `alias` que publica el ETL.

- **En Windows, `Path.write_text` escribe CRLF.** Medido el 2026-09-15: editar un `.py` o
  un `.jsx` con un script de Python lo dejó entero en CRLF contra el LF de HEAD. Git lo
  normaliza al commitear, pero la copia de trabajo queda con un diff de ruido. Escribir con
  `write_bytes` o `newline="\n"`.

- **`python3` es el stub de la Microsoft Store y termina con código 49.** El intérprete
  real de este equipo responde a `python` y es
  `C:\Users\luis.monsalve\AppData\Local\anaconda3\python.exe` (medido el 2026-09-10). Ojo:
  **`analisis/README.md` dice `C:\ProgramData\anaconda3\python.exe` y está desfasado.** En
  el runner de Actions, que es Ubuntu, `python3` sí existe y es el que usa el workflow.

- **Sin tippecanoe, el ETL degrada y esa salida NO se commitea.** `tippecanoe` no corre
  nativo en Windows. Si falta, `ETL/tiles.py` emite `rutas.geojson` y `redvial.geojson`
  simplificados a 25 m en vez de los `.pmtiles`, y lo anota en el manifest. El aviso sale
  por **stderr** al arrancar `run.py`. Para trabajar en local: `npm run datos`.

- **En Windows, D12 y D13 no corren.** Son las dos aserciones del cruce espacial, las que
  cazan un huso UTM invertido (`DECISIONES.md` §A), y necesitan el intermedio
  `ETL/_build/*.geojson`, que **sólo se puebla cuando corre tippecanoe**. `--negativas`
  **no se lo salta en silencio**: si falta, lo dice y cuenta como fallo. Para producirlo en
  local sin tocar lo publicado, se genera hacia un directorio desechable y se copia:

  ```bash
  python ETL/run.py --layers rutas   --out /tmp/etl-out --sin-verify -v
  python ETL/run.py --layers redvial --out /tmp/etl-out --sin-verify -v
  cp /tmp/etl-out/rutas.geojson   ETL/_build/
  cp /tmp/etl-out/redvial.geojson ETL/_build/
  ```

  **Con una sola de las dos capas viales, D12 se pone roja y no es un defecto de los
  datos**: con sólo `rutas`, 16 de 500 incendios quedan a más de 25 km de un camino.
  Producción cruza contra las dos, 19.242 líneas.

- **Los arneses necesitan Chrome** y lo manejan por CDP. Dos trampas ya pagadas: el
  **`--user-data-dir` propio es obligatorio** (sin él Chrome se adjunta a la sesión ya
  abierta, termina de inmediato y no genera ningún PNG), y **nunca se sirve la app en un
  puerto fijo** — si algo lo ocupa, Vite se mueve solo al siguiente y capturas otro sitio
  sin enterarte. Los scripts levantan su propio servidor en el **puerto 0** y leen el que
  les asignaron.

- **`verify:mutantes` y `verify:priorizacion -- --negativas` PARCHEAN `src/` y restauran.**
  Desde el 2026-09-14 ya no dependen de git: guardan una instantánea con sha256 y un
  respaldo en `.verificacion/respaldo-mutantes` (o `respaldo-priorizacion`) con
  `pendiente.json`, restauran ante SIGINT, SIGTERM, SIGHUP y SIGBREAK, y al final exigen que
  cada archivo quede **byte a byte** igual. Así funcionan con el árbol sin commitear. Si el
  proceso muere sin manejador (`taskkill /F`), la corrida siguiente encuentra el respaldo y
  **se niega a arrancar** hasta que se restaure. `--solo X` con un id desconocido falla.

- **`--negativas` y `verify:mutantes` SOBRESCRIBEN las capturas de `.verificacion/` con
  estados MUTADOS.** Medido el 2026-09-15: tras `verify:priorizacion -- --negativas`, la
  ficha capturada decía «2532.0 ha» porque la última corrida fue la del mutante de C14. **Antes
  de mirar una captura, vuelve a correr el arnés sin mutantes.**

- **Los arneses no fijan `prefers-color-scheme`.** En este equipo Chrome headless pinta en
  oscuro, así que casi todas las capturas salen oscuras y el tema claro queda sin mirar
  salvo en las que lo emulan a propósito (banner, panel).

- **`verify:panel` elige el modo de datos solo.** Con `frontend/public/data/manifest.json`
  presente afirma cifras de producción; sin él usa un fixture de 12 incendios. En CI el
  workflow pasa **`--datos ficticios` explícito**, porque un cambio en el sparse-checkout
  metería las capas reales en el runner y el script se pondría a afirmar cifras de
  producción contra el fixture: rojo sin que nadie hubiera roto nada.

### Lo que hay hoy, medido el 2026-09-15

| suite | cuánto | comando |
|---|---|---|
| Aserciones de datos (D1–D20, D16b) | 21 distintas, **81 ejecuciones**, y **31 controles negativos** en rojo · ~22 s + ~2 min | `python ETL/verify.py --negativas` |
| Arnés del banner (A1–A10) | 10 distintas, **49 ejecuciones** · ~4 s | `npm run verify:banner` |
| Arnés del panel (B1–B28) | 28 distintas, **199 ejecuciones** con datos reales (195 con el fixture) · ~1 min | `npm run verify:panel` |
| Arnés de la vista Riesgo (C1–C15, C4b, C10b) | 17 distintas, **18 ejecuciones** · ~40 s, y **21 controles negativos** en rojo · ~10 min | `npm run verify:priorizacion` |
| Arnés de Líneas eléctricas (E1–E12) | 12 distintas · ~15 s, y **6 controles negativos** en rojo · ~1 min | `npm run verify:electrico` |
| Mutantes de los arneses | **17**, todos en rojo · ~16 min | `npm run verify:mutantes` |
| Humo contra lo publicado | base path + manifest + capas y derivados por bytes + Range en 2 teselas + `lineas-electricas.html` | job `humo` de `deploy.yml` |

Todo verde el 2026-09-15, con el árbol de F0 sin commitear y las fuentes byte a byte iguales
tras la matriz. El cruce espacial, con las dos capas viales en `_build/`:
**mediana 0,36 km · p95 2,2 km · máx 10,2 km · 500/500 a menos de 25 km**.

---

## 4. La regla de dependencia que no se puede romper

**Los arneses no importan nada de `src/`.** `frontend/scripts/verify-panel.mjs` recalcula
las cifras esperadas **con código propio**, y su docstring dice por qué: *«importarlo
verificaría que una función es igual a sí misma»*. Lo mismo con las constantes de
geometría: `MIN_PANEL`, `MAX_PANEL` y `MIN_MAPA` están **duplicadas a propósito** en el
script. Si algún día un arnés importa de `src/`, deja de ser un oráculo independiente y
pasa a ser un espejo.

**Los cortes de régimen viven en dos sitios y es inevitable.** `CORTE_KPI = 1200` y
`CORTE_PANEL = 900` están en `src/config.js` **y** en las media queries de `App.css`: una
media query no puede leer una constante de JS, y JS necesita saber en qué régimen está. Lo
que **no** es inevitable es que se desincronicen, y por eso `.app` publica `data-regimen` y
**la aserción B12** comprueba que coincida con el número de pistas que resuelve el CSS en
los diez anchos.

**Los derivados van en `manifest.derivados`, NUNCA en `manifest.capas`.** `PanelLateral.jsx`
suma los `dominios` de todas las capas y `App.jsx` une sus `bbox`: una copia de incendios
dentro de `capas` duplicaría los filtros sin que nada se pusiera rojo (`DECISIONES.md` §Q). Y
`python ETL/run.py --layers X` sin `incendios` escribe el manifest **sin** `derivados`.

**Cada filtro cuenta en la primera capa ENCENDIDA a la que se aplica**, con la unidad de
esa capa (`UNIDAD_CAPA` en `config.js`). Sumar dominios de capas distintas daba «Biobío
(5.049)» mezclando incendios, obras, rutas y tramos. Lo vigila B27.

**El manifest es la única fuente de los dominios.** El frontend **no hardcodea ninguna
temporada, región, causa ni institución**: los categóricos viajan como índices contra
`tablas[campo]` (`DECISIONES.md` §J). Si llega la temporada 2026-2027, aparece sola en los
filtros al reejecutar el ETL. Un índice que apunte a la tabla equivocada da una etiqueta
**plausible y falsa**, que es el peor fallo posible aquí.

**Las claves de `BASEMAPS` son un contrato público.** Cada una es tres cosas a la vez: la
etiqueta del selector, el valor de `?base=` en la URL y el literal contra el que comparan
`App.jsx` y `mapaPNG.js`. Añadir una es libre; **renombrar o retirar una ya publicada
cambia el significado de todo enlace compartido**, y `BASEMAPS[base] ?? .Claro` degrada en
silencio.

**Tres valores acoplados que se cambian juntos:** el `base` de `frontend/vite.config.js`,
el `BASE` del job `humo` en `.github/workflows/deploy.yml`, y el `<link rel="preconnect">`
de `frontend/index.html`. Un `base` mal resuelto **funciona en la raíz y rompe publicado**,
con código de salida 0.

---

## 5. Reglas de los datos que no se pueden romper

- **Un solo renderer de canvas para todas las capas vectoriales.** Leaflet engancha los
  eventos de ratón al `<canvas>`: con un canvas por capa **sólo la de encima recibe los
  clics**, y cuál queda encima lo decide el orden en que terminan de descargarse los
  archivos. La regla completa es **ninguna capa vectorial declara `renderer` NI `pane`**:
  `_getPaneRenderer` crea uno nuevo para cualquier pane que no sea `overlayPane`, con
  precedencia sobre el compartido, así que un `pane` propio reintroduciría el fallo sin
  escribir la palabra `renderer` (leído en el fuente, **no comprobado con un mutante**).
  `DECISIONES.md` §H — **lo vigila C1 de `verify-priorizacion.mjs`**, con un control
  negativo que conserva `tolerance: 8`: medido, perder la tolerancia también pone C1 roja,
  así que un mutante que la quite no prueba §H.
- **La normalización comunal de la vista de riesgo NO toca el dato.** No existe ningún
  nivel normalizado: vive en una función pura de `src/escalas.js` y sólo la lee el callback
  de estilo. Y reparte **por rango**, no por min-max — con el modelo nacional, el min-max
  deja 144 de las 213 manchas de Mulchén (68 %) en dos escalones. `DECISIONES.md` §P.
- **Los colores de riesgo van por NIVEL (0–4), no por etiqueta**, y las etiquetas y los
  cortes salen del manifest. Con claves por etiqueta, el paso de «Muy Alta» a «Muy Alto»
  habría dejado el mapa entero gris sin un error. Lo vigila C15. `DECISIONES.md` §S.
- **Las manchas de una comuna no entran en la caché de módulo** (`useGeoJSON(..., {
  cachear: false })`): Natales ocupa 267 MB de heap y la caché no se vacía nunca.
- **El huso UTM de los incendios no viene declarado y cambia por fila.** Se prueban ambos y
  se elige el que cae en la franja de longitudes de la región de la propia fila. La regla
  `X < 500000` manda Calama 470 km mar adentro. `DECISIONES.md` §A.
- **El CRS no se asume nunca**: hay cuatro sistemas entre los 33 shapefiles y uno de los
  insumos no declara ninguno. Se lee el `.prj` de cada archivo. `DECISIONES.md` §B y §C.
- **«Código causa general 2023» no se lee nunca como número.** Como float 4.10 es 4.1: hasta
  el 2026-09-14 se publicaron 1.056 incendios de «Otras causas» con el código de «Faenas
  forestales». El código sale del prefijo de «Causa investigada 2023». `DECISIONES.md` §Q,
  vigilado por D16 y D16b.
- **Google Earth se enlaza con `/web/search/lat,lon`, no con la URL de cámara `/web/@…`**,
  que aterriza sin ninguna marca del punto (visto en captura). Lo vigila C12.
- **La fecha del manifest se arma con los componentes del ISO**, nunca con `new Date(iso)`:
  en Chile eso retrocede un día todo lo generado antes de las 03:00 UTC.
- **PMTiles exige HTTP Range.** Sin respuestas `206` el visor **no dibuja ninguna
  carretera** y falla con «Check that your storage backend supports HTTP Byte Serving». Si
  sirves `dist` con un servidor propio, tiene que soportarlo.
- **`AVISO_CIVICO` y `CONTACTO` son `null` a propósito.** No son un pendiente que se rellene
  por conveniencia: cualquier teléfono o canal debe venir autorizado por la Unidad de
  Información y Análisis de CONAF. Y el repositorio de GitHub **no es un canal
  institucional**. `DECISIONES.md` §Ñ.
- **Este visor no muestra incendios activos**, y lo dice en tres superficies distintas. Es
  el malentendido más caro que tiene. `DECISIONES.md` §O.

---

## 6. Cómo se escribe aquí

**Todo en español**, comentarios incluidos. En el código los comentarios van **sin tildes**;
los textos de la interfaz, **con** tildes.

Los comentarios explican **por qué**, con la medida al lado: «medido en seis puntos», «se
agota en 16 y declara 23», «bajan el archivo de 6,0 a 3,9 MB». Un comentario que sólo
repite lo que hace la línea siguiente sobra.

**Cuando una prueba y el código discrepan, la primera hipótesis es que la prueba está mal.**
Y **una aserción que nunca se ha visto roja no es una prueba**: por eso existe
`--negativas`. **Si añades una aserción, añade su mutación.** El 2026-09-10 la mutación D8
encontró un `ValueError` real en `_cruce_espacial` a los cinco minutos de existir.

**Las cifras de la interfaz salen del manifest**, nunca escritas a mano.

---

## 7. Brechas conocidas — no las "arregles" sin leer esto

Comprobadas una a una el 2026-09-10:

1. **Borrar la carga inerte no cierra la cuestión jurídica, y conviene no confundirlas.**
   El 2026-09-10 se borraron de `INSUMO_INCENDIO/` **241 archivos y 492,1 MB** que ningún
   paso del pipeline abría: los 70 PDF, los 16 `.docx`, las fotos, los `.rar` (ya extraídos,
   y el ETL lee el `.shp` desempaquetado), los `.xml`/`.qmd` de metadatos y los índices
   `.sbn`/`.sbx`/`.qix` de ArcGIS. Comprobado ejecutando el ETL completo después: mismas
   14.705 / 1.863 / 1.114 / 327 / 5.278 / 13.964 features y los mismos KPIs. El directorio
   pasó de 832 MB a **340 MB** y de 775 a **534 archivos**.

   **Pero `.git` sigue pesando 718 MB y la historia conserva todos los blobs.** Un clon no
   adelgaza, y **las 9 actas de reunión siguen siendo recuperables por cualquiera** con un
   `git log`. Si lo que preocupaba era la exposición en un repositorio público, el borrado
   **no la resuelve**: eso exige hacer el repo privado o reescribir la historia, y lo
   segundo es peligroso con ramas ya publicadas (`uat`, `imgbot`). `mejoras.md` §D1 tiene
   las opciones. **Estado: ABIERTA. La decide Luis.**

   Lo que sí está comprobado: **la capa publicada no expone nombres de personas.**
   `jefe_brigada` e `investigado_por` viajan como códigos contra las tablas del manifest
   (`'5.1'`, `'4.1.2'`, `'UAD.86A'`), no como nombres.

   Para recuperar cualquier archivo borrado: `git checkout HEAD -- <ruta>`.

2. **La regla §H no tiene vigilante en la página de Líneas eléctricas.** En el visor la vigila
   C1; en `lineas-electricas.html` el clic de E8 se hace con las comunas apagadas y nadie
   cuenta los canvas. Se resuelve al integrarla como vista (F5, `mejoras.md` §0).
3. **El corrimiento de campos del `.dbf` no tiene vigilante de contenido.** D10 caza que
   falte un campo, no que su valor esté desplazado (`DECISIONES.md` §D).
4. **El cruce contra `KM_OFICIAL_NACIONAL` sólo corre en `analisis/leer_capas.py`**, no en
   `verify.py` (`DECISIONES.md` §G).
5. **`analisis/README.md` da mal la ruta del intérprete** (ver §3).
6. **`INSUMO_GRAFICO/README.md` dice que el asset es `banner-conaf-uia.jpg`**; el real es
   `frontend/src/assets/banner-conaf-incendios.jpg`.
7. **`npm audit` reporta 1 vulnerabilidad alta** en `nanoid`, dependencia transitiva de la
   cadena de build. No afecta a lo publicado, pero está anotada.
8. **Tres identidades git para la misma persona** y convención de mensajes mixta: conviven
   `docs:`/`ci:`/`datos:` con mensajes sueltos.
9. **La grafía de las comunas no se canoniza.** CABRERO y Cabrero salen como comunas distintas
   en las tablas del visor (226 etiquetas para 220 comunas en el subconjunto eléctrico).
   `DECISIONES.md` §Q.
10. **`INSUMO_ELECTRICO/` duplica el Excel de `INSUMO_INCENDIO/`** (mismo blob) desde `18ff9db`.
    Qué hacer con esa carpeta lo decide Luis.
11. **Las 5 comunas de riesgo de más de 10 MB son lentas en un equipo modesto** (Natales:
    8,4 s de carga y 2,1 s por repintado con la CPU a ×4, medido el 2026-09-15).
    Simplificarlas cambia la geometría publicada y lo decide Luis (`mejoras.md`, Pendientes
    de datos).
12. **La región 12 de riesgo se publica simplificada**, con 5 geometrías inválidas y 1.231
    manchas sin geometría que el ETL cuenta y no dibuja. Cómo se simplificó no quedó
    registrado en el lab.

---

## 8. Git y despliegue

- Rama por defecto **`main`**. `.github/workflows/deploy.yml` se dispara con cada push a
  `main` que toque `INSUMO_INCENDIO/**`, `INSUMO_RIESGO/**`, `INSUMO_PRIORIZACION/**`,
  `ETL/**`, `frontend/**` o el propio workflow.
- **Cuatro trabajos**: **build** (ETL + tippecanoe cacheado + `verify.py --negativas` +
  commit de las capas + `npm run build` + **los arneses de priorización y de Líneas
  eléctricas**) y **verificar-visual** (banner y panel,
  en paralelo, sin pagar los 832 MB de insumos) → **deploy** → **humo**.
- **`verify:priorizacion` corre en `build` y no en `verificar-visual`, al revés que los
  otros dos arneses.** No es un descuido: C2–C15 afirman cifras de las capas REALES (las
  manchas y los puntos de la comuna que eligen por definición, sus extremos de nivel, las
  clases del manifest), y `verificar-visual` excluye `/frontend/public/data/` de su
  sparse-checkout a propósito para bajar menos de 1 MB. Allí no hay datos que afirmar; en
  `build` el ETL acaba de generarlos.
- El job **humo** pide el **sitio ya publicado**, no el artefacto: comprueba el base path en
  `index.html`, que el manifest parsee, que **cada capa se sirva con los bytes que declara**
  —con `Accept-Encoding: identity`, porque Pages comprime `application/octet-stream` y sin
  esa cabecera el tamaño no cuadra nunca; las 343 comunas de riesgo, una a una— y que las
  teselas respondan **`206` con el magic
  `PMTiles`** a un `Range: bytes=0-126`. Si ninguna capa de teselas entra a ese bucle,
  **falla**: una comprobación que no comprueba nada es peor que no tenerla. Recorre también
  `manifest.derivados` (falla si falta `lineas_electricas`) y pide `lineas-electricas.html`
  con el base path.
- **El ETL sí corre en CI**, al revés que en el repo hermano: aquí los insumos están
  versionados, así que el runner regenera las capas y las commitea con
  `datos: capas del ETL … [skip ci]`.
- **`.gitattributes` fuerza `text eol=lf`** en `.geojson`, `.json`, `.py`, `.js`, `.mjs`,
  `.jsx`, `.css`, `.yml` e `.ipynb`, para que el ETL produzca el mismo byte en Windows y en
  el runner; y marca 17 extensiones como binarias para que git no les toque los finales de
  línea.
- **No se commitea** lo que lista `.gitignore`: `node_modules/`, `dist/`, `ETL/_build/`,
  `frontend/.verificacion/`, las salidas del notebook, las reglas de COIPO_ERRORES y
  `.claude/settings.local.json`.

**El historial y la publicación los decide Luis.** No hagas commit ni push salvo que te lo
pida explícitamente.
