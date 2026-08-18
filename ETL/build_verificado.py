"""Capa OECV verificado en terreno -> oecv_verificado.geojson

Evidencia GEOMETRICA de verificacion que las regiones dejan en las carpetas
'OECV 2025 - 2026/<region>/Verificado/' y que hasta ahora no se desplegaba: el
visor afirmaba el avance (kpis.json, hoja 'Matriz de avance') sin que nadie
pudiera ver DONDE estan los kilometros reportados.

Esto NO es el avance oficial y la capa no lo pretende: es la evidencia tal como
la enviaron las regiones, que hoy es heterogenea a proposito de mostrarse --esa
heterogeneidad es el hallazgo:

    Aysen       calza al kilometro con su plan (46,0 km)
    Los Rios    PEE mensual en shapefile + KMZ de mecanizados por comuna
    Valparaiso  KMZ con MAS geometria que su propio plan (mezcla obras y accesos)
    Tarapaca    reporta 23 km y no hay NINGUNA geometria (solo PDFs)

Reglas de lectura:
  - Se leen .kmz/.kml (WGS84) y .shp (reproyectado segun su .prj).
  - Solo lineas (LineString/MultiLineString). Los poligonos quedan fuera: su
    perimetro no es longitud de faja y sumarlo inflaria los km.
  - Si en una carpeta conviven un .kml y un .kmz con el mismo nombre, se lee
    solo el .kmz (son exportaciones duplicadas del mismo contenido).
  - Un archivo ilegible se anota y NO detiene la capa (hay KMZ corruptos
    reales, p. ej. los IF de Los Rios).
  - La institucion se infiere de la ruta (CONAF/MOP/Municipio/Privado), que es
    el unico lugar donde las regiones la declaran.
"""

from __future__ import annotations

import re

from cfg import Cfg, log
from geo import canon_region, en_chile, length_geod_km, round_coords, simplify_m, to_wgs84
from gj_io import dominios, feature, humano, write_geojson
from kml_reader import read_kml_o_kmz
from shp_reader import read_shapefile

BASE = "OECV 2025 - 2026"

# El orden importa: 'CONAF MOP' no aparece en Verificado, pero si aparece un
# dia gana el segmento mas profundo de la ruta, que es el mas especifico.
INST_PATRONES = [
    (re.compile(r"CONAF", re.I), "CONAF"),
    (re.compile(r"MOP|VIALIDAD", re.I), "MOP"),
    (re.compile(r"MUNICIP|MUNI\b", re.I), "Municipio"),
    (re.compile(r"PRIVAD", re.I), "Privado"),
    (re.compile(r"ELECTRIC", re.I), "Empresa eléctrica"),
]


def _inst_de(rel: str) -> str | None:
    """Institucion segun el segmento mas profundo de la ruta que la nombre."""
    for seg in reversed(rel.split("/")):
        for patron, inst in INST_PATRONES:
            if patron.search(seg):
                return inst
    return None


def _region_de(carpeta: str) -> str | None:
    """'13.- Los Ríos' -> 'Los Ríos' canonizada."""
    return canon_region(re.sub(r"^\d+[.\-\s]+", "", carpeta))


def _lineas(geom: dict | None):
    """Descompone en LineStrings; descarta puntos y poligonos."""
    if not geom:
        return
    if geom["type"] == "LineString":
        yield geom
    elif geom["type"] == "MultiLineString":
        for c in geom["coordinates"]:
            yield {"type": "LineString", "coordinates": c}
    elif geom["type"] == "GeometryCollection":
        for g in geom.get("geometries", []):
            yield from _lineas(g)


def build(cfg: Cfg) -> dict:
    raiz = cfg.insumo / BASE
    feats: list[dict] = []
    km_por_region: dict[str, float] = {}
    leidos = 0
    ilegibles: list[str] = []
    fuera = 0

    for reg_dir in sorted(raiz.iterdir()):
        ver = reg_dir / "Verificado"
        if not ver.is_dir():
            continue
        region = _region_de(reg_dir.name)

        archivos = sorted(f for f in ver.rglob("*") if f.suffix.lower() in (".kmz", ".kml", ".shp"))
        elegidos = [
            f for f in archivos
            if not (f.suffix.lower() == ".kml" and f.with_suffix(".kmz") in archivos)
        ]

        for f in elegidos:
            rel = f.relative_to(raiz).as_posix()
            inst = _inst_de(rel)
            # (linea WGS84 original, linea final simplificada+redondeada, nombre).
            # simplify_m() exige METROS, o sea el CRS nativo del shapefile: con
            # los 10 m de tolerancia aplicados sobre grados no quedaria linea.
            # Los KML ya vienen en WGS84 y dibujados a mano (pocos vertices):
            # se emiten sin simplificar.
            lineas: list[tuple[dict, dict, str | None]] = []
            try:
                if f.suffix.lower() == ".shp":
                    sf = read_shapefile(f)
                    for g, props in sf:
                        nombre = props.get("Name") or props.get("NOMBRE")
                        for ln in _lineas(g):
                            lineas.append((
                                to_wgs84(ln, sf.epsg),
                                to_wgs84(simplify_m(ln, cfg.oecv_simplify), sf.epsg),
                                nombre,
                            ))
                else:
                    for pm in read_kml_o_kmz(f):
                        for ln in _lineas(pm.get("geometry")):
                            lineas.append((ln, ln, pm.get("name")))
            except Exception as e:
                ilegibles.append(rel)
                log(cfg, "verificad", f"AVISO: ilegible {rel} ({type(e).__name__})")
                continue
            leidos += 1

            for original, final, nombre in lineas:
                if any(not en_chile(c[0], c[1]) for c in original["coordinates"]):
                    fuera += 1
                    continue
                # Longitud sobre la geometria ORIGINAL: simplificar acorta.
                km = length_geod_km(original)
                if region:
                    km_por_region[region] = km_por_region.get(region, 0.0) + km
                feats.append(
                    feature(
                        round_coords(final, cfg.precision),
                        {
                            "nombre": nombre,
                            "inst": inst,
                            "region": region,
                            "origen": rel,
                            "longitud_km": round(km, 3),
                        },
                    )
                )

    st = write_geojson(cfg.out / "oecv_verificado.geojson", feats)
    km_total = sum(km_por_region.values())
    log(
        cfg,
        "verificad",
        f"{len(feats)} lineas de {leidos} archivos · {km_total:.1f} km · "
        f"{len(ilegibles)} ilegibles · {fuera} fuera de Chile · {humano(st['bytes'])}",
    )

    return {
        "capa": "verificado",
        "titulo": "OECV verificado en terreno",
        "formato": "geojson",
        "geometria": "LineString",
        "carga": "inmediata",
        "leidos": leidos,
        "ilegibles": ilegibles,
        "longitud_km": round(km_total, 1),
        "km_por_region": {k: round(v, 1) for k, v in sorted(km_por_region.items())},
        "filtros": ["region"],
        "dominios": dominios(feats, ["region", "inst"]),
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
