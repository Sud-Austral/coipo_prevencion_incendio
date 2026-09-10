# CLAUDE.md

Notas para quien vaya a **modificar** este repo. Lo que ya se deduce leyendo el código no
está aquí; lo que costó una sesión averiguar, sí.

Verificado ejecutando el **2026-09-10**. Los números llevan fecha porque caducan.

---

## 1. Qué es y en qué estado está

Visor público de **prevención de incendios forestales** de CONAF, publicado en
<https://sud-austral.github.io/coipo_prevencion_incendio/>. Un mapa Leaflet con seis capas
sobre las 16 regiones: **14.705 incendios investigados** por las UAD en nueve temporadas,
las obras OECV planificadas y verificadas, los puntos stand-by, las rutas de despliegue y
la red vial MOP.

**Funciona y está verificado.** No es una demo ni le falta backend: no hay backend, y es
deliberado — el sitio es estático, las capas se precomputan y **se commitean** en
`frontend/public/data/`.

### Dos documentos mandan sobre este

- **`DECISIONES.md`** manda sobre los DATOS y sobre la simbología. Dieciséis secciones (A–O, la Ñ incluida)
  con por qué cada decisión del ETL es como es, con las cifras medidas. **Léelo antes de
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
  verify.py              13 aserciones D sobre lo PUBLICADO, con --negativas
  _build/                intermedio de tippecanoe. NO se versiona (ver §3)
frontend/
  src/config.js          LAS DECISIONES de simbologia y mapas base, con sus mediciones
  src/App.jsx            unico dueño del estado
  src/hooks/useDatos.js  manifest + carga perezosa con cache
  scripts/verify-*.mjs   los dos arneses de navegador (CDP)
  public/data/           GENERADO Y COMMITEADO. No se edita a mano.
  .verificacion/         salida de los arneses. NO se versiona
analisis/                contraparte Python del visor
  construir_notebook.py  GENERA el .ipynb. El notebook no se edita a mano
  leer_capas.py          valida el contrato y cruza con kpis.json
INSUMO_INCENDIO/         insumos crudos de las 16 regiones (~832 MB). Ver §7
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
python ETL/verify.py                       # 39 comprobaciones sobre lo publicado (~1,6 s)
python ETL/verify.py --negativas           # 12 mutaciones, cada una debe ponerse roja (~19 s)

# --- frontend --------------------------------------------------------------
cd frontend
npm install
npm run datos                              # baja las capas ya publicadas por Actions
npm run dev
npm run lint                               # oxlint. Verde en el estado base (0 avisos)
npm run build                              # ~1,3 s
npm run verify:banner                      # ~5 s, necesita Chrome
npm run verify:panel                       # ~1 min, necesita Chrome
npm run verify:mutantes                    # ~2 min, PARCHEA el repo y restaura
```

**Trampas que cuestan tiempo si no las sabes:**

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

- **`verify:mutantes` PARCHEA EL REPO** y restaura al terminar. Se niega a arrancar si
  los archivos que va a tocar ya tienen cambios sin commitear, y al acabar comprueba con
  git que no quedo nada modificado. Si lo interrumpes a media ejecucion, la siguiente
  corrida te lo dira; `git checkout -- frontend/src/config.js frontend/src/index.css`
  lo deja como estaba.

- **`verify:panel` elige el modo de datos solo.** Con `frontend/public/data/manifest.json`
  presente afirma cifras de producción; sin él usa un fixture de 12 incendios. En CI el
  workflow pasa **`--datos ficticios` explícito**, porque un cambio en el sparse-checkout
  metería las capas reales en el runner y el script se pondría a afirmar cifras de
  producción contra el fixture: rojo sin que nadie hubiera roto nada.

### Lo que hay hoy, medido el 2026-09-10

| suite | cuánto | comando |
|---|---|---|
| Aserciones de datos (D1–D13) | 13 distintas, **39 ejecuciones**, y **12 controles negativos** en rojo | `python ETL/verify.py --negativas` |
| Arnés del banner (A1–A10) | 10 distintas, **49 ejecuciones**, 13 capturas · ~5 s | `npm run verify:banner` |
| Arnés del panel (B1–B23) | 23 distintas, **133 ejecuciones**, 44 capturas · ~1 min | `npm run verify:panel` |
| Mutantes de los arneses | **4**, todos en rojo · ~2 min | `npm run verify:mutantes` |
| Humo contra lo publicado | base path + manifest + 6 capas por bytes + Range en 2 teselas | job `humo` de `deploy.yml` |

Todo verde el 2026-09-10. El cruce espacial, con las dos capas viales en `_build/`:
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

- **Un solo renderer de canvas para todas las capas vectoriales**, declarado en las
  opciones del mapa y no en cada componente. Leaflet engancha los eventos de ratón al
  `<canvas>`: con un canvas por capa **sólo la de encima recibe los clics**, y cuál queda
  encima lo decide el orden en que terminan de descargarse los archivos.
  `DECISIONES.md` §H — **y hoy no lo vigila ninguna aserción.**
- **El huso UTM de los incendios no viene declarado y cambia por fila.** Se prueban ambos y
  se elige el que cae en la franja de longitudes de la región de la propia fila. La regla
  `X < 500000` manda Calama 470 km mar adentro. `DECISIONES.md` §A.
- **El CRS no se asume nunca**: hay cuatro sistemas entre los 33 shapefiles y uno de los
  insumos no declara ninguno. Se lee el `.prj` de cada archivo. `DECISIONES.md` §B y §C.
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

1. **`INSUMO_INCENDIO/` son ~832 MB versionados en un repositorio público**, incluida
   `BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx`, 70 PDFs de actas de reunión y 16
   `.docx` que suelen consignar asistentes. `insumos/MANIFIESTO.yaml` ya lo marca como la
   revisión jurídica pendiente n.º 1 y nadie la ha cerrado. **Estado: ABIERTA. La decide
   Luis.** No reescribas la historia de git por tu cuenta.
2. **La decisión §H de `DECISIONES.md` —el renderer compartido— no tiene vigilante.** Es el
   fallo que sólo aparece con varias capas encendidas y que **se ve idéntico en una
   captura**. Escribir esa aserción y su mutante es la primera prioridad de `mejoras.md`.
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

---

## 8. Git y despliegue

- Rama por defecto **`main`**. `.github/workflows/deploy.yml` se dispara con cada push a
  `main` que toque `INSUMO_INCENDIO/**`, `ETL/**`, `frontend/**` o el propio workflow.
- **Cuatro trabajos**: **build** (ETL + tippecanoe cacheado + commit de las capas +
  `npm run build`) y **verificar-visual** (banner y panel, en paralelo, sin pagar los
  832 MB de insumos) → **deploy** → **humo**.
- El job **humo** pide el **sitio ya publicado**, no el artefacto: comprueba el base path en
  `index.html`, que el manifest parsee, que **cada capa se sirva con los bytes que declara**
  —con `Accept-Encoding: identity`, porque Pages comprime `application/octet-stream` y sin
  esa cabecera el tamaño no cuadra nunca— y que las teselas respondan **`206` con el magic
  `PMTiles`** a un `Range: bytes=0-126`. Si ninguna capa de teselas entra a ese bucle,
  **falla**: una comprobación que no comprueba nada es peor que no tenerla.
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
