# Visor de Prevención de Incendios Forestales — CONAF

App de React solo-frontend que muestra en un mapa Leaflet los insumos de `INSUMO_INCENDIO/`, más un ETL en Python que los convierte a formatos web. Sin backend: todo se sirve como archivos estáticos.

**https://sud-austral.github.io/coipo_prevencion_incendio/**

## Descripción

Aplicación web que visualiza datos de prevención de incendios forestales mediante un mapa interactivo. El sistema procesa datos de múltiples fuentes y los presenta como capas geoespaciales en un visor basado en Leaflet.

## Objetivo

Proporcionar una herramienta visual para la prevención de incendios forestales, integrando datos de incendios históricos, cortafuegos (OECV), puntos de stand-by, rutas de despliegue y red vial.

## Stack técnico

- Frontend: React, JavaScript, Leaflet, Vite
- Backend: Ninguno (servidor estático)
- Procesamiento de datos: Python (pandas, pyproj, shapely, openpyxl)
- Formatos: GeoJSON, PMTiles, JSON
- Herramientas: tippecanoe (para teselación)

## Estructura del proyecto

```
ETL/
  run.py            punto de entrada: 6 capas en paralelo + manifest + verify
  shp_reader.py     lector SHP/DBF/PRJ/CPG en Python puro
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
    assets/           el banner institucional
  scripts/
    descargar-datos.mjs  npm run datos
    verify-banner.mjs    npm run verify:banner
```

## Requisitos

- Python 3.13 con dependencias: `pyproj`, `shapely`, `pandas`, `openpyxl` (ver `ETL/requirements.txt`)
- Node.js para el frontend
- `tippecanoe` para generar PMTiles (no requerido en Windows, usa modo degradado)

## Instalación

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

## Configuración

No se requieren configuraciones adicionales más allá de las dependencias.

## Ejecución

- Frontend: `npm run dev` (desarrollo) o `npm run build` (producción)
- ETL: `python ETL/run.py` con opciones:
  ```
  python ETL/run.py [--layers incendios,oecv,…] [--jobs N] [--secuencial]
                    [--no-tiles] [--simplify 25] [--sin-verify] [-v]
  ```

## API

No hay endpoints API tradicionales. Los datos se sirven como archivos estáticos:
- `manifest.json`: lista de capas disponibles
- Archivos GeoJSON/PMTiles en `frontend/public/data/`
- `kpis.json`: indicadores clave

## Base de datos

No hay base de datos tradicional. Los datos se almacenan como archivos:
- Shapefiles (SHP/DBF/PRJ/CPG)
- KMZ/KML
- Excel (XLSX)
- GeoJSON
- PMTiles

## Flujo de funcionamiento

1. El ETL procesa insumos de `INSUMO_INCENDIO/`
2. Genera capas en formatos web (GeoJSON/PMTiles)
3. Actualiza `manifest.json` como contrato entre frontend y datos
4. GitHub Actions publica los datos en Pages
5. El frontend carga los datos mediante peticiones HTTP Range
6. Los usuarios interactúan con el mapa y las capas

## Desarrollo

- El estado se maneja en el frontend (React)
- Las capas comparten un único renderer de canvas para manejar eventos
- Las fichas se implementan con `<dialog>` nativo
- El estado se persiste en la URL para compartir vistas

## Pruebas

- Verificación automática con `verify.py` al final del ETL
- Verificación del banner institucional:
  ```bash
  cd frontend && npm run verify:banner
  ```
- Las pruebas capturan screenshots y validan dimensiones y elementos

## Despliegue

- GitHub Pages publica el frontend
- GitHub Actions ejecuta el ETL y publica los datos
- Los datos se commitean en `frontend/public/data/`
- El despliegue se activa con push a `INSUMO_INCENDIO/`, `ETL/` o `frontend/`

## Limitaciones conocidas

- `tippecanoe` no funciona en Windows: el ETL emite GeoJSON simplificado en lugar de PMTiles
- No commitear corridas locales del ETL en Windows (solo el runner de Actions es válido)
- Los datos viales requieren soporte HTTP Range para PMTiles
- El huso UTM de los incendios no está declarado y cambia por fila
- Cuatro CRS mezclados entre los shapefiles
- `Red-vial_MOP_2024.json` no declara CRS (es EPSG:32719)
- Los anchos de campo del `.dbf` están en bytes, no en caracteres
- El `Consolidado` de rutas pierde 476 rutas
- 3 features de Los Lagos están en UTM 17S pese a declarar 18S
- `Shape_Leng` viene en grados en todos los `.dbf`
- Ñuble entrega `KM_I/KM_F/KM_TRAMO` como texto con múltiples formatos regionales
