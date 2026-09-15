"""Validacion empirica de los datos generados.

No comprueba que el codigo se ejecuto, comprueba que el RESULTADO sirve: que los
archivos parsean, que las cifras cuadran con el manifest, que nada quedo fuera de
Chile y que los incendios caen sobre la red vial y no en el mar.

Lo llama run.py al final. Tambien corre suelto:

    python ETL/verify.py --data frontend/public/data --muestra 500
    python ETL/verify.py --negativas

Las aserciones van numeradas D1..D18 para poder referirse a una sola. Ese numero
es lo que exige --negativas: cada mutacion reintroduce un defecto concreto y
comprueba que se ponga roja LA asercion que lo vigila, no cualquier otra. Una
asercion que no se ha visto roja no esta probando nada.

    D1        el archivo declarado existe (capas y derivados)
    D2-D4     PMTiles: magic, zooms del manifest, bbox dentro de Chile
    D5-D9     GeoJSON (capas y derivados): FeatureCollection, n de features,
              sin NaN, sin geometrias vacias, dentro de Chile
    D10       campos de filtro presentes (solo capas)
    D11       regiones canonizadas en los dominios y en sin_coordenadas.por_region
    D12, D13  cruce espacial incendios <-> red vial (necesitan ETL/_build/)
    D14       riesgo: cada mancha dentro de la caja de SU comuna, con el CUT y el
              nombre que declara el manifest para ese archivo
    D15       infra_puntos: cada punto dentro de la caja de riesgo de su CUT
    D16       incendios: causa_general_codigo es el prefijo de causa_codigo
    D16b      incendios: cada codigo general lleva una sola etiqueta. Es la unica
              guarda de una fila 4.10.x con la etiqueta de 4.1: el prefijo cuadra
              y D16 queda verde. Va con identificador propio para que su mutacion
              no pueda ponerse roja gracias a D16
    D17       derivado bbdd_uad_completa == incendios decodificado, fila a fila
    D18       derivado lineas_electricas == filtro de la BBDD completa
    D19       riesgo: rangos del modelo (0 <= min <= medio <= max <= 4, pct_alto
              0..100) y clase coherente con los cortes del manifest
    D20       riesgo: las cuentas cuadran -- partes = total, leidas = publicadas +
              sin geometria, CSV = leidas + solo en CSV, las 16 regiones, y ningun
              mancha_id repetido entre comunas

Las capas partidas (`partes` en el manifest, hoy solo riesgo) pasan por D1 y
D5-D9 archivo por archivo, con UNA linea por asercion para las 343 comunas.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

# Sin esto la consola de Windows (cp1252) revienta con UnicodeEncodeError en el
# primer '✔' y el verificador no llega ni a la primera linea. Medido el
# 2026-09-10: `python ETL/verify.py` moria en el print de la cabecera.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BUILD = Path(__file__).resolve().parent / "_build"

CHILE = (-76.0, -56.0, -66.0, -17.0)  # minlon, minlat, maxlon, maxlat

# Capas de red vial. Son la unica referencia valida del cruce espacial: los
# incendios ocurren junto a caminos. OECV queda fuera a proposito.
CAPAS_VIALES = ("rutas", "redvial")

# Cabecera del Excel -> campo de incendios.geojson. DUPLICADO A PROPOSITO del dict
# `c` y PROP_DE_CAMPO de ETL/build_incendios.py: si D17 importara el mapa del ETL
# comprobaria que el mapa es igual a si mismo, y un campo cruzado ('Provincia' ->
# comuna) saldria en verde. El orden es el de la hoja 'Hoja 1' (medido el
# 2026-09-14).
CABECERA_A_CAMPO = {
    "ID": "id",
    "Región": "region",
    "Provincia": "provincia",
    "Comuna": "comuna",
    "Temporada": "temporada",
    "N° Incendio": "n_incendio",
    "Nombre": "nombre",
    "Causa investigada 2023": "causa_codigo",
    "Nombre causa específica 2023": "causa_especifica",
    "Causa general 2023": "causa_general",
    "Código causa general 2023": "causa_general_codigo",
    "Grupo causas 2023": "causa_grupo",
    "X": "utm_x",
    "Y": "utm_y",
    "Superficie": "superficie_ha",
    "jefe brigada****": "jefe_brigada",
    "Mes investigación": "mes_investigacion",
    "Investigado por": "investigado_por",
    "Inicio R20": "inicio_r20",
    "Hora R20": "hora_r20",
    "Fecha de inicio investigación": "inv_inicio",
    "Fecha finalización investigación": "inv_fin",
    "Informe": "informe",
}
EXTRA_DERIVADOS = ["lat", "lon", "utm_epsg"]
# Tambien duplicado del ETL, por lo mismo: D18 no puede leer del manifest el filtro
# que esta verificando.
CAUSA_ELECTRICA = "Líneas eléctricas"

OK = "✔"
NO = "✘"


class Res:
    def __init__(self):
        self.fallos = 0
        # No basta con contar: --negativas tiene que exigir que se ponga roja LA
        # asercion mutada. Sin guardar cual fue, un control negativo pasa por el
        # motivo equivocado -- por ejemplo, porque el archivo ni siquiera abrio.
        self.rojos: list[str] = []

    def check(self, cond: bool, ident: str, titulo: str, detalle: str = "") -> bool:
        if not cond:
            self.fallos += 1
            self.rojos.append(ident)
        print(
            f"  {OK if cond else NO} {ident:<4} {titulo}" + (f" — {detalle}" if detalle else ""),
            flush=True,
        )
        return cond


def _coords(geom):
    """Aplana las coordenadas de cualquier geometria."""
    salida = []

    def _walk(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            salida.append(c)
        else:
            for x in c:
                _walk(x)

    _walk(geom["coordinates"])
    return salida


# Resumen por archivo de riesgo, por sha1 de sus BYTES (y de los cortes con los
# que se juzgo la clase). --negativas llama a verificar() unas 30 veces y cada
# llamada tendria que volver a parsear 163 MiB repartidos en 343 archivos; con la
# clave por contenido solo se reparsea el archivo que muto una mutacion. Por
# contenido y no por mtime a proposito: un cache que enmascarase una mutacion
# convertiria cada control negativo en un falso superviviente -- y lo contrario,
# un falso verde, que es peor.
_RESUMENES: dict[tuple, dict] = {}


def _resumen_parte(ruta: Path, clases: list[dict]) -> dict:
    """Hechos de un archivo de riesgo que no dependen de su entrada del manifest."""
    datos = ruta.read_bytes()
    clave = (hashlib.sha1(datos).hexdigest(), json.dumps(clases, sort_keys=True))
    if clave in _RESUMENES:
        return _RESUMENES[clave]
    res = {"parsea": False}
    try:
        gj = json.loads(datos.decode("utf-8"))
    except ValueError:
        _RESUMENES[clave] = res
        return res
    feats = [f for f in (gj.get("features") or []) if isinstance(f, dict)] if isinstance(gj, dict) else []
    res.update(parsea=True, tipo=gj.get("type") if isinstance(gj, dict) else None, n=len(feats))
    malas = fuera = vacias = 0
    ext = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    cuts, nombres, ids, problemas = set(), set(), [], []
    cortes = [c["desde"] for c in clases[1:]]
    etiquetas = [c["clase"] for c in clases]
    for f in feats:
        p = f.get("properties") or {}
        mid = str(p.get("mancha_id"))
        ids.append(mid)
        cuts.add(mid[:5])
        nombres.add(p.get("comuna"))
        g = f.get("geometry")
        cs = _coords(g) if g and g.get("coordinates") else []
        if not cs:
            vacias += 1
        for c in cs:
            lon, lat = c[0], c[1]
            if lon != lon or lat != lat or abs(lon) == float("inf") or abs(lat) == float("inf"):
                malas += 1
                break
            if not (CHILE[0] <= lon <= CHILE[2] and CHILE[1] <= lat <= CHILE[3]):
                fuera += 1
                break
            ext[0], ext[1] = min(ext[0], lon), min(ext[1], lat)
            ext[2], ext[3] = max(ext[2], lon), max(ext[3], lat)
        problemas.extend(f"{mid}: {x}" for x in _problemas_riesgo(p, cortes, etiquetas))
    res.update(malas=malas, fuera=fuera, vacias=vacias, extension=ext, cuts=cuts,
               nombres=nombres, ids=ids, problemas=problemas)
    _RESUMENES[clave] = res
    return res


def _problemas_riesgo(p: dict, cortes: list[float], etiquetas: list[str]) -> list[str]:
    """D19. DUPLICADO A PROPOSITO de ETL/build_riesgo.py: importarlo verificaria
    que la regla es igual a si misma. Los limites salen de la DEFINICION del modelo
    (nivel 0..4, porcentaje 0..100), no de los valores que traen los datos."""
    num = ("nivel_medio", "nivel_medio_min", "nivel_medio_max", "pct_alto", "area_ha")
    if any(not isinstance(p.get(c), (int, float)) or isinstance(p.get(c), bool) for c in num):
        return [f"campos numericos ausentes o no numericos: {[c for c in num if not isinstance(p.get(c), (int, float))]}"]
    out = []
    if not 0 <= p["nivel_medio_min"] <= p["nivel_medio"] <= p["nivel_medio_max"] <= 4:
        out.append("no cumple 0 <= min <= medio <= max <= 4")
    if not 0 <= p["pct_alto"] <= 100:
        out.append(f"pct_alto {p['pct_alto']}")
    v = p["nivel_medio"]
    # Un valor EXACTAMENTE en un corte puede venir en cualquiera de las dos clases
    # vecinas: el notebook clasifica antes de redondear a 3 decimales (123 manchas).
    en = [i for i, c in enumerate(cortes) if abs(v - c) < 1e-9]
    if en:
        validas = {etiquetas[en[0]], etiquetas[en[0] + 1]}
    else:
        validas = {etiquetas[sum(1 for c in cortes if v >= c)]}
    if p.get("clase") not in validas:
        out.append(f"clase {p.get('clase')!r} con nivel_medio {v}")
    return out


def _verificar_partes(r: "Res", data: Path, nombre: str, meta: dict) -> dict[str, dict]:
    """D1, D5-D9 y D14 de una capa partida, con UNA linea por asercion.

    Devuelve los resumenes por clave de parte para D19/D20.
    """
    partes = meta.get("partes") or {}
    clases = meta.get("clases") or []
    faltan, no_coleccion, cuentas, d7, d8, d9, d14 = [], [], [], [], [], [], []
    resumenes: dict[str, dict] = {}
    for cut, pm in partes.items():
        ruta = data / str(pm.get("archivo"))
        if not ruta.exists():
            faltan.append(pm.get("archivo"))
            continue
        res = _resumen_parte(ruta, clases)
        resumenes[cut] = res
        if not res["parsea"] or res["tipo"] != "FeatureCollection":
            no_coleccion.append(cut)
            continue
        if res["n"] != pm.get("features"):
            cuentas.append(f"{cut}: {res['n']} vs {pm.get('features')}")
        if res["malas"]:
            d7.append(f"{cut}: {res['malas']}")
        if res["vacias"]:
            d8.append(f"{cut}: {res['vacias']}")
        if res["fuera"]:
            d9.append(f"{cut}: {res['fuera']}")
        # Todas las manchas dentro de la caja <=> su extension conjunta dentro de
        # ella. SIN margen: la caja se calcula DE estas manchas, redondeada hacia
        # afuera, y encerrarlas es su unica razon de existir.
        caja, ext = pm.get("bbox") or [0, 0, 0, 0], res["extension"]
        if res["n"] and not (caja[0] <= ext[0] and caja[1] <= ext[1] and ext[2] <= caja[2] and ext[3] <= caja[3]):
            d14.append(f"{cut}: extension {[round(x, 5) for x in ext]} fuera de {caja}")
        # El archivo de una comuna solo trae manchas de ESA comuna, con el nombre
        # que el manifest le da. Es donde se veria un «Coyhaique» colado.
        if res["n"] and res["cuts"] != {cut}:
            d14.append(f"{cut}: trae manchas de {sorted(res['cuts'])}")
        if res["n"] and res["nombres"] != {pm.get("comuna")}:
            d14.append(f"{cut}: comuna {sorted(map(str, res['nombres']))} y el manifest dice {pm.get('comuna')!r}")
    n = len(partes)
    r.check(not faltan, "D1", f"{nombre}: existen los {n} archivos por comuna", f"faltan {faltan[:3]}" if faltan else "")
    r.check(not no_coleccion, "D5", f"{nombre}: {n} FeatureCollection", f"{no_coleccion[:3]}" if no_coleccion else "")
    r.check(not cuentas, "D6", f"{nombre}: features de cada comuna = manifest", f"{cuentas[:3]}" if cuentas else "")
    r.check(not d7, "D7", f"{nombre}: sin NaN/Infinity", f"{d7[:3]}" if d7 else "")
    r.check(not d8, "D8", f"{nombre}: sin geometrías vacías", f"{d8[:3]}" if d8 else "")
    r.check(not d9, "D9", f"{nombre}: todas dentro de Chile", f"{d9[:3]}" if d9 else "")
    r.check(
        n > 0 and not d14,
        "D14",
        f"{nombre}: cada mancha dentro de la caja de su comuna, con su CUT y su nombre",
        f"{len(d14)}: {d14[:3]}" if d14 else ("sin partes" if not n else ""),
    )
    return resumenes


def _cuentas_riesgo(r: "Res", meta: dict, resumenes: dict[str, dict]) -> None:
    """D19 y D20."""
    from geo import REGIONES

    problemas = [x for res in resumenes.values() for x in res.get("problemas", [])]
    r.check(
        bool(resumenes) and not problemas,
        "D19",
        f"riesgo: rangos y clase coherentes en {sum(x.get('n', 0) for x in resumenes.values())} manchas",
        f"{len(problemas)}: {problemas[:3]}" if problemas else "",
    )

    partes = meta.get("partes") or {}
    f = meta.get("fuente") or {}
    sin = (f.get("sin_geometria") or {}).get("n")
    malas = []
    suma = sum(p.get("features") or 0 for p in partes.values())
    if suma != meta.get("features"):
        malas.append(f"partes suman {suma} y el total dice {meta.get('features')}")
    if not isinstance(sin, int) or f.get("leidas") != (meta.get("features") or 0) + sin:
        malas.append(f"leidas {f.get('leidas')} != publicadas {meta.get('features')} + sin geometria {sin}")
    if f.get("filas_csv") != (f.get("leidas") or 0) + len(f.get("solo_en_csv") or []):
        malas.append(f"filas_csv {f.get('filas_csv')} != leidas + {len(f.get('solo_en_csv') or [])} solo en el CSV")
    por_region = (f.get("sin_geometria") or {}).get("por_region") or {}
    if isinstance(sin, int) and sum(por_region.values()) != sin:
        malas.append(f"sin_geometria.por_region suma {sum(por_region.values())} y n={sin}")
    regiones = {p.get("region") for p in partes.values()}
    if regiones != set(REGIONES):
        malas.append(f"regiones: faltan {sorted(set(REGIONES) - regiones)} sobran {sorted(map(str, regiones - set(REGIONES)))}")
    listadas = [c for reg in meta.get("regiones") or [] for c in reg.get("comunas") or []]
    if sorted(listadas) != sorted(partes):
        malas.append(f"`regiones` lista {len(listadas)} comunas y hay {len(partes)} partes")
    ids = [i for res in resumenes.values() for i in res.get("ids", [])]
    if len(ids) != len(set(ids)):
        malas.append(f"{len(ids) - len(set(ids))} mancha_id repetidos entre comunas")
    r.check(not malas, "D20", f"riesgo: las cuentas cuadran ({len(partes)} comunas)", "; ".join(malas))


def _leer_header_pmtiles(p: Path) -> dict | None:
    """Lee el header de un PMTiles v3 (spec: 127 bytes, magic 'PMTiles')."""
    with open(p, "rb") as fh:
        head = fh.read(127)
    if len(head) < 127 or head[0:7] != b"PMTiles":
        return None
    version = head[7]
    minzoom, maxzoom = head[100], head[101]
    minlon, minlat, maxlon, maxlat = struct.unpack_from("<4i", head, 102)
    return {
        "version": version,
        "minzoom": minzoom,
        "maxzoom": maxzoom,
        "bbox": [minlon / 1e7, minlat / 1e7, maxlon / 1e7, maxlat / 1e7],
    }


def verificar(data: Path, muestra: int = 500, res: Res | None = None) -> bool:
    data = Path(data)
    r = res if res is not None else Res()
    man_path = data / "manifest.json"
    if not man_path.exists():
        print(f"  {NO} falta {man_path}")
        return False
    manifest = json.loads(man_path.read_text(encoding="utf-8"))
    capas = manifest["capas"]
    derivados = manifest.get("derivados") or {}

    print("\n── verificación ─────────────────────────────────────────────")

    lineas_para_cruce = []
    # GeoJSON ya parseados en esta corrida, por nombre de archivo. D16-D18 releen
    # incendios (7,6 MiB) y la BBDD completa (11,9 MiB); parsearlos dos veces
    # alarga --negativas, que llama a verificar() una vez por mutacion.
    parseados: dict[str, dict] = {}

    # Los derivados pasan por los mismos D1 y D5-D9 que las capas: un archivo que
    # la pagina de lineas electricas descarga no puede quedar sin mirar solo por
    # vivir en otra clave del manifest.
    recorrido = [(n, m, False) for n, m in capas.items()] + [(n, m, True) for n, m in derivados.items()]
    riesgo_resumenes: dict[str, dict] | None = None
    for nombre, meta, es_derivado in recorrido:
        if meta.get("partes") is not None:
            riesgo_resumenes = _verificar_partes(r, data, nombre, meta)
            continue
        archivo = data / meta["archivo"]
        if not r.check(archivo.exists(), "D1", f"{nombre}: existe {meta['archivo']}"):
            continue

        if meta.get("formato") == "pmtiles":
            h = _leer_header_pmtiles(archivo)
            r.check(h is not None, "D2", f"{nombre}: PMTiles valido")
            if h:
                r.check(
                    h["minzoom"] == meta["minzoom"] and h["maxzoom"] == meta["maxzoom"],
                    "D3",
                    f"{nombre}: zooms z{h['minzoom']}-{h['maxzoom']}",
                )
                b = h["bbox"]
                r.check(
                    CHILE[0] <= b[0] and b[2] <= CHILE[2] and CHILE[1] <= b[1] and b[3] <= CHILE[3],
                    "D4",
                    f"{nombre}: bbox dentro de Chile",
                    f"{[round(v, 3) for v in b]}",
                )
            # Las teselas no se pueden recorrer feature a feature, pero el
            # GeoJSON intermedio que consumio tippecanoe sigue en _build/. Se usa
            # para no perder el cruce espacial justo en produccion, que es donde
            # mas importa.
            if nombre in CAPAS_VIALES:
                inter = BUILD / f"{nombre}.geojson"
                if inter.exists():
                    for f in json.loads(inter.read_text(encoding="utf-8"))["features"]:
                        g = f.get("geometry")
                        if g and g.get("coordinates"):
                            lineas_para_cruce.append(g)
                else:
                    print(f"  · {nombre}: sin intermedio en _build/, queda fuera del cruce")
            continue

        gj = json.loads(archivo.read_text(encoding="utf-8"))
        parseados[meta["archivo"]] = gj
        r.check(gj.get("type") == "FeatureCollection", "D5", f"{nombre}: FeatureCollection")
        n = len(gj["features"])
        r.check(
            n == meta["features"],
            "D6",
            f"{nombre}: {n} features",
            "" if n == meta["features"] else f"el manifest dice {meta['features']}",
        )

        malas = 0
        fuera = 0
        vacias = 0
        for f in gj["features"]:
            g = f.get("geometry")
            if not g or not g.get("coordinates"):
                vacias += 1
                continue
            cs = _coords(g)
            if not cs:
                vacias += 1
                continue
            for lon, lat in cs:
                if lon != lon or lat != lat or abs(lon) == float("inf"):
                    malas += 1
                    break
                if not (CHILE[0] <= lon <= CHILE[2] and CHILE[1] <= lat <= CHILE[3]):
                    fuera += 1
                    break
            # Solo la red vial sirve de referencia. OECV son cortafuegos, que
            # por diseño no pasan por donde se queman los bosques: medir contra
            # ellos da una mediana de 3,4 km y no significa nada.
            if nombre in CAPAS_VIALES and g["type"] in ("LineString", "MultiLineString"):
                lineas_para_cruce.append(g)

        r.check(malas == 0, "D7", f"{nombre}: sin NaN/Infinity", f"{malas} malas" if malas else "")
        r.check(vacias == 0, "D8", f"{nombre}: sin geometrías vacías", f"{vacias}" if vacias else "")
        r.check(fuera == 0, "D9", f"{nombre}: todas dentro de Chile", f"{fuera} fuera" if fuera else "")

        # Un derivado no declara filtros: D10 saldria en verde sin mirar nada.
        if es_derivado:
            continue
        campos_esperados = set(meta.get("filtros", []))
        presentes = set()
        for f in gj["features"][:200]:
            presentes |= set(f["properties"].keys())
        faltan = campos_esperados - presentes
        r.check(not faltan, "D10", f"{nombre}: campos de filtro presentes", f"faltan {faltan}" if faltan else "")

    # --- las regiones tienen que estar canonizadas en TODAS las capas ---
    # Sin esto un valor sin normalizar ('Región Metropolitana de Santiago' junto
    # a 'Metropolitana') se cuela como una opcion extra del filtro que deja capas
    # enteras en cero sin ningun aviso.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from geo import REGIONES

    intrusos = {}
    for nombre, meta in capas.items():
        for v in (d["v"] for d in meta.get("dominios", {}).get("region", [])):
            if v not in REGIONES:
                intrusos.setdefault(nombre, []).append(v)
    # Tambien las claves de sin_coordenadas.por_region de los derivados: una celda
    # de region vacia llego a publicarse como la region 'nan' con todo en verde
    # (revision del 2026-09-14). 'Sin región' es la clave que el ETL usa a proposito.
    for nombre, meta in (manifest.get("derivados") or {}).items():
        claves = ((meta or {}).get("sin_coordenadas") or {}).get("por_region") or {}
        for v in claves:
            if v not in REGIONES and v != "Sin región":
                intrusos.setdefault(f"derivados.{nombre}.sin_coordenadas", []).append(v)
    r.check(
        not intrusos,
        "D11",
        "regiones canonizadas en todas las capas",
        "; ".join(f"{k}: {v}" for k, v in intrusos.items()) if intrusos else "",
    )

    # --- riesgo: rangos, clases y cuentas ---
    meta_riesgo = capas.get("riesgo")
    if meta_riesgo is not None:
        _cuentas_riesgo(r, meta_riesgo, riesgo_resumenes or {})

    # --- infraestructura: cada punto dentro de la caja de riesgo de SU CUT ---
    # Cruza las dos capas, asi que caza de una vez tres fallos distintos: un huso
    # UTM mal leido (el punto se va ~700 km), un CUT que no es el de la carpeta, y
    # una comuna con infraestructura y sin manchas.
    # El margen es 0,01 grados (~1,1 km): las manchas se cortan en el limite
    # comunal y un punto real puede quedar a unos metros fuera de ellas, y 0,01
    # sigue siendo 70 veces menor que el error de huso que debe detectar.
    infra = data / "infra_puntos.geojson"
    if infra.exists() and meta_riesgo is not None:
        partes = meta_riesgo.get("partes") or {}
        m = 0.01
        gj = json.loads(infra.read_text(encoding="utf-8"))
        malos = []
        for f in gj["features"]:
            p = f["properties"]
            caja = (partes.get(str(p.get("cut"))) or {}).get("bbox")
            if caja is None:
                malos.append(f"{p.get('nombre')}: CUT {p.get('cut')!r} ({p.get('comuna')}) no esta en riesgo")
                continue
            lon, lat = f["geometry"]["coordinates"]
            if not (caja[0] - m <= lon <= caja[2] + m and caja[1] - m <= lat <= caja[3] + m):
                malos.append(f"{p.get('familia')}/{p.get('nombre')} en {p.get('comuna')} ({p.get('cut')})")
        r.check(
            bool(gj["features"]) and not malos,
            "D15",
            "infra_puntos: cada punto dentro de la caja de riesgo de su CUT",
            f"{len(malos)} fuera: {malos[:3]}" if malos else "",
        )

    # --- D16-D18: codigo de causa general y derivados de incendios ---
    # Como D14 y D15, solo exigen algo cuando la capa de la que dependen esta en
    # el manifest. Una corrida `--layers oecv` no tiene derivados que verificar.
    if "incendios" in capas:
        _causas_y_derivados(r, data, capas["incendios"], derivados, parseados)

    # --- cruce espacial: los incendios deben caer sobre la red vial ---
    inc = data / "incendios.geojson"
    if inc.exists() and lineas_para_cruce:
        _cruce_espacial(r, inc, lineas_para_cruce, muestra)
    elif inc.exists():
        print("  · cruce espacial omitido: no hay geometría vial disponible")

    print("─────────────────────────────────────────────────────────────")
    print(f"{OK if r.fallos == 0 else NO} {'todo correcto' if r.fallos == 0 else f'{r.fallos} comprobaciones fallidas'}\n")
    return r.fallos == 0


def _leer_gj(data: Path, archivo, parseados: dict) -> dict | None:
    """GeoJSON ya parseado en esta corrida o leido ahora. None si falta o no parsea.

    Nunca lanza: una mutacion que deja el archivo roto tiene que acabar en rojo,
    no matando al verificador.
    """
    if not isinstance(archivo, str):
        return None
    if archivo in parseados:
        return parseados[archivo]
    p = data / archivo
    if not p.exists():
        return None
    try:
        gj = json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return None
    parseados[archivo] = gj
    return gj


def _features(gj) -> list:
    fs = gj.get("features") if isinstance(gj, dict) else None
    return [f for f in fs if isinstance(f, dict)] if isinstance(fs, list) else []


def _decodificar(props, tablas: dict) -> dict:
    """Props de incendios con los indices resueltos contra manifest.tablas."""
    out = dict(props) if isinstance(props, dict) else {}
    for campo, tabla in tablas.items():
        if campo in out:
            i = out[campo]
            ok = isinstance(i, int) and 0 <= i < len(tabla)
            out[campo] = tabla[i] if ok else f"<indice invalido {i!r}>"
    return out


def _canon(obj) -> str:
    """Serializacion estable para comparar 'byte a byte' props y geometria."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _cuentas_sin_coord(meta: dict) -> tuple[list, list]:
    """(ids sin coordenadas, problemas de coherencia interna del bloque)."""
    sc = meta.get("sin_coordenadas") if isinstance(meta.get("sin_coordenadas"), dict) else {}
    ids = sc.get("ids") if isinstance(sc.get("ids"), list) else []
    n = sc.get("n")
    por_region = sc.get("por_region") if isinstance(sc.get("por_region"), dict) else {}
    problemas = []
    if not isinstance(n, int):
        problemas.append("sin_coordenadas.n no es entero")
        return ids, problemas
    if len(ids) != n:
        problemas.append(f"{len(ids)} ids vs n={n}")
    if sum(v for v in por_region.values() if isinstance(v, int)) != n:
        problemas.append(f"por_region suma {sum(v for v in por_region.values() if isinstance(v, int))} vs n={n}")
    feats = meta.get("features")
    if not isinstance(feats, int) or feats + n != meta.get("leidos"):
        problemas.append(f"features {meta.get('features')} + sin coordenadas {n} != leidos {meta.get('leidos')}")
    return ids, problemas


def _causas_y_derivados(r: Res, data: Path, inc_meta: dict, derivados: dict, parseados: dict) -> None:
    """D16, D17 y D18. Todas cruzan dos fuentes: nunca un archivo contra si mismo."""
    tablas = inc_meta.get("tablas") or {}
    inc_feats = _features(_leer_gj(data, inc_meta.get("archivo"), parseados))
    inc_dec = [_decodificar(f.get("properties"), tablas) for f in inc_feats]

    # --- D16: el codigo general es el prefijo de la causa investigada ---------
    # El defecto que vigila: 'Codigo causa general 2023' llega como float y 4.10
    # es el mismo numero que 4.1. Publicado hasta el 2026-09-14: 'Otras causas'
    # (1.006 features) bajo el 4.1 de 'Faenas forestales' (914), y 50 mas bajo 1.1;
    # sobre esos datos esta asercion da 1.056 filas en rojo. Se comprueba contra
    # causa_codigo, que es texto en el Excel y conserva el '4.10'.
    malos, sin_causa = [], 0
    etiquetas: dict[str, set] = {}
    for p in inc_dec:
        ci, cg = p.get("causa_codigo"), p.get("causa_general_codigo")
        if cg is not None and p.get("causa_general") is not None:
            etiquetas.setdefault(str(cg), set()).add(p["causa_general"])
        if ci is None:
            # Sin causa investigada no hay contra que comprobar el codigo; se
            # cuenta y se dice (medido el 2026-09-14: 0 filas).
            sin_causa += 1
            continue
        if cg is None or not (str(ci) == str(cg) or str(ci).startswith(f"{cg}.")):
            malos.append(f"id {p.get('id')}: {cg!r} vs {ci!r}")
    nota = f" · {sin_causa} sin causa_codigo" if sin_causa else ""
    r.check(
        bool(inc_dec) and not malos,
        "D16",
        f"incendios: causa_general_codigo es prefijo de causa_codigo ({len(inc_dec)} filas)",
        (f"{len(malos)} no: {malos[:3]}" if malos else ("no se pudo leer incendios" if not inc_dec else "")) + nota,
    )
    dobles = {k: sorted(v) for k, v in etiquetas.items() if len(v) > 1}
    r.check(
        bool(inc_dec) and not dobles,
        "D16b",
        f"incendios: cada código general lleva una sola etiqueta ({len(etiquetas)} códigos)",
        f"{dobles}" if dobles else "",
    )

    # --- D17: la BBDD completa es incendios decodificado, fila a fila ---------
    esperadas = list(CABECERA_A_CAMPO) + EXTRA_DERIVADOS
    bb_meta = derivados.get("bbdd_uad_completa")
    bb_feats: list | None = None
    if r.check(isinstance(bb_meta, dict), "D17", "derivados.bbdd_uad_completa declarado en el manifest"):
        cols = bb_meta.get("columnas") if isinstance(bb_meta.get("columnas"), list) else []
        r.check(
            cols == list(CABECERA_A_CAMPO) and bb_meta.get("extra") == EXTRA_DERIVADOS,
            "D17",
            f"bbdd_uad_completa: {len(cols)} columnas = las {len(CABECERA_A_CAMPO)} de la Hoja 1, en orden",
            ""
            if cols == list(CABECERA_A_CAMPO) and bb_meta.get("extra") == EXTRA_DERIVADOS
            else f"faltan {[c for c in CABECERA_A_CAMPO if c not in cols]} · "
            f"sobran {[c for c in cols if c not in CABECERA_A_CAMPO]} · extra {bb_meta.get('extra')}",
        )
        bb_gj = _leer_gj(data, bb_meta.get("archivo"), parseados)
        bb_feats = _features(bb_gj) if bb_gj is not None else None

    if bb_feats is None:
        r.check(False, "D17", "bbdd_uad_completa: legible", "falta el archivo o no parsea")
    else:
        claves_malas = [
            f"#{i}: faltan {[k for k in esperadas if k not in p]} sobran {[k for k in p if k not in esperadas]}"
            for i, p in enumerate((f.get("properties") or {}) for f in bb_feats)
            if list(p) != esperadas
        ]
        r.check(
            not claves_malas,
            "D17",
            "bbdd_uad_completa: cada feature trae exactamente las 23 columnas + lat/lon/utm_epsg",
            f"{len(claves_malas)} features: {claves_malas[:2]}" if claves_malas else "",
        )

        difs = []
        if len(bb_feats) != len(inc_feats):
            difs.append(f"{len(bb_feats)} features vs {len(inc_feats)} en incendios")
        for i, (fb, fi, pi) in enumerate(zip(bb_feats, inc_feats, inc_dec)):
            pb = fb.get("properties") or {}
            g = fb.get("geometry")
            if _canon(g) != _canon(fi.get("geometry")):
                difs.append(f"#{i} geometría {g} vs {fi.get('geometry')}")
            cs = g.get("coordinates") if isinstance(g, dict) else None
            if not (isinstance(cs, list) and len(cs) == 2 and pb.get("lon") == cs[0] and pb.get("lat") == cs[1]):
                difs.append(f"#{i} lat/lon {pb.get('lat')},{pb.get('lon')} vs geometría {cs}")
            if pb.get("utm_epsg") != pi.get("utm_epsg"):
                difs.append(f"#{i} utm_epsg {pb.get('utm_epsg')!r} vs {pi.get('utm_epsg')!r}")
            # null en la BBDD == clave ausente en incendios (gj_io.feature las
            # descarta), por eso .get() en los dos lados.
            for cab, campo in CABECERA_A_CAMPO.items():
                if pb.get(cab) != pi.get(campo):
                    difs.append(f"#{i} ID {pb.get('ID')} {cab!r}: {pb.get(cab)!r} vs {campo}={pi.get(campo)!r}")
            if len(difs) > 50:
                break
        r.check(
            bool(inc_feats) and not difs,
            "D17",
            f"bbdd_uad_completa: {len(bb_feats)} features idénticas a incendios decodificado",
            f"{len(difs)}{'+' if len(difs) > 50 else ''} diferencias: {difs[:3]}" if difs else "",
        )

        sin_ids, problemas = _cuentas_sin_coord(bb_meta)
        if bb_meta.get("leidos") != inc_meta.get("leidos"):
            problemas.append(f"leidos {bb_meta.get('leidos')} vs incendios {inc_meta.get('leidos')}")
        if len(sin_ids) != inc_meta.get("descartados"):
            problemas.append(f"{len(sin_ids)} sin coordenadas vs {inc_meta.get('descartados')} descartados de incendios")
        # Sin los None: dos filas sin ID, una con y otra sin coordenadas, darian el
        # falso 'ids a la vez con y sin coordenadas: [None]'.
        cruzados = ({(f.get("properties") or {}).get("ID") for f in bb_feats} - {None}) & (set(sin_ids) - {None})
        if cruzados:
            problemas.append(f"ids a la vez con y sin coordenadas: {sorted(cruzados, key=str)[:3]}")
        r.check(not problemas, "D17", "bbdd_uad_completa: sin_coordenadas cuadra con incendios", "; ".join(problemas))

    # --- D18: lineas electricas == filtro literal de la BBDD completa ---------
    li_meta = derivados.get("lineas_electricas")
    if not r.check(isinstance(li_meta, dict), "D18", "derivados.lineas_electricas declarado en el manifest"):
        return
    filtro = {"campo": "Causa general 2023", "valor": CAUSA_ELECTRICA}
    r.check(
        li_meta.get("filtro") == filtro,
        "D18",
        f"lineas_electricas: filtro {filtro}",
        "" if li_meta.get("filtro") == filtro else f"declara {li_meta.get('filtro')}",
    )
    li_gj = _leer_gj(data, li_meta.get("archivo"), parseados)
    if li_gj is None or bb_feats is None:
        r.check(False, "D18", "lineas_electricas: legible y con BBDD completa contra la que cruzar",
                "falta lineas_electricas" if li_gj is None else "falta la BBDD completa")
        return
    li_feats = _features(li_gj)
    r.check(len(li_feats) > 0, "D18", f"lineas_electricas: {len(li_feats)} features > 0")

    esperados = [(f.get("properties") or {}).get("ID") for f in bb_feats
                 if (f.get("properties") or {}).get("Causa general 2023") == CAUSA_ELECTRICA]
    ids = [(f.get("properties") or {}).get("ID") for f in li_feats]
    r.check(
        ids == esperados,
        "D18",
        f"lineas_electricas: sus ID son los de la BBDD con causa {CAUSA_ELECTRICA!r}",
        "" if ids == esperados else
        f"{len(ids)} vs {len(esperados)} · sobran {[i for i in ids if i not in set(esperados)][:3]} · "
        f"faltan {[i for i in esperados if i not in set(ids)][:3]}",
    )
    # Por POSICION y no por ID: la comprobacion anterior ya exige el mismo orden, y
    # un dict por ID colapsa las filas sin ID (el Excel anterior traia 6) en una.
    filtradas = [f for f in bb_feats if (f.get("properties") or {}).get("Causa general 2023") == CAUSA_ELECTRICA]
    distintas = [
        (f.get("properties") or {}).get("ID")
        for f, b in zip(li_feats, filtradas)
        if _canon(f.get("properties")) != _canon(b.get("properties"))
        or _canon(f.get("geometry")) != _canon(b.get("geometry"))
    ]
    if len(li_feats) != len(filtradas):
        distintas.append(f"{len(li_feats)} features vs {len(filtradas)} filtradas")
    r.check(
        not distintas,
        "D18",
        "lineas_electricas: propiedades y geometría idénticas a la BBDD completa",
        f"{len(distintas)} distintas: ID {distintas[:3]}" if distintas else "",
    )
    sin_ids, problemas = _cuentas_sin_coord(li_meta)
    fuera_bbdd = sorted(set(sin_ids) - set((bb_meta.get("sin_coordenadas") or {}).get("ids") or []), key=str)
    if fuera_bbdd:
        problemas.append(f"ids sin coordenadas que la BBDD completa no declara: {fuera_bbdd[:3]}")
    r.check(not problemas, "D18", "lineas_electricas: features + sin coordenadas = leídos", "; ".join(problemas))


def _cruce_espacial(r: Res, inc_path: Path, lineas: list, muestra: int) -> None:
    """Distancia de una muestra de incendios al camino mas cercano.

    Es la comprobacion que caza un huso UTM invertido: un punto mal reproyectado
    aterriza 300-600 km al oeste, en el Pacifico, y revienta el umbral.
    """
    try:
        from shapely.geometry import Point, shape
        from shapely.strtree import STRtree
    except ImportError:
        print("  · cruce espacial omitido: shapely no disponible")
        return

    gj = json.loads(inc_path.read_text(encoding="utf-8"))
    # Solo puntos [lon, lat] bien formados. Sin el filtro de longitud, un feature
    # con las coordenadas vacias revienta el desempaquetado de abajo con un
    # ValueError y el verificador MUERE en vez de reportar D8 en rojo. Lo encontro
    # la mutacion D8 de --negativas el 2026-09-10.
    pts = [
        c
        for f in gj["features"]
        if (g := f.get("geometry")) and len(c := g.get("coordinates") or ()) == 2
    ]
    if not pts:
        return
    paso = max(1, len(pts) // muestra)
    pts = pts[::paso][:muestra]

    geoms = [shape(g) for g in lineas]
    arbol = STRtree(geoms)

    # A la latitud de Chile, 1 grado ~ 111 km en latitud y ~ 87 km en longitud.
    dists = []
    for lon, lat in pts:
        p = Point(lon, lat)
        idx = arbol.nearest(p)
        d = p.distance(geoms[idx])
        dists.append(d * 105.0)  # grados -> km, aproximacion suficiente

    dists.sort()
    n = len(dists)
    mediana = dists[n // 2]
    p95 = dists[int(n * 0.95)]
    bajo25 = sum(1 for d in dists if d < 25.0)

    print(f"  · cruce espacial: {n} incendios vs {len(geoms)} líneas")
    print(
        f"      distancia al camino más cercano — mediana {mediana:.2f} km · "
        f"p95 {p95:.1f} km · máx {dists[-1]:.1f} km"
    )
    r.check(
        bajo25 >= n * 0.99,
        "D12",
        f"a menos de 25 km del camino más cercano: {bajo25}/{n} ({100.0 * bajo25 / n:.1f} %)",
    )
    r.check(mediana < 1.5, "D13", f"mediana {mediana:.2f} km < 1,5 km")


# ---------------------------------------------------------------------------
# Controles negativos
# ---------------------------------------------------------------------------
# Cada mutacion reintroduce a proposito un defecto que alguna asercion vigila, y
# exige que ESA asercion se ponga roja. Si sobrevive, la asercion no prueba nada.
#
# Las mutaciones se aplican sobre una COPIA en un temporal, nunca sobre
# frontend/public/data: una interrupcion a media ejecucion no puede dejar datos
# corruptos versionados.


def _capas_por_formato(data: Path) -> tuple[dict, str, str]:
    man = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    # Con `archivo`: una capa partida por comuna no tiene un archivo al que
    # apuntar las mutaciones genericas, y el orden de `capas` lo decide cual capa
    # termino antes en el pool.
    geo = next(n for n, c in man["capas"].items() if c.get("formato") != "pmtiles" and "archivo" in c)
    pm = next(n for n, c in man["capas"].items() if c.get("formato") == "pmtiles")
    return man, geo, pm


def _mut_json(ruta: Path, fn) -> None:
    """Lee un JSON, lo deja tocar y lo reescribe. allow_nan permite inyectar NaN."""
    d = json.loads(ruta.read_text(encoding="utf-8"))
    fn(d)
    ruta.write_text(json.dumps(d, allow_nan=True), encoding="utf-8")


def _mutaciones(data: Path) -> list[tuple[str, str, str, object]]:
    """(ident esperado, descripcion, archivo relativo a tocar, funcion)."""
    man, geo, pm = _capas_por_formato(data)
    arch_geo = man["capas"][geo]["archivo"]
    arch_pm = man["capas"][pm]["archivo"]

    def borrar_archivo(p: Path):
        p.unlink()

    def no_es_coleccion(p: Path):
        _mut_json(p, lambda d: d.__setitem__("type", "Feature"))

    def falta_un_feature(p: Path):
        _mut_json(p, lambda d: d["features"].pop())

    def coordenada_nan(p: Path):
        _mut_json(p, lambda d: d["features"][0]["geometry"].__setitem__("coordinates", [float("nan"), -33.0]))

    def geometria_vacia(p: Path):
        _mut_json(p, lambda d: d["features"][0]["geometry"].__setitem__("coordinates", []))

    def punto_fuera_de_chile(p: Path):
        _mut_json(p, lambda d: d["features"][0]["geometry"].__setitem__("coordinates", [0.0, 0.0]))

    def sin_campo_de_filtro(p: Path):
        def quitar(d):
            campo = man["capas"][geo]["filtros"][0]
            for f in d["features"][:200]:
                f["properties"].pop(campo, None)

        _mut_json(p, quitar)

    def region_sin_canonizar(p: Path):
        def meter(d):
            d["capas"][geo].setdefault("dominios", {}).setdefault("region", []).append(
                {"v": "Región Metropolitana de Santiago", "n": 1}
            )

        _mut_json(p, meter)

    def zoom_que_no_cuadra(p: Path):
        _mut_json(p, lambda d: d["capas"][pm].__setitem__("minzoom", d["capas"][pm]["minzoom"] + 1))

    def magic_corrupto(p: Path):
        b = bytearray(p.read_bytes())
        b[0:7] = b"XXXXXXX"
        p.write_bytes(bytes(b))

    def bbox_fuera_de_chile(p: Path):
        b = bytearray(p.read_bytes())
        # Los 4 int32 del bbox viven en el offset 102 del header v3, en 1e7 de grado.
        struct.pack_into("<4i", b, 102, int(10.0 * 1e7), int(40.0 * 1e7), int(20.0 * 1e7), int(50.0 * 1e7))
        p.write_bytes(bytes(b))

    def huso_invertido(p: Path):
        # EL control negativo que importa: es el defecto de DECISIONES.md §A. Un
        # huso mal elegido manda el punto cientos de km al oeste. Se desplaza la
        # mitad de la muestra para que la MEDIANA se mueva, no solo la cola.
        def desplazar(d):
            for f in d["features"][: len(d["features"]) // 2 + 1]:
                g = f.get("geometry")
                if g and g.get("coordinates"):
                    g["coordinates"][0] -= 5.0

        _mut_json(p, desplazar)

    def punto_con_huso_equivocado(p: Path):
        # El defecto que D15 existe para cazar: leer un archivo con el huso de su
        # vecino. Entre 18S y 19S son ~6 grados de longitud, muy por encima del
        # margen de 0,01 y aun asi dentro de Chile, asi que D9 NO lo detecta.
        def desplazar(d):
            d["features"][0]["geometry"]["coordinates"][0] -= 6.0

        _mut_json(p, desplazar)

    # --- D16-D18. Cada una toca UN archivo --negativas solo restaura el mutado--
    # y ninguna lanza: si el archivo no esta, no muta, la asercion queda verde y
    # la mutacion sale como SUPERVIVIENTE, que es ruidoso.
    der = man.get("derivados") or {}
    arch_bbdd = (der.get("bbdd_uad_completa") or {}).get("archivo", "bbdd_uad_completa.geojson")
    arch_lineas = (der.get("lineas_electricas") or {}).get("archivo", "lineas_electricas.geojson")

    def fundir_codigo_general(p: Path):
        # El defecto real publicado hasta el 2026-09-14: 4.10 leido como float es
        # 4.1. Renombrar la etiqueta de la tabla reproduce exactamente lo que veia
        # el visor: las filas de 4.10 decodifican como '4.1'.
        def fundir(d):
            t = ((d.get("capas") or {}).get("incendios") or {}).get("tablas", {}).get("causa_general_codigo")
            if not t or len(t) < 2:
                return
            if "4.10" in t:
                t[t.index("4.10")] = "4.1"
            else:
                t[0] = t[1]

        _mut_json(p, fundir)

    def intercambiar_comunas(p: Path):
        # Dos filas con la comuna del vecino: el archivo sigue siendo un GeoJSON
        # perfecto con 23 columnas, y solo el cruce contra incendios lo ve.
        def cambiar(d):
            fs = d.get("features") or []
            if not fs:
                return
            a = fs[0]["properties"]
            b = next((f["properties"] for f in fs[1:] if f["properties"].get("Comuna") != a.get("Comuna")), None)
            if b is not None:
                a["Comuna"], b["Comuna"] = b["Comuna"], a["Comuna"]

        if p.exists():
            _mut_json(p, cambiar)

    def quitar_columna_informe(p: Path):
        # La columna perdida de un solo feature: lo que pasaria si alguien
        # volviera a construir el feature con gj_io.feature, que tira los null.
        def quitar(d):
            fs = d.get("features") or []
            if fs:
                fs[0]["properties"].pop("Informe", None)

        if p.exists():
            _mut_json(p, quitar)

    def colar_otra_causa(p: Path):
        # Un incendio de otra causa dentro de lineas electricas. Se LEE la BBDD
        # completa (sin tocarla) para colar una fila real, no una inventada.
        def colar(d):
            bbdd = p.parent / arch_bbdd
            if not bbdd.exists():
                return
            otra = next(
                (f for f in json.loads(bbdd.read_text(encoding="utf-8")).get("features", [])
                 if f["properties"].get("Causa general 2023") != CAUSA_ELECTRICA),
                None,
            )
            if otra is not None:
                d["features"].append(otra)

        if p.exists():
            _mut_json(p, colar)

    def etiqueta_falsa_bajo_4_10(p: Path):
        # Una fila de 'Otras causas' (4.10.x / 4.10) con la etiqueta de 4.1. El
        # prefijo sigue cuadrando, asi que D16 queda verde: solo D16b puede verla.
        def falsear(d):
            t = ((man.get("capas") or {}).get("incendios") or {}).get("tablas") or {}
            codigos, generales = t.get("causa_general_codigo") or [], t.get("causa_general") or []
            if "4.10" not in codigos or "Faenas forestales" not in generales:
                return
            i410, ifaenas = codigos.index("4.10"), generales.index("Faenas forestales")
            f = next((f for f in d.get("features", []) if f["properties"].get("causa_general_codigo") == i410), None)
            if f is not None:
                f["properties"]["causa_general"] = ifaenas

        _mut_json(p, falsear)

    def region_nan_en_sin_coordenadas(p: Path):
        # Lo que publicaba una celda de region vacia antes del arreglo.
        def colar(d):
            li = (d.get("derivados") or {}).get("lineas_electricas") or {}
            pr = (li.get("sin_coordenadas") or {}).get("por_region")
            if isinstance(pr, dict):
                pr["nan"] = 1

        _mut_json(p, colar)

    def falta_un_feature_si_existe(p: Path):
        if p.exists():
            falta_un_feature(p)

    # --- riesgo. Se muta la comuna con MENOS manchas que tenga al menos dos, y
    # la mutacion de D14 por nombre usa otra, para no depender de una sola.
    partes = ((man["capas"].get("riesgo") or {}).get("partes")) or {}
    chicas = sorted((p["features"], c) for c, p in partes.items() if p.get("features", 0) >= 2)
    cut_a = chicas[0][1] if chicas else None
    cut_b = chicas[1][1] if len(chicas) > 1 else cut_a
    arch_a = partes[cut_a]["archivo"] if cut_a else "riesgo/sin-partes.geojson"
    arch_b = partes[cut_b]["archivo"] if cut_b else arch_a

    def mancha_sin_geometria(p: Path):
        _mut_json(p, lambda d: d["features"][0].__setitem__("geometry", None))

    def mancha_fuera_de_chile(p: Path):
        def mover(d):
            g = d["features"][0]["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for poly in polys:
                for anillo in poly:
                    for c in anillo:
                        c[0] += 60.0

        _mut_json(p, mover)

    def mancha_fuera_de_su_caja(p: Path):
        # Basta 0,5 grados al este: sigue dentro de Chile (D9 verde) y fuera de la
        # caja de su comuna, que es lo unico que D14 puede ver.
        def mover(d):
            g = d["features"][0]["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for poly in polys:
                for anillo in poly:
                    for c in anillo:
                        c[0] += 0.5

        _mut_json(p, mover)

    def mancha_con_otra_grafia(p: Path):
        # El defecto real de este insumo: la misma comuna escrita de dos formas
        # («Coyhaique» / «Coihaique»). El archivo sigue perfecto en todo lo demas.
        _mut_json(p, lambda d: d["features"][0]["properties"].__setitem__("comuna", "Coyhaique"))

    def clase_incoherente(p: Path):
        def subir(d):
            pr = d["features"][0]["properties"]
            clases = [c["clase"] for c in (man["capas"].get("riesgo") or {}).get("clases", [])]
            if pr.get("clase") in clases:
                pr["clase"] = clases[(clases.index(pr["clase"]) + 2) % len(clases)]

        _mut_json(p, subir)

    def pct_alto_fuera_de_rango(p: Path):
        _mut_json(p, lambda d: d["features"][0]["properties"].__setitem__("pct_alto", 150.0))

    def descuadrar_sin_geometria(p: Path):
        # Lo que pasaria si el ETL dejara de contar las manchas sin geometria de
        # la region 12: 1.231 manchas desaparecerian del visor sin que conste.
        def tocar(d):
            sg = ((d["capas"].get("riesgo") or {}).get("fuente") or {}).get("sin_geometria")
            if isinstance(sg, dict):
                sg["n"] = 0
                sg["por_region"] = {}

        _mut_json(p, tocar)

    def quitar_una_region(p: Path):
        def quitar(d):
            rg = d["capas"].get("riesgo") or {}
            pts = rg.get("partes") or {}
            if not pts:
                return
            region = next(iter(pts.values()))["region"]
            for c in [c for c, v in pts.items() if v["region"] == region]:
                rg["features"] -= pts[c]["features"]
                rg["fuente"]["leidas"] -= pts[c]["features"]
                rg["fuente"]["filas_csv"] -= pts[c]["features"]
                del pts[c]
            rg["regiones"] = [x for x in rg.get("regiones", []) if x["region"] != region]

        _mut_json(p, quitar)

    def punto_con_cut_de_otra_comuna(p: Path):
        # Lo que dejaria un CUT mal escrito en COMUNAS de build_infra_puntos: los
        # iconos de Mulchen apareciendo en Los Angeles.
        def cambiar(d):
            fs = d.get("features") or []
            cuts = sorted({f["properties"].get("cut") for f in fs} - {None})
            if len(cuts) < 2:
                return
            a = fs[0]["properties"]
            a["cut"] = next(c for c in cuts if c != a.get("cut"))

        _mut_json(p, cambiar)

    return [
        ("D1", "borrar el archivo de una capa", arch_geo, borrar_archivo),
        ("D2", "corromper el magic 'PMTiles' del header", arch_pm, magic_corrupto),
        ("D3", "subir el minzoom del manifest sin regenerar", "manifest.json", zoom_que_no_cuadra),
        ("D4", "mover el bbox del header a Europa", arch_pm, bbox_fuera_de_chile),
        ("D5", "type FeatureCollection -> Feature", arch_geo, no_es_coleccion),
        ("D6", "quitar un feature sin tocar el manifest", arch_geo, falta_un_feature),
        ("D7", "meter NaN en una coordenada", arch_geo, coordenada_nan),
        ("D8", "vaciar las coordenadas de un feature", arch_geo, geometria_vacia),
        ("D9", "mover un punto al golfo de Guinea", arch_geo, punto_fuera_de_chile),
        ("D10", "borrar un campo de filtro de los 200 primeros", arch_geo, sin_campo_de_filtro),
        ("D11", "colar una región sin canonizar en el manifest", "manifest.json", region_sin_canonizar),
        ("D13", "invertir el huso: desplazar la longitud 5° al oeste", "incendios.geojson", huso_invertido),
        ("D1", "borrar el archivo de una comuna de riesgo", arch_a, borrar_archivo),
        ("D6", "quitar una mancha de una comuna sin tocar el manifest", arch_a, falta_un_feature),
        ("D8", "dejar sin geometría una mancha de riesgo", arch_a, mancha_sin_geometria),
        ("D9", "llevar una mancha de riesgo 60° al este", arch_a, mancha_fuera_de_chile),
        ("D14", "sacar una mancha 0,5° al este de la caja de su comuna", arch_a, mancha_fuera_de_su_caja),
        ("D14", "escribir «Coyhaique» en una mancha de otra comuna", arch_b, mancha_con_otra_grafia),
        ("D15", "leer un punto con el huso vecino: 6° al oeste", "infra_puntos.geojson", punto_con_huso_equivocado),
        ("D15", "dar a un punto el CUT de otra comuna", "infra_puntos.geojson", punto_con_cut_de_otra_comuna),
        ("D19", "subir dos clases una mancha sin cambiar su nivel", arch_a, clase_incoherente),
        ("D19", "pct_alto = 150 en una mancha", arch_b, pct_alto_fuera_de_rango),
        ("D20", "olvidar en el manifest las manchas sin geometría", "manifest.json", descuadrar_sin_geometria),
        ("D20", "quitar del manifest una región entera de riesgo", "manifest.json", quitar_una_region),
        ("D16", "volver a fundir 4.10 en 4.1 en la tabla del manifest", "manifest.json", fundir_codigo_general),
        ("D16b", "etiquetar como 'Faenas forestales' una fila de 4.10", "incendios.geojson", etiqueta_falsa_bajo_4_10),
        ("D11", "colar la región 'nan' en sin_coordenadas de un derivado", "manifest.json", region_nan_en_sin_coordenadas),
        ("D17", "intercambiar la comuna de dos incendios en la BBDD completa", arch_bbdd, intercambiar_comunas),
        ("D17", "quitar la columna Informe de un feature de la BBDD completa", arch_bbdd, quitar_columna_informe),
        ("D18", "colar un incendio de otra causa en lineas eléctricas", arch_lineas, colar_otra_causa),
        ("D6", "quitar un feature de un derivado sin tocar el manifest", arch_lineas, falta_un_feature_si_existe),
    ]


def negativas(data: Path, muestra: int = 500) -> bool:
    data = Path(data)
    muts = _mutaciones(data)

    print("\n── controles negativos ──────────────────────────────────────")
    print(f"  {len(muts)} mutaciones; cada una debe poner roja SU aserción\n")

    hay_cruce = any((BUILD / f"{c}.geojson").exists() for c in CAPAS_VIALES)
    if not hay_cruce:
        # Como la excepcion D26 de catastro: si el control no se puede correr, se
        # DICE y cuenta como fallo. Nunca se salta en silencio.
        print(f"  {NO} D12/D13 no verificables: falta ETL/_build/*.geojson.")
        print("       El cruce espacial no corre sin el intermedio de tippecanoe.")
        print("       Corre `python ETL/run.py` antes de exigir estos controles.\n")

    sobreviven = []
    with tempfile.TemporaryDirectory(prefix="verify-negativas-") as tmp:
        espejo = Path(tmp) / "data"
        shutil.copytree(data, espejo)
        for ident, desc, arch, fn in muts:
            objetivo = espejo / arch
            # Se guarda el archivo JUSTO antes de mutarlo, y no una foto del primer
            # nivel de data/: las comunas de riesgo viven en data/riesgo/, y con la
            # foto de primer nivel la mutacion de una comuna quedaba sin restaurar
            # y contaminaba todas las siguientes.
            antes = objetivo.read_bytes() if objetivo.exists() else None
            try:
                fn(objetivo)
                r = Res()
                # La salida de verificar() aqui es ruido: solo interesa que la
                # asercion mutada figure entre las rojas.
                with contextlib.redirect_stdout(io.StringIO()):
                    verificar(espejo, muestra, res=r)
                roja = ident in r.rojos
            finally:
                if antes is not None:
                    objetivo.write_bytes(antes)

            if not roja:
                sobreviven.append((ident, desc))
            print(f"  {OK if roja else NO} {ident:<4} {desc}")

    print("─────────────────────────────────────────────────────────────")
    if sobreviven:
        print(f"{NO} {len(sobreviven)} mutaciones SOBREVIVIERON:")
        for ident, desc in sobreviven:
            print(f"    {ident}: {desc} — esa aserción no está probando nada")
        print()
        return False
    if not hay_cruce:
        print(f"{NO} las {len(muts)} mutaciones se pusieron rojas, pero D12/D13 quedaron sin verificar\n")
        return False
    print(f"{OK} las {len(muts)} mutaciones se pusieron rojas\n")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent.parent / "frontend" / "public" / "data")
    ap.add_argument("--muestra", type=int, default=500)
    ap.add_argument("--negativas", action="store_true", help="reintroduce cada defecto y exige que su aserción se ponga roja")
    a = ap.parse_args()
    if a.negativas:
        return 0 if negativas(a.data, a.muestra) else 1
    return 0 if verificar(a.data, a.muestra) else 1


if __name__ == "__main__":
    raise SystemExit(main())
