"""Escritura de GeoJSON compacto e idempotente.

Escritura atomica (.tmp -> os.replace) para que reejecutar el ETL nunca deje un
archivo a medias si algo revienta, y para que el mismo input produzca el mismo
byte de salida.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from geo import bbox_of, bbox_union, count_vertices


def feature(geom: dict, props: dict, fid=None) -> dict:
    """Construye un Feature GeoJSON, descartando props nulas (ahorra bytes)."""
    f = {
        "type": "Feature",
        "geometry": geom,
        "properties": {k: v for k, v in props.items() if v is not None and v != ""},
    }
    if fid is not None:
        f["id"] = fid
    return f


def _escribir_atomico(path: Path, texto: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    data = texto.encode("utf-8")
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)
    return len(data)


def write_geojson(path: str | Path, features: list[dict], *, bbox=None) -> dict:
    """Escribe una FeatureCollection compacta. Devuelve estadisticas."""
    path = Path(path)
    if bbox is None:
        bbox = bbox_union([bbox_of(f["geometry"]) for f in features if f.get("geometry")])

    fc = {"type": "FeatureCollection", "features": features}
    if bbox:
        fc["bbox"] = [round(v, 5) for v in bbox]

    texto = json.dumps(fc, separators=(",", ":"), ensure_ascii=False)
    nbytes = _escribir_atomico(path, texto)

    return {
        "archivo": path.name,
        "features": len(features),
        "vertices": sum(count_vertices(f["geometry"]) for f in features if f.get("geometry")),
        "bytes": nbytes,
        "bbox": [round(v, 5) for v in bbox] if bbox else None,
    }


def write_json(path: str | Path, obj) -> int:
    """Escribe un JSON legible (manifest, kpis). Ordenado para ser idempotente."""
    texto = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False)
    return _escribir_atomico(Path(path), texto)


def dominios(features: list[dict], campos: list[str]) -> dict:
    """Cuenta los valores distintos de cada campo, ordenados por frecuencia.

    Es lo que alimenta los <select> del frontend: asi no hardcodea ninguna lista
    de temporadas, regiones ni causas, y una temporada nueva aparece sola al
    reejecutar el ETL.
    """
    from collections import Counter

    out = {}
    for campo in campos:
        c = Counter(
            f["properties"][campo]
            for f in features
            if f["properties"].get(campo) not in (None, "")
        )
        out[campo] = [{"v": v, "n": n} for v, n in c.most_common()]
    return out


def humano(nbytes: int) -> str:
    """Formatea bytes como MiB/KiB."""
    if nbytes >= 1024 * 1024:
        return f"{nbytes / 1048576:.2f} MiB"
    return f"{nbytes / 1024:.0f} KiB"
