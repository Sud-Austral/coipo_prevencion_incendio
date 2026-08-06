# Visor de Prevención de Incendios Forestales — CONAF

App de React solo-frontend que muestra en un mapa Leaflet los insumos de
`INSUMO_INCENDIO/`, más un ETL en Python que los convierte a formatos web.
Sin backend: todo se sirve como archivos estáticos.

**https://sud-austral.github.io/coipo_prevencion_incendio/**

## Uso

```bash
python ETL/run.py          # genera las capas y las valida  (~20 s)
cd frontend && npm install && npm run dev
```

`ETL/run.py` es el único punto de entrada: corre las 6 capas en paralelo,
escribe `manifest.json` y ejecuta `verify.py` al terminar.

```
python ETL/run.py [--layers incendios,oecv,…] [--jobs N] [--secuencial]
                  [--no-tiles] [--simplify 25] [--sin-verify] [-v]
```

Los datos generados **no se commitean**: los reconstruye GitHub Actions en cada
push a `INSUMO_INCENDIO/`, `ETL/` o `frontend/`, y los publica en Pages.

## Capas

| Capa | Origen | Features | Salida |
|---|---|---:|---|
| Incendios investigados | `BBDD INVESTIGACIÓN UAD…xlsx`, hoja `Hoja 1` | 14.705 de 14.985 (98,1 %) | `incendios.geojson` 3,9 MB |
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

frontend/src/
  App.jsx           único dueño del estado
  config.js         capas, filtros, paletas, basemaps
  components/       CapaPuntos · CapaLineas · CapaTiles · PanelLateral
  hooks/useDatos.js manifest + carga perezosa con caché
```

`manifest.json` es el contrato entre ambos: el frontend no hardcodea ninguna
temporada, región, causa ni institución. Si llega la temporada 2026-2027,
aparece sola en los filtros al reejecutar el ETL.

Los campos categóricos de incendios se emiten como índices enteros contra tablas
del manifest (`tablas[campo][codigo]`): bajan el archivo de 6,0 a 3,9 MB y
convierten el filtrado en comparación de enteros.

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

Para ver la app de verdad, y no solo suponer que funciona:

```powershell
cd frontend; npm run dev
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --user-data-dir="$env:TEMP\chrome-conaf" `
  --window-size=1600,1000 --virtual-time-budget=45000 `
  --run-all-compositor-stages-before-draw `
  --screenshot="$env:TEMP\mapa.png" `
  "http://localhost:5173/coipo_prevencion_incendio/"
```

El `--user-data-dir` propio es obligatorio: sin él, Chrome se adjunta a la
sesión ya abierta, termina de inmediato y no genera ningún PNG.

El estado va en la URL (`?lat=&lon=&z=&capas=&region=&causa_grupo=`), así que
las capturas son reproducibles sin simular clics y las vistas son compartibles.
