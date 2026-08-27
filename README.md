# Visor de Prevención de Incendios Forestales — CONAF

App de React solo-frontend que muestra en un mapa Leaflet los insumos de
`INSUMO_INCENDIO/`, más un ETL en Python que los convierte a formatos web.
Sin backend: todo se sirve como archivos estáticos.

**https://sud-austral.github.io/coipo_prevencion_incendio/**

## Uso

Para trabajar solo en el frontend, sin correr el ETL:

```bash
cd frontend && npm install
npm run datos     # baja las capas ya publicadas por Actions
npm run dev
```

Para regenerar las capas desde los insumos:

```bash
python ETL/run.py          # 6 capas en paralelo + validación  (~20 s)
```

`ETL/run.py` es el único punto de entrada: corre las 6 capas en paralelo,
escribe `manifest.json` y ejecuta `verify.py` al terminar.

`npm run datos` lee la lista de archivos del propio `manifest.json` publicado,
así que baja lo que haya (GeoJSON o PMTiles) sin saber de antemano cuál toca.
Cada run del workflow deja además las capas como artefacto `capas-geo`,
descargable durante 30 días desde la página del run.

```
python ETL/run.py [--layers incendios,oecv,…] [--jobs N] [--secuencial]
                  [--no-tiles] [--simplify 25] [--sin-verify] [-v]
```

Los datos generados **sí se commitean**, en `frontend/public/data/`: los
reconstruye GitHub Actions en cada push a `INSUMO_INCENDIO/`, `ETL/` o
`frontend/`, los publica en Pages y los deja versionados en `main` con un commit
`datos: capas del ETL …`. Así están disponibles al clonar, sin pasos extra, para
trabajar con ellos fuera del visor.

> **No commitees una corrida local del ETL en Windows.** Ahí no existe
> tippecanoe y `ETL/tiles.py` cae en modo degradado: emite `rutas.geojson` y
> `redvial.geojson` en vez de los `.pmtiles`, y lo anota en el manifest. El único
> productor válido de lo versionado es el runner de Actions. Para trabajar en
> local, `npm run datos`.

## Capas

| Capa | Origen | Features | Salida |
|---|---|---:|---|
| Incendios investigados | `BBDD INVESTIGACIÓN UAD…xlsx`, hoja `Hoja 1` (las 23 columnas) | 14.705 de 14.985 (98,1 %) | `incendios.geojson` 7,6 MB (0,9 MB comprimido) |
| OECV (cortafuegos) | `OECV 2025 - 2026/COMPILADO/SHAPE/Compilado_OECV_2025.shp` | 1.863 · 4.790 km | `oecv.geojson` 908 KB |
| Puntos stand-by | 6 shapefiles + 1 KMZ, uno por región | 327 | `puntos_standby.geojson` 54 KB |
| Rutas de despliegue | 15 shapefiles de `Despliegue territorial` | 5.278 | `rutas.pmtiles` |
| Red vial MOP 2024 | `Red-vial_MOP_2024.json` (87 MB) | 13.964 | `redvial.pmtiles` |
| Indicadores | `OECV 2025-2026.xlsx` | 4.898,6 km plan / 78,8 % avance | `kpis.json` |

Las dos capas viales suman 19.000 líneas y 5,7 M de vértices. Como GeoJSON
obligarían a descargar el país entero a detalle completo solo para ver el mapa
nacional, así que salen como teselas vectoriales: el navegador pide por HTTP
Range únicamente el viewport al zoom actual. Las capas ligeras siguen en GeoJSON
porque hay que filtrarlas por atributo y tenerlas enteras en memoria de todos
modos.

## Trampas de los datos (y cómo se resuelven)

Todas verificadas contra los archivos reales; están comentadas en el código.

**El huso UTM de los incendios no está declarado y cambia por fila.**
La regla obvia (`X < 500000` → 19S) falla justo al este del meridiano −69°, que
es donde está el norte del país: Calama da un easting de ~510.000 y terminaba
470 km mar adentro. Se prueban ambos husos y se elige el que cae en la franja de
longitudes de la región declarada en la propia fila (`geo.LON_REGION`).

**Cuatro CRS mezclados entre los 33 shapefiles** (22×32719, 9×32718, 1×4326,
1×9707). Se lee el EPSG de cada `.prj`; nunca se asume.

**`Red-vial_MOP_2024.json` no declara CRS.** Es EPSG:32719, deducido del bbox y
confirmado reproyectando el primer vértice: cae en Arauco–Lebu, coincidiendo con
su `NOMBRE_CAM` y su `REGION`.

**Los anchos de campo del `.dbf` están en bytes, no en caracteres.** Decodificar
el registro completo antes de cortarlo desplaza todos los campos posteriores a
la primera tilde (`Inst='MOP'` salía como `'OP  F'`).

**El `Consolidado` de rutas pierde 476 rutas** (201 registros con geometría
vacía, 198 solo en La Araucanía). Se elige la mejor fuente por región; ver la
tabla en `build_rutas.py`.

**3 features de Los Lagos están en UTM 17S pese a declarar 18S** y caerían en el
Atlántico. Se detectan por su easting (>1.000.000), no por un bbox de Chile:
reproyectadas dan lon ≈ −67,8, que cae dentro del rectángulo nacional aunque a
latitud −42 eso sea Argentina.

**`Shape_Leng` viene en grados en todos los `.dbf`.** Las longitudes se calculan
sobre la geometría, y para OECV de forma geodésica: ese archivo fuerza todo
Chile a la zona 19, así que la distancia proyectada depende de lo lejos que esté
el tramo del meridiano central.

**Ñuble entrega `KM_I/KM_F/KM_TRAMO` como texto** y la misma región aparece
escrita de hasta cuatro formas distintas entre fuentes.

## Estructura

```
ETL/
  run.py            punto de entrada: 6 capas en paralelo + manifest + verify
  shp_reader.py     lector SHP/DBF/PRJ/CPG en Python puro (no hay GDAL)
  kml_reader.py     KMZ/KML con zipfile + xml.etree
  geo.py            reproyección, simplificación, husos, nombres de región
  gj_io.py          GeoJSON compacto, escritura atómica, codificación de dominios
  tiles.py          tippecanoe → .pmtiles, con modo degradado
  build_*.py        una capa cada uno, exponen build(cfg)
  verify.py         validación empírica de las salidas

frontend/
  src/
    App.jsx           único dueño del estado
    config.js         capas, filtros, paletas, basemaps
    fichas.js         qué muestra la ficha de cada capa, como datos
    components/       Banner · CapaPuntos · CapaLineas · CapaTiles ·
                      PanelLateral · ModalFicha
    hooks/useDatos.js manifest + carga perezosa con caché
    assets/           el banner institucional (ver INSUMO_GRAFICO/)
  scripts/
    descargar-datos.mjs  npm run datos
    verify-banner.mjs    npm run verify:banner
```

`manifest.json` es el contrato entre ambos: el frontend no hardcodea ninguna
temporada, región, causa ni institución. Si llega la temporada 2026-2027,
aparece sola en los filtros al reejecutar el ETL.

Los campos categóricos de incendios se emiten como índices enteros contra tablas
del manifest (`tablas[campo][codigo]`): bajan el archivo de 6,0 a 3,9 MB y
convierten el filtrado en comparación de enteros.

`manifest.generado` se muestra en la cabecera del panel («datos al …»), no solo
en el pie: el panel scrollea y el pie queda fuera de pantalla en cuanto hay capas
y filtros, y de cuándo son los datos es lo primero que se pregunta quien abre el
visor. La fecha se arma con los componentes del ISO, no con `new Date(iso)`: en
Chile eso retrocedería un día todo lo generado antes de las 03:00 UTC.

Al hacer clic en cualquier figura se abre una ficha con sus atributos, incluidas
las dos capas viales, que son teselas vectoriales y no tienen ningún objeto al
que atar un evento: ahí se le pregunta a protomaps qué cae bajo el cursor, con
una brocha de 8 px. La ficha es un `<dialog>` nativo abierto con `showModal()`,
así que el foco atrapado, el cierre con Escape y el fondo inerte los pone el
navegador.

**Todas las capas vectoriales comparten un único renderer de canvas**, declarado
en las opciones del mapa y no en cada componente. No es un detalle de estilo:
Leaflet engancha los eventos de ratón al elemento `<canvas>`, así que con un
canvas por capa **solo la de encima recibe los clics** y las de debajo no llegan
a consultarse. Y cuál queda encima lo decide el orden en que terminan de
descargarse los archivos: incendios son 3,9 MB, siempre llega el último, y dejaba
OECV y stand-by mudos. Un canvas por capa se ve idéntico en una captura y en una
prueba de una sola capa, así que el fallo solo aparece usando la app con varias
capas encendidas, que es como se usa siempre.

## Requisitos

Python 3.13 con `pyproj`, `shapely`, `pandas`, `openpyxl` (`ETL/requirements.txt`).
No hace falta GDAL ni geopandas.

`tippecanoe` no corre nativo en Windows. Si falta, el ETL emite GeoJSON
simplificado a 25 m en vez de teselas y lo marca en el manifest; el frontend
monta el componente que corresponda. En Actions (Ubuntu) sí está, así que lo
publicado siempre son teselas.

## Verificación

`verify.py` corre solo al final de `run.py` y comprueba el resultado, no que el
código se haya ejecutado: que los archivos parsean, que las cifras cuadran con
el manifest, que las regiones están canonizadas, que nada quedó fuera de Chile,
y un cruce espacial de la distancia de cada incendio al camino más cercano
(mediana 0,30 km; un punto con el huso invertido cae 300–600 km y lo delata).

La cabecera institucional tiene su propia verificación, que no supone que
funciona: la mira.

```bash
cd frontend && npm run verify:banner
```

Construye, sirve el `dist` con un manifest de prueba, y captura los cinco anchos
en tema claro y oscuro más la marca ampliada ×4, el caso sin imagen y la pantalla
de error. Después **mide los píxeles pintados**: el alto de la banda contra
`max(ancho/17,1299, 68)`, que el filete superior siga entero, que el borde
derecho no tenga costura y que el asset haya llegado al artefacto. Corre también
en CI, en un job aparte que no necesita el ETL y que bloquea el despliegue.
Las capturas aceptadas viven en `INSUMO_GRAFICO/verificacion/`.

Dos trampas que cuestan una tarde si se descubren a mano:

- El `--user-data-dir` propio es obligatorio al lanzar Chrome headless. Sin él se
  adjunta a la sesión ya abierta, termina de inmediato y no genera ningún PNG.
- **Nunca sirvas la app en un puerto fijo para capturarla.** Si algo ya ocupa el
  puerto, Vite se mueve solo al siguiente y capturas otro sitio sin enterarte.
  `verify-banner.mjs` levanta su propio servidor en el puerto 0 y lee el que le
  asignaron.

Si sirves `dist` con un servidor propio para cualquier otra cosa, tiene que
soportar **HTTP Range**: las capas viales son PMTiles y sin respuestas `206`
el visor no dibuja ninguna carretera y falla con «Check that your storage
backend supports HTTP Byte Serving».

El estado va en la URL (`?lat=&lon=&z=&capas=&region=&causa_grupo=`), así que
las capturas son reproducibles sin simular clics y las vistas son compartibles.
