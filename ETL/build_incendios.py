"""Capa de incendios investigados por las UAD -> incendios.geojson

Fuente: 'BBDD INVESTIGACION UAD CONSOLIDADA COMPLETA.xlsx', hoja 'Hoja 1'
(14.985 filas x 23 columnas).

El problema central de esta fuente: las columnas X/Y son UTM WGS84 en metros
pero NO declaran el huso, y el huso cambia por fila.

La regla obvia (X<500000 -> 19S, X>=500000 -> 18S) NO sirve: falla justo al este
del meridiano central del huso 19 (-69), que es donde esta el norte del pais.
Calama (lon -68,9) da un easting de ~510.000, la regla elegia el huso 18 y el
punto terminaba 470 km mar adentro en el Pacifico. Eran 16 incendios de
Antofagasta y Tarapaca.

Lo que se hace: probar AMBOS husos y quedarse con el que cae dentro de la franja
de longitudes de la region declarada en la propia fila (geo.LON_REGION). Solo
cuando la region falta o ambos husos encajan se recurre a la regla del easting.
"""

from __future__ import annotations

import re
import unicodedata

import pandas as pd

from cfg import Cfg, log
from geo import canon_region, en_chile, huso_por_region, to_wgs84
from gj_io import codificar, feature, humano, write_geojson

XLSX = "BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx"

# Campos con pocos valores distintos que se emiten como indice entero contra una
# tabla del manifest. El frontend resuelve la etiqueta con tablas[campo][codigo].
CATEGORICOS = [
    "region",
    "provincia",
    "comuna",
    "temporada",
    "causa_grupo",
    "causa_general",
    "causa_especifica",
]

# Centinelas de "no hay dato" que aparecen en columnas numericas.
NULOS = {
    "sin información", "sin informacion", "sin info", "sin dato", "sin datos",
    "no aplica", "s/i", "-", "--", "", "nan", "none", "null",
}


def norm_txt(v) -> str | None:
    """Colapsa espacios (incluido NBSP) y recorta. None si queda vacio."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).replace("\xa0", " ")
    s = " ".join(s.split())
    return s or None


def es_nulo(v) -> bool:
    s = norm_txt(v)
    return s is None or s.lower() in NULOS


def parse_coord(v) -> float | None:
    """Limpia y convierte una coordenada UTM.

    Casos reales en el archivo: NBSP inicial ('\\xa0\\xa05734964'), separador
    decimal coma ('280826,7'), y los centinelas de NULOS.
    """
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = norm_txt(v)
    if s is None or s.lower() in NULOS:
        return None
    s = s.replace(" ", "").replace(".", "") if s.count(",") == 1 and s.count(".") > 1 else s
    s = s.replace(",", ".")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def _col(df: pd.DataFrame, *candidatos: str) -> str | None:
    """Busca una columna por nombre normalizado (las hay con '\\n' embebido)."""
    def k(s):
        s = unicodedata.normalize("NFKD", str(s))
        s = "".join(c for c in s if not unicodedata.combining(c))
        return re.sub(r"[^a-z0-9]", "", s.lower())

    mapa = {k(c): c for c in df.columns}
    for cand in candidatos:
        if k(cand) in mapa:
            return mapa[k(cand)]
    return None


def build(cfg: Cfg) -> dict:
    ruta = cfg.insumo / XLSX
    df = pd.read_excel(ruta, sheet_name="Hoja 1")
    n_filas = len(df)

    # Catalogo comuna -> (provincia, region). La columna Region solo trae valor
    # en la primera fila de cada bloque (celdas combinadas) -> ffill.
    lookup: dict[str, tuple[str, str]] = {}
    try:
        prov = pd.read_excel(ruta, sheet_name="Provincias")
        prov.columns = [norm_txt(c) for c in prov.columns]
        cc, cp, cr = prov.columns[0], prov.columns[1], prov.columns[2]
        prov[cr] = prov[cr].ffill()
        for _, r in prov.iterrows():
            com = norm_txt(r[cc])
            if com:
                lookup[com.lower()] = (norm_txt(r[cp]), canon_region(r[cr]))
    except Exception as e:  # el catalogo es una ayuda, no un requisito
        log(cfg, "incendios", f"aviso: no se pudo leer la hoja Provincias ({e})")

    c = {
        "id": _col(df, "ID"),
        "region": _col(df, "Región"),
        "provincia": _col(df, "Provincia"),
        "comuna": _col(df, "Comuna"),
        "temporada": _col(df, "Temporada"),
        "n_incendio": _col(df, "N° Incendio"),
        "nombre": _col(df, "Nombre"),
        "causa_especifica": _col(df, "Nombre causa específica 2023"),
        "causa_general": _col(df, "Causa general 2023"),
        "causa_grupo": _col(df, "Grupo causas 2023"),
        "x": _col(df, "X"),
        "y": _col(df, "Y"),
        "superficie_ha": _col(df, "Superficie"),
    }
    faltan = [k for k, v in c.items() if v is None]
    if faltan:
        raise ValueError(f"columnas no encontradas en Hoja 1: {faltan}")

    feats: list[dict] = []
    husos = {32718: 0, 32719: 0}
    sin_coord = 0
    inseguros = 0
    fuera = []

    for _, row in df.iterrows():
        x = parse_coord(row[c["x"]])
        y = parse_coord(row[c["y"]])
        if x is None or y is None:
            sin_coord += 1
            continue

        comuna = norm_txt(row[c["comuna"]])
        region = canon_region(row[c["region"]])
        provincia = norm_txt(row[c["provincia"]])
        if comuna and (not region or not provincia):
            hit = lookup.get(comuna.lower())
            if hit:
                provincia = provincia or hit[0]
                region = region or hit[1]

        # El huso se decide probando ambos contra la franja de longitudes de la
        # region declarada; la regla del easting solo es el respaldo.
        epsg, seguro = huso_por_region(x, y, region)
        if not seguro:
            inseguros += 1
        lon, lat = to_wgs84({"type": "Point", "coordinates": [x, y]}, epsg)["coordinates"]
        if not en_chile(lon, lat):
            fuera.append((row[c["id"]], comuna, x, y, round(lon, 4), round(lat, 4)))
            continue
        husos[epsg] += 1

        sup = row[c["superficie_ha"]]
        sup = None if es_nulo(sup) else parse_coord(sup)

        props = {
            "id": int(row[c["id"]]) if pd.notna(row[c["id"]]) else None,
            "region": region,
            "provincia": provincia,
            "comuna": comuna,
            "temporada": norm_txt(row[c["temporada"]]),
            # Dos variantes del mismo valor difieren por un espacio antes de la
            # coma ('Parcelaciones, edificaciones residenciales , industriales').
            "causa_grupo": norm_txt(row[c["causa_grupo"]]),
            "causa_general": (norm_txt(row[c["causa_general"]]) or "").replace(" ,", ",") or None,
            "causa_especifica": (norm_txt(row[c["causa_especifica"]]) or "").replace(" ,", ",") or None,
            "superficie_ha": round(sup, 2) if sup is not None else None,
            "n_incendio": norm_txt(row[c["n_incendio"]]),
            "nombre": norm_txt(row[c["nombre"]]),
        }

        feats.append(
            feature(
                {"type": "Point", "coordinates": [round(lon, cfg.precision), round(lat, cfg.precision)]},
                props,
            )
        )

    if fuera:
        log(cfg, "incendios", f"{len(fuera)} filas fuera del bbox de Chile, descartadas:")
        for f in fuera[:10]:
            log(cfg, "incendios", f"    id={f[0]} comuna={f[1]!r} X={f[2]} Y={f[3]} -> {f[4]},{f[5]}")

    # Los categoricos son el 59% del archivo pese a tener <=351 valores unicos.
    tablas, doms = codificar(feats, CATEGORICOS)

    st = write_geojson(cfg.out / "incendios.geojson", feats)
    pct = 100.0 * len(feats) / n_filas if n_filas else 0.0
    log(
        cfg,
        "incendios",
        f"{n_filas} filas -> {len(feats)} features ({pct:.1f} %) · "
        f"{sin_coord} sin coord + {len(fuera)} fuera de Chile · "
        f"{inseguros} con huso por regla de respaldo · "
        f"18S {husos[32718]} / 19S {husos[32719]} · {humano(st['bytes'])}",
    )

    return {
        "capa": "incendios",
        "titulo": "Incendios investigados (UAD)",
        "formato": "geojson",
        "geometria": "Point",
        "carga": "inmediata",
        "leidos": n_filas,
        "descartados": sin_coord + len(fuera),
        "husos": {"32718": husos[32718], "32719": husos[32719]},
        "filtros": ["temporada", "region", "provincia", "causa_grupo", "causa_general"],
        "codificados": CATEGORICOS,
        "tablas": tablas,
        "dominios": doms,
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
