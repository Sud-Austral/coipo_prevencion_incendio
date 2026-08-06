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


_GEOD = None


def length_geod_km(geom: dict) -> float:
    """Longitud sobre el elipsoide, en km, de una geometria YA en EPSG:4326.

    Se usa en vez de length_m() cuando el archivo de origen fuerza todo Chile a
    una sola zona UTM (el Compilado_OECV declara EPSG:32719 de Arica a
    Magallanes): ahi la distancia proyectada depende de cuan lejos este el
    tramo del meridiano central, mientras que la geodesica es la distancia real
    en terreno y no depende de la proyeccion elegida.

    Suma PARTE POR PARTE. Aplanar una MultiLineString e interpolar entre partes
    disjuntas inventa tramos: sobre esta capa infla el total de 4.790 a 5.086 km.
    """
    global _GEOD
    if geom["type"] not in ("LineString", "MultiLineString"):
        return 0.0
    if _GEOD is None:
        from pyproj import Geod

        _GEOD = Geod(ellps="WGS84")
    partes = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
    total = 0.0
    for p in partes:
        if len(p) > 1:
            total += _GEOD.line_length([c[0] for c in p], [c[1] for c in p])
    return total / 1000.0


# --------------------------------------------------------------------------- #
# Reglas de dominio de este proyecto
# --------------------------------------------------------------------------- #


# Franja de longitudes de cada region, con holgura. Sirve para desambiguar el
# huso UTM de la BBDD de incendios, que no lo declara.
LON_REGION = {
    "Arica y Parinacota": (-70.6, -68.8),
    "Tarapacá": (-70.4, -68.3),
    "Antofagasta": (-70.8, -67.2),
    "Atacama": (-71.8, -68.2),
    "Coquimbo": (-72.0, -69.7),
    "Valparaíso": (-72.1, -69.9),
    "Metropolitana": (-71.8, -69.7),
    "O'Higgins": (-72.2, -69.9),
    "Maule": (-72.8, -70.2),
    "Ñuble": (-72.9, -70.9),
    "Biobío": (-74.1, -70.9),
    "La Araucanía": (-73.8, -70.8),
    "Los Ríos": (-73.9, -71.5),
    "Los Lagos": (-75.0, -71.3),
    "Aysén": (-75.9, -71.0),
    "Magallanes": (-75.8, -66.3),
}


def huso_epsg_por_x(x: float) -> int:
    """Regla de respaldo cuando no se conoce la region de la fila.

    Los eastings del huso 19 en Chile van de ~200k a ~500k y los del 18 de ~500k
    a ~800k, pero la frontera NO es limpia: el norte del pais esta justo al este
    del meridiano central del huso 19 (-69), asi que Calama (lon -68,9) da un
    easting de ~510.000 y esta regla lo manda al huso 18, es decir 470 km mar
    adentro. Por eso solo se usa cuando huso_por_region() no puede decidir.
    """
    return 32719 if x < 500_000 else 32718


def huso_por_region(x: float, y: float, region: str | None) -> tuple[int, bool]:
    """Elige el huso UTM probando ambos y viendo cual cae en la region declarada.

    Devuelve (epsg, seguro). `seguro` es False cuando hubo que recurrir a la
    regla del easting porque la region falta, es desconocida, o ambos husos (o
    ninguno) caen dentro de su franja de longitudes.
    """
    banda = LON_REGION.get(region or "")
    if banda:
        candidatos = []
        for epsg in (32718, 32719):
            lon, lat = tx(epsg, 4326).transform(x, y)
            if banda[0] <= lon <= banda[1] and en_chile(lon, lat):
                candidatos.append(epsg)
        if len(candidatos) == 1:
            return candidatos[0], True
    return huso_epsg_por_x(x), False


def en_chile(lon: float, lat: float) -> bool:
    """True si la coordenada cae dentro del bbox de Chile."""
    return CHILE_LON[0] <= lon <= CHILE_LON[1] and CHILE_LAT[0] <= lat <= CHILE_LAT[1]


# Cota superior del easting. Detecta la firma exacta de la corrupcion de
# '14.- Los Lagos/Rutas_...shp': 3 features (Putemun-Rilan-Aguantao, Yutuy-Punta
# Peuque, Cruce Ruta 5-By Pass Chacao) con eastings de 1,09-1,10 M, que estan en
# UTM 17S pese a que su .prj declara 18S.
#
# Un bbox de Chile NO sirve para esto: reproyectadas desde 18S esas coordenadas
# dan lon ~ -67,8, que cae dentro del rectangulo nacional aunque a latitud -42
# eso sea territorio argentino.
#
# Solo se acota por arriba, no por abajo: estos archivos fuerzan todo Chile a una
# sola zona UTM, asi que un tramo lejos del meridiano central tiene eastings
# legitimamente bajos. Biobio en EPSG:32719 (MC -69) esta 4,6 grados al oeste y
# baja a 87.000 sin estar corrupto; una cota inferior de 100.000 descartaba 15
# rutas validas de Arauco y Lebu.
EASTING_MAX = 1_000_000


def utm_valido(geom: dict) -> bool:
    """True si ninguna coordenada delata una zona UTM equivocada."""
    ok = True

    def _walk(c):
        nonlocal ok
        if not ok or not c:
            return
        if isinstance(c[0], (int, float)):
            if not (0 <= c[0] <= EASTING_MAX and 0 <= c[1] <= 10_000_000):
                ok = False
        else:
            for x in c:
                _walk(x)

    _walk(geom["coordinates"])
    return ok


def bbox_en_chile(bbox) -> bool:
    """True si un bbox completo cae dentro de Chile."""
    if not bbox:
        return False
    return en_chile(bbox[0], bbox[1]) and en_chile(bbox[2], bbox[3])


# Las 16 regiones, tal como se muestran en el visor.
REGIONES = (
    "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo",
    "Valparaíso", "Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío",
    "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
)

# Nombres canonicos de region. La misma region aparece escrita de hasta cuatro
# formas distintas entre las fuentes; sin esto los filtros del visor salen
# duplicados ('Metropolitana' y 'Región Metropolitana de Santiago' como dos
# opciones que filtran cosas distintas).
#
# OJO: las claves van DESPUES de pasar por _clave(), o sea en minusculas, sin
# tildes y SIN el prefijo 'Region [de|del|de la] '. Una clave escrita con ese
# prefijo nunca llega a compararse.
REGION_CANON = {
    "arica y parinacota": "Arica y Parinacota",
    "tarapaca": "Tarapacá",
    "antofagasta": "Antofagasta",
    "atacama": "Atacama",
    "coquimbo": "Coquimbo",
    "valparaiso": "Valparaíso",
    "metropolitana": "Metropolitana",
    "metropolitana de santiago": "Metropolitana",
    "o'higgins": "O'Higgins",
    "ohiggins": "O'Higgins",
    "libertador general bernardo o'higgins": "O'Higgins",
    "del libertador general bernardo o'higgins": "O'Higgins",
    "maule": "Maule",
    "nuble": "Ñuble",
    "biobio": "Biobío",
    "araucania": "La Araucanía",
    "la araucania": "La Araucanía",
    "los rios": "Los Ríos",
    "los lagos": "Los Lagos",
    "aysen": "Aysén",
    "aysen del general carlos ibanez del campo": "Aysén",
    # El .dbf de origen truncaba este nombre al ancho de campo de 46 caracteres.
    "aysen del general carlos ibanez del cam": "Aysén",
    "magallanes": "Magallanes",
    "magallanes y de la antartica chilena": "Magallanes",
    "magallanes y la antartica chilena": "Magallanes",
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
