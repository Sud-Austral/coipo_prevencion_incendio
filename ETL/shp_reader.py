"""Lector de shapefiles (.shp/.dbf/.prj/.cpg) en Python puro.

Existe porque en la maquina de desarrollo (Windows) no hay GDAL, geopandas,
pyshp ni fiona, y el ETL tiene que correr igual ahi que en el runner de Actions.
Solo usa la stdlib (`struct`, `pathlib`).

Especificacion implementada: ESRI Shapefile Technical Description (julio 1998)
y dBASE III/IV para el .dbf.

Regla de oro: NUNCA adivinar el CRS. Si no se puede determinar el EPSG desde el
.prj y no se paso uno explicito, se lanza ValueError. Un fallo ruidoso cuesta
minutos; un CRS mal asumido desplaza la geometria cientos de kilometros y se
descubre semanas despues.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

# Codigos de tipo de shape segun la especificacion ESRI.
SHAPE_TYPES = {
    0: "Null",
    1: "Point",
    3: "PolyLine",
    5: "Polygon",
    8: "MultiPoint",
    11: "PointZ",
    13: "PolyLineZ",
    15: "PolygonZ",
    18: "MultiPointZ",
    21: "PointM",
    23: "PolyLineM",
    25: "PolygonM",
    28: "MultiPointM",
}

_PUNTUALES = {1, 11, 21}
_MULTIPUNTO = {8, 18, 28}
_LINEAS = {3, 13, 23}
_POLIGONOS = {5, 15, 25}

# El .prj de estos archivos declara un CRS que hay que reinterpretar.
# Puntos_stand_by: EPSG:9707 (WGS84 + altura EGM96); horizontalmente es 4326.
# Puntos_Region_Biobio: GEOGCS puro sin PROJCS.
CRS_OVERRIDES = {
    "Puntos_stand_by": 4326,
    "Puntos_Región_Biobio_25-26_Conaf": 4326,
}


@dataclass
class Field:
    """Un campo del .dbf."""

    name: str
    type: str
    length: int
    decimals: int


@dataclass
class Shapefile:
    """Un shapefile abierto: geometrias + atributos + CRS."""

    path: Path
    shape_type: int
    bbox_nativo: tuple[float, float, float, float]
    epsg: int
    fields: list[Field]
    records: list[dict]
    encoding: str

    @property
    def n(self) -> int:
        return len(self.records)

    @property
    def geom_name(self) -> str:
        return SHAPE_TYPES.get(self.shape_type, f"Desconocido({self.shape_type})")

    def __iter__(self) -> Iterator[tuple[dict, dict]]:
        """Itera (geometria_geojson_en_coords_nativas, propiedades).

        Las geometrias nulas se omiten, pero el emparejamiento con el .dbf se
        mantiene porque iter_shapes emite None en esa posicion.
        """
        for geom, props in zip(iter_shapes(self.path), self.records):
            if geom is not None:
                yield geom, props


# --------------------------------------------------------------------------- #
# .shp
# --------------------------------------------------------------------------- #


def read_shp_header(fh) -> tuple[int, tuple[float, float, float, float]]:
    """Lee los 100 bytes de cabecera. Devuelve (shape_type, bbox)."""
    head = fh.read(100)
    if len(head) < 100:
        raise ValueError("cabecera .shp truncada")
    (filecode,) = struct.unpack(">i", head[0:4])
    if filecode != 9994:
        raise ValueError(f"file code {filecode} != 9994, no es un .shp")
    (version,) = struct.unpack("<i", head[28:32])
    if version != 1000:
        raise ValueError(f"version {version} != 1000")
    (shape_type,) = struct.unpack("<i", head[32:36])
    bbox = struct.unpack("<4d", head[36:68])
    return shape_type, bbox


def _puntos(buf: memoryview, off: int, n: int) -> list[list[float]]:
    """Desempaqueta n pares (x, y) consecutivos."""
    vals = struct.unpack_from(f"<{2 * n}d", buf, off)
    return [[vals[i], vals[i + 1]] for i in range(0, 2 * n, 2)]


def _partes(buf: memoryview, off: int) -> tuple[list[list[list[float]]], int]:
    """Lee el bloque bbox+parts+points comun a PolyLine y Polygon.

    Devuelve (lista_de_anillos, offset_final).
    """
    off += 32  # bbox de la geometria, no se usa
    n_parts, n_points = struct.unpack_from("<2i", buf, off)
    off += 8
    indices = struct.unpack_from(f"<{n_parts}i", buf, off)
    off += 4 * n_parts
    pts = _puntos(buf, off, n_points)
    off += 16 * n_points

    anillos = []
    for i, ini in enumerate(indices):
        fin = indices[i + 1] if i + 1 < n_parts else n_points
        anillo = pts[ini:fin]
        if anillo:
            anillos.append(anillo)
    return anillos, off


def iter_shapes(shp_path: str | Path) -> Iterator[dict | None]:
    """Itera las geometrias de un .shp como dicts GeoJSON en coordenadas nativas.

    Recorre los registros secuencialmente, sin necesitar el .shx. Los bloques Z
    y M van despues de los puntos XY en el registro, asi que simplemente no se
    leen: la geometria emitida siempre es 2D (Leaflet ignora Z y arrastrarla
    infla el GeoJSON ~50%).

    Emite None para los registros de tipo Null, de modo que la posicion siga
    correspondiendo con la fila del .dbf.
    """
    shp_path = Path(shp_path)
    with open(shp_path, "rb") as fh:
        read_shp_header(fh)
        while True:
            cab = fh.read(8)
            if len(cab) < 8:
                break
            _num, len_words = struct.unpack(">2i", cab)
            payload = fh.read(len_words * 2)
            if len(payload) < 4:
                break
            buf = memoryview(payload)
            (st,) = struct.unpack_from("<i", buf, 0)

            if st == 0:
                yield None
                continue

            if st in _PUNTUALES:
                x, y = struct.unpack_from("<2d", buf, 4)
                yield {"type": "Point", "coordinates": [x, y]}

            elif st in _MULTIPUNTO:
                off = 4 + 32
                (n,) = struct.unpack_from("<i", buf, off)
                pts = _puntos(buf, off + 4, n)
                if n == 1:
                    yield {"type": "Point", "coordinates": pts[0]}
                else:
                    yield {"type": "MultiPoint", "coordinates": pts}

            elif st in _LINEAS:
                anillos, _ = _partes(buf, 4)
                if not anillos:
                    yield None
                elif len(anillos) == 1:
                    yield {"type": "LineString", "coordinates": anillos[0]}
                else:
                    yield {"type": "MultiLineString", "coordinates": anillos}

            elif st in _POLIGONOS:
                anillos, _ = _partes(buf, 4)
                if not anillos:
                    yield None
                else:
                    yield {"type": "Polygon", "coordinates": anillos}

            else:
                raise ValueError(f"tipo de shape no soportado: {st} en {shp_path.name}")


# --------------------------------------------------------------------------- #
# .dbf
# --------------------------------------------------------------------------- #


def read_cpg(base: Path) -> str:
    """Lee el .cpg (page code) del shapefile. Por defecto utf-8.

    Los 33 shapefiles de este proyecto traen .cpg = 'UTF-8' aunque el header
    dBASE no lo declare. Sin esto sale 'La AraucanÃ­a' en vez de 'La Araucania'.
    """
    cpg = base.with_suffix(".cpg")
    if cpg.exists():
        txt = cpg.read_text(encoding="ascii", errors="replace").strip().lower()
        if txt in ("utf-8", "utf8", "65001"):
            return "utf-8"
        if txt:
            return txt
    return "utf-8"


def _castear(raw: bytes, f: Field, encoding: str):
    """Convierte el campo de ancho fijo del .dbf al tipo Python correspondiente.

    Recibe BYTES, no str: los anchos del .dbf estan en bytes y decodificar el
    registro completo antes de cortarlo desplaza todos los campos posteriores a
    la primera tilde (con UTF-8 'a' ocupa 2 bytes pero 1 caracter).
    """
    s = raw.decode(encoding, errors="replace").strip()
    if not s or s == "*" * len(s):
        return None
    if f.type in ("N", "F"):
        s = s.replace(",", ".")
        try:
            return float(s) if f.decimals else int(s)
        except ValueError:
            try:
                return float(s)
            except ValueError:
                return None
    if f.type == "D":
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else None
    if f.type == "L":
        return s.upper() in ("Y", "T")
    return s


def read_dbf(dbf_path: str | Path, encoding: str = "utf-8") -> tuple[list[Field], list[dict]]:
    """Lee un .dbf completo. Devuelve (campos, registros)."""
    dbf_path = Path(dbf_path)
    with open(dbf_path, "rb") as fh:
        head = fh.read(32)
        _ver, _yy, _mm, _dd, n_records, header_len, record_len = struct.unpack(
            "<BBBBIHH", head[:12]
        )

        fields: list[Field] = []
        while True:
            raw = fh.read(32)
            if not raw or raw[0] == 0x0D:
                break
            name = raw[0:11].split(b"\x00")[0].decode("latin-1").strip()
            fields.append(
                Field(name=name, type=chr(raw[11]), length=raw[16], decimals=raw[17])
            )

        fh.seek(header_len)
        registros: list[dict] = []
        for _ in range(n_records):
            row = fh.read(record_len)
            if len(row) < record_len:
                break
            if row[0:1] == b"*":  # registro marcado como borrado
                registros.append({})
                continue
            off = 1  # byte 0 = flag de borrado
            rec = {}
            for f in fields:
                rec[f.name] = _castear(row[off : off + f.length], f, encoding)
                off += f.length
            registros.append(rec)

    return fields, registros


# --------------------------------------------------------------------------- #
# .prj
# --------------------------------------------------------------------------- #


def read_prj_epsg(prj_path: str | Path) -> int | None:
    """Deduce el EPSG desde el WKT del .prj.

    Cascada de estrategias, de la mas fiable a la mas heuristica. Devuelve None
    si ninguna aplica; el llamador decide si eso es un error.
    """
    prj_path = Path(prj_path)
    if not prj_path.exists():
        return None
    wkt = prj_path.read_text(encoding="utf-8", errors="replace")

    # 1) AUTHORITY explicito al final del WKT.
    import re

    m = re.findall(r'AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]', wkt, re.I)
    if m:
        code = int(m[-1])
        # 9707 = WGS84 + EGM96 height. Horizontalmente es 4326.
        return 4326 if code == 9707 else code

    tiene_projcs = "PROJCS" in wkt.upper()

    # 2) Nombre del PROJCS.
    up = wkt.upper().replace(" ", "_")
    if "UTM_ZONE_19S" in up:
        return 32719
    if "UTM_ZONE_18S" in up:
        return 32718
    if "UTM_ZONE_17S" in up:
        return 32717

    # 3) Meridiano central + falso norte (hemisferio sur).
    mc = re.search(r'PARAMETER\s*\[\s*"Central_Meridian"\s*,\s*(-?[\d.]+)', wkt, re.I)
    fn = re.search(r'PARAMETER\s*\[\s*"False_Northing"\s*,\s*(-?[\d.]+)', wkt, re.I)
    if mc and tiene_projcs:
        cm = float(mc.group(1))
        sur = bool(fn) and float(fn.group(1)) > 0
        zona = int(round((cm + 183.0) / 6.0))
        if 1 <= zona <= 60:
            return (32700 if sur else 32600) + zona

    # 4) GEOGCS sin PROJCS -> geograficas WGS84.
    if not tiene_projcs and "GEOGCS" in wkt.upper():
        return 4326

    return None


# --------------------------------------------------------------------------- #
# API principal
# --------------------------------------------------------------------------- #


def read_shapefile(
    base: str | Path, encoding: str | None = None, epsg: int | None = None
) -> Shapefile:
    """Abre un shapefile completo (.shp + .dbf + .prj + .cpg).

    `base` puede llevar o no la extension .shp.
    `epsg` explicito gana sobre el .prj (para los casos de CRS_OVERRIDES).
    """
    base = Path(base)
    if base.suffix.lower() == ".shp":
        base = base.with_suffix("")
    shp = base.with_suffix(".shp")
    if not shp.exists():
        raise FileNotFoundError(shp)

    enc = encoding or read_cpg(base)
    shape_type, bbox = None, None
    with open(shp, "rb") as fh:
        shape_type, bbox = read_shp_header(fh)

    fields, records = read_dbf(base.with_suffix(".dbf"), encoding=enc)

    if epsg is None:
        epsg = CRS_OVERRIDES.get(base.name)
    if epsg is None:
        epsg = read_prj_epsg(base.with_suffix(".prj"))
    if epsg is None:
        raise ValueError(
            f"No se pudo determinar el EPSG de {shp.name}. "
            f"Pasa epsg= explicito o corrige el .prj. "
            f"Asumir un CRS desplazaria la geometria cientos de km."
        )

    return Shapefile(
        path=shp,
        shape_type=shape_type,
        bbox_nativo=bbox,
        epsg=epsg,
        fields=fields,
        records=records,
        encoding=enc,
    )


if __name__ == "__main__":
    import sys

    for arg in sys.argv[1:]:
        sf = read_shapefile(arg)
        print(f"{sf.path.name}: {sf.geom_name} · {sf.n} recs · EPSG:{sf.epsg}")
        print(f"  bbox nativo: {sf.bbox_nativo}")
        print(f"  campos ({len(sf.fields)}): {[f.name for f in sf.fields]}")
        for geom, props in sf:
            print(f"  primer feature: {geom['type']} · {props}")
            break
