"""Utilidades geoespaciales del ETL: reproyeccion, simplificacion, bbox.

ORDEN CANONICO por feature (no negociable):

    leer nativo (UTM metros) -> simplify_m(tol) -> length_m() -> to_wgs84() -> round(5)

Simplificar en METROS antes de reproyectar, no en grados: con la misma
tolerancia angular la distorsion entre Arica y Magallanes es ~2,5x. Y las
longitudes hay que medirlas sobre la geometria UTM porque los campos
Shape_Leng / SHAPE_Leng de todos los .dbf de este proyecto vienen en GRADOS,
no en metros, y son inservibles.
"""

from __future__ import annotations

from pyproj import Transformer
from shapely.geometry import mapping, shape

# Chile continental + insular, con holgura. Cualquier cosa fuera de aqui es un
# error de reproyeccion, no un dato raro.
CHILE_LON = (-76.0, -66.0)
CHILE_LAT = (-56.0, -17.0)

_TX_CACHE: dict[tuple[int, int], Transformer] = {}


def tx(epsg_src: int, epsg_dst: int = 4326) -> Transformer:
    """Transformer cacheado. Crearlos es caro; reutilizarlos es gratis."""
    key = (epsg_src, epsg_dst)
    if key not in _TX_CACHE:
        _TX_CACHE[key] = Transformer.from_crs(epsg_src, epsg_dst, always_xy=True)
    return _TX_CACHE[key]


# --------------------------------------------------------------------------- #
# Recorrido generico de coordenadas
# --------------------------------------------------------------------------- #


def _map_coords(coords, fn):
    """Aplica fn a cada par [x, y] de una estructura de coordenadas anidada."""
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        return fn(coords)
    return [_map_coords(c, fn) for c in coords]


def to_wgs84(geom: dict, epsg: int) -> dict:
    """Reproyecta una geometria GeoJSON a EPSG:4326. No-op si ya lo esta."""
    if epsg == 4326:
        return geom
    t = tx(epsg, 4326)

    def _p(xy):
        lon, lat = t.transform(xy[0], xy[1])
        return [lon, lat]

    return {"type": geom["type"], "coordinates": _map_coords(geom["coordinates"], _p)}


def round_coords(geom: dict, nd: int = 5) -> dict:
    """Redondea las coordenadas. 5 decimales ~ 1,1 m en latitud.

    Es el mayor ahorro de bytes del ETL: el JSON original de la red vial trae
    15 decimales (precision de femtometro) y eso es ~44% del archivo.
    """
    return {
        "type": geom["type"],
        "coordinates": _map_coords(geom["coordinates"], lambda c: [round(c[0], nd), round(c[1], nd)]),
    }


def count_vertices(geom: dict) -> int:
    """Cuenta vertices de cualquier geometria GeoJSON."""
    n = 0

    def _walk(c):
        nonlocal n
        if not c:
            return
        if isinstance(c[0], (int, float)):
            n += 1
        else:
            for x in c:
                _walk(x)

    _walk(geom["coordinates"])
    return n


def bbox_of(geom: dict) -> list[float]:
    """[minx, miny, maxx, maxy] de una geometria."""
    xs, ys = [], []

    def _walk(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for x in c:
                _walk(x)

    _walk(geom["coordinates"])
    if not xs:
        return [0.0, 0.0, 0.0, 0.0]
    return [min(xs), min(ys), max(xs), max(ys)]


def bbox_union(bboxes) -> list[float] | None:
    """Une una lista de bboxes."""
    bs = [b for b in bboxes if b]
    if not bs:
        return None
    return [
        min(b[0] for b in bs),
        min(b[1] for b in bs),
        max(b[2] for b in bs),
        max(b[3] for b in bs),
    ]


# --------------------------------------------------------------------------- #
# Shapely: simplificacion y longitud (sobre coordenadas UTM en metros)
# --------------------------------------------------------------------------- #


def simplify_m(geom: dict, tol_m: float) -> dict:
    """Douglas-Peucker con tolerancia en metros, sobre coordenadas nativas UTM.

    preserve_topology=False (DP puro): ~3x mas rapido y correcto para lineas de
    visualizacion que no comparten topologia.
    """
    if tol_m <= 0 or geom["type"] in ("Point", "MultiPoint"):
        return geom
    try:
        g = shape(geom).simplify(tol_m, preserve_topology=False)
    except Exception:
        return geom
    if g.is_empty:
        return geom
    return mapping(g)


def length_m(geom: dict) -> float:
    """Longitud en metros de una geometria en coordenadas UTM."""
    if geom["type"] not in ("LineString", "MultiLineString"):
        return 0.0
    try:
        return float(shape(geom).length)
    except Exception:
        return 0.0


# --------------------------------------------------------------------------- #
# Reglas de dominio de este proyecto
# --------------------------------------------------------------------------- #


def huso_epsg_por_x(x: float) -> int:
    """Deduce el huso UTM de la BBDD de incendios, que no lo declara.

    Verificado sobre las 14.985 filas contra la longitud de referencia de cada
    region: 8.643 caen en 18S y 6.060 en 19S, con 100% de acierto en las filas
    limpias. Los eastings del huso 19 en Chile van de ~200k a ~500k; los del
    huso 18 de ~500k a ~800k.
    """
    return 32719 if x < 500_000 else 32718


def en_chile(lon: float, lat: float) -> bool:
    """True si la coordenada cae dentro del bbox de Chile."""
    return CHILE_LON[0] <= lon <= CHILE_LON[1] and CHILE_LAT[0] <= lat <= CHILE_LAT[1]


def bbox_en_chile(bbox) -> bool:
    """True si un bbox completo cae dentro de Chile."""
    if not bbox:
        return False
    return en_chile(bbox[0], bbox[1]) and en_chile(bbox[2], bbox[3])


# Nombres canonicos de region. La misma region aparece escrita de varias formas
# entre las cuatro fuentes; sin esto los filtros del frontend se duplican.
REGION_CANON = {
    "arica y parinacota": "Arica y Parinacota",
    "region de arica y parinacota": "Arica y Parinacota",
    "tarapaca": "Tarapacá",
    "region de tarapaca": "Tarapacá",
    "antofagasta": "Antofagasta",
    "region de antofagasta": "Antofagasta",
    "atacama": "Atacama",
    "region de atacama": "Atacama",
    "coquimbo": "Coquimbo",
    "region de coquimbo": "Coquimbo",
    "valparaiso": "Valparaíso",
    "region de valparaiso": "Valparaíso",
    "metropolitana": "Metropolitana",
    "region metropolitana": "Metropolitana",
    "region metropolitana de santiago": "Metropolitana",
    "o'higgins": "O'Higgins",
    "ohiggins": "O'Higgins",
    "libertador general bernardo o'higgins": "O'Higgins",
    "region del libertador general bernardo o'higgins": "O'Higgins",
    "maule": "Maule",
    "region del maule": "Maule",
    "nuble": "Ñuble",
    "region de nuble": "Ñuble",
    "biobio": "Biobío",
    "region del biobio": "Biobío",
    "araucania": "La Araucanía",
    "la araucania": "La Araucanía",
    "region de la araucania": "La Araucanía",
    "los rios": "Los Ríos",
    "region de los rios": "Los Ríos",
    "los lagos": "Los Lagos",
    "region de los lagos": "Los Lagos",
    "aysen": "Aysén",
    "region de aysen": "Aysén",
    "region aysen del general carlos ibanez del campo": "Aysén",
    # El .dbf de origen truncaba este nombre a 46 caracteres.
    "region aysen del general carlos ibanez del cam": "Aysén",
    "magallanes": "Magallanes",
    "region de magallanes": "Magallanes",
    "magallanes y de la antartica chilena": "Magallanes",
    "region de magallanes y de la antartica chilena": "Magallanes",
}

_ACENTOS = str.maketrans("áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ",
                         "aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN")


def _clave(s: str) -> str:
    """Normaliza para buscar en REGION_CANON: minusculas, sin tildes, sin 'region de'."""
    k = " ".join(str(s).split()).lower().translate(_ACENTOS)
    for pre in ("region del ", "region de la ", "region de ", "region "):
        if k.startswith(pre):
            k = k[len(pre) :]
            break
    return k.strip(" .")


def canon_region(valor) -> str | None:
    """Devuelve el nombre canonico de una region, o el original limpio si no la reconoce."""
    if valor is None:
        return None
    s = " ".join(str(valor).split())
    if not s:
        return None
    return REGION_CANON.get(_clave(s)) or REGION_CANON.get(_clave(s).replace("del ", "")) or s


def slug(s: str) -> str:
    """Slug ASCII para nombres de archivo."""
    k = str(s).translate(_ACENTOS).lower()
    return "".join(c if c.isalnum() else "-" for c in k).strip("-").replace("--", "-")
