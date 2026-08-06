"""Rutas de despliegue territorial 25-26 -> rutas.pmtiles (o rutas.geojson)

SELECCION DE FUENTE, medida archivo por archivo (features con geometria valida):

    region          Consolidado   regional    elegida
    Araucania           311          480      regional  (+169)
    Biobio              235          382      regional  (+147)
    Maule              1168         1288      regional  (+120)
    Nuble               292          330      regional   (+38)
    Los Lagos           201          206      regional    (+5, tras filtrar 3 corruptas)
    Aysen                95           25      Consolidado
    Magallanes           58           43      Consolidado
    Arica / Valparaiso / Metropolitana / OHiggins  -> identicas, se usa Consolidado
    Antofagasta / Tarapaca / Los Rios / Corma      -> solo existen en Consolidado

Usar Consolidado para todo (que era el plan inicial) costaba 476 rutas, el 10%
de la capa, concentradas justo en las regiones con mas incendios. El motivo es
que Consolidado tiene 201 registros con geometria VACIA (nParts=0, nPoints=0),
198 de ellos en Araucania.

Las razones para desconfiar de las carpetas regionales siguen siendo reales,
pero se manejan por feature en vez de descartando el archivo entero:
  - Los Lagos: 3 features en UTM 17S pese a declarar 18S -> las caza utm_valido().
  - Biobio: el mismo shapefile duplicado byte a byte con nombre en mojibake
    ('Rutas_Biob+¡o_...') -> se referencia solo la copia con nombre limpio.
  - Magallanes: 51 campos por un auto-join triplicado -> se usa Consolidado, que
    ademas tiene mas geometria.

Los archivos mezclan EPSG:32718 y 32719, asi que el CRS se lee del .prj de cada
uno y viaja con cada feature hasta el momento de reproyectar.
"""

from __future__ import annotations

import re

from cfg import Cfg, log
from geo import canon_region, count_vertices, utm_valido
from gj_io import dominios
from shp_reader import read_shapefile
from tiles import construir_capa_vial

BASE = "Despliegue territorial"
CONS = f"{BASE}/Consolidado"

FUENTES = [
    # (etiqueta, ruta relativa, origen)
    ("Antofagasta",   f"{CONS}/Rutas_Antofagasta_25-26_Conaf.shp",   "CONAF"),
    ("Arica",         f"{CONS}/Rutas_Arica_25-26_Conaf.shp",         "CONAF"),
    ("Tarapacá",      f"{CONS}/Rutas_Tarapaca_25-26_Conaf.shp",      "CONAF"),
    ("Valparaíso",    f"{CONS}/Rutas_Valparaiso_25-26_Conaf.shp",    "CONAF"),
    ("Metropolitana", f"{CONS}/Rutas_Metropolitana_25-26_Conaf.shp", "CONAF"),
    ("O'Higgins",     f"{CONS}/Rutas_OHiggins_25-26_Conaf.shp",      "CONAF"),
    ("Los Ríos",      f"{CONS}/Rutas_LosRios_25-26_Conaf.shp",       "CONAF"),
    ("Aysén",         f"{CONS}/Rutas_Aysen_25-26_Conaf.shp",         "CONAF"),
    ("Magallanes",    f"{CONS}/Rutas_Magallanes_25-26_Conaf.shp",    "CONAF"),
    ("CORMA",         f"{CONS}/Rutas_Corma_25-26.shp",               "CORMA"),
    ("La Araucanía",  f"{BASE}/12.- Araucanía/Rutas Región de La Araucanía/Rutas_Region_La_Araucanía.shp", "CONAF"),
    ("Biobío",        f"{BASE}/11.- Biobío/Rutas_Correccion/Rutas_Biobio_25-26_Conaf.shp", "CONAF"),
    ("Maule",         f"{BASE}/9.- Maule/Rutas_Maule_25-26_Conaf.shp", "CONAF"),
    ("Ñuble",         f"{BASE}/10.- Ñuble/Rutas_Ñuble_25-26_Conaf.shp", "CONAF"),
    ("Los Lagos",     f"{BASE}/14.- Los Lagos/Rutas_Región de Los Lagos_25-26_Conaf.shp", "CONAF"),
]

# Los C(254) sobrantes multiplicados por 5.003 features son varios MiB de texto
# muerto. Solo se emite lo que el popup o los filtros usan.
CAMPOS = {
    "nombre": "NOMBRE_CAM",
    "rol": "ROL",
    "clasificacion": "CLASIFICAC",
    "carpeta": "CARPETA",
    "km_tramo": "KM_TRAMO",
    "enrolado": "ENROLADO",
    "concesionada": "CONCESIONA",
}

# Metropolitana es la unica capa vial que trae causalidad de incendios.
CAMPOS_RM = {
    "provincia": "Provincia",
    "comuna": "Comuna",
    "causa_grupo": "Grupo_de_C",
    "causa_general": "Causa_Gene",
    "causa_especifica": "Causa_Espe",
}


def _num(v):
    """Nuble entrega KM_I/KM_F/KM_TRAMO como C(254) en vez de numerico."""
    if v is None or isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace(",", ".")
    try:
        return int(float(s))
    except ValueError:
        return None


def _norm_clasificacion(v):
    """Colapsa la variante con 'p' minuscula: '(En proceso de Enrolamiento)'."""
    if not v:
        return None
    return re.sub(r"\(En proceso de", "(En Proceso de", str(v).strip())


def build(cfg: Cfg) -> dict:
    feats: list[dict] = []
    v_orig = 0
    por_archivo: dict[str, int] = {}
    epsgs: dict[int, int] = {}
    corruptas: list[str] = []
    sin_geom = 0

    for etiqueta, rel, origen in FUENTES:
        shp = cfg.insumo / rel
        if not shp.exists():
            raise FileNotFoundError(shp)
        sf = read_shapefile(shp)
        epsgs[sf.epsg] = epsgs.get(sf.epsg, 0) + sf.n
        n = 0
        con_geom = 0

        for geom, props in sf:
            con_geom += 1
            # Coordenadas fuera del rango de una zona UTM = feature corrupta.
            if sf.epsg != 4326 and not utm_valido(geom):
                corruptas.append(f"{etiqueta}: {props.get('NOMBRE_CAM') or props.get('ROL')}")
                continue
            v_orig += count_vertices(geom)
            p = {
                "nombre": props.get(CAMPOS["nombre"]),
                "rol": props.get(CAMPOS["rol"]),
                "clasificacion": _norm_clasificacion(props.get(CAMPOS["clasificacion"])),
                "carpeta": props.get(CAMPOS["carpeta"]),
                "km_tramo": _num(props.get(CAMPOS["km_tramo"])),
                "enrolado": props.get(CAMPOS["enrolado"]),
                "concesionada": props.get(CAMPOS["concesionada"]),
                # CORMA cruza varias regiones, por eso la region sale del dato y
                # no de la etiqueta del archivo; la etiqueta es el respaldo.
                "region": canon_region(props.get("REGION")) or etiqueta,
                "origen": origen,
            }
            for destino, campo in CAMPOS_RM.items():
                if campo in props and props[campo]:
                    p[destino] = props[campo]

            feats.append(
                {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {k: v for k, v in p.items() if v is not None and v != ""},
                    "_epsg": sf.epsg,
                }
            )
            n += 1
        por_archivo[etiqueta] = n
        sin_geom += sf.n - con_geom

    if corruptas:
        log(cfg, "rutas", f"{len(corruptas)} features con coordenadas fuera de rango UTM, descartadas:")
        for c in corruptas:
            log(cfg, "rutas", f"    {c}")
    if sin_geom:
        log(cfg, "rutas", f"{sin_geom} registros sin geometria en el origen, omitidos")

    log(
        cfg,
        "rutas",
        f"{len(FUENTES)} shapefiles · {len(feats)} f · {v_orig} v · "
        f"CRS {dict(sorted(epsgs.items()))}",
    )

    doms = dominios(feats, ["region", "clasificacion", "carpeta", "origen"])
    st = construir_capa_vial(cfg, "rutas", "Rutas de despliegue territorial 25-26", feats)

    return {
        "capa": "rutas",
        "titulo": "Rutas de despliegue territorial 25-26",
        "carga": "demanda",
        "leidos": len(feats),
        "vertices_origen": v_orig,
        "por_archivo": por_archivo,
        "filtros": ["region", "clasificacion", "carpeta", "origen"],
        "dominios": doms,
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
