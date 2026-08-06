"""Puntos stand-by (posiciones de espera de brigadas) -> puntos_standby.geojson

La capa mas sucia del proyecto: 7 fuentes, 2 formatos y 6 esquemas de atributos
mutuamente incompatibles, porque cada region entrego lo que tenia. Varias son
exportaciones crudas de KML con el bloque de campos repetido 3 veces
(Name/Name_2/Name_3), y Valparaiso solo existe como KMZ.

Se normalizan a un esquema comun: {nombre, descripcion, responsable, region, fuente}.

Regiones sin puntos y es correcto que no aparezcan: Arica, Tarapaca,
Antofagasta, Atacama, Coquimbo, Maule, Nuble, Los Rios, Magallanes.
"""

from __future__ import annotations

from cfg import Cfg, log
from geo import en_chile, to_wgs84
from gj_io import dominios, feature, humano, write_geojson
from kml_reader import read_kmz
from shp_reader import read_shapefile

BASE = "Despliegue territorial"

# (region, ruta relativa, epsg_forzado|None, mapeo de campos)
# El epsg forzado solo se usa donde el .prj declara algo que hay que
# reinterpretar; en el resto manda el .prj del propio archivo.
FUENTES_SHP = [
    (
        "Aysén",
        f"{BASE}/15.- Aysén/Puntos_Aysen_25-26_Conaf/Puntos_Aysen_25-26_Conaf.shp",
        None,
        {"nombre": "Sector", "descripcion": "Ruta", "responsable": "Responsabl"},
    ),
    (
        "Los Lagos",
        f"{BASE}/14.- Los Lagos/Puntos_Región de Los Lagos_25-26_Conaf.shp",
        None,
        {"nombre": "Name", "descripcion": "descriptio"},
    ),
    (
        "O'Higgins",
        f"{BASE}/8.- O_Higgins/Puntos_O_Higgins_25-26_Conaf.shp",
        None,
        {"nombre": "Name", "descripcion": "descriptio"},
    ),
    (
        "Biobío",
        f"{BASE}/11.- Biobío/Puntos_Región_Biobio_25-26_Conaf/Puntos_Región_Biobio_25-26_Conaf.shp",
        4326,  # el .prj es GEOGCS puro
        {"nombre": "Name", "descripcion": "descriptio"},
    ),
    (
        "La Araucanía",
        f"{BASE}/12.- Araucanía/Puntos Stand By Región de La Araucanía/Puntos_Stand_By_Region_La_Araucania.shp",
        None,
        # 'Name' aqui es un codigo ('9.23'); la etiqueta legible esta en descriptio.
        {"nombre": "descriptio", "codigo": "Name_2", "descripcion": "Name"},
    ),
    (
        "Metropolitana",
        f"{BASE}/7.- Metropolitana/Puntos_stand_by/Puntos_stand_by.shp",
        4326,  # el .prj declara EPSG:9707 (WGS84 + altura EGM96)
        {"nombre": "Name", "descripcion": "Snippet"},
    ),
]

# Unica fuente de puntos de Valparaiso: no existe shapefile equivalente.
KMZ_VALPARAISO = (
    "Valparaíso",
    f"{BASE}/6.- Valparaíso/Puntos_Valparaiso_25-26_Conaf/Puntos_Valparaíso_25-26_Conaf.kmz",
)


def _explotar(geom: dict) -> list[dict]:
    """MultiPoint -> N Point. Biobio entrega MultiPointZ con un punto por feature."""
    if geom["type"] == "MultiPoint":
        return [{"type": "Point", "coordinates": c} for c in geom["coordinates"]]
    return [geom]


def build(cfg: Cfg) -> dict:
    feats: list[dict] = []
    por_fuente: dict[str, int] = {}
    descartados = 0

    for region, rel, epsg_forzado, mapeo in FUENTES_SHP:
        ruta = cfg.insumo / rel
        if not ruta.exists():
            log(cfg, "puntos", f"AVISO: no existe {rel}")
            continue
        sf = read_shapefile(ruta, epsg=epsg_forzado)
        n = 0
        for geom, props in sf:
            for g in _explotar(geom):
                w = to_wgs84(g, sf.epsg)
                lon, lat = w["coordinates"]
                if not en_chile(lon, lat):
                    descartados += 1
                    continue
                feats.append(
                    feature(
                        {
                            "type": "Point",
                            "coordinates": [round(lon, cfg.precision), round(lat, cfg.precision)],
                        },
                        {
                            "nombre": props.get(mapeo.get("nombre", "")),
                            "descripcion": props.get(mapeo.get("descripcion", "")),
                            "responsable": props.get(mapeo.get("responsable", "")),
                            "codigo": props.get(mapeo.get("codigo", "")),
                            "region": region,
                            "fuente": "shapefile",
                        },
                    )
                )
                n += 1
        por_fuente[region] = n

    region, rel = KMZ_VALPARAISO
    ruta = cfg.insumo / rel
    if ruta.exists():
        n = 0
        for pm in read_kmz(ruta):
            if pm["geometry"]["type"] != "Point":
                continue
            lon, lat = pm["geometry"]["coordinates"]
            if not en_chile(lon, lat):
                descartados += 1
                continue
            feats.append(
                feature(
                    {
                        "type": "Point",
                        "coordinates": [round(lon, cfg.precision), round(lat, cfg.precision)],
                    },
                    {
                        "nombre": pm.get("name"),
                        "descripcion": pm.get("description"),
                        "region": region,
                        "fuente": "kmz",
                    },
                )
            )
            n += 1
        por_fuente[region] = n
    else:
        log(cfg, "puntos", f"AVISO: no existe {rel}")

    st = write_geojson(cfg.out / "puntos_standby.geojson", feats)
    detalle = ", ".join(f"{k} {v}" for k, v in por_fuente.items())
    log(
        cfg,
        "puntos",
        f"{len(feats)} f de {len(por_fuente)} fuentes ({detalle}) · "
        f"{descartados} descartados · {humano(st['bytes'])}",
    )

    return {
        "capa": "puntos_standby",
        "titulo": "Puntos stand-by",
        "formato": "geojson",
        "geometria": "Point",
        "carga": "inmediata",
        "por_fuente": por_fuente,
        "descartados": descartados,
        "filtros": ["region"],
        "dominios": dominios(feats, ["region"]),
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
