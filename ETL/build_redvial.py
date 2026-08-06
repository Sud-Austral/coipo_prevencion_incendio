"""Red vial MOP 2024 -> redvial.pmtiles (o redvial.geojson)

Fuente: 'Red-vial_MOP_2024/Red-vial_MOP_2024.json', 87,3 MiB. Ya es un GeoJSON
plano (13.964 LineString, 2.191.840 vertices), pero NO declara su CRS.

CRS deducido y verificado: EPSG:32719. El bbox va de X 67.677..698.371 e
Y 3.910.130..8.065.296, y el primer vertice del primer feature
(89755.90, 5827956.01) reproyecta a (-73.6464, -37.6040) = Arauco-Lebu, que
coincide con su NOMBRE_CAM 'Cruce P-20 (Arauco) - Quiapo - Cruce P-480 (Lebu)'
y su REGION 'Region del Biobio'. Con 32718 daria lon -79,6 (en el Pacifico) y
con 32720 lon -67,6 (en Argentina).

RAM: json.load() de 87,3 MiB expande a ~1,5-2 GB de objetos Python. Funciona,
pero conviene liberar el crudo en cuanto se termina de recorrer.
"""

from __future__ import annotations

import gc
import json
import re

from cfg import Cfg, log
from geo import canon_region, count_vertices
from gj_io import dominios, humano
from shp_reader import read_shapefile  # noqa: F401  (se mantiene la API homogenea)
from tiles import construir_capa_vial

JSON = "Red-vial_MOP_2024/Red-vial_MOP_2024.json"
EPSG = 32719

CAMPOS = {
    "nombre": "NOMBRE_CAM",
    "rol": "ROL",
    "clasificacion": "CLASIFICAC",
    "carpeta": "CARPETA",
    "km_tramo": "KM_TRAMO",
    "enrolado": "ENROLADO",
    "concesionada": "CONCESIONA",
}


def _norm_clasificacion(v):
    if not v:
        return None
    return re.sub(r"\(En proceso de", "(En Proceso de", str(v).strip())


def _norm_concesionada(v):
    """El dato trae un 'Si' sin tilde entre 13.964 registros."""
    if not v:
        return None
    s = str(v).strip()
    return "Sí" if s.lower() in ("si", "sí") else s


def build(cfg: Cfg) -> dict:
    ruta = cfg.insumo / JSON
    mb = ruta.stat().st_size / 1048576
    log(cfg, "redvial", f"leyendo {mb:.1f} MiB de JSON (usara ~2 GB de RAM)")

    with open(ruta, encoding="utf-8") as fh:
        crudo = json.load(fh)

    origen = crudo.get("features", [])
    feats: list[dict] = []
    v_orig = 0

    for f in origen:
        geom = f.get("geometry")
        if not geom or not geom.get("coordinates"):
            continue
        v_orig += count_vertices(geom)
        p = f.get("properties", {})
        props = {
            "nombre": p.get(CAMPOS["nombre"]),
            "rol": p.get(CAMPOS["rol"]),
            "clasificacion": _norm_clasificacion(p.get(CAMPOS["clasificacion"])),
            "carpeta": p.get(CAMPOS["carpeta"]),
            # KM_TRAMO viene en metros y es fiable. SHAPE_Leng viene en GRADOS.
            "km_tramo": p.get(CAMPOS["km_tramo"]),
            "enrolado": p.get(CAMPOS["enrolado"]),
            "concesionada": _norm_concesionada(p.get(CAMPOS["concesionada"])),
            # 'Región Aysén del General Carlos Ibáñez del Cam' viene truncado al
            # ancho de campo dBASE de 46 caracteres; canon_region lo reconoce.
            "region": canon_region(p.get("REGION")),
        }
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": geom["type"], "coordinates": geom["coordinates"]},
                "properties": {k: v for k, v in props.items() if v is not None and v != ""},
                "_epsg": EPSG,
            }
        )

    del crudo, origen
    gc.collect()

    log(cfg, "redvial", f"{len(feats)} f · {v_orig} v · EPSG:{EPSG}")
    doms = dominios(feats, ["region", "clasificacion", "carpeta"])
    st = construir_capa_vial(cfg, "redvial", "Red vial MOP 2024", feats)

    return {
        "capa": "redvial",
        "titulo": "Red vial MOP 2024",
        "carga": "demanda",
        "leidos": len(feats),
        "vertices_origen": v_orig,
        "filtros": ["region", "clasificacion", "carpeta"],
        "dominios": doms,
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
