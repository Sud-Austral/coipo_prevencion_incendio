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
    D11       regiones canonizadas en los dominios
    D12, D13  cruce espacial incendios <-> red vial (necesitan ETL/_build/)
    D14, D15  priorizacion e infra_puntos dentro del bbox de su comuna
    D16       incendios: causa_general_codigo es el prefijo de causa_codigo y
              cada codigo general lleva una sola etiqueta (el defecto 4.1/4.10)
    D17       derivado bbdd_uad_completa == incendios decodificado, fila a fila
    D18       derivado lineas_electricas == filtro de la BBDD completa
"""

from __future__ import annotations

import argparse
import contextlib
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
    for nombre, meta, es_derivado in recorrido:
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
    r.check(
        not intrusos,
        "D11",
        "regiones canonizadas en todas las capas",
        "; ".join(f"{k}: {v}" for k, v in intrusos.items()) if intrusos else "",
    )

    # --- priorizacion: cada mancha dentro del bbox declarado de SU comuna ---
    # bbox_comuna es lo que usa el visor para encuadrar al elegir comuna. Si una
    # mancha se sale, el encuadre deja fuera parte de lo que dice mostrar.
    prio = data / "priorizacion.geojson"
    meta_prio = capas.get("priorizacion", {})
    if prio.exists() and meta_prio.get("bbox_comuna"):
        cajas = meta_prio["bbox_comuna"]
        gj = json.loads(prio.read_text(encoding="utf-8"))
        malas = []
        for f in gj["features"]:
            p = f["properties"]
            caja = cajas.get(p.get("comuna"))
            if caja is None:
                malas.append(f"{p.get('mancha_id')}: comuna sin bbox")
                continue
            cs = _coords(f["geometry"])
            if (
                min(c[0] for c in cs) < caja[0]
                or min(c[1] for c in cs) < caja[1]
                or max(c[0] for c in cs) > caja[2]
                or max(c[1] for c in cs) > caja[3]
            ):
                malas.append(str(p.get("mancha_id")))
        r.check(
            not malas,
            "D14",
            "priorizacion: cada mancha dentro del bbox de su comuna",
            f"{len(malas)} fuera: {malas[:3]}" if malas else "",
        )

    # --- infraestructura: cada punto dentro del bbox de la comuna que declara ---
    # Cruza las DOS capas nuevas, asi que caza de una vez tres fallos distintos:
    # un huso UTM mal leido (el punto se va ~700 km), un nombre de comuna que no
    # cruza entre capas, y una comuna publicada en una capa y no en la otra.
    # El margen es 0,01 grados (~1,1 km): el contorno comunal del que salen las
    # manchas viene simplificado a 25 m, asi que 0,01 deja 40x de holgura y
    # sigue siendo 70 veces menor que el error de huso que debe detectar.
    infra = data / "infra_puntos.geojson"
    if infra.exists() and meta_prio.get("bbox_comuna"):
        cajas = meta_prio["bbox_comuna"]
        m = 0.01
        gj = json.loads(infra.read_text(encoding="utf-8"))
        malos = []
        for f in gj["features"]:
            p = f["properties"]
            caja = cajas.get(p.get("comuna"))
            if caja is None:
                malos.append(f"{p.get('nombre')}: comuna '{p.get('comuna')}' no esta en priorizacion")
                continue
            lon, lat = f["geometry"]["coordinates"]
            if not (caja[0] - m <= lon <= caja[2] + m and caja[1] - m <= lat <= caja[3] + m):
                malos.append(f"{p.get('familia')}/{p.get('nombre')} en {p.get('comuna')}")
        r.check(
            not malos,
            "D15",
            "infra_puntos: cada punto dentro del bbox de su comuna",
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
        "D16",
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
        cruzados = {(f.get("properties") or {}).get("ID") for f in bb_feats} & set(sin_ids)
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
    por_id = {(f.get("properties") or {}).get("ID"): f for f in bb_feats}
    distintas = [
        (f.get("properties") or {}).get("ID")
        for f in li_feats
        if (b := por_id.get((f.get("properties") or {}).get("ID"))) is None
        or _canon(f.get("properties")) != _canon(b.get("properties"))
        or _canon(f.get("geometry")) != _canon(b.get("geometry"))
    ]
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
    geo = next(n for n, c in man["capas"].items() if c.get("formato") != "pmtiles")
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

    def mancha_fuera_de_su_bbox(p: Path):
        # Basta desplazar una mancha un poco: D14 no tiene margen a proposito,
        # porque bbox_comuna se calcula DE estas mismas manchas y encerrarlas es
        # su unica razon de existir.
        def mover(d):
            g = d["features"][0]["geometry"]
            g["coordinates"] = [[[x + 1.0, y] for x, y in anillo] for anillo in g["coordinates"]]

        _mut_json(p, mover)

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

    def falta_un_feature_si_existe(p: Path):
        if p.exists():
            falta_un_feature(p)

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
        ("D14", "sacar una mancha 1° al este de su comuna", "priorizacion.geojson", mancha_fuera_de_su_bbox),
        ("D15", "leer un punto con el huso vecino: 6° al oeste", "infra_puntos.geojson", punto_con_huso_equivocado),
        ("D16", "volver a fundir 4.10 en 4.1 en la tabla del manifest", "manifest.json", fundir_codigo_general),
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
        original = {p.name: p.read_bytes() for p in espejo.iterdir() if p.is_file()}

        for ident, desc, arch, fn in muts:
            objetivo = espejo / arch
            try:
                fn(objetivo)
                r = Res()
                # La salida de verificar() aqui es ruido: solo interesa que la
                # asercion mutada figure entre las rojas.
                with contextlib.redirect_stdout(io.StringIO()):
                    verificar(espejo, muestra, res=r)
                roja = ident in r.rojos
            finally:
                if objetivo.name in original:
                    objetivo.write_bytes(original[objetivo.name])

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
