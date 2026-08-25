"""Capa de incendios investigados por las UAD -> incendios.geojson

Fuente: 'BBDD INVESTIGACION UAD CONSOLIDADA COMPLETA.xlsx', hoja 'Hoja 1'
(14.985 filas x 23 columnas). SE EMITEN LAS 23; ver el diccionario `c` en
build(). Durante un tiempo se emitieron solo trece y las otras diez no existian
para el visor, que no es lo mismo que no existir en la fuente.

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
    # Anadidos al emitir las 23 columnas de la hoja: todos tienen pocos valores
    # distintos (21, 92, 203, 84 y 13) sobre 14.985 filas, asi que codificarlos
    # cuesta un entero por fila en vez de la cadena entera. Los que NO entran
    # aqui son los de alta cardinalidad --informe (9.945 unicos), las tres
    # fechas y la hora--, donde la tabla pesaria mas que el ahorro.
    "causa_general_codigo",
    "causa_codigo",
    "jefe_brigada",
    "investigado_por",
    "mes_investigacion",
]

# Meses escritos a mano durante nueve temporadas: 30 formas distintas para 12
# meses. Se unifican por minusculas sin tildes; lo que no reconoce se deja tal
# cual (hay rangos legitimos como 'Abril-Mayo') en vez de tirarlo.
MESES = {
    "enero": "Enero", "febrero": "Febrero", "marzo": "Marzo", "abril": "Abril",
    "abrill": "Abril",  # erratura real en la fuente
    "mayo": "Mayo", "junio": "Junio", "julio": "Julio", "agosto": "Agosto",
    "septiembre": "Septiembre", "setiembre": "Septiembre", "octubre": "Octubre",
    "noviembre": "Noviembre", "diciembre": "Diciembre",
}

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


def fmt_codigo(v) -> str | None:
    """Codigo jerarquico que Excel entrego como float.

    '%g' y no round(): 4.1 y 4.11 son codigos DISTINTOS --seccion 4 apartado 1
    contra seccion 4 apartado 11-- y redondear a un decimal los fundiria.
    """
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        return f"{v:g}"
    return norm_txt(v)


def norm_fecha(v) -> str | None:
    """Devuelve ISO 'YYYY-MM-DD' o None.

    La columna llega MEZCLADA: openpyxl resuelve unas celdas como datetime y
    otras se quedan en texto 'dd/mm/yyyy', mas los centinelas de NULOS. Ademas
    hay dos celdas con seriales fuera del rango de fechas de Excel (V3650 y
    V4446, 6.692.303 y 6.692.449 = anno ~20.300) que openpyxl marca como error;
    caen por el except y salen como None, que es lo correcto: una fecha
    imposible no es un dato.
    """
    import datetime as _dt

    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, _dt.datetime):
        return v.date().isoformat()
    if isinstance(v, _dt.date):
        return v.isoformat()
    s = norm_txt(v)
    if s is None or s.lower() in NULOS or s.lower().startswith("sin "):
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return _dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def norm_hora(v) -> str | None:
    """Devuelve 'HH:MM' o None. Mezcla time / datetime / texto, igual que arriba."""
    import datetime as _dt

    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, _dt.datetime):
        return v.strftime("%H:%M")
    if isinstance(v, _dt.time):
        return v.strftime("%H:%M")
    s = norm_txt(v)
    if s is None or s.lower() in NULOS or s.lower().startswith("sin "):
        return None
    m = re.match(r"^(\d{1,2})[:.h](\d{2})", s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def norm_mes(v) -> str | None:
    """Unifica el mes de investigacion. Ver MESES."""
    s = norm_txt(v)
    if s is None or s.lower() in NULOS or s.lower().startswith("sin ") or s.lower() == "no aplica":
        return None
    k = unicodedata.normalize("NFKD", s.lower())
    k = "".join(ch for ch in k if not unicodedata.combining(ch))
    return MESES.get(k, s)


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

    # LAS 23 COLUMNAS DE 'Hoja 1', TODAS. Antes se leian trece y las otras diez
    # no llegaban al visor: el usuario no las echaba de menos porque no habia
    # forma de saber que existian. Si manana la fuente pierde una columna, esto
    # revienta con su nombre en vez de publicar un campo vacio en silencio --que
    # es exactamente como se perdieron las diez anteriores.
    #
    # 'Hoja 1' y no 'Hoja 8': la 8 tiene una columna mas ('mes finalizacion')
    # pero solo 3.205 filas contra 14.985, o sea un subconjunto. La consolidada
    # completa es esta.
    c = {
        "id": _col(df, "ID"),
        "region": _col(df, "Región"),
        "provincia": _col(df, "Provincia"),
        "comuna": _col(df, "Comuna"),
        "temporada": _col(df, "Temporada"),
        "n_incendio": _col(df, "N° Incendio"),
        "nombre": _col(df, "Nombre"),
        "causa_codigo": _col(df, "Causa investigada 2023"),
        "causa_especifica": _col(df, "Nombre causa específica 2023"),
        "causa_general": _col(df, "Causa general 2023"),
        "causa_general_codigo": _col(df, "Código causa general 2023"),
        "causa_grupo": _col(df, "Grupo causas 2023"),
        "x": _col(df, "X"),
        "y": _col(df, "Y"),
        "superficie_ha": _col(df, "Superficie"),
        # El encabezado dice 'jefe brigada' pero la columna NO trae personas:
        # trae codigos de causa en dos formatos ('01.01.02' y '4.1.2'), 203
        # distintos, y NO coincide con 'Causa investigada 2023' (coinciden en el
        # 0,2 % de las filas). Comprobado sobre el archivo, no deducido del
        # nombre. Se emite con el nombre de la columna de origen para que quien
        # lo lea pueda cotejarlo contra el Excel; ponerle 'Jefe de brigada' en
        # la ficha seria propagar el error del encabezado.
        "jefe_brigada": _col(df, "jefe brigada****", "jefe brigada"),
        "mes_investigacion": _col(df, "Mes investigación"),
        "investigado_por": _col(df, "Investigado por"),
        "inicio_r20": _col(df, "Inicio R20"),
        "hora_r20": _col(df, "Hora R20"),
        "inv_inicio": _col(df, "Fecha de inicio investigación"),
        "inv_fin": _col(df, "Fecha finalización investigación"),
        "informe": _col(df, "Informe"),
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
            # --- las diez que faltaban -------------------------------------
            "causa_codigo": norm_txt(row[c["causa_codigo"]]),
            "causa_general_codigo": fmt_codigo(row[c["causa_general_codigo"]]),
            "jefe_brigada": norm_txt(row[c["jefe_brigada"]]),
            "mes_investigacion": norm_mes(row[c["mes_investigacion"]]),
            "investigado_por": norm_txt(row[c["investigado_por"]]),
            "inicio_r20": norm_fecha(row[c["inicio_r20"]]),
            "hora_r20": norm_hora(row[c["hora_r20"]]),
            "inv_inicio": norm_fecha(row[c["inv_inicio"]]),
            "inv_fin": norm_fecha(row[c["inv_fin"]]),
            # 'Sin informe' se CONSERVA: dice que la investigacion no produjo
            # informe, que es un dato. Lo que se descarta son los centinelas de
            # ausencia ('Sin info', 'Sin informacion'), que solo dicen que nadie
            # lleno la celda.
            "informe": None if es_nulo(row[c["informe"]]) else norm_txt(row[c["informe"]]),
            # Las coordenadas de origen, tal como vienen en el Excel. La
            # geometria ya lleva el punto en WGS84, pero quien trabaja en
            # terreno usa UTM y son dos columnas de la fuente como cualquier
            # otra. `epsg` dice en que huso hay que leerlas: cambia por fila.
            # Entero cuando lo es --el 99,87 % de las filas-- para no escribir
            # 14.705 veces un '.0' que no significa nada. La precision
            # submetrica de las 19 filas que si traen decimal se conserva.
            "utm_x": int(x) if float(x).is_integer() else round(x, 1),
            "utm_y": int(y) if float(y).is_integer() else round(y, 1),
            "utm_epsg": epsg,
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
