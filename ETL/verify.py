"""Validacion empirica de los datos generados.

No comprueba que el codigo se ejecuto, comprueba que el RESULTADO sirve: que los
archivos parsean, que las cifras cuadran con el manifest, que nada quedo fuera de
Chile y que los incendios caen sobre la red vial y no en el mar.

Lo llama run.py al final. Tambien corre suelto:

    python ETL/verify.py --data frontend/public/data --muestra 500
    python ETL/verify.py --negativas

Las aserciones van numeradas D1..D13 para poder referirse a una sola. Ese numero
es lo que exige --negativas: cada mutacion reintroduce un defecto concreto y
comprueba que se ponga roja LA asercion que lo vigila, no cualquier otra. Una
asercion que no se ha visto roja no esta probando nada.
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

    print("\n── verificación ─────────────────────────────────────────────")

    lineas_para_cruce = []

    for nombre, meta in capas.items():
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
