"""Infraestructura critica y comunidades preparadas de TODO CHILE -> infra_puntos.geojson

El 2026-09-16 Luis reemplazo el paquete de 3 comunas por uno nacional: ocho
fuentes en `INSUMO_PRIORIZACION/`, 35.921 elementos. Lo que habia antes eran 707
puntos de Coyhaique, Los Angeles y Mulchen (DECISIONES.md §S); el visor los
dibujaba uno a uno encima de las manchas de riesgo de esas tres comunas.

QUE TRAE EL PAQUETE NUEVO, medido el 2026-09-16:

    INFRAESTRUCTURA_CRITICA/ANTENAS                        18.006
    INFRAESTRUCTURA_CRITICA/CENTROS_DE_SALUD                2.752
    INFRAESTRUCTURA_CRITICA/SERVICIOS_SANITARIOS_RURALES    1.829
    INFRAESTRUCTURA_CRITICA/SUBESTACIONES                   1.215
    INFRAESTRUCTURA_CRITICA/RED_AEROPORTUARIA                 314
    INFRAESTRUCTURA_CRITICA/CENTROS_PENITENCIARIOS             80
    COMUNIDADES_ESCUELAS_PREPARADAS/ESCUELAS_PREPARADAS    11.128
    COMUNIDADES_ESCUELAS_PREPARADAS/COMUNIDADES_PREPARADAS    597

TRES COSAS DEL INSUMO QUE NO SE PUEDEN ADIVINAR LEYENDO LOS NOMBRES:

1. LAS SEIS FAMILIAS CRITICAS SON BUFERES, no puntos: poligonos de 60 m (100 m
   en penitenciarios) en EPSG 32719. Se publica el CENTRO de cada buffer, que es
   el elemento: a cualquier escala del visor un circulo de 60 m es un punto, y
   dibujar 24.196 poligonos de 33 vertices costaria 800.000 vertices para no
   verse. La version puntual original no viene en el paquete.

2. `ESCUELAS_PREPARADAS.shp` NO son las escuelas preparadas: es el directorio
   nacional entero, 11.128 establecimientos, con una marca `E_PREP` que vale
   'SI' en 97. Se publican los 11.128 como «Establecimientos educacionales» y
   los 97 llevan ademas `preparada: true`, que es lo que separa las dos familias
   que el visor mostraba antes. Publicar solo los 97 habria escondido el
   directorio; publicarlos todos como «preparadas» habria sido falso.

3. EL CODIGO DE COMUNA NO SIEMPRE ESTA. `cod_comuna` viene del cruce espacial que
   trae el propio paquete y esta en cinco de las ocho fuentes; en ANTENAS esta
   VACIO en las 18.006 filas y en comunidades no existe. Ahi se resuelve por
   NOMBRE contra las comunas del modelo de riesgo (y sus alias), con la misma
   clave sin tildes ni mayusculas que usa el resto del repo. Lo que no se resuelve
   se cuenta en `sin_comuna` y no se inventa.

TERRITORIO INSULAR: Isla de Pascua y Juan Fernandez quedan FUERA (decision de
Luis, 2026-09-16), porque la caja de Chile del visor es continental y el modelo de
riesgo no las cubre. Son 10 elementos --el hospital de Hanga Roa, los aerodromos
Mataveri y Robinson Crusoe, antenas, el CP de Isla de Pascua-- y se publican
CONTADOS por familia en `fuera_de_chile`, para que el panel pueda decirlo: un
descarte silencioso se lee como que ahi no hay nada.
"""

from __future__ import annotations

import math
import unicodedata

from cfg import RAIZ, Cfg, log
from geo import en_chile, to_wgs84
from gj_io import codificar, dominios, feature, humano, write_geojson
from shp_reader import iter_shapes, read_shapefile

# (ruta relativa, familia, etiqueta, campo de nombre, campo de tipo,
#  campos de comuna por orden de preferencia (codigo primero), extras)
#
# El campo de tipo se elige mirando los VALORES, no el nombre: salud usa
# SIMBOLOGIA (clases limpias) y no TIPO; antenas, el soporte fisico TISO_DESCR,
# porque ALIAS es el operador y va aparte.
FUENTES = [
    (
        "INFRAESTRUCTURA_CRITICA/ANTENAS/ANTENAS_buf60m.shp",
        "antenas", "Antenas de telecomunicaciones", "ELM_NOMBRE", "TISO_DESCR",
        ("cod_comuna", "Comuna_2", "COMUNA"),
        {"operador": "ALIAS", "tecnologia": "TECNOLOGIA", "altura_m": "SOPO_ALTUR"},
    ),
    (
        "INFRAESTRUCTURA_CRITICA/CENTROS_DE_SALUD/CENTROS_DE_SALUD_buf60m.shp",
        "salud", "Servicios de salud", "NOMBRE", "SIMBOLOGIA",
        ("CUT_COMUNA", "cod_comuna", "Comuna", "NOM_COMUNA"),
        {"detalle": "TIPO", "complejidad": "COMPLEJIDA", "urgencia": "URGENCIA", "direccion": "DIRECCION"},
    ),
    (
        "INFRAESTRUCTURA_CRITICA/SERVICIOS_SANITARIOS_RURALES/SERVICIOS_SANITARIOS_RURALES_buf60m.shp",
        "ssr", "Servicios sanitarios rurales", "NOMBRE_SSR", "CLAS_OP",
        ("cod_comuna", "Comuna_2", "COMUNA"),
        {"ambito": "URBAN_RURA", "beneficiarios": "BENEF_EST", "arranques": "CANT_ARR"},
    ),
    (
        "INFRAESTRUCTURA_CRITICA/SUBESTACIONES/SUBESTACIONES_buf60m.shp",
        "subestaciones", "Subestaciones eléctricas", "NOMBRE", "TIPO",
        ("cod_comuna", "Comuna_2"),
        {"tension_kv": "TENSION_KV", "propiedad": "PROPIEDAD", "estado": "ESTADO"},
    ),
    (
        "INFRAESTRUCTURA_CRITICA/RED_AEROPORTUARIA/RED_AEROPORTUARIA_buf60m.shp",
        "aeropuerto", "Red aeroportuaria", "NOMBRE", "RED",
        ("cod_comuna", "Comuna_2"),
        {"codigo_oaci": "COD_OACI", "uso": "USO", "propiedad": "PROPIEDAD"},
    ),
    (
        "INFRAESTRUCTURA_CRITICA/CENTROS_PENITENCIARIOS/CENTROS_PENITENCIARIOS_buf100m.shp",
        # El unico campo util es el nombre: el resto del .dbf son ids de un KML.
        "penitenciaria", "Unidades penitenciarias", "Name", None,
        ("cod_comuna", "Comuna"),
        {},
    ),
    (
        "COMUNIDADES_ESCUELAS_PREPARADAS/ESCUELAS_PREPARADAS.shp",
        "educacion", "Establecimientos educacionales", "NOM_RBD", None,
        ("COD_COM_RB", "Comuna", "NOM_COM_RB"),
        # TIPO_DEPEN es un codigo numerico (1..5) y el .dbf no trae diccionario;
        # se publica CRUDO y la ficha lo rotula como codigo. Una etiqueta
        # plausible y falsa seria el peor fallo posible aqui.
        {"dependencia_cod": "TIPO_DEPEN", "matricula": "MAT_TOTAL", "direccion": "DIRECCION"},
    ),
    (
        "COMUNIDADES_ESCUELAS_PREPARADAS/COMUNIDADES_PREPARADAS.shp",
        "comunidades_prep", "Comunidades preparadas", "COMUNIDAD", "TIPO_COM",
        # Sin codigo: solo el nombre de la comuna.
        ("COMUNA",),
        {"riesgo": "RIESGO", "poblacion": "POBLACION", "anio": "ANIO", "sector": "SECTOR"},
    ),
]

# Marca de escuela preparada dentro del directorio nacional (ver la cabecera).
CAMPO_PREPARADA = "E_PREP"

# Holgura al comparar un punto contra la caja de las manchas de su CUT, en
# grados (~1,1 km). No es una tolerancia de precision: la caja son las manchas
# del modelo, no el limite comunal, asi que un punto legitimo puede caer justo
# fuera. Sigue siendo 500 veces menor que el error que hay que cazar --leer un
# punto con el huso UTM vecino lo manda ~550 km-- y viaja al manifest.
MARGEN_CAJA = 0.01

# Campos que viajan como INDICE contra `tablas` del manifest, igual que en
# incendios (DECISIONES.md §J). Medido el 2026-09-16 sobre las 35.905 features:
# el archivo pasa de 10,80 a 6,04 MiB, y `familia` sola pesaba 0,71 MiB repetida
# 35.905 veces. No entran `nombre` ni `direccion`, que son texto de verdad.
CATEGORICOS = ["familia", "tipo", "operador", "tecnologia", "propiedad", "detalle",
               "complejidad", "urgencia", "ambito", "uso", "estado", "riesgo", "sector"]


def _clave(s) -> str:
    """Sin tildes, sin mayusculas y sin espacios dobles. La misma del resto del repo."""
    t = "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn")
    return " ".join(t.casefold().split())


def _cut(valor) -> str | None:
    """Codigo comunal de 5 digitos, o None. El .dbf los trae como '6204', '6204.0' o 6204."""
    s = str(valor or "").strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(5) if s.isdigit() and 0 < len(s) <= 5 else None


def _centro(geom: dict) -> tuple[float, float] | None:
    """Punto representativo de una geometria en coordenadas nativas.

    De un buffer, el promedio de los vertices de su anillo exterior: son
    circulos regulares de 60 o 100 m, asi que el promedio ES el centro. De un
    punto o multipunto, el punto.
    """
    t, c = geom.get("type"), geom.get("coordinates")
    if not c:
        return None
    if t == "Point":
        return c[0], c[1]
    if t == "MultiPoint":
        return c[0][0], c[0][1]
    anillo = c[0] if t == "Polygon" else c[0][0]
    if not anillo:
        return None
    return sum(p[0] for p in anillo) / len(anillo), sum(p[1] for p in anillo) / len(anillo)


def build(cfg: Cfg) -> dict:
    raiz = cfg.insumo_prior
    if not raiz.exists():
        raise FileNotFoundError(f"Falta {raiz}")

    # Nombre de comuna -> CUT, del modelo de riesgo si ya se genero en esta
    # corrida; si no, del manifest publicado. Es la MISMA tabla que usa el visor
    # para cruzar, asi que un punto con comuna resuelta aqui es un punto que el
    # visor puede encontrar.
    por_nombre, por_cut, cajas = _comunas_del_riesgo(cfg)

    feats: list[dict] = []
    por_familia: dict[str, int] = {}
    fuera_de_chile: dict[str, int] = {}
    sin_comuna: dict[str, int] = {}
    sin_geometria: dict[str, int] = {}
    preparadas = 0
    faltan: list[str] = []

    for rel, familia, etiqueta, campo_nombre, campo_tipo, campos_comuna, extras in FUENTES:
        shp = raiz / rel
        if not shp.exists():
            faltan.append(rel)
            continue
        sf = read_shapefile(shp)
        n = 0
        # zip() propio y no `for ... in sf`: el iterador del lector SE SALTA las
        # geometrias nulas, y aqui hay que contarlas. Un descarte que no se
        # cuenta es un dato que desaparece sin que conste.
        for geom, raw in zip(iter_shapes(shp), sf.records):
            if geom is None:
                sin_geometria[familia] = sin_geometria.get(familia, 0) + 1
                continue
            centro = _centro(geom)
            if centro is None:
                sin_geometria[familia] = sin_geometria.get(familia, 0) + 1
                continue
            lon, lat = to_wgs84({"type": "Point", "coordinates": list(centro)}, sf.epsg)["coordinates"]
            if not en_chile(lon, lat):
                # Isla de Pascua y Juan Fernandez. Se cuentan y se publican en el
                # manifest: un descarte silencioso se lee como que ahi no hay nada.
                fuera_de_chile[familia] = fuera_de_chile.get(familia, 0) + 1
                continue

            cut = nombre_comuna = None
            for campo in campos_comuna:
                valor = raw.get(campo)
                cut = _cut(valor)
                if cut and cut in por_cut:
                    nombre_comuna = por_cut[cut]
                    break
                cut = None
                eq = por_nombre.get(_clave(valor))
                if eq:
                    cut, nombre_comuna = eq
                    break
            if cut is None:
                sin_comuna[familia] = sin_comuna.get(familia, 0) + 1

            # NI `grupo` NI `comuna` viajan en las features: la etiqueta de la
            # familia esta UNA vez en el manifest (`familias`) y el nombre de la
            # comuna sale del CUT contra las partes de riesgo, que el visor ya
            # tiene. Repetidos en cada punto pesaban 2,05 MiB de los 10,80.
            props = {
                "familia": familia,
                "nombre": raw.get(campo_nombre) if campo_nombre else None,
                "tipo": raw.get(campo_tipo) if campo_tipo else None,
                "cut": cut,
            }
            if familia == "educacion":
                # La marca del insumo, tal cual: 'SI' en 97 de 11.128.
                props["preparada"] = str(raw.get(CAMPO_PREPARADA) or "").strip().upper() == "SI"
                preparadas += 1 if props["preparada"] else 0
            for salida, campo in extras.items():
                props[salida] = raw.get(campo)

            feats.append(
                feature(
                    {"type": "Point", "coordinates": [round(lon, cfg.precision), round(lat, cfg.precision)]},
                    props,
                )
            )
            n += 1
        por_familia[familia] = n

    if faltan:
        raise FileNotFoundError(
            "Faltan fuentes de infraestructura en INSUMO_PRIORIZACION: " + ", ".join(faltan)
        )

    # EL CUT LO DECLARA EL INSUMO, no la geometria, y a veces no cuadran: una
    # antena con el codigo de otra comuna sale en el filtro de la comuna
    # equivocada. No se corrige --el dato es de su servicio y este visor no lo
    # reescribe-- pero tampoco se absorbe en silencio: se mide contra la caja de
    # las manchas de ese CUT y se publica. Medido el 2026-09-16: 11 de 35.905,
    # el peor a 756 km.
    #
    # MARGEN_CAJA no es cero porque la caja son las MANCHAS de la comuna, no su
    # limite: el modelo no cubre todo el territorio y un punto legitimo puede
    # quedar unos metros fuera. Viaja al manifest para que D15 lo cruce en vez
    # de llevar su propia copia del numero.
    lejos: dict[str, int] = {}
    max_km = 0.0
    for f in feats:
        cut = f["properties"].get("cut")
        caja = cajas.get(cut) if cut else None
        if not caja:
            continue
        lon, lat = f["geometry"]["coordinates"]
        dx = max(caja[0] - lon, lon - caja[2], 0.0)
        dy = max(caja[1] - lat, lat - caja[3], 0.0)
        if dx <= MARGEN_CAJA and dy <= MARGEN_CAJA:
            continue
        fam = f["properties"]["familia"]
        lejos[fam] = lejos.get(fam, 0) + 1
        max_km = max(max_km, dx * 111.32 * math.cos(math.radians(lat)), dy * 110.57)

    tablas, doms = codificar(feats, CATEGORICOS)

    ruta = cfg.out / "infra_puntos.geojson"
    st = write_geojson(ruta, feats)
    resumen = " ".join(f"{k} {v}" for k, v in sorted(por_familia.items()))
    log(
        cfg,
        "infra",
        f"{len(feats)} elementos en {len(por_familia)} familias ({resumen})"
        f" · {preparadas} escuelas preparadas"
        f" · {sum(sin_comuna.values())} sin comuna del modelo"
        f" · {sum(fuera_de_chile.values())} fuera de Chile continental"
        f" · {sum(lejos.values())} con el CUT del insumo lejos de su coordenada"
        f" · {humano(st['bytes'])}",
    )

    return {
        "titulo": "Infraestructura crítica y comunidades preparadas",
        "archivo": "infra_puntos.geojson",
        "formato": "geojson",
        "geometria": "Point",
        "features": len(feats),
        "bytes": st["bytes"],
        "bbox": st["bbox"],
        "filtros": ["familia", "cut"],
        "codificados": CATEGORICOS,
        "tablas": tablas,
        "dominios": {**doms, **dominios(feats, ["cut"])},
        # La etiqueta larga de cada familia, UNA vez y no en cada punto.
        "familias": {f[1]: f[2] for f in FUENTES},
        "cobertura": "nacional",
        "fuente": {
            "por_familia": por_familia,
            "escuelas_preparadas": preparadas,
            "sin_comuna": sin_comuna,
            "sin_geometria": sin_geometria,
            # Isla de Pascua y Juan Fernandez, por familia (ver la cabecera).
            "fuera_de_chile": fuera_de_chile,
            # Puntos cuyo CUT del insumo no cuadra con donde estan (ver arriba).
            "cut_fuera_de_su_caja": {
                "total": sum(lejos.values()),
                "por_familia": lejos,
                "max_km": round(max_km, 1),
                "margen_grados": MARGEN_CAJA,
            },
        },
    }


def _comunas_del_riesgo(cfg: Cfg) -> tuple[dict, dict, dict]:
    """(clave de nombre -> (cut, nombre), cut -> nombre, cut -> caja) del modelo de riesgo.

    Se lee del manifest que la corrida ya escribio o, si esta capa va sola, del
    publicado. Sin esa tabla no hay forma de resolver por nombre las 18.006
    antenas, que traen `cod_comuna` vacio.
    """
    import json

    partes = {}
    for candidato in (cfg.out / "manifest.json", RAIZ / "frontend" / "public" / "data" / "manifest.json"):
        if not candidato.exists():
            continue
        try:
            man = json.loads(candidato.read_text(encoding="utf-8"))
        except ValueError:
            continue
        partes = ((man.get("capas") or {}).get("riesgo") or {}).get("partes") or {}
        if partes:
            break

    por_nombre: dict[str, tuple[str, str]] = {}
    por_cut: dict[str, str] = {}
    cajas: dict[str, list] = {}
    for cut, p in partes.items():
        por_cut[cut] = p.get("comuna")
        if p.get("bbox"):
            cajas[cut] = p["bbox"]
        for nombre in [p.get("comuna"), *(p.get("alias") or [])]:
            if nombre:
                por_nombre.setdefault(_clave(nombre), (cut, p.get("comuna")))
    return por_nombre, por_cut, cajas
