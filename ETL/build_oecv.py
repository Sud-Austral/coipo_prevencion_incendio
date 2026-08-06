"""Capa OECV -> oecv.geojson

OECV = Obras de Eliminacion de Combustible Vegetal (cortafuegos preventivos,
fajas cortacombustible). Definidas en el Memo N 3045/2025 de la Gerencia de
Proteccion contra Incendios Forestales de CONAF, que ademas fija la simbologia
oficial por titularidad del terreno: VERDE = Fiscal, NARANJO = Privado,
AMARILLO = Sin determinar.

Fuente unica: COMPILADO/SHAPE/Compilado shape/Compilado_OECV_2025.shp, que es
exactamente la union de los 15 shapefiles regionales de esa misma carpeta.
"""

from __future__ import annotations

import re

from cfg import Cfg, log
from geo import canon_region, count_vertices, length_geod_km, round_coords, simplify_m, to_wgs84
from gj_io import dominios, feature, humano, write_geojson
from shp_reader import read_shapefile

SHP = "OECV 2025 - 2026/COMPILADO/SHAPE/Compilado shape/Compilado_OECV_2025.shp"

# Km planificados a nivel nacional segun 'OECV 2025-2026.xlsx', hoja
# 'Total Planificado'. Es la unica cifra oficial independiente disponible y se
# usa como control de sanidad de la geometria.
#
# La geometria medida da ~4.790 km, un 2,2% menos: la diferencia entre lo
# dibujado en los KMZ y lo declarado en la planilla es esperable, por eso la
# tolerancia es amplia. Lo que este aserto detecta es un fallo estructural
# (CRS equivocado, features perdidas), no un desajuste administrativo.
KM_OFICIAL_NACIONAL = 4898.595
TOLERANCIA_PCT = 12.0


def grupo_de_folderpath(fp: str | None, nombre: str | None) -> str | None:
    """Ultimo segmento del FolderPath: la carpeta de la que salio la obra.

    OJO: NO es la comuna. Se comprobo sobre los 1.863 registros que cada region
    usa una estructura distinta y no hay comuna recuperable de forma fiable:

      Tarapaca   'OECV 2025-2026 TARAPACÁ/MOP/A-855 Huatacondo.kmz'
                 -> el .kmz es el nombre de la ruta
      Coquimbo   'OECV 2025-2026 COQUIMBO/CONAF.kmz/CONAF/CONAF_LaSerena'
                 -> la comuna va pegada al prefijo de la institucion
      Valparaiso '...kmz/Planificación OECV MOP 2025-2026/MOP/TERRENOS PRIVADOS/Regimiento Maipo'
                 -> el ultimo segmento es un predio

    Se expone como contexto para el popup, sin afirmar que sea una division
    administrativa. Se omite cuando solo repite el nombre de la obra.
    """
    if not fp:
        return None
    seg = [s.strip() for s in fp.split("/") if s.strip()]
    if not seg:
        return None
    ultimo = re.sub(r"\.kmz$", "", seg[-1], flags=re.I).strip()
    if not ultimo or "OECV" in ultimo.upper():
        return None
    if nombre and ultimo.lower() == nombre.strip().lower():
        return None
    return ultimo


def build(cfg: Cfg) -> dict:
    sf = read_shapefile(cfg.insumo / SHP)
    feats: list[dict] = []
    km_por_region: dict[str, float] = {}
    total_v_orig = 0

    for geom, props in sf:
        total_v_orig += count_vertices(geom)

        # Longitud sobre la geometria ORIGINAL (simplificar acorta las lineas) y
        # geodesica, no proyectada: este archivo fuerza todo Chile a EPSG:32719.
        # Nunca desde Shape_Leng del .dbf, que viene en GRADOS.
        km = length_geod_km(to_wgs84(geom, sf.epsg))

        # Las fajas son cortas: 25 m les come la forma, 10 m la conserva.
        g = simplify_m(geom, cfg.oecv_simplify)
        g = round_coords(to_wgs84(g, sf.epsg), cfg.precision)

        region = canon_region(props.get("Region"))
        if region:
            km_por_region[region] = km_por_region.get(region, 0.0) + km

        nombre = props.get("Name")
        feats.append(
            feature(
                g,
                {
                    "nombre": nombre,
                    "tipo": props.get("Tipo"),
                    "inst": props.get("Inst"),
                    "region": region,
                    "grupo": grupo_de_folderpath(props.get("FolderPath"), nombre),
                    "longitud_km": round(km, 3),
                },
            )
        )

    st = write_geojson(cfg.out / "oecv.geojson", feats)

    km_total = sum(km_por_region.values())
    delta = 100.0 * (km_total - KM_OFICIAL_NACIONAL) / KM_OFICIAL_NACIONAL
    if abs(delta) > TOLERANCIA_PCT:
        raise AssertionError(
            f"OECV: {km_total:.1f} km medidos vs {KM_OFICIAL_NACIONAL:.1f} km "
            f"planificados segun el Excel oficial (delta {delta:+.1f} %, "
            f"tolerancia {TOLERANCIA_PCT:.0f} %). Revisa el CRS o la lectura."
        )

    log(
        cfg,
        "oecv",
        f"{sf.n} f · {total_v_orig} -> {st['vertices']} v "
        f"({100.0 * st['vertices'] / total_v_orig:.1f} %) · {humano(st['bytes'])} · "
        f"{km_total:.1f} km medidos vs {KM_OFICIAL_NACIONAL:.0f} planificados "
        f"(Δ {delta:+.1f} %)",
    )

    return {
        "capa": "oecv",
        "titulo": "OECV — Obras de Eliminación de Combustible Vegetal",
        "formato": "geojson",
        "geometria": "LineString",
        "carga": "inmediata",
        "leidos": sf.n,
        "vertices_origen": total_v_orig,
        "longitud_km": round(km_total, 1),
        "km_por_region": {k: round(v, 1) for k, v in sorted(km_por_region.items())},
        "filtros": ["region", "tipo", "inst"],
        "dominios": dominios(feats, ["region", "tipo", "inst"]),
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
