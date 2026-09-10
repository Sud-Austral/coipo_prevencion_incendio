# Visor de Prevención de Incendios Forestales — CONAF

App de React solo-frontend que muestra en un mapa Leaflet los insumos de
`INSUMO_INCENDIO/`, más un ETL en Python que los convierte a formatos web.
Sin backend: todo se sirve como archivos estáticos.

**https://sud-austral.github.io/coipo_prevencion_incendio/**

> **Este archivo es el borrador del README.** El `README.md` lo genera un bot
> (`.github/workflows/readme.yml` → `Sud-Austral/coipo_aireadme@v1`) y puede
> sobrescribirse en cualquier push a `main`. Lo que no se puede perder **no va
> aquí**: va en `CLAUDE.md` (cómo se toca el repo) y en `DECISIONES.md` (por qué
> los datos son como son).

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

```
python ETL/run.py [--layers incendios,oecv,…] [--jobs N] [--secuencial]
                  [--no-tiles] [--simplify 25] [--sin-verify] [-v]
```

Los datos generados **sí se commitean**, en `frontend/public/data/`: los
reconstruye GitHub Actions en cada push a `INSUMO_INCENDIO/`, `ETL/` o
`frontend/`, los publica en Pages y los deja versionados en `main`.

> **No commitees una corrida local del ETL en Windows.** Ahí no existe
> tippecanoe y el ETL cae en modo degradado: emite GeoJSON en vez de `.pmtiles`.
> El único productor válido de lo versionado es el runner de Actions. Para
> trabajar en local, `npm run datos`. El porqué completo, en `DECISIONES.md` §L.

## Capas

| Capa | Origen | Features | Salida |
|---|---|---:|---|
| Incendios investigados | `BBDD INVESTIGACIÓN UAD…xlsx`, hoja `Hoja 1` (las 23 columnas) | 14.705 de 14.985 (98,1 %) | `incendios.geojson` 7,6 MB |
| OECV (cortafuegos) | `OECV 2025 - 2026/COMPILADO/SHAPE/Compilado_OECV_2025.shp` | 1.863 · 4.790 km | `oecv.geojson` 908 KB |
| OECV verificado | evidencia enviada por las regiones | 1.114 | `oecv_verificado.geojson` 1,9 MB |
| Puntos stand-by | 6 shapefiles + 1 KMZ, uno por región | 327 | `puntos_standby.geojson` 54 KB |
| Rutas de despliegue | 15 shapefiles de `Despliegue territorial` | 5.278 | `rutas.pmtiles` |
| Red vial MOP 2024 | `Red-vial_MOP_2024.json` (87 MB) | 13.964 | `redvial.pmtiles` |
| Indicadores | `OECV 2025-2026.xlsx` | 4.898,6 km plan / 78,8 % avance | `kpis.json` |

Las dos capas viales suman 19.000 líneas y 5,7 M de vértices, así que salen como
teselas vectoriales: el navegador pide por HTTP Range únicamente el viewport al
zoom actual. Las capas ligeras siguen en GeoJSON porque hay que filtrarlas por
atributo y tenerlas enteras en memoria de todos modos (`DECISIONES.md` §I).

## Los datos traen trampas, y están todas documentadas

El huso UTM de los incendios no viene declarado y cambia por fila; hay cuatro CRS
mezclados entre los shapefiles; la red vial MOP no declara ninguno; los anchos
del `.dbf` están en bytes y no en caracteres; el consolidado de rutas pierde 476
registros; tres features de Los Lagos vienen en el huso equivocado; `Shape_Leng`
viene en grados.

**Cada una está medida y explicada en [`DECISIONES.md`](DECISIONES.md)**, con qué
aserción la vigila y qué cuesta. No las re-descubras.

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
  verify.py         13 aserciones D sobre las salidas, con --negativas

frontend/
  src/
    App.jsx           único dueño del estado
    config.js         capas, filtros, paletas, basemaps — y sus mediciones
    components/       Banner · CapaPuntos · CapaLineas · CapaTiles · PanelLateral · ModalFicha
    hooks/useDatos.js manifest + carga perezosa con caché
  scripts/
    descargar-datos.mjs  npm run datos
    verify-banner.mjs    npm run verify:banner
    verify-panel.mjs     npm run verify:panel
    mutaciones.mjs       npm run verify:mutantes

analisis/           contraparte Python del visor (el notebook se GENERA)
```

`manifest.json` es el contrato entre ETL y frontend: el visor no hardcodea
ninguna temporada, región, causa ni institución. Si llega la temporada
2026-2027, aparece sola en los filtros al reejecutar el ETL.

El estado va en la URL (`?lat=&lon=&z=&capas=&region=&causa_grupo=`), así que las
capturas son reproducibles sin simular clics y las vistas son compartibles.

## Requisitos

Python 3.13 con `pyproj`, `shapely`, `pandas`, `openpyxl` (`ETL/requirements.txt`).
No hace falta GDAL ni geopandas.

`tippecanoe` no corre nativo en Windows. En Actions (Ubuntu) sí está, así que lo
publicado siempre son teselas.

## Verificación

Nada aquí supone que algo funciona: lo mira.

```bash
python ETL/verify.py               # 39 comprobaciones sobre lo publicado
python ETL/verify.py --negativas   # 12 mutaciones, cada una debe ponerse roja
cd frontend
npm run verify:banner              # el banner institucional, midiendo píxeles
npm run verify:panel               # el panel de indicadores
npm run verify:mutantes            # los controles negativos de los dos arneses
```

`verify.py` comprueba el **resultado**, no que el código se haya ejecutado: que
los archivos parsean, que las cifras cuadran con el manifest, que las regiones
están canonizadas, que nada quedó fuera de Chile, y un cruce espacial de la
distancia de cada incendio al camino más cercano — la comprobación que delata un
huso UTM invertido.

Los dos arneses de navegador pilotan Chrome por CDP y **miden los píxeles
pintados**. Corren también en CI, en un job aparte que bloquea el despliegue.

Y porque **una aserción que nunca se ha visto roja no es una prueba**, los modos
`--negativas` y `verify:mutantes` reintroducen cada defecto y exigen que se ponga
roja la aserción que lo vigila. Si un mutante sobrevive, esa aserción no está
probando nada.

Las trampas de cada comando —el intérprete, el modo degradado, Chrome— están en
[`CLAUDE.md`](CLAUDE.md) §3.
