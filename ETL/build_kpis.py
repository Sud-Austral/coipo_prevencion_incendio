"""Indicadores agregados -> kpis.json

Fuente: 'OECV 2025 - 2026/OECV 2025-2026.xlsx'. Son tablas ya agregadas por
region, sin coordenadas: alimentan el panel de resumen, no el mapa.

Las dos hojas utiles tienen la cabecera desplazada varias filas (llevan un
titulo y filas en blanco arriba), asi que se localiza buscando la fila que
contiene 'Región', en vez de fijar un numero de fila que se rompe al primer
retoque del Excel.
"""

from __future__ import annotations

import pandas as pd

from cfg import Cfg, log
from geo import canon_region
from gj_io import write_json

XLSX = "OECV 2025 - 2026/OECV 2025-2026.xlsx"
H_PLAN = "Total Planificado (no modificar"
H_AVANCE = "Matriz de avance (modificable)"


def _fila_cabecera(ruta, hoja: str, marca: str = "región") -> int:
    """Devuelve el indice de la fila que contiene la cabecera."""
    crudo = pd.read_excel(ruta, sheet_name=hoja, header=None, nrows=15)
    for i in range(len(crudo)):
        for v in crudo.iloc[i].tolist():
            if isinstance(v, str) and v.strip().lower() == marca:
                return i
    raise ValueError(f"no se encontro la cabecera en la hoja {hoja!r}")


def _num(v) -> float | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build(cfg: Cfg) -> dict:
    ruta = cfg.insumo / XLSX

    # --- Planificado por region e institucion ---
    plan = pd.read_excel(ruta, sheet_name=H_PLAN, header=_fila_cabecera(ruta, H_PLAN) + 1)
    col_reg = plan.columns[0]
    instituciones = [c for c in plan.columns[1:] if not str(c).startswith("Unnamed")]

    por_region: dict[str, dict] = {}
    total_plan = None
    for _, r in plan.iterrows():
        etiqueta = r[col_reg]
        if not isinstance(etiqueta, str) or not etiqueta.strip():
            continue
        if etiqueta.strip().lower() == "total":
            total_plan = _num(r.get("Planificado"))
            continue
        por_region[canon_region(etiqueta)] = {
            k: _num(r.get(k)) for k in instituciones if _num(r.get(k)) is not None
        }

    # --- Reportado por region ---
    av = pd.read_excel(ruta, sheet_name=H_AVANCE, header=_fila_cabecera(ruta, H_AVANCE))
    col_reg_av = next(c for c in av.columns if str(c).strip().lower() == "región")
    col_rep = next((c for c in av.columns if "total reportado" in str(c).lower()), None)

    total_rep = 0.0
    for _, r in av.iterrows():
        etiqueta = r[col_reg_av]
        if not isinstance(etiqueta, str) or not etiqueta.strip():
            continue
        reg = canon_region(etiqueta)
        rep = _num(r.get(col_rep)) if col_rep else None
        if reg in por_region and rep is not None:
            por_region[reg]["reportado"] = rep
            total_rep += rep

    avance = 100.0 * total_rep / total_plan if total_plan else 0.0

    kpis = {
        "oecv": {
            "km_planificados": round(total_plan, 3) if total_plan else None,
            "km_reportados": round(total_rep, 3),
            "avance_pct": round(avance, 1),
            "por_region": {k: v for k, v in sorted(por_region.items())},
        }
    }
    write_json(cfg.out / "kpis.json", kpis)

    log(
        cfg,
        "kpis",
        f"{total_plan:.3f} km planificados / {total_rep:.3f} reportados = {avance:.1f} % de avance",
    )
    return {"capa": "kpis", "archivo": "kpis.json", **kpis["oecv"]}


if __name__ == "__main__":
    build(Cfg(verbose=True))
