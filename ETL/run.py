"""Punto de entrada UNICO del ETL.

    python ETL/run.py

Corre las 6 capas EN PARALELO, escribe manifest.json y valida el resultado.
Todo lo demas son opciones.

Por que procesos y no hilos: el trabajo es CPU-bound (shapely, pyproj, json), el
GIL anularia cualquier ganancia con hilos. Ademas cada capa en su propio proceso
hace que los ~2 GB que necesita redvial se devuelvan al sistema al terminar, en
vez de quedarse en el interprete.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import importlib
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cfg import RAIZ, Cfg  # noqa: E402
from gj_io import humano, write_json  # noqa: E402

# (nombre, modulo, peso estimado en segundos, usa mucha RAM)
# Se despachan de MAYOR a MENOR peso (longest-job-first): las dos capas largas
# arrancan de inmediato y las cortas rellenan los huecos.
TAREAS = [
    ("redvial", "build_redvial", 180, True),    # 87 MiB de JSON -> ~2 GB de RAM
    ("rutas", "build_rutas", 150, False),       # 3,8 M de vertices en 15 shapefiles
    ("incendios", "build_incendios", 40, False),
    ("oecv", "build_oecv", 25, False),
    ("verificado", "build_verificado", 15, False),
    ("puntos", "build_puntos", 10, False),
    ("kpis", "build_kpis", 5, False),
]

CLAVE_MANIFEST = {
    "incendios": "incendios",
    "oecv": "oecv",
    "verificado": "oecv_verificado",
    "puntos": "puntos_standby",
    "rutas": "rutas",
    "redvial": "redvial",
}


def _ejecutar(nombre: str, modulo: str, cfg: Cfg) -> dict:
    """Corre una capa. Se ejecuta dentro del worker."""
    t0 = time.time()
    try:
        mod = importlib.import_module(modulo)
        res = mod.build(cfg)
        res["segundos"] = round(time.time() - t0, 1)
        return res
    except Exception:
        # El traceback del worker se pierde al cruzar el proceso: se serializa.
        return {"capa": nombre, "_error": traceback.format_exc()}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="ETL de insumos CONAF -> GeoJSON + PMTiles para el visor web."
    )
    ap.add_argument("--insumo", type=Path, default=RAIZ / "INSUMO_INCENDIO")
    ap.add_argument("--out", type=Path, default=RAIZ / "frontend" / "public" / "data")
    ap.add_argument(
        "--layers", default="all", help="all | incendios,oecv,verificado,puntos,rutas,redvial,kpis"
    )
    ap.add_argument("--jobs", type=int, default=0, help="0 = automatico")
    ap.add_argument("--secuencial", action="store_true", help="equivale a --jobs 1")
    ap.add_argument("--no-tiles", action="store_true", help="fuerza GeoJSON en las capas viales")
    ap.add_argument("--simplify", type=float, default=25.0)
    ap.add_argument("--oecv-simplify", type=float, default=10.0)
    ap.add_argument("--precision", type=int, default=5)
    ap.add_argument("--sin-verify", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    cfg = Cfg(
        insumo=args.insumo,
        out=args.out,
        simplify=args.simplify,
        oecv_simplify=args.oecv_simplify,
        precision=args.precision,
        no_tiles=args.no_tiles,
        verbose=args.verbose,
    )

    pedidas = (
        [n for n, *_ in TAREAS]
        if args.layers == "all"
        else [s.strip() for s in args.layers.split(",") if s.strip()]
    )
    tareas = [t for t in TAREAS if t[0] in pedidas]
    if not tareas:
        print(f"ninguna capa coincide con {args.layers!r}", file=sys.stderr)
        return 2

    jobs = 1 if args.secuencial else (args.jobs or min(4, max(1, (os.cpu_count() or 2) - 1)))

    from tiles import version_tippecanoe

    tv = version_tippecanoe()
    print(
        f"▶ {len(tareas)} capas · {jobs} proceso(s) · out={cfg.out} · "
        f"tippecanoe={tv or 'no disponible (modo degradado)'}",
        flush=True,
    )
    # El aviso dejo de ser informativo el dia que frontend/public/data/ paso a
    # estar versionado: sin tippecanoe esta corrida escribe rutas.geojson y
    # redvial.geojson en lugar de los .pmtiles y lo anota en el manifest, asi que
    # commitearla cambia el formato publicado y el componente con el que el visor
    # dibuja las capas viales.
    if not tv:
        for linea in (
            "  ⚠ sin tippecanoe: rutas y redvial saldran como GeoJSON simplificado.",
            "    NO COMMITEES esta salida: frontend/public/data/ esta versionado y lo",
            "    produce GitHub Actions. Para trabajar en local, `npm run datos`.",
        ):
            print(linea, file=sys.stderr, flush=True)

    t0 = time.time()
    resultados: dict[str, dict] = {}

    if jobs == 1:
        for nombre, modulo, _, _ in tareas:
            resultados[nombre] = _ejecutar(nombre, modulo, cfg)
    else:
        # Las tareas que usan mucha RAM se lanzan primero y de a una, para no
        # tener dos procesos de ~2 GB simultaneos.
        pesadas = [t for t in tareas if t[3]]
        livianas = [t for t in tareas if not t[3]]
        with cf.ProcessPoolExecutor(max_workers=jobs) as pool:
            futuros = {}
            for nombre, modulo, _, _ in pesadas + livianas:
                futuros[pool.submit(_ejecutar, nombre, modulo, cfg)] = nombre
            for fut in cf.as_completed(futuros):
                nombre = futuros[fut]
                resultados[nombre] = fut.result()

    fallos = []
    for nombre, res in resultados.items():
        if "_error" in res:
            fallos.append(nombre)
            print(f"\n[{nombre}] FALLO:\n{res['_error']}", file=sys.stderr)

    if fallos:
        print(f"\n✘ fallaron {len(fallos)} capas: {', '.join(fallos)}", file=sys.stderr)
        return 1

    # --- manifest.json: el contrato con el frontend ---
    capas = {}
    for nombre, res in resultados.items():
        if nombre == "kpis":
            continue
        clave = CLAVE_MANIFEST.get(nombre, nombre)
        capas[clave] = {k: v for k, v in res.items() if not k.startswith("_") and k != "capa"}

    manifest = {
        "generado": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "simplify_m": cfg.simplify,
        "precision": cfg.precision,
        "tippecanoe": tv,
        "capas": capas,
    }
    if "kpis" in resultados:
        manifest["kpis"] = "kpis.json"
    write_json(cfg.out / "manifest.json", manifest)

    total = sum(
        r.get("bytes", 0) for n, r in resultados.items() if n != "kpis"
    )
    secuencial = sum(r.get("segundos", 0) for r in resultados.values())
    real = time.time() - t0
    print(
        f"manifest.json ✔ · TOTAL {humano(total)} · "
        f"secuencial {secuencial:.0f} s → real {real:.0f} s",
        flush=True,
    )

    if args.sin_verify:
        return 0

    import verify

    return 0 if verify.verificar(cfg.out, muestra=500) else 1


if __name__ == "__main__":
    # En Windows el arranque de procesos es 'spawn': sin este guard el pool
    # se re-importa a si mismo en bucle.
    raise SystemExit(main())
