"""Teselado vectorial con tippecanoe, y modo degradado cuando no esta disponible.

tippecanoe es C++ con Makefile y no corre nativo en Windows, asi que en la
maquina de desarrollo no existe. En vez de bloquear el ETL, este modulo detecta
su ausencia y emite GeoJSON simplificado, marcandolo en el manifest para que el
frontend monte el componente adecuado.

Produccion (GitHub Actions, ubuntu-latest) SI tiene tippecanoe, asi que los
datos publicados siempre son teselas.

Por que teselas para estas dos capas: juntas son 19.000 lineas y 5,7 M de
vertices. Como GeoJSON, la vista nacional obliga a descargar y parsear el pais
entero a detalle completo. Con teselas el navegador pide solo el viewport al
zoom actual (~300 KB) y la simplificacion por nivel la calcula tippecanoe.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from cfg import Cfg, log
from geo import round_coords, simplify_m, to_wgs84
from gj_io import humano, write_geojson

# z4: por debajo Chile no cabe en pantalla. z13: por encima la geometria de
# origen (escala nacional) ya no aporta detalle nuevo.
MIN_ZOOM = 4
MAX_ZOOM = 13


def tippecanoe_disponible() -> str | None:
    return shutil.which("tippecanoe")


def version_tippecanoe() -> str | None:
    exe = tippecanoe_disponible()
    if not exe:
        return None
    try:
        # tippecanoe escribe su version en stderr y sale con codigo != 0.
        r = subprocess.run([exe, "--version"], capture_output=True, text=True)
        return (r.stderr or r.stdout).strip().splitlines()[0]
    except Exception:
        return None


def teselar(cfg: Cfg, capa: str, entrada: Path, titulo: str) -> dict:
    """Convierte un GeoJSON a .pmtiles. Devuelve metadata de la capa."""
    exe = tippecanoe_disponible()
    salida = cfg.out / f"{capa}.pmtiles"
    cmd = [
        exe,
        "-o", str(salida),
        "--layer", capa,
        "--name", titulo,
        "--minimum-zoom", str(MIN_ZOOM),
        "--maximum-zoom", str(MAX_ZOOM),
        # Descarta donde hay saturacion visual, no uniformemente.
        "--drop-densest-as-needed",
        # Sin esto se pierden tramos enteros en zooms bajos por presion de tamano.
        "--extend-zooms-if-still-dropping",
        "--simplification", "4",
        "--force",
        str(entrada),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"tippecanoe fallo en {capa}:\n{r.stderr[-2000:]}")

    return {
        "formato": "pmtiles",
        "archivo": salida.name,
        "capa_mvt": capa,
        "minzoom": MIN_ZOOM,
        "maxzoom": MAX_ZOOM,
        "bytes": salida.stat().st_size,
    }


def degradado(cfg: Cfg, capa: str, feats: list[dict], epsg_por_feat=None) -> dict:
    """Sin tippecanoe: GeoJSON simplificado a cfg.simplify.

    Las features llegan en coordenadas NATIVAS; aqui se simplifican en metros,
    se reproyectan y se redondean.
    """
    salida: list[dict] = []
    for f in feats:
        epsg = f.pop("_epsg")
        g = simplify_m(f["geometry"], cfg.simplify)
        g = round_coords(to_wgs84(g, epsg), cfg.precision)
        f["geometry"] = g
        salida.append(f)

    st = write_geojson(cfg.out / f"{capa}.geojson", salida)
    st["formato"] = "geojson"
    st["simplify_m"] = cfg.simplify
    return st


def emitir_para_tippecanoe(cfg: Cfg, capa: str, feats: list[dict]) -> tuple[Path, int]:
    """Escribe el GeoJSON intermedio en _build/ que consumira tippecanoe.

    Se reproyecta pero NO se simplifica: tippecanoe simplifica por nivel de zoom,
    que da mejor resultado que un Douglas-Peucker unico. Se redondea a
    tiles_precision (6 decimales) para no darle ruido de entrada.
    """
    ruta = cfg.build / f"{capa}.geojson"
    salida = []
    for f in feats:
        epsg = f["_epsg"]
        f = {k: v for k, v in f.items() if k != "_epsg"}
        f["geometry"] = round_coords(to_wgs84(f["geometry"], epsg), cfg.tiles_precision)
        salida.append(f)
    st = write_geojson(ruta, salida)
    return ruta, st["bytes"]


def construir_capa_vial(cfg: Cfg, capa: str, titulo: str, feats: list[dict]) -> dict:
    """Punto de entrada comun de rutas y redvial.

    `feats` son Features GeoJSON con geometria en coordenadas nativas y una
    clave '_epsg' por feature (las rutas mezclan EPSG:32718 y 32719).
    """
    if cfg.no_tiles or not tippecanoe_disponible():
        motivo = "--no-tiles" if cfg.no_tiles else "tippecanoe no disponible"
        log(cfg, capa, f"modo degradado ({motivo}): GeoJSON simplificado a {cfg.simplify:.0f} m")
        st = degradado(cfg, capa, feats)
        log(cfg, capa, f"{st['features']} f · {st['vertices']} v · {humano(st['bytes'])}")
        return st

    inter, nbytes = emitir_para_tippecanoe(cfg, capa, feats)
    log(cfg, capa, f"intermedio {humano(nbytes)} -> tippecanoe z{MIN_ZOOM}-{MAX_ZOOM}")
    st = teselar(cfg, capa, inter, titulo)
    log(cfg, capa, f"{len(feats)} f · {st['archivo']} {humano(st['bytes'])}")
    st["features"] = len(feats)
    return st
