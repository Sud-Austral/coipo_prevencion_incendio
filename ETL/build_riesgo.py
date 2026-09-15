"""Manchas de riesgo de incendio forestal, nacionales -> riesgo/<CUT>.geojson

El calculo NO vive aqui. Lo hace `lab/priorizacion/notebook/manchas_riesgo.py`
(notebook 4) y entrega en `INSUMO_RIESGO/` un GeoJSON por region, el CSV con las
mismas manchas y `parametros.json`. Este modulo valida ese insumo, lo parte por
comuna y publica sus metadatos en el manifest.

Que es una mancha (leido en manchas_riesgo.py el 2026-09-15): las celdas H3 de
resolucion 8 recortadas por comuna ("piezas") se cruzan EXACTAMENTE con la capa
de riesgo (gridcode 0..4, EPSG:32719); `nivel_medio` es la media de nivel
ponderada por superficie con dato, y una mancha es un conjunto conexo de piezas
de la MISMA clase dentro de UNA comuna. Nunca cruza un limite comunal, y por eso
se puede publicar un archivo por comuna sin partir ninguna.

ES OTRO MODELO, NO UNA VERSION DEL ANTERIOR. El de 3 comunas
(priorizacion_manchas_100ha) combinaba riesgo, interfaz, infraestructura y
comunidades preparadas. Este mide solo la amenaza: no hay exposicion. Por eso la
vista se llama «Riesgo» y no «Priorizacion» (DECISIONES.md §S).

Por que un archivo por comuna y no uno nacional: 111.939 manchas y 6,0 M de
vertices. Un GeoJSON nacional pesa ~154 MB (medido): GitHub rechaza archivos de
mas de 100 MB y el canvas de Leaflet no dibuja eso. Por comuna la mediana pesa
~140 KB y la mayor (Natales) ~33 MB, y el visor solo carga la que se elige.

Cuatro trampas del insumo, todas medidas el 2026-09-15:

- La region 12 viene SIMPLIFICADA en `manchas_riesgo_h3r8_12.json` (75 MB) y no
  en el `_12_original.geojson` de 130 MB, que no cabe en el historial de GitHub.
  La simplificacion dejo 1.231 manchas con `geometry: null` (9,24 ha en total,
  ninguna de mas de 0,04 ha). No se inventa su geometria: se descartan y se
  CUENTAN en `fuente.sin_geometria`.
- Una corrida nueva del notebook escribe `_12.geojson` y NO borra el `_12.json`
  viejo. Si conviven los dos para una misma region, esto se niega a elegir.
- 6 manchas son MultiPolygon (make_valid tras redondear), no Polygon.
- El CSV trae 111.943 filas y los GeoJSON 111.939: 4 astillas de 0 ha que el
  notebook descarta al escribir la salida web. Se listan en `fuente`.

Las cifras que hay que entender antes de tocar la simbologia:

- `clase` sale de cortes FIJOS sobre `nivel_medio` (parametros.json), no de
  cuantiles, asi que es comparable entre comunas. Un valor EXACTAMENTE en un
  corte puede venir en cualquiera de las dos clases vecinas (124 manchas; la
  clase se calculo antes de redondear a 3 decimales). Fuera de los cortes no hay
  ni una discrepancia, y eso se exige.
- `pct_alto` es el % de la superficie CON DATO en niveles 3 y 4. No se deduce del
  rango: 72.121 manchas tienen pct_alto > 0 con maximo < 2,5.
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from bisect import bisect_right
from collections import Counter
from pathlib import Path

from cfg import Cfg, log
from geo import REGIONES, bbox_of, bbox_union, canon_region, en_chile
from gj_io import humano, write_geojson

PREFIJO = "manchas_riesgo_h3r8_"
CSV = "manchas_riesgo_h3r8.csv"
PARAMETROS = "parametros.json"
SUBDIR = "riesgo"

# Los 9 campos de CAMPOS_WEB del notebook. Se exige el conjunto EXACTO: el
# constructor anterior copiaba `if c in props` y un campo ausente desaparecia del
# visor sin que nada lo dijera.
CAMPOS = [
    "comuna",
    "mancha_id",
    "clase",
    "nivel_medio",
    "nivel_medio_min",
    "nivel_medio_max",
    "pct_alto",
    "n_hexagonos",
    "area_ha",
]
NUMERICOS = CAMPOS[3:]

# <CUT comunal>-<menor h3_index de la mancha>[-N si la base se repite en la comuna]
RE_ID = re.compile(r"^(\d{5})-[0-9a-f]{15}(-\d+)?$")

# Tolerancia para decidir que un nivel_medio cae EXACTAMENTE en un corte. Viajan
# con 3 decimales, asi que cualquier cosa menor que 5e-4 es el mismo valor.
EN_CORTE = 1e-9


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _archivos_por_region(raiz: Path) -> dict[str, Path]:
    """{'01': ruta, ...}. Exige las 16 regiones y una sola fuente por region."""
    encontrados: dict[str, list[Path]] = {}
    for p in sorted(raiz.iterdir()):
        m = re.fullmatch(PREFIJO + r"(\d{2})\.(geojson|json)", p.name)
        # `_12_original.geojson` no casa con el patron a proposito: es el archivo
        # sin simplificar, que no se versiona.
        if m:
            encontrados.setdefault(m.group(1), []).append(p)
    dobles = {k: [p.name for p in v] for k, v in encontrados.items() if len(v) > 1}
    if dobles:
        raise ValueError(
            f"Mas de una fuente para la misma region: {dobles}. Una corrida nueva del "
            f"notebook escribe .geojson sin borrar el .json simplificado; hay que "
            f"quedarse con uno solo."
        )
    esperadas = {f"{i:02d}" for i in range(1, 17)}
    faltan = sorted(esperadas - set(encontrados))
    sobran = sorted(set(encontrados) - esperadas)
    if faltan or sobran:
        raise ValueError(f"Regiones del insumo: faltan {faltan}, sobran {sobran}")
    return {k: v[0] for k, v in sorted(encontrados.items())}


def _leer_csv(ruta: Path) -> dict[str, dict]:
    """Filas del CSV por mancha_id. Es la fuente de la region y del conteo total."""
    filas: dict[str, dict] = {}
    with open(ruta, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            mid = row["mancha_id"]
            if mid in filas:
                raise ValueError(f"{CSV}: mancha_id duplicado {mid}")
            filas[mid] = row
    return filas


def _clase_de(nivel: float, cortes: list[float], etiquetas: list[str]) -> str:
    """La misma regla que el notebook: searchsorted(cortes, side='right')."""
    return etiquetas[bisect_right(cortes, nivel)]


def _coherente(props: dict, cortes: list[float], etiquetas: list[str]) -> bool:
    """Clase coherente con nivel_medio. En un corte exacto vale cualquiera de las dos."""
    v = props["nivel_medio"]
    for i, c in enumerate(cortes):
        if abs(v - c) < EN_CORTE:
            return props["clase"] in (etiquetas[i], etiquetas[i + 1])
    return props["clase"] == _clase_de(v, cortes, etiquetas)


def _problemas_de(props: dict, cortes, etiquetas) -> list[str]:
    """Rangos por definicion del modelo (manchas_riesgo.py), no por lo que traen los datos."""
    p = []
    if set(props) != set(CAMPOS):
        p.append(f"campos {sorted(props)} != {sorted(CAMPOS)}")
        return p
    for c in NUMERICOS:
        if not isinstance(props[c], (int, float)) or isinstance(props[c], bool):
            p.append(f"{c} no numerico: {props[c]!r}")
    if p:
        return p
    if not 0 <= props["nivel_medio_min"] <= props["nivel_medio"] <= props["nivel_medio_max"] <= 4:
        p.append("no cumple 0 <= min <= medio <= max <= 4")
    if not 0 <= props["pct_alto"] <= 100:
        p.append(f"pct_alto {props['pct_alto']} fuera de 0..100")
    if props["area_ha"] < 0:
        p.append(f"area_ha negativa {props['area_ha']}")
    if not isinstance(props["n_hexagonos"], int) or props["n_hexagonos"] < 1:
        p.append(f"n_hexagonos {props['n_hexagonos']!r}")
    if props["clase"] not in etiquetas:
        p.append(f"clase {props['clase']!r} no esta en parametros.json")
    elif not _coherente(props, cortes, etiquetas):
        p.append(f"clase {props['clase']!r} no corresponde a nivel_medio {props['nivel_medio']}")
    return p


def _caja_hacia_afuera(caja: list[float]) -> list[float]:
    """bbox a 5 decimales redondeado HACIA AFUERA.

    Con round() el borde puede caer DENTRO de la mancha: las coordenadas viajan
    con 6 decimales y D14 exige que cada mancha quepa en la caja de su comuna sin
    margen. Medido con el redondeo simple: 436 manchas en 277 comunas se salian.
    """
    import math

    f = 1e5
    return [
        math.floor(caja[0] * f) / f,
        math.floor(caja[1] * f) / f,
        math.ceil(caja[2] * f) / f,
        math.ceil(caja[3] * f) / f,
    ]


def build(cfg: Cfg) -> dict:
    raiz = cfg.insumo_riesgo
    if not raiz.exists():
        raise FileNotFoundError(
            f"Falta {raiz}. Lo produce lab/priorizacion (notebook 4); este ETL no lo calcula."
        )

    params = json.loads((raiz / PARAMETROS).read_text(encoding="utf-8"))
    cortes = [float(c) for c in params["cortes"]]
    etiquetas = [params["etiquetas"][str(i)] for i in range(len(cortes) + 1)]
    filas_csv = _leer_csv(raiz / CSV)
    por_region = _archivos_por_region(raiz)

    # Region por codigo, SACADA DEL CSV y no de una tabla escrita aqui. Y cada
    # nombre tiene que canonizar a una de las 16 regiones del visor (D11).
    region_de: dict[str, str] = {}
    for row in filas_csv.values():
        nombre = canon_region(row["region"])
        previa = region_de.setdefault(row["cod_region"], nombre)
        if previa != nombre:
            raise ValueError(f"cod_region {row['cod_region']} con dos nombres: {previa} / {nombre}")
    ajenas = {k: v for k, v in region_de.items() if v not in REGIONES}
    if ajenas:
        raise ValueError(f"Regiones que no canonizan a las 16 del visor: {ajenas}")

    salida = cfg.out / SUBDIR
    salida.mkdir(parents=True, exist_ok=True)

    partes: dict[str, dict] = {}
    vistos: set[str] = set()
    sin_geom = Counter()
    sin_geom_ha = 0.0
    total_feats = total_vertices = total_bytes = 0
    cajas_todas = []
    clases_n = Counter()
    en_corte = 0
    multi = 0

    for nn, ruta in por_region.items():
        fc = json.loads(ruta.read_text(encoding="utf-8"))
        por_comuna: dict[str, list[dict]] = {}
        nombres: dict[str, str] = {}

        for f in fc["features"]:
            props = f.get("properties") or {}
            mid = props.get("mancha_id")
            m = RE_ID.match(str(mid))
            if not m:
                raise ValueError(f"{ruta.name}: mancha_id con formato inesperado {mid!r}")
            cut = m.group(1)
            if cut[:2] != nn:
                raise ValueError(f"{ruta.name}: {mid} es de la region {cut[:2]}, no de la {nn}")
            if mid in vistos:
                raise ValueError(f"mancha_id duplicado entre regiones: {mid}")
            vistos.add(mid)

            problemas = _problemas_de(props, cortes, etiquetas)
            if problemas:
                raise ValueError(f"{ruta.name}: {mid}: {'; '.join(problemas)}")

            # El CSV es la otra salida del MISMO notebook: tienen que decir lo
            # mismo de cada mancha. Si divergen, alguien regenero una y no la otra.
            row = filas_csv.get(mid)
            if row is None:
                raise ValueError(f"{ruta.name}: {mid} no esta en {CSV}")
            distintos = [
                c for c in CAMPOS
                if (float(row[c]) != float(props[c]) if c in NUMERICOS else row[c] != props[c])
            ]
            if row["cod_comuna"] != cut:
                distintos.append(f"cod_comuna {row['cod_comuna']}")
            if distintos:
                raise ValueError(f"{mid}: el GeoJSON y el CSV difieren en {distintos}")

            previo = nombres.setdefault(cut, props["comuna"])
            if previo != props["comuna"]:
                raise ValueError(f"CUT {cut} con dos nombres: {previo!r} y {props['comuna']!r}")

            geom = f.get("geometry")
            if geom is None:
                sin_geom[nn] += 1
                sin_geom_ha += props["area_ha"]
                continue
            if geom.get("type") not in ("Polygon", "MultiPolygon"):
                raise ValueError(f"{mid}: geometria {geom.get('type')}")
            multi += geom["type"] == "MultiPolygon"
            caja = bbox_of(geom)
            if not (en_chile(caja[0], caja[1]) and en_chile(caja[2], caja[3])):
                raise ValueError(f"Mancha fuera de Chile: {mid} bbox={caja}")

            en_corte += any(abs(props["nivel_medio"] - c) < EN_CORTE for c in cortes)
            clases_n[props["clase"]] += 1
            por_comuna.setdefault(cut, []).append(
                {
                    "type": "Feature",
                    "geometry": geom,
                    # En el orden de CAMPOS, sin gj_io.feature(): ese descarta los
                    # valores vacios, y aqui un pct_alto de 0 es un dato.
                    "properties": {c: props[c] for c in CAMPOS},
                }
            )

        del fc
        for cut, feats in sorted(por_comuna.items()):
            caja = _caja_hacia_afuera(bbox_union([bbox_of(x["geometry"]) for x in feats]))
            st = write_geojson(salida / f"{cut}.geojson", feats, bbox=caja)
            partes[cut] = {
                "comuna": nombres[cut],
                "region": region_de[nn],
                "archivo": f"{SUBDIR}/{cut}.geojson",
                "features": st["features"],
                "vertices": st["vertices"],
                "bytes": st["bytes"],
                "bbox": caja,
                "clases": dict(Counter(x["properties"]["clase"] for x in feats)),
            }
            total_feats += st["features"]
            total_vertices += st["vertices"]
            total_bytes += st["bytes"]
            cajas_todas.append(caja)

    # Un archivo de una comuna que ya no viene en el insumo quedaria publicado sin
    # que el manifest lo declare. Se borran SOLO los <CUT>.geojson de riesgo/.
    for p in salida.glob("*.geojson"):
        if re.fullmatch(r"\d{5}\.geojson", p.name) and p.stem not in partes:
            p.unlink()

    colapsadas = sorted(set(filas_csv) - vistos)

    # Alias de nombre para los enlaces ya publicados con ?comuna=: el modelo
    # anterior y la infraestructura escriben «Coyhaique» y «Mulchen», y este
    # «Coihaique» y «Mulchén». Salen del propio build_infra_puntos, no de aqui.
    from build_infra_puntos import COMUNAS as COMUNAS_INFRA

    for nombre_infra, cut in COMUNAS_INFRA.values():
        if cut not in partes:
            raise ValueError(f"La infraestructura declara el CUT {cut} ({nombre_infra}) y no hay manchas")
        if nombre_infra != partes[cut]["comuna"]:
            partes[cut]["alias"] = [nombre_infra]

    # Regiones de norte a sur, en el orden del visor, con sus comunas por nombre.
    regiones = []
    for reg in REGIONES:
        cuts = [c for c, p in partes.items() if p["region"] == reg]
        cuts.sort(key=lambda c: _sin_tildes(partes[c]["comuna"]).lower())
        if cuts:
            regiones.append({"region": reg, "comunas": cuts})

    log(
        cfg,
        "riesgo",
        f"{total_feats} manchas en {len(partes)} comunas de {len(regiones)} regiones · "
        f"{sum(sin_geom.values())} sin geometria · {len(colapsadas)} solo en el CSV · "
        f"{multi} MultiPolygon · {humano(total_bytes)}",
    )

    return {
        "capa": "riesgo",
        "titulo": "Riesgo de incendio forestal",
        "formato": "geojson",
        "particion": "comuna",
        "geometria": "Polygon",
        "carga": "por_comuna",
        "partes": dict(sorted(partes.items())),
        "regiones": regiones,
        "clases": [
            {
                "nivel": i,
                "clase": etq,
                "desde": None if i == 0 else cortes[i - 1],
                "hasta": None if i == len(cortes) else cortes[i],
            }
            for i, etq in enumerate(etiquetas)
        ],
        "dominios": {
            "clase": [{"v": v, "n": clases_n[v]} for v in etiquetas],
            "region": [
                {"v": r["region"], "n": sum(partes[c]["features"] for c in r["comunas"])}
                for r in regiones
            ],
        },
        "fuente": {
            "modelo": "lab/priorizacion notebook 4 (manchas_riesgo.py)",
            "manchas_modelo": params.get("manchas"),
            "filas_csv": len(filas_csv),
            "leidas": len(vistos),
            "sin_geometria": {
                "n": sum(sin_geom.values()),
                "area_ha": round(sin_geom_ha, 2),
                "por_region": {region_de[k]: v for k, v in sorted(sin_geom.items())},
            },
            "solo_en_csv": colapsadas,
            "en_corte": en_corte,
            "multipoligonos": multi,
        },
        "features": total_feats,
        "vertices": total_vertices,
        "bytes": total_bytes,
        "bbox": bbox_union(cajas_todas),
    }


if __name__ == "__main__":
    import sys

    salida_manual = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    res = build(Cfg(verbose=True, **({"out": salida_manual} if salida_manual else {})))
    print(json.dumps({k: v for k, v in res.items() if k != "partes"}, ensure_ascii=False, indent=1)[:3000])
