"""Configuracion compartida entre run.py y los modulos build_*.

Se separa en su propio modulo para que cada build_*.py se pueda ejecutar suelto
durante el desarrollo sin importar run.py (y sin ciclos de import).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


@dataclass
class Cfg:
    insumo: Path = RAIZ / "INSUMO_INCENDIO"
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
        self.out = Path(self.out)
        self.build = Path(self.build)
        self.out.mkdir(parents=True, exist_ok=True)
        self.build.mkdir(parents=True, exist_ok=True)


def log(cfg: Cfg, capa: str, msg: str) -> None:
    """Log con prefijo de capa, para que la salida en paralelo sea legible."""
    print(f"[{capa:<9}] {msg}", flush=True)
