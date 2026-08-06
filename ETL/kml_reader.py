"""Lector de KML y KMZ con la stdlib (zipfile + xml.etree).

Necesario porque los puntos stand-by de Valparaiso (108 placemarks) solo
existen como KMZ: no hay shapefile equivalente para esa region.

Las coordenadas KML son SIEMPRE lon,lat[,alt] en WGS84 -> EPSG:4326, sin
reproyeccion.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def _sin_ns(tag: str) -> str:
    """'{http://www.opengis.net/kml/2.2}Placemark' -> 'Placemark'."""
    return tag.rsplit("}", 1)[-1]


def _coords(texto: str) -> list[list[float]]:
    """Parsea un bloque <coordinates>: 'lon,lat,alt lon,lat,alt ...' -> [[lon,lat],...]."""
    pts = []
    for tok in re.split(r"\s+", texto.strip()):
        if not tok:
            continue
        partes = tok.split(",")
        if len(partes) >= 2:
            try:
                pts.append([float(partes[0]), float(partes[1])])
            except ValueError:
                continue
    return pts


def _geom_de(el) -> dict | None:
    """Extrae la geometria de un elemento Placemark (o de un MultiGeometry)."""
    geoms = []
    for hijo in el.iter():
        t = _sin_ns(hijo.tag)
        if t == "Point":
            c = hijo.find(".//{*}coordinates")
            if c is not None and c.text:
                pts = _coords(c.text)
                if pts:
                    geoms.append({"type": "Point", "coordinates": pts[0]})
        elif t == "LineString":
            c = hijo.find(".//{*}coordinates")
            if c is not None and c.text:
                pts = _coords(c.text)
                if len(pts) >= 2:
                    geoms.append({"type": "LineString", "coordinates": pts})
        elif t == "Polygon":
            anillos = []
            for c in hijo.findall(".//{*}coordinates"):
                if c.text:
                    pts = _coords(c.text)
                    if len(pts) >= 4:
                        anillos.append(pts)
            if anillos:
                geoms.append({"type": "Polygon", "coordinates": anillos})

    if not geoms:
        return None
    if len(geoms) == 1:
        return geoms[0]

    # MultiGeometry homogenea -> Multi*; heterogenea -> se queda con la primera.
    tipos = {g["type"] for g in geoms}
    if tipos == {"Point"}:
        return {"type": "MultiPoint", "coordinates": [g["coordinates"] for g in geoms]}
    if tipos == {"LineString"}:
        return {"type": "MultiLineString", "coordinates": [g["coordinates"] for g in geoms]}
    if tipos == {"Polygon"}:
        return {"type": "MultiPolygon", "coordinates": [g["coordinates"] for g in geoms]}
    return geoms[0]


def read_kml_bytes(data: bytes) -> list[dict]:
    """Parsea KML crudo -> [{'name','description','styleUrl','folders','geometry'}].

    'folders' es la pila de <Folder><name> ancestros, que en los KMZ de OECV
    codifica la jerarquia Region/Institucion/Titularidad.
    """
    raiz = ET.fromstring(data)
    salida: list[dict] = []

    def _recorrer(el, folders: list[str]):
        for hijo in el:
            t = _sin_ns(hijo.tag)
            if t == "Folder" or t == "Document":
                n = hijo.find("{*}name")
                nuevo = folders + ([n.text.strip()] if n is not None and n.text else [])
                _recorrer(hijo, nuevo)
            elif t == "Placemark":
                geom = _geom_de(hijo)
                if geom is None:
                    continue
                nombre = hijo.find("{*}name")
                desc = hijo.find("{*}description")
                style = hijo.find("{*}styleUrl")
                salida.append(
                    {
                        "name": nombre.text.strip() if nombre is not None and nombre.text else None,
                        "description": desc.text.strip() if desc is not None and desc.text else None,
                        "styleUrl": style.text.strip() if style is not None and style.text else None,
                        "folders": folders,
                        "geometry": geom,
                    }
                )
            else:
                _recorrer(hijo, folders)

    _recorrer(raiz, [])
    return salida


def read_kml(path: str | Path) -> list[dict]:
    return read_kml_bytes(Path(path).read_bytes())


def read_kmz(path: str | Path) -> list[dict]:
    """Abre un KMZ (zip) y parsea el primer .kml que contenga."""
    with zipfile.ZipFile(path) as z:
        nombres = [n for n in z.namelist() if n.lower().endswith(".kml")]
        if not nombres:
            raise ValueError(f"{path} no contiene ningun .kml")
        # doc.kml es el nombre canonico; si hay varios, ese manda.
        elegido = next((n for n in nombres if n.lower().endswith("doc.kml")), nombres[0])
        return read_kml_bytes(z.read(elegido))


def read_kml_o_kmz(path: str | Path) -> list[dict]:
    p = Path(path)
    return read_kmz(p) if p.suffix.lower() == ".kmz" else read_kml(p)


if __name__ == "__main__":
    import sys

    for arg in sys.argv[1:]:
        pms = read_kml_o_kmz(arg)
        print(f"{Path(arg).name}: {len(pms)} placemarks")
        for pm in pms[:3]:
            print(f"   {pm['name']!r} · {pm['geometry']['type']} · folders={pm['folders']}")
