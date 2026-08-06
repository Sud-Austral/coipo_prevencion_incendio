"""Validacion empirica de los datos generados.

No comprueba que el codigo se ejecuto, comprueba que el RESULTADO sirve: que los
archivos parsean, que las cifras cuadran con el manifest, que nada quedo fuera de
Chile y que los incendios caen sobre la red vial y no en el mar.

Lo llama run.py al final. Tambien corre suelto:

    python ETL/verify.py --data frontend/public/data --muestra 500
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

BUILD = Path(__file__).resolve().parent / "_build"

CHILE = (-76.0, -56.0, -66.0, -17.0)  # minlon, minlat, maxlon, maxlat

# Capas de red vial. Son la unica referencia valida del cruce espacial: los
# incendios ocurren junto a caminos. OECV queda fuera a proposito.
CAPAS_VIALES = ("rutas", "redvial")

OK = "✔"
NO = "✘"


class Res:
    def __init__(self):
        self.fallos = 0

    def check(self, cond: bool, titulo: str, detalle: str = "") -> bool:
        if not cond:
            self.fallos += 1
        print(f"  {OK if cond else NO} {titulo}" + (f" — {detalle}" if detalle else ""), flush=True)
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


def verificar(data: Path, muestra: int = 500) -> bool:
    data = Path(data)
    r = Res()
    man_path = data / "manifest.json"
    if not man_path.exists():
        print(f"  {NO} falta {man_path}")
        return False
    manifest = json.loads(man_path.read_text(encoding="utf-8"))
    capas = manifest["capas"]

    print("\n── verificación ─────────────────────────────────────────────")

    lineas_para_cruce = []

    for nombre, meta in capas.items():
        archivo = data / meta["archivo"]
        if not r.check(archivo.exists(), f"{nombre}: existe {meta['archivo']}"):
            continue

        if meta.get("formato") == "pmtiles":
            h = _leer_header_pmtiles(archivo)
            r.check(h is not None, f"{nombre}: PMTiles valido")
            if h:
                r.check(
                    h["minzoom"] == meta["minzoom"] and h["maxzoom"] == meta["maxzoom"],
                    f"{nombre}: zooms z{h['minzoom']}-{h['maxzoom']}",
                )
                b = h["bbox"]
                r.check(
                    CHILE[0] <= b[0] and b[2] <= CHILE[2] and CHILE[1] <= b[1] and b[3] <= CHILE[3],
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
        r.check(gj.get("type") == "FeatureCollection", f"{nombre}: FeatureCollection")
        n = len(gj["features"])
        r.check(
            n == meta["features"],
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

        r.check(malas == 0, f"{nombre}: sin NaN/Infinity", f"{malas} malas" if malas else "")
        r.check(vacias == 0, f"{nombre}: sin geometrías vacías", f"{vacias}" if vacias else "")
        r.check(fuera == 0, f"{nombre}: todas dentro de Chile", f"{fuera} fuera" if fuera else "")

        campos_esperados = set(meta.get("filtros", []))
        presentes = set()
        for f in gj["features"][:200]:
            presentes |= set(f["properties"].keys())
        faltan = campos_esperados - presentes
        r.check(not faltan, f"{nombre}: campos de filtro presentes", f"faltan {faltan}" if faltan else "")

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
        "regiones canonizadas en todas las capas",
        "; ".join(f"{k}: {v}" for k, v in intrusos.items()) if intrusos else "",
    )

    # --- cruce espacial: los incendios deben caer sobre la red vial ---
    inc = data / "incendios.geojson"
    if inc.exists() and lineas_para_cruce:
        _cruce_espacial(r, inc, lineas_para_cruce, muestra)
    elif inc.exists():
        print("  · cruce espacial omitido: no hay geometría vial disponible")

    print("─────────────────────────────────────────────────────────────")
    print(f"{OK if r.fallos == 0 else NO} {'todo correcto' if r.fallos == 0 else f'{r.fallos} comprobaciones fallidas'}\n")
    return r.fallos == 0


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
    pts = [f["geometry"]["coordinates"] for f in gj["features"] if f.get("geometry")]
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
        f"a menos de 25 km del camino más cercano: {bajo25}/{n} ({100.0 * bajo25 / n:.1f} %)",
    )
    r.check(mediana < 1.5, f"mediana {mediana:.2f} km < 1,5 km")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent.parent / "frontend" / "public" / "data")
    ap.add_argument("--muestra", type=int, default=500)
    a = ap.parse_args()
    return 0 if verificar(a.data, a.muestra) else 1


if __name__ == "__main__":
    raise SystemExit(main())
