"""Infraestructura critica de las 3 comunas priorizadas -> infra_puntos.geojson

Los 707 elementos puntuales que alimentan los subindices `sub_infra` y
`sub_preparadas` del modelo de priorizacion, en 8 familias y 23 shapefiles.
Se publican para que el visor pueda mostrar QUE hay dentro de cada mancha.

Las capas se descubren por el nombre de la carpeta, no por una lista de 23
rutas, porque los nombres de archivo del paquete son inconsistentes: hay dobles
espacios ('ESTABLECIMIENTOS  EDUCACIONALES'), sufijos pegados ('_shp.shp') y
guiones bajos finales que varian por comuna. Una carpeta que no encaje en
ninguna familia conocida se AVISA y se descarta, nunca entra en silencio.

Cuatro trampas del paquete, todas medidas el 2026-09-10:

- DOS HUSOS UTM MEZCLADOS SIN PATRON (32718 y 32719). No siguen a la comuna: en
  Los Angeles las subestaciones estan en 19S y sus hermanas en 18S; en Mulchen
  las escuelas preparadas estan en 19S y el resto en 18S. Se lee el .prj de cada
  archivo. Asumir un huso unico desplaza los puntos ~700 km.
- SERVICIOS DE SALUD MULCHEN llego SIN .shp ni .shx: solo .dbf. Sus 10 postas
  rurales se reconstruyen desde LATITUD/LONGITUD, que ahi si son grados WGS84.
- UP_LOS_ANGELES_.shp tiene 0 features (bbox [0,0,0,0]). No es un error: Los
  Angeles no aporta unidades penitenciarias.
- 10 puntos declaran una comuna vecina (Aisen, Yumbel, Villarrica, Quilaco...).
  Se descartan comparando la comuna que declara el registro contra la de su
  carpeta, y se cuentan en `fuera_de_comuna`.

Lo que NO se publica y es deliberado: la version PUNTUAL de comunidades
preparadas de Mulchen (el modelo usa la poligonal; publicar la puntual dejaria 2
comunidades en Mulchen y 0 en las otras dos comunas) y los 20 buffers, que son
derivados de estos mismos puntos.
"""

from __future__ import annotations

import unicodedata

from cfg import Cfg, log
from geo import en_chile, to_wgs84
from gj_io import dominios, feature, humano, write_geojson
from shp_reader import read_dbf, read_shapefile

# La carpeta de primer nivel manda sobre la comuna. Se escribe sin tilde para
# que coincida EXACTAMENTE con el campo `comuna` de priorizacion.geojson: el
# frontend cruza las dos capas por ese literal.
COMUNAS = {
    "INFRAESTRUCTURA CRITICA COYHAIQUE": "Coyhaique",
    "INFRAESTRUCTURA CRITICA LOS ANGELES": "Los Angeles",
    "INFRAESTRUCTURA CRITICA MULCHEN": "Mulchen",
}

# Alias de comuna vistos en los .dbf, ya normalizados (sin tildes, minusculas).
# Incluye los codigos CUT porque subestaciones y salud los usan como texto en
# vez del nombre, con y sin cero a la izquierda.
ALIAS_COMUNA = {
    "coyhaique": "Coyhaique",
    "11101": "Coyhaique",
    "los angeles": "Los Angeles",
    "8301": "Los Angeles",
    "08301": "Los Angeles",
    "mulchen": "Mulchen",
    "8305": "Mulchen",
    "08305": "Mulchen",
}

# (patron en el nombre de la carpeta, familia, etiqueta, campo de comuna,
#  campo de tipo, campo de nombre, extras {clave_salida: campo_dbf})
#
# El campo de tipo se eligio mirando los valores reales, no el nombre:
#  - salud usa SIMBOLOGIA (7 clases limpias) y no TIPO (16, cola muy larga)
#  - antenas usa TISO_DESCR (el soporte fisico); ALIAS es el operador y va aparte
#  - educacion NO tiene campo de tipo utilizable: ver TIPO_DEPEN abajo
FAMILIAS = [
    (
        "ANTENAS",
        "antenas",
        "Antenas de telecomunicaciones",
        "COMUNA",
        "TISO_DESCR",
        "ELM_NOMBRE",
        {"operador": "ALIAS", "tecnologia": "TECNOLOGIA", "altura_m": "SOPO_ALTUR"},
    ),
    (
        "ESTABLECIMIENTOS",
        "educacion",
        "Establecimientos educacionales",
        "NOM_COM_RB",
        None,
        "NOM_RBD",
        # TIPO_DEPEN es un codigo numerico (1..4) y el .dbf no trae diccionario;
        # el .qmd de QGIS tampoco (verificado: solo lleva el CRS). Se publica el
        # codigo CRUDO y la ficha lo rotula como codigo. La lectura habitual
        # (1=Municipal, 2=Part. Subvencionado...) NO esta confirmada en el dato,
        # y una etiqueta plausible y falsa es el peor fallo posible aqui.
        {"dependencia_cod": "TIPO_DEPEN", "matricula": "MAT_TOTAL", "direccion": "DIRECCION"},
    ),
    (
        "SERVICIOS DE SALUD",
        "salud",
        "Servicios de salud",
        "NOM_COM",
        "SIMBOLOGIA",
        "NOMBRE",
        {"detalle": "TIPO", "complejidad": "COMPLEJIDA", "direccion": "DIRECCION"},
    ),
    (
        "SSR",
        "ssr",
        "Servicios sanitarios rurales",
        "COMUNA",
        "CLAS_OP",
        "NOMBRE_SSR",
        {"ambito": "URBAN_RURA", "beneficiarios": "BENEF_EST", "arranques": "CANT_ARR"},
    ),
    (
        "SUBESTACIONES",
        "subestaciones",
        "Subestaciones eléctricas",
        "COMUNA",
        "TIPO",
        "NOMBRE",
        {"tension_kv": "TENSION_KV", "propiedad": "PROPIEDAD"},
    ),
    (
        "ESCUELAS PREPARADAS",
        "escuelas_prep",
        "Escuelas preparadas",
        "COMUNA",
        "RIESGO",
        "NOMBRE_EP",
        {"alumnos": "_N_alumnos", "comunidad_escolar": "_total_com"},
    ),
    (
        "RED AEROPORTUARIA",
        "aeropuerto",
        "Red aeroportuaria",
        "COMUNA",
        "RED",
        "NOMBRE",
        {"codigo_oaci": "COD_OACI", "uso": "USO"},
    ),
    (
        "UP",
        "penitenciaria",
        "Unidades penitenciarias",
        # Es un KML convertido con el esquema de Google Earth: no trae comuna.
        # La de la carpeta es la unica fuente, y por eso no se puede filtrar
        # contaminacion en esta familia (son 2 puntos, ambos verificados).
        None,
        None,
        "Name",
        # `descriptio` trae un bloque HTML completo de Google Earth y `drawOrder`
        # un '**********' por desbordamiento del dBase. Ninguno se publica.
        {},
    ),
]


def _sin_tildes(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _canon_comuna(valor) -> str | None:
    """Nombre canonico de comuna, o None si no se reconoce.

    Hace falta porque las mismas tres comunas llegan en seis grafias distintas
    entre familias: 'Los Ángeles', 'LOS ANGELES', 'Los angeles', 'MULCHÉN',
    'Mulchen' y los codigos CUT '08301'/'11101'.
    """
    if valor in (None, ""):
        return None
    return ALIAS_COMUNA.get(_sin_tildes(str(valor)).strip().lower().replace("  ", " "))


def _familia_de(nombre_carpeta: str):
    """Empareja una carpeta con su familia. La primera que encaja gana."""
    up = nombre_carpeta.upper()
    for patron, *resto in FAMILIAS:
        # 'UP' se comprueba como palabra suelta: sin esto casaria dentro de
        # cualquier carpeta que contenga esas dos letras seguidas.
        if patron == "UP":
            if up.split()[0] == "UP":
                return resto
        elif patron in up:
            return resto
    return None


def _props(familia, etiqueta, comuna, campo_tipo, campo_nombre, extras, raw) -> dict:
    p = {
        "familia": familia,
        "grupo": etiqueta,
        "comuna": comuna,
        "nombre": raw.get(campo_nombre) if campo_nombre else None,
        "tipo": raw.get(campo_tipo) if campo_tipo else None,
    }
    for salida, campo in extras.items():
        p[salida] = raw.get(campo)
    return p


def build(cfg: Cfg) -> dict:
    raiz = cfg.insumo_prior
    if not raiz.exists():
        raise FileNotFoundError(f"Falta {raiz}")

    feats: list[dict] = []
    por_familia: dict[str, int] = {}
    fuera_de_comuna = fuera_de_chile = 0
    sin_familia: list[str] = []

    for carpeta_comuna in sorted(d for d in raiz.iterdir() if d.is_dir()):
        comuna = COMUNAS.get(carpeta_comuna.name)
        if comuna is None:
            sin_familia.append(carpeta_comuna.name)
            continue

        for sub in sorted(d for d in carpeta_comuna.iterdir() if d.is_dir()):
            emparejada = _familia_de(sub.name)
            if emparejada is None:
                sin_familia.append(f"{carpeta_comuna.name}/{sub.name}")
                continue
            familia, etiqueta, campo_com, campo_tipo, campo_nombre, extras = emparejada

            shps = sorted(sub.glob("*.shp"))
            if shps:
                origen = [(read_shapefile(shps[0]), None)]
            else:
                # Sin .shp: unica via es el .dbf con LATITUD/LONGITUD (salud de
                # Mulchen). Si tampoco hay .dbf, se avisa y se sigue.
                dbfs = sorted(sub.glob("*.dbf"))
                if not dbfs:
                    log(cfg, "infra", f"AVISO: {sub.name} no tiene .shp ni .dbf")
                    continue
                origen = [(None, read_dbf(dbfs[0], encoding="utf-8")[1])]

            sf, regs = origen[0]
            n = 0

            if sf is not None:
                pares = (
                    (g, pr) for g, pr in sf if g is not None
                )
                for geom, raw in pares:
                    partes = (
                        geom["coordinates"]
                        if geom["type"] == "MultiPoint"
                        else [geom["coordinates"]]
                    )
                    for c in partes:
                        lon, lat = to_wgs84(
                            {"type": "Point", "coordinates": c}, sf.epsg
                        )["coordinates"]
                        if not en_chile(lon, lat):
                            fuera_de_chile += 1
                            continue
                        if campo_com and _canon_comuna(raw.get(campo_com)) != comuna:
                            fuera_de_comuna += 1
                            continue
                        feats.append(
                            feature(
                                {
                                    "type": "Point",
                                    "coordinates": [
                                        round(lon, cfg.precision),
                                        round(lat, cfg.precision),
                                    ],
                                },
                                _props(
                                    familia, etiqueta, comuna,
                                    campo_tipo, campo_nombre, extras, raw,
                                ),
                            )
                        )
                        n += 1
            else:
                for raw in regs:
                    lon, lat = float(raw["LONGITUD"]), float(raw["LATITUD"])
                    if not en_chile(lon, lat):
                        fuera_de_chile += 1
                        continue
                    if campo_com and _canon_comuna(raw.get(campo_com)) != comuna:
                        fuera_de_comuna += 1
                        continue
                    feats.append(
                        feature(
                            {
                                "type": "Point",
                                "coordinates": [
                                    round(lon, cfg.precision),
                                    round(lat, cfg.precision),
                                ],
                            },
                            _props(
                                familia, etiqueta, comuna,
                                campo_tipo, campo_nombre, extras, raw,
                            ),
                        )
                    )
                    n += 1

            por_familia[familia] = por_familia.get(familia, 0) + n

    if sin_familia:
        log(cfg, "infra", f"AVISO: {len(sin_familia)} carpetas sin familia: {sin_familia}")

    st = write_geojson(cfg.out / "infra_puntos.geojson", feats)
    detalle = ", ".join(f"{k} {v}" for k, v in sorted(por_familia.items()))
    log(
        cfg,
        "infra",
        f"{len(feats)} puntos en {len(por_familia)} familias ({detalle}) · "
        f"{fuera_de_comuna} de comuna vecina · {fuera_de_chile} fuera de Chile · "
        f"{humano(st['bytes'])}",
    )

    return {
        "capa": "infra_puntos",
        "titulo": "Infraestructura crítica",
        "formato": "geojson",
        "geometria": "Point",
        "carga": "inmediata",
        "por_familia": por_familia,
        "fuera_de_comuna": fuera_de_comuna,
        "descartados": fuera_de_chile,
        "filtros": ["comuna", "familia"],
        "dominios": dominios(feats, ["comuna", "familia", "grupo", "tipo"]),
        **st,
    }


if __name__ == "__main__":
    build(Cfg(verbose=True))
