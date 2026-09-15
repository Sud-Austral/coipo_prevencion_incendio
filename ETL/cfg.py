"""Configuracion compartida entre run.py y los modulos build_*.

Se separa en su propio modulo para que cada build_*.py se pueda ejecutar suelto
durante el desarrollo sin importar run.py (y sin ciclos de import).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

# La consola de Windows es cp1252 y todo el ETL imprime '▶', '✔', '⚠' y '✘'. Sin
# esto `python ETL/run.py` muere con UnicodeEncodeError en su PRIMER print, antes
# de leer un solo insumo. Medido el 2026-09-10: reventaba en la linea de cabecera
# de run.py y en la de verify.py. Va aqui porque cfg lo importa todo el ETL,
# incluidos los procesos hijo (spawn vuelve a importar el modulo).
#
# stderr TAMBIEN: el aviso de "sin tippecanoe" -el mas importante que emite el
# ETL, el que dice que no se commitee la salida- va por ahi, y sin reconfigurar
# salia como el literal '⚠' en vez del simbolo.
for _flujo in (sys.stdout, sys.stderr):
    if hasattr(_flujo, "reconfigure"):
        _flujo.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent


@dataclass
class Cfg:
    insumo: Path = RAIZ / "INSUMO_INCENDIO"
    # Raices de insumos separadas de la primera a proposito: son otros origenes y
    # apuntar --insumo alla romperia las seis capas que salen de INSUMO_INCENDIO.
    # INSUMO_PRIORIZACION guarda hoy solo la infraestructura critica de las 3
    # comunas del modelo anterior; las manchas de riesgo nacionales viven en
    # INSUMO_RIESGO (salida del notebook 4 de lab/priorizacion).
    insumo_prior: Path = RAIZ / "INSUMO_PRIORIZACION"
    insumo_riesgo: Path = RAIZ / "INSUMO_RIESGO"
    out: Path = RAIZ / "frontend" / "public" / "data"
    build: Path = RAIZ / "ETL" / "_build"
    simplify: float = 25.0          # tolerancia DP para las capas viales (modo degradado)
    oecv_simplify: float = 10.0     # las fajas OECV son cortas; 25 m les come la forma
    overview_simplify: float = 150.0
    precision: int = 5              # decimales; 5 ~ 1,1 m
    tiles_precision: int = 6        # tippecanoe simplifica luego, conviene darle mas detalle
    no_tiles: bool = False
    verbose: bool = False

    def __post_init__(self):
        self.insumo = Path(self.insumo)
        self.insumo_prior = Path(self.insumo_prior)
        self.insumo_riesgo = Path(self.insumo_riesgo)
        self.out = Path(self.out)
        self.build = Path(self.build)
        self.out.mkdir(parents=True, exist_ok=True)
        self.build.mkdir(parents=True, exist_ok=True)


def log(cfg: Cfg, capa: str, msg: str) -> None:
    """Log con prefijo de capa, para que la salida en paralelo sea legible."""
    print(f"[{capa:<9}] {msg}", flush=True)
