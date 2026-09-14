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

Ademas de la capa, emite dos DERIVADOS que van a `manifest.derivados` y no a
`manifest.capas` (el panel suma los dominios de todas las capas y el mapa une sus
bbox: una copia de incendios ahi duplicaria los filtros):

  bbdd_uad_completa.geojson  las 23 columnas con las cabeceras reales del Excel,
                             sin codificar y con todas las claves presentes
  lineas_electricas.geojson  el subconjunto 'Causa general 2023' == CAUSA_ELECTRICA

Salen de las MISMAS features ya parseadas, no de un segundo lector: asi no hay dos
normalizaciones del mismo Excel que puedan divergir.
"""

from __future__ import annotations

import re
import unicodedata

import pandas as pd

from cfg import Cfg, log
from geo import canon_region, en_chile, huso_por_region, to_wgs84
from gj_io import codificar, feature, humano, write_geojson

XLSX = "BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx"
FUENTE = f"{XLSX} · Hoja 1"

# Literal de 'Causa general 2023' que define el derivado de lineas electricas, en
# NFC. Medido el 2026-09-14: 1.270 filas, 1.248 con coordenadas. Si el Excel lo
# reescribe (otra tilde, otra forma Unicode) el filtro daria 0 features: por eso
# build() revienta en vez de publicar un archivo vacio.
CAUSA_ELECTRICA = "Líneas eléctricas"

# Propiedades que los derivados anaden a las 23 columnas, en este orden.
EXTRA_DERIVADOS = ["lat", "lon", "utm_epsg"]

# Campo del dict `c` de build() -> clave en las props de incendios.geojson, solo
# donde difieren. X/Y se publican como utm_x/utm_y porque la geometria ya es WGS84.
PROP_DE_CAMPO = {"x": "utm_x", "y": "utm_y"}

# Codigo de la causa investigada: 'seccion.apartado' con un tercer nivel opcional.
# El prefijo de dos niveles ES el codigo general (4.10.2 -> 4.10). Medido el
# 2026-09-14: 14.982 filas con tres niveles y 3 con dos ('4.6').
RE_CAUSA = re.compile(r"^(\d+\.\d+)(?:\.\d+)?$")

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
    """Codigo jerarquico que Excel entrego como float. Solo es el RESPALDO.

    '%g' y no round(): 4.1 y 4.11 son floats distintos y redondear a un decimal
    los fundiria. Pero ningun formato separa 4.1 de 4.10: como float son el MISMO
    numero, y la distincion se perdio al guardar la celda como numero. Hasta el
    2026-09-14 esto fundio 'Otras causas' (4.10, 1.011 filas del Excel) con el 4.1
    de 'Faenas forestales' (919), y 1.10 (51) con 1.1 (103). El codigo bueno se
    recupera de la causa investigada: ver _codigo_general.
    """
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        return f"{v:g}"
    return norm_txt(v)


def _codigo_general(causa_codigo: str | None, float_excel) -> tuple[str | None, str | None]:
    """'Codigo causa general 2023' sin el defecto del float. Devuelve (codigo, motivo).

    El codigo general es el prefijo de dos niveles de la causa investigada
    ('4.10.2' -> '4.10'). Se toma SOLO si como float coincide con la celda del
    Excel: asi el prefijo decide la grafia ('4.10' y no '4.1') pero no puede
    inventar un codigo que la fuente no declara. Si no coinciden, gana el Excel
    formateado con fmt_codigo y el motivo 'conflicto' lo cuenta el log. Medido el
    2026-09-14: 0 conflictos sobre 14.985 filas.

    motivo: None | 'dos_niveles' (la causa investigada no tiene tercer nivel,
    medido: 3 filas '4.6') | 'conflicto'.
    """
    try:
        fl = None if float_excel is None or pd.isna(float_excel) else float(float_excel)
    except (TypeError, ValueError):
        fl = None
    m = RE_CAUSA.match(causa_codigo or "")
    if m and fl is not None and float(m.group(1)) == fl:
        return m.group(1), ("dos_niveles" if m.group(0) == m.group(1) else None)
    if causa_codigo is None and fl is None:
        return None, None
    return fmt_codigo(float_excel), "conflicto"


def _region_provincia(fila: dict, lookup: dict) -> tuple[str | None, str | None]:
    """Region canonica y provincia de una fila, completadas con el catalogo.

    Va aparte porque la necesitan TAMBIEN las filas sin coordenadas: el derivado
    declara cuantas faltan por region, y antes el `continue` de la fila sin X/Y
    saltaba esta resolucion.
    """
    comuna = norm_txt(fila["comuna"])
    region = canon_region(fila["region"])
    provincia = norm_txt(fila["provincia"])
    if comuna and (not region or not provincia):
        hit = lookup.get(comuna.lower())
        if hit:
            provincia = provincia or hit[0]
            region = region or hit[1]
    return region, provincia


def _txt_coma(v) -> str | None:
    """norm_txt + el espacio antes de coma. Dos variantes del mismo valor difieren
    solo en eso ('Parcelaciones, edificaciones residenciales , industriales')."""
    return (norm_txt(v) or "").replace(" ,", ",") or None


def _columnas_excel(df: pd.DataFrame, c: dict) -> list[tuple[str, str]]:
    """[(cabecera normalizada, campo de c)] en el ORDEN del Excel.

    Revienta si la hoja trae una columna que `c` no lee: el derivado promete TODAS
    las columnas, y una columna nueva que no llega es indistinguible, desde el
    visor, de una columna que la fuente no tiene.
    """
    campo_de = {}
    for k, col in c.items():
        if col in campo_de:
            raise ValueError(f"la columna {col!r} la leen dos campos: {campo_de[col]} y {k}")
        campo_de[col] = k
    sin_leer = [col for col in df.columns if col not in campo_de]
    if sin_leer:
        raise ValueError(
            f"Hoja 1 trae columnas que el ETL no lee: {sin_leer}. Anadelas al dict `c` "
            "de build() para que lleguen a los derivados."
        )
    salida = [(" ".join(str(col).split()), campo_de[col]) for col in df.columns]
    cabeceras = [cab for cab, _ in salida]
    if len(set(cabeceras)) != len(cabeceras):
        raise ValueError(f"cabeceras repetidas tras normalizar espacios: {cabeceras}")
    return salida


def _meta_derivado(titulo: str, st: dict, columnas: list[str], leidos: int, sin: list[tuple], **extra) -> dict:
    """Entrada de manifest.derivados (contrato 1). `sin` = [(id, region, causa)]."""
    if st["features"] + len(sin) != leidos:
        raise ValueError(
            f"{st['archivo']}: {st['features']} features + {len(sin)} sin coordenadas "
            f"!= {leidos} filas leidas; alguna fila se perdio sin contarse"
        )
    por_region: dict[str, int] = {}
    for _, region, _ in sin:
        k = region or "Sin región"
        por_region[k] = por_region.get(k, 0) + 1
    return {
        "titulo": titulo,
        "archivo": st["archivo"],
        "formato": "geojson",
        "geometria": "Point",
        "fuente": FUENTE,
        **extra,
        "columnas": columnas,
        "extra": list(EXTRA_DERIVADOS),
        "leidos": leidos,
        "features": st["features"],
        "bytes": st["bytes"],
        "vertices": st["vertices"],
        "bbox": st["bbox"],
        "sin_coordenadas": {"n": len(sin), "ids": [i for i, _, _ in sin], "por_region": por_region},
    }


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

    # Antes de leer una sola fila: la hoja no puede traer columnas que no lleguen
    # a los derivados.
    columnas_excel = _columnas_excel(df, c)

    feats: list[dict] = []
    husos = {32718: 0, 32719: 0}
    sin_coord = 0
    inseguros = 0
    fuera = []
    # Filas que no llegan a feature --sin X/Y o fuera de Chile--, en orden de fila:
    # (id, region, causa_general). Son el `sin_coordenadas` de los derivados.
    sin_fila: list[tuple] = []
    conflictos: list[tuple] = []
    dos_niveles = 0

    for _, row in df.iterrows():
        fila = {k: row[col] for k, col in c.items()}
        ident = int(fila["id"]) if pd.notna(fila["id"]) else None
        region, provincia = _region_provincia(fila, lookup)
        causa_general = _txt_coma(fila["causa_general"])

        x = parse_coord(fila["x"])
        y = parse_coord(fila["y"])
        if x is None or y is None:
            sin_coord += 1
            sin_fila.append((ident, region, causa_general))
            continue

        comuna = norm_txt(fila["comuna"])

        # El huso se decide probando ambos contra la franja de longitudes de la
        # region declarada; la regla del easting solo es el respaldo.
        epsg, seguro = huso_por_region(x, y, region)
        if not seguro:
            inseguros += 1
        lon, lat = to_wgs84({"type": "Point", "coordinates": [x, y]}, epsg)["coordinates"]
        if not en_chile(lon, lat):
            fuera.append((fila["id"], comuna, x, y, round(lon, 4), round(lat, 4)))
            sin_fila.append((ident, region, causa_general))
            continue
        husos[epsg] += 1

        sup = fila["superficie_ha"]
        sup = None if es_nulo(sup) else parse_coord(sup)

        causa_codigo = norm_txt(fila["causa_codigo"])
        codigo_general, motivo = _codigo_general(causa_codigo, fila["causa_general_codigo"])
        if motivo == "conflicto":
            conflictos.append((ident, causa_codigo, fila["causa_general_codigo"], codigo_general))
        elif motivo == "dos_niveles":
            dos_niveles += 1

        props = {
            "id": ident,
            "region": region,
            "provincia": provincia,
            "comuna": comuna,
            "temporada": norm_txt(fila["temporada"]),
            "causa_grupo": norm_txt(fila["causa_grupo"]),
            "causa_general": causa_general,
            "causa_especifica": _txt_coma(fila["causa_especifica"]),
            "superficie_ha": round(sup, 2) if sup is not None else None,
            "n_incendio": norm_txt(fila["n_incendio"]),
            "nombre": norm_txt(fila["nombre"]),
            # --- las diez que faltaban -------------------------------------
            "causa_codigo": causa_codigo,
            "causa_general_codigo": codigo_general,
            "jefe_brigada": norm_txt(fila["jefe_brigada"]),
            "mes_investigacion": norm_mes(fila["mes_investigacion"]),
            "investigado_por": norm_txt(fila["investigado_por"]),
            "inicio_r20": norm_fecha(fila["inicio_r20"]),
            "hora_r20": norm_hora(fila["hora_r20"]),
            "inv_inicio": norm_fecha(fila["inv_inicio"]),
            "inv_fin": norm_fecha(fila["inv_fin"]),
            # 'Sin informe' se CONSERVA: dice que la investigacion no produjo
            # informe, que es un dato. Lo que se descarta son los centinelas de
            # ausencia ('Sin info', 'Sin informacion'), que solo dicen que nadie
            # lleno la celda.
            "informe": None if es_nulo(fila["informe"]) else norm_txt(fila["informe"]),
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

    log(
        cfg,
        "incendios",
        f"codigo causa general: {len(conflictos)} conflictos prefijo/Excel · "
        f"{dos_niveles} filas con causa investigada de dos niveles",
    )
    for ident, cc, fl, cg in conflictos[:10]:
        log(cfg, "incendios", f"    conflicto id={ident} causa investigada={cc!r} Excel={fl!r} -> {cg!r}")

    # Los derivados se arman AQUI, antes de codificar(): codificar muta las props
    # en su sitio y los derivados van con las etiquetas, no con indices.
    derivados = _derivados(cfg, df, c, columnas_excel, feats, sin_fila, n_filas)

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
        # La '_' inicial lo deja fuera de manifest.capas; run.py lo mueve a
        # manifest.derivados.
        "_derivados": derivados,
    }


def _derivados(cfg: Cfg, df: pd.DataFrame, c: dict, columnas_excel: list[tuple[str, str]],
               feats: list[dict], sin_fila: list[tuple], n_filas: int) -> dict:
    """Escribe bbdd_uad_completa.geojson y lineas_electricas.geojson (contrato 1).

    `feats` todavia SIN codificar. El feature se arma a mano y no con
    gj_io.feature, que descarta las props nulas: aqui cada feature lleva las 23
    columnas siempre, con null donde falta el dato, para que quien abra el archivo
    en QGIS o pandas vea la columna vacia en vez de no ver la columna.
    """
    columnas = [cab for cab, _ in columnas_excel]
    completa = []
    for f in feats:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        props = {cab: p.get(PROP_DE_CAMPO.get(k, k)) for cab, k in columnas_excel}
        props["lat"] = lat
        props["lon"] = lon
        props["utm_epsg"] = p.get("utm_epsg")
        completa.append(
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}
        )

    cab_causa = next(cab for cab, k in columnas_excel if k == "causa_general")
    lineas = [f for f in completa if f["properties"][cab_causa] == CAUSA_ELECTRICA]
    if not lineas:
        raise ValueError(
            f"ninguna feature con {cab_causa!r} == {CAUSA_ELECTRICA!r}: el literal cambio en el "
            "Excel y lineas_electricas.geojson saldria vacio"
        )
    # Leidas de esa causa contadas sobre el DataFrame, no sumando lo emitido: asi
    # _meta_derivado puede comprobar que ninguna fila se perdio por el camino.
    leidas_lineas = sum(1 for v in df[c["causa_general"]] if _txt_coma(v) == CAUSA_ELECTRICA)
    sin_lineas = [s for s in sin_fila if s[2] == CAUSA_ELECTRICA]

    st_completa = write_geojson(cfg.out / "bbdd_uad_completa.geojson", completa)
    st_lineas = write_geojson(cfg.out / "lineas_electricas.geojson", lineas)
    derivados = {
        "bbdd_uad_completa": _meta_derivado(
            "BBDD de investigación UAD, todas las columnas", st_completa, columnas, n_filas, sin_fila
        ),
        "lineas_electricas": _meta_derivado(
            "Incendios por líneas eléctricas", st_lineas, columnas, leidas_lineas, sin_lineas,
            filtro={"campo": cab_causa, "valor": CAUSA_ELECTRICA},
        ),
    }
    for nombre, st, sin in (("bbdd_uad_completa", st_completa, sin_fila), ("lineas_electricas", st_lineas, sin_lineas)):
        log(
            cfg,
            "incendios",
            f"derivado {nombre}: {st['features']} features · {len(sin)} sin coordenadas · {humano(st['bytes'])}",
        )
    return derivados


if __name__ == "__main__":
    build(Cfg(verbose=True))
