"""Manchas de priorizacion territorial -> priorizacion.geojson

El calculo NO vive aqui. Lo hace el modelo de `lab/priorizacion`
(`notebook/priorizacion.py`, 1.955 lineas con malla hexagonal y cruces
espaciales, que necesita geopandas) y entrega el resultado ya cocinado en
`INSUMO_PRIORIZACION/priorizacion_manchas_100ha.geojson`. Este modulo valida ese
insumo, lo reempaqueta y publica sus metadatos en el manifest.

Que es una mancha: hexagonos de 100 ha contiguos de la MISMA clase, disueltos
por comuna y clase. El modelo agrupa por comuna Y clase, nunca solo por clase,
justamente para que el visor pueda filtrar por comuna sin que una mancha quede a
caballo entre dos.

Las dos cifras que hay que entender antes de tocar la simbologia:

- `puntaje_medio` es la media de los hexagonos de la mancha PONDERADA POR AREA,
  en escala ABSOLUTA. El modelo no normaliza contra el lote procesado: un
  hexagono da el mismo puntaje se corran 3 comunas o las 346 del pais. Por eso
  publicar un `puntaje_normalizado` aqui seria un error -- caducaria en cuanto
  entrara una comuna nueva. La normalizacion comunal es una lectura visual y
  vive en el frontend (`src/escalas.js`).
- `clase` sale de cortes FIJOS (0,20 / 0,35 / 0,50 / 0,65), no de cuantiles. El
  modelo tiene quintiles y Jenks implementados y no los usa a proposito: con
  cuantiles, anadir comunas recolocaria a todas las demas.

`puntaje_medio` sin `puntaje_min`/`puntaje_max` al lado enganya: la mancha
COYHAIQU-MUYBAJ-01 tiene medio 0,113 y maximo 0,200 sobre 561.027 ha. Los tres
campos viajan juntos para que la ficha los muestre juntos.
"""

from __future__ import annotations

import json

from cfg import Cfg, log
from geo import bbox_of, bbox_union, en_chile
from gj_io import dominios, humano, write_geojson

ARCHIVO = "priorizacion_manchas_100ha.geojson"

# Los 14 campos que el modelo declara como CAMPOS_MANCHA_WEB. Se listan aqui
# para que un campo nuevo en el insumo no entre al visor sin que nadie lo mire.
CAMPOS = [
    "comuna",
    "mancha_id",
    "clase",
    "puntaje_medio",
    "puntaje_min",
    "puntaje_max",
    "n_hexagonos",
    "area_ha",
    "sub_riesgo",
    "sub_interfaz",
    "sub_infra",
    "sub_preparadas",
    "componente_dominante",
    "n_elementos",
]


def build(cfg: Cfg) -> dict:
    ruta = cfg.insumo_prior / ARCHIVO
    if not ruta.exists():
        raise FileNotFoundError(
            f"Falta {ruta}. Lo produce el modelo de lab/priorizacion; "
            f"este ETL no lo calcula."
        )

    fc = json.loads(ruta.read_text(encoding="utf-8"))
    feats: list[dict] = []
    # bbox por comuna porque el bbox global no sirve para encuadrar: Biobio y
    # Aysen estan a ~1.000 km, asi que el bbox de las tres comunas juntas es
    # medio pais y no encuadra ninguna.
    cajas: dict[str, list] = {}
    ids = set()

    for f in fc["features"]:
        geom, props = f.get("geometry"), f.get("properties", {})
        if geom is None:
            raise ValueError(f"Feature sin geometria: {props.get('mancha_id')}")
        if geom["type"] != "Polygon":
            raise ValueError(
                f"Se esperaba Polygon y llego {geom['type']} en {props.get('mancha_id')}. "
                f"El modelo garantiza Polygon puro con un assert."
            )

        mid = props.get("mancha_id")
        if mid in ids:
            raise ValueError(f"mancha_id duplicado: {mid}. El frontend lo usa como clave.")
        ids.add(mid)

        caja = bbox_of(geom)
        minx, miny, maxx, maxy = caja
        if not (en_chile(minx, miny) and en_chile(maxx, maxy)):
            raise ValueError(f"Mancha fuera de Chile: {mid} bbox={caja}")

        comuna = props.get("comuna")
        cajas[comuna] = bbox_union([cajas.get(comuna), caja])

        feats.append(
            {
                "type": "Feature",
                "geometry": geom,
                # No se usa gj_io.feature(): descarta las props vacias, y aqui un
                # sub_infra de 0.0 es un dato (el 97,8 % de las manchas lo tiene
                # en cero), no un hueco que ahorrar.
                "properties": {c: props[c] for c in CAMPOS if c in props},
            }
        )

    st = write_geojson(cfg.out / "priorizacion.geojson", feats)

    por_comuna = {c: sum(1 for f in feats if f["properties"]["comuna"] == c) for c in cajas}
    detalle = ", ".join(f"{k} {v}" for k, v in sorted(por_comuna.items()))
    log(
        cfg,
        "prioriz",
        f"{len(feats)} manchas en {len(cajas)} comunas ({detalle}) · {humano(st['bytes'])}",
    )

    return {
        "capa": "priorizacion",
        "titulo": "Áreas de priorización",
        "formato": "geojson",
        "geometria": "Polygon",
        "carga": "inmediata",
        "por_comuna": por_comuna,
        "bbox_comuna": {c: [round(v, 5) for v in b] for c, b in sorted(cajas.items())},
        "filtros": ["comuna", "clase"],
        "dominios": dominios(feats, ["comuna", "clase", "componente_dominante"]),
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
