"""Teselas vectoriales de las manchas de riesgo, con GDAL, una por region.

Por que teselas: el riesgo nacional son 110.708 manchas y 6,0 M de vertices.
Dibujadas como GeoJSON en el canvas de Leaflet, Natales sola (25.278 manchas)
tardaba 8,4 s en cargar y 2,1 s por repintado con la CPU a x4 (medido el
2026-09-15). Con teselas el navegador pide solo el viewport, a su zoom.

Por que GDAL y no tippecanoe, como las capas viales: tippecanoe no corre en
Windows y esta capa tiene que poder generarse y verificarse en la maquina de
desarrollo (en este equipo GDAL 3.12.3 viene de conda-forge). El driver PMTiles
de GDAL existe desde la 3.8.

Por que una por region y no una nacional: la nacional mide 154,6 MB (medido) y
GitHub rechaza archivos de mas de 100 MB. Decidido con Luis el 2026-09-15:
«separalos por regiones como estaba originalmente». El visor las carga todas en
UNA capa de protomaps-leaflet con varias fuentes.

NO SE SIMPLIFICA EN EL ZOOM MAXIMO (SIMPLIFICATION_MAX_ZOOM=0, decision de Luis:
«no simplificar nada»). En los zooms bajos GDAL descarta lo que no llega a un
pixel, que es lo que hace cualquier tesela. La geometria completa sigue
publicada en riesgo/<CUT>.geojson para descargar.

SALIDA DETERMINISTA: GDAL escribe el nombre del archivo de salida en los
metadatos si no se le da NAME, y con eso dos corridas identicas diferian en 1.196
bytes (medido). Con NAME fijo los bytes de las teselas son iguales.
"""

from __future__ import annotations

import concurrent.futures as cf
import os
import re
import shutil
import subprocess
from pathlib import Path

MIN_ZOOM = 4
MAX_ZOOM = 14
CAPA_MVT = "riesgo"


def ogr2ogr() -> str | None:
    """Ejecutable de GDAL: $OGR2OGR o el del PATH."""
    return os.environ.get("OGR2OGR") or shutil.which("ogr2ogr")


def _entorno(exe: str) -> dict:
    """GDAL_DATA y PROJ_DATA junto al ejecutable si no vienen dados.

    Un entorno de conda sin activar no los define, y sin proj.db la reproyeccion
    a 3857 de las teselas falla. Se buscan en <prefijo>/share, que es donde los
    deja conda-forge en Windows (Library/) y en Linux.
    """
    env = dict(os.environ)
    prefijo = Path(exe).resolve().parent.parent
    for var, sub in (("GDAL_DATA", "share/gdal"), ("PROJ_DATA", "share/proj")):
        if var not in env and (prefijo / sub).exists():
            env[var] = str(prefijo / sub)
    return env


def version() -> str | None:
    exe = ogr2ogr()
    if not exe:
        return None
    try:
        r = subprocess.run([exe, "--version"], capture_output=True, text=True, env=_entorno(exe), timeout=60)
        return r.stdout.strip().split(",")[0] or None
    except Exception:
        return None


def teselar_region(entrada: Path, salida: Path, max_size: int) -> dict:
    """GeoJSONSeq de una region -> PMTiles. Devuelve bytes y avisos de GDAL."""
    exe = ogr2ogr()
    salida.parent.mkdir(parents=True, exist_ok=True)
    tmp = salida.with_suffix(".pmtiles.tmp")
    if tmp.exists():
        tmp.unlink()
    cmd = [
        exe, "-f", "PMTiles", str(tmp), str(entrada), "-nln", CAPA_MVT,
        "-dsco", f"NAME={CAPA_MVT}",
        "-dsco", f"MINZOOM={MIN_ZOOM}",
        "-dsco", f"MAXZOOM={MAX_ZOOM}",
        "-dsco", "SIMPLIFICATION_MAX_ZOOM=0",
        "-dsco", f"MAX_SIZE={max_size}",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, env=_entorno(exe))
    if r.returncode != 0:
        raise RuntimeError(f"ogr2ogr fallo en {entrada.name}:\n{r.stderr[-2000:]}")
    os.replace(tmp, salida)
    avisos = [linea for linea in r.stderr.splitlines() if linea.strip()]
    return {"bytes": salida.stat().st_size, "avisos": avisos}


def teselar(regiones: dict[str, Path], destino: Path, max_size: int, hilos: int = 4) -> dict[str, dict]:
    """Todas las regiones en paralelo. `regiones` = {'08': ruta del .geojsonl}.

    Hilos y no procesos: el trabajo lo hace ogr2ogr en su propio proceso, y asi
    el pool de run.py no anida otro pool de procesos.
    """
    out: dict[str, dict] = {}
    with cf.ThreadPoolExecutor(max_workers=hilos) as pool:
        futs = {pool.submit(teselar_region, e, destino / f"{nn}.pmtiles", max_size): nn for nn, e in regiones.items()}
        for fu in cf.as_completed(futs):
            out[futs[fu]] = fu.result()
    # Un .pmtiles de una region que ya no viene quedaria publicado sin declararse.
    for p in destino.glob("*.pmtiles"):
        if re.fullmatch(r"\d{2}\.pmtiles", p.name) and p.stem not in out:
            p.unlink()
    return dict(sorted(out.items()))
