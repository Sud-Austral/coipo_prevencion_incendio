"""Lee en pandas EXACTAMENTE lo que el visor pinta: las capas de frontend/public/data.

Es la contraparte en Python de frontend/src/App.jsx + hooks/useDatos.js. Mismo
contrato (manifest.json), mismos vocabularios, mismos centinelas -- y por eso
ninguna cifra que salga de aqui puede discrepar de la que muestra el visor sin
que uno de los dos este roto.

    import sys; sys.path.insert(0, "analisis")
    from leer_capas import cargar, leer_manifest
    df = cargar()                 # 14.705 filas x 34 columnas

POR QUE LA CAPA PUBLICADA Y NO LA FUENTE. Aqui, a diferencia del catastro, la
fuente TAMBIEN esta en disco (INSUMO_INCENDIO/, 775 archivos, 830 MB). Se lee de
todas formas la capa publicada porque es literalmente lo que el visor pinta,
porque trae el manifest --que es el contrato-- y porque el ETL ya resolvio ahi
los problemas caros de la fuente: el huso UTM que no venia declarado y cambia
POR FILA, los cuatro CRS mezclados entre 33 shapefiles, y las longitudes que en
los .dbf venian en grados. Rehacer eso desde el Excel es reimplementar
ETL/build_incendios.py con peor informacion.

POR QUE AQUI NO HAY UN .bin. El catastro son 1,83 M de centroides y ahi un
columnar binario se paga solo. Estas son 14.705 filas y el reparto ya esta
resuelto en dos niveles: la geometria pesada (19.242 lineas, 5,7 M de vertices)
SI es binaria --rutas.pmtiles y redvial.pmtiles, con HTTP Range por viewport-- y
las capas ligeras se quedan en GeoJSON porque hay que filtrarlas por atributo y
tenerlas enteras en memoria igual. Y la idea que motiva un .bin --no repetir
cadenas-- si esta aplicada dentro del JSON: ETL/gj_io.py:87-125 sustituye los
categoricos por indices enteros contra tablas del manifest. Es dictionary
encoding; lo que cambia es el contenedor.

NADA HARDCODEADO. Vocabularios, campos codificados, filtros y precision salen
del manifest. Si el ETL cambia el vocabulario, este lector cambia solo. Lo unico
que se afirma es la GENERACION del esquema, y se afirma a gritos: ver
`exigir_contrato`.

--------------------------------------------------------------------------
CUATRO TRAMPAS, MEDIDAS SOBRE ESTE DATASET (manifest generado 2026-08-25)
--------------------------------------------------------------------------

1. ACUMULACION EN float32. El formato es JSON de TEXTO: no hay ni un f32 en el
   archivo, asi que la trampa no la pone el dato sino el lector que degrade al
   cargar. Medido sobre `superficie_ha` (n=14.624): la suma en f64 da
   666.197,20 ha; acumulando en f32 da 666.197,25, o sea +0,05 ha (7,5e-6 %),
   que es un ULP de f32 a esa magnitud. math.fsum, np.sum y el sum() de Python
   coinciden EXACTAMENTE en f64. Aqui todo numerico entra como float64 y
   `cargar(verificar=True)` comprueba que ninguna columna quedo en float32.

2. LOS CENTINELAS NO SON DATOS. El ETL ya tradujo los suyos
   (ETL/build_incendios.py:69-72) a CLAVES AUSENTES: no hay -1 ni null, la clave
   simplemente no esta en `properties` (gj_io.py:123 hace `del`). Pero varios
   SOBREVIVEN como etiqueta real dentro de las tablas del manifest, y sin
   traducirlos se convierten en una categoria mas:

       provincia[33]         'Sin registro'                    74 filas
       comuna[71]            'Sin registro'                    67 filas
       jefe_brigada[4]       'Sin informacion'                664 filas
       jefe_brigada[14]      'Sin estimar'                    231 filas
       jefe_brigada[15]      'Sin causa'                      219 filas
       jefe_brigada[32]      'Sin determinar'                  42 filas
       jefe_brigada[37]      'Sin Informacion'  (otra caja)    36 filas
       jefe_brigada[47]      'Sin Estimar'      (otra caja)    20 filas
       jefe_brigada[77]      '--'                               5 filas
       jefe_brigada[198/199] 'Periodo sin brigada(s)'         1 + 1 filas

   Total en jefe_brigada: 1.219 filas = 8,29 %, que sumadas a las 1.645 que ya
   venian ausentes dejan el campo con 2.864 NA (19,48 %). Sin traducirlos, 'Sin
   informacion' seria la 5a categoria mas frecuente del campo.

   DOS EXCEPCIONES QUE NO SE TOCAN, y por eso los centinelas se aplican por
   capa y no globalmente:
     - 'Sin informe' NO es centinela (ETL/build_incendios.py:319-323): dice que
       la investigacion no produjo informe, que es un dato.
     - 'Sin determinar' en `oecv.tipo` SI es una categoria OFICIAL (Memo N
       3045/2025). En jefe_brigada es un centinela; en oecv.tipo no. `cargar()`
       aplica centinelas solo a incendios; `cargar_lineas()` no aplica ninguno.

   `superficie_ha` tiene ademas 71 filas con valor EXACTAMENTE 0,0. Como
   build_incendios.py:306 hace round(sup, 2), ese 0,0 confunde "menos de 0,005
   ha" con "cero registrado". NO se convierte a NA --seria inventar una
   interpretacion-- sino que se marca en la columna `superficie_cero`.

3. LAS ETIQUETAS SE REPITEN ENTRE CODIGOS DISTINTOS. Aqui pasa de tres formas y
   las tres importan:

   a) EN AMBAS DIRECCIONES dentro de causa_general. Las 14 etiquetas se reparten
      en 23 pares (etiqueta, codigo oficial): NUEVE etiquetas tienen mas de un
      codigo --'Otras quemas' es 4.8 (2.485 filas) y 1.8 (5); 'Lineas
      electricas' es 4.9 (1.143) y 1.9 (105)-- y DOS codigos llevan mas de una
      etiqueta: 4.1 es a la vez 'Faenas forestales' (914) y 'Otras causas'
      (1.006), y 1.1 lo mismo. O sea: ni la etiqueta ni el codigo bastan solos.
      En causa_especifica x causa_codigo, en cambio, la correspondencia es 1:1
      perfecta (92 <-> 92).

   b) ENTRE VOCABULARIOS: 88 etiquetas aparecen en mas de un campo. 'Valparaiso'
      es region[5], provincia[13] Y comuna[7]. 'Sin registro' es provincia[33] y
      comuna[71]. Sin decir de que campo, una etiqueta no identifica nada.

   c) LA MISMA COMUNA BAJO VARIOS CODIGOS: 35 comunas reales estan repartidas en
      76 codigos por variantes de mayusculas y espacios ('San Pedro de la Paz'
      bajo los codigos 53, 254, 256, 289, 312 y 328; 'Talcahuano' bajo 3),
      afectando 2.450 filas = 16,7 %. Los 351 codigos colapsan a 310 comunas.
      Agrupar por codigo SOBRE-fragmenta, y por etiqueta cruda tambien.

   Por eso cada dimension sale DOS veces --`<campo>` con la etiqueta y
   `<campo>_cod` con el codigo-- y comuna sale CUATRO (ver `cargar`).

   ATENCION, y es la diferencia con el catastro: aqui `<campo>_cod` NO es un
   codigo oficial. Es la POSICION en la tabla del manifest, que gj_io.codificar
   ordena POR FRECUENCIA DESCENDENTE, asi que cambia entre corridas del ETL.
   Los unicos identificadores oficiales y citables de este dataset son
   `causa_codigo` y `causa_general_codigo`, del catalogo de causas 2023.

4. `groupby` DE PANDAS DESCARTA LOS NA POR DEFECTO, y este modulo no puede
   desactivarlo: hay que tenerlo presente en cada agregacion. Medido:

       inv_inicio          4.890 ausentes  (33,25 %)
       inv_fin             3.342           (22,73 %)
       informe             2.317           (15,76 %)
       jefe_brigada        1.645           (11,19 %)
       hora_r20              220           ( 1,50 %)
       inicio_r20            176           ( 1,20 %)
       superficie_ha          81           ( 0,55 %)
       mes_investigacion      34           ( 0,23 %)
       id / n_incendio       6 / 3

   Un `groupby('inv_inicio')` pierde UN TERCIO de las filas sin decir nada. Y
   hay un segundo efecto: en las columnas territoriales los ausentes son CERO
   hasta que se aplica la trampa 2. Al traducir 'Sin registro' a NA, provincia
   pasa a 74 NA y comuna a 67, y ahi si un groupby por defecto pierde esas filas
   en silencio. Las trampas 2 y 4 son la misma trampa vista dos veces. Usa
   `agrupar()`, que conserva los NA y avisa del descuadre.

FECHAS QUE NO PUEDEN SER. `norm_fecha` del ETL valida el FORMATO, no el
calendario, asi que un ano tecleado al reves pasa. Detectado y reportado por
`_auditar_fechas`, nunca corregido: 3 filas de `inv_fin` con ano 0203
(0203-01-25 / 03-07 / 03-14, casi seguro 2023) que caen FUERA del rango de
datetime64[ns] y que un `to_datetime(errors='coerce')` convertiria en NaT sin
decir nada; 4 fechas posteriores a la propia corrida del ETL (inicio_r20
2028-01-18, inv_inicio 2026-12-10, inv_fin 2029-06-10 x2); y 24 filas donde la
investigacion termina ANTES de empezar, marcadas en `inv_incoherente`.

PRECISION DE LAS COORDENADAS: lon/lat vienen redondeadas a `manifest.precision`
= 5 decimales (~1,1 m). Eso es precision de ALMACENAMIENTO, no exactitud: el
huso UTM de origen no venia declarado y se dedujo por region
(ETL/build_incendios.py:1-20). No sirve para trabajo predial ni legal.

CAPAS VIALES: `rutas` y `redvial` NO se pueden leer como features. Solo existen
como PMTiles, ETL/_build/ esta vacio y el teselado lleva
--drop-densest-as-needed, asi que lo recuperable de las teselas no es el
conjunto fiel. `meta_teselas()` devuelve lo que el manifest sabe de ellas.

Uso desde la linea de comandos:
    python analisis/leer_capas.py                       resumen y chequeos
    python analisis/leer_capas.py --capa oecv
    python analisis/leer_capas.py --parquet salidas/incendios.parquet
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import struct
import sys
import unicodedata
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Contrato
# ---------------------------------------------------------------------------

# No existe ningun campo de version en el manifest ni constante de esquema en el
# ETL (comprobado: ETL/run.py:145-162 escribe generado/simplify_m/precision/
# tippecanoe/capas/kpis y nada mas). Asi que la generacion se nombra aqui y se
# afirma con CODIFICADOS_ESPERADOS + huella().
#
# La fecha es la de la GENERACION DEL ESQUEMA --el commit 9f5c069, "nuevas
# columnas", que llevo build_incendios de 13 a 23 columnas emitidas-- y NO la de
# la corrida que produjo los datos, que va en `manifest.generado` y cambia cada
# vez que Actions reejecuta el ETL. Las dos se imprimen juntas en `resumen()`
# justo para que no se confundan.
ESQUEMA = "incendios/2026-08-25"

# El conjunto de campos codificados ES la firma de la generacion. El snapshot
# anterior (2026-08-07) declaraba solo los siete primeros; leerlo con este
# lector daria un DataFrame sin los codigos oficiales de causa y sin las diez
# columnas nuevas, EN SILENCIO. Eso es lo que este conjunto impide.
CODIFICADOS_ESPERADOS = frozenset({
    "region", "provincia", "comuna", "temporada",
    "causa_grupo", "causa_general", "causa_especifica",
    "causa_general_codigo", "causa_codigo",
    "jefe_brigada", "investigado_por", "mes_investigacion",
})

CAPAS_GEOJSON = ("incendios", "oecv", "oecv_verificado", "puntos_standby")
CAPAS_TESELAS = ("rutas", "redvial")

# Mismo rectangulo que ETL/verify.py:22. minlon, minlat, maxlon, maxlat.
CHILE = (-76.0, -56.0, -66.0, -17.0)

# Centinelas de "no hay dato" que sobreviven como etiqueta. Se comparan por
# igualdad EXACTA sobre la clave normalizada, NUNCA por subcadena: varias causas
# especificas legitimas contienen "sin " ("...que se propaga libre y sin
# control") y una comparacion laxa las tiraria a NA.
CENTINELAS = frozenset({
    "sin registro", "sin informacion", "sin info", "sin dato", "sin datos",
    "no aplica", "s/i", "-", "--", "nan", "none", "null",
    "sin estimar", "sin causa", "sin determinar",
    "periodo sin brigada", "periodo sin brigadas",
})

# 'Sin informe' dice que la investigacion no produjo informe: es un dato, no una
# ausencia. ETL/build_incendios.py:319-323 lo conserva a proposito.
NO_CENTINELAS = frozenset({"sin informe"})

# Columnas de incendios que son fecha ISO / hora, no categoricas.
FECHAS = ("inicio_r20", "inv_inicio", "inv_fin")


class ContratoDesfasado(ValueError):
    """El manifest no es de la generacion contra la que se escribio el lector."""


class DatosAusentes(FileNotFoundError):
    """Falta la capa publicada en disco."""


class PaletaIncompleta(ValueError):
    """La paleta del visor no cubre alguna clase presente en los datos."""


# ---------------------------------------------------------------------------
# Localizacion
# ---------------------------------------------------------------------------

# Dos anclas y no una: 'ETL' a secas haria match en cualquier carpeta que se
# llame igual, y el lector acabaria leyendo los datos de otro repo.
ANCLAS = ("ETL/run.py", "frontend/src/config.js")


def raiz_repo(desde=None):
    """Sube desde `desde` (o el cwd) hasta el directorio que tenga las dos anclas.

    Asi el notebook funciona lo mismo abierto desde analisis/, desde la raiz o
    desde JupyterLab con otro directorio de trabajo.
    """
    p = Path(desde or os.environ.get("COIPO_RAIZ") or os.getcwd()).resolve()
    candidatos = [p, *p.parents]
    # Tambien desde el propio archivo: importar el modulo y correr desde otra
    # carpeta cualquiera tiene que funcionar.
    aqui = Path(__file__).resolve()
    candidatos += [aqui.parent, *aqui.parents]
    for cand in candidatos:
        if all((cand / a).exists() for a in ANCLAS):
            return cand
    raise FileNotFoundError(
        "no encuentro la raiz del repo (hacen falta " + " y ".join(ANCLAS)
        + ") subiendo desde " + str(p)
    )


def ruta_datos(raiz=None):
    """frontend/public/data. Falla diciendo COMO conseguirla."""
    d = (Path(raiz) if raiz else raiz_repo()) / "frontend" / "public" / "data"
    if not (d / "manifest.json").exists():
        raise DatosAusentes(
            "no hay manifest.json en " + str(d) + ".\n"
            "La capa publicada la genera el ETL y la publica GitHub Actions.\n"
            "  Consiguela con:  cd frontend && npm run datos\n"
            "  NO la regeneres en Windows con `python ETL/run.py`: sin "
            "tippecanoe, ETL/tiles.py degrada a GeoJSON y cambia el formato "
            "publicado de las capas viales."
        )
    return d


def _leer_json(ruta):
    """Nunca open() sin encoding: en Windows el default es cp1252 y destroza
    todas las tildes de regiones, comunas y causas."""
    return json.loads(Path(ruta).read_bytes().decode("utf-8"))


# ---------------------------------------------------------------------------
# Normalizacion
# ---------------------------------------------------------------------------

# Marcas diacriticas combinantes (U+0300..U+036F). Se construye desde una CADENA
# y no como literal de regex por la misma razon que config.js:53-63: escrito
# como literal, el archivo acaba guardando los combinantes de verdad, que son
# invisibles al revisar el diff y los destruye cualquier herramienta que
# normalice el fuente.
_DIACRITICOS = re.compile("[̀-ͯ]")
_AGUDOS = re.compile("[´’`]")


def clave(s):
    """Clave de comparacion: sin tildes, sin caja, espacios colapsados."""
    if s is None:
        return ""
    t = unicodedata.normalize("NFKD", str(s).replace("\xa0", " "))
    t = _DIACRITICOS.sub("", t)
    return " ".join(t.casefold().split())


def es_centinela(s):
    """Igualdad EXACTA sobre la clave normalizada. Ver CENTINELAS."""
    k = clave(s)
    return bool(k) and k in CENTINELAS and k not in NO_CENTINELAS


def norm_region(s):
    """Espejo exacto de normRegion (frontend/src/indicadores.js:18-22).

    Hace falta porque kpis.json publica la clave de O'Higgins con acento agudo
    U+00B4 mientras las capas usan el apostrofo U+0027. Un join literal PIERDE
    O'Higgins, que es la 2a region del pais por km planificados (836,8). El
    frontend lo parchea; en Python no hay equivalente --ni geo.canon_region ni
    build_kpis.py lo hacen-- asi que se replica aqui.
    """
    return _AGUDOS.sub("'", unicodedata.normalize("NFC", str(s or ""))).strip()


def es(x, dec=0):
    """Formato chileno: punto de miles y coma decimal. Un total nacional escrito
    a la inglesa en un informe de CONAF se lee mal o, peor, se lee al reves."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "--"
    return f"{x:,.{dec}f}".translate(str.maketrans({",": ".", ".": ","}))


# ---------------------------------------------------------------------------
# El ETL como fuente de verdad, leido con ast (NO se importa)
# ---------------------------------------------------------------------------

def _literal_del_modulo(ruta, nombre):
    """Extrae una constante literal de un .py SIN importarlo.

    No se importa a proposito: ETL/ es un paquete plano que se importa por
    nombre desnudo tras un sys.path.insert, y cfg.Cfg crea directorios al
    instanciarse. Leer el AST no ejecuta nada.
    """
    try:
        arbol = ast.parse(Path(ruta).read_bytes().decode("utf-8"))
    except (OSError, SyntaxError):
        return None
    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign):
            for t in nodo.targets:
                if getattr(t, "id", None) == nombre:
                    try:
                        return ast.literal_eval(nodo.value)
                    except ValueError:
                        return None
    return None


def esquema_del_etl(raiz=None):
    """Lo que el ETL del arbol de trabajo dice que produce."""
    r = Path(raiz) if raiz else raiz_repo()
    return {
        "categoricos": _literal_del_modulo(r / "ETL" / "build_incendios.py", "CATEGORICOS"),
        "regiones": _literal_del_modulo(r / "ETL" / "geo.py", "REGIONES"),
        "km_oficial": _literal_del_modulo(r / "ETL" / "build_oecv.py", "KM_OFICIAL_NACIONAL"),
        "tolerancia_pct": _literal_del_modulo(r / "ETL" / "build_oecv.py", "TOLERANCIA_PCT"),
    }


# ---------------------------------------------------------------------------
# Manifest y contrato
# ---------------------------------------------------------------------------

def huella(man):
    """sha256 de lo ESTRUCTURAL del manifest.

    Entra: nombres de capa, (archivo, formato, geometria) de cada una,
    sorted(codificados), sorted(filtros), y por campo codificado
    (len(tabla), sha1 de las etiquetas ORDENADAS alfabeticamente).

    NO entra: `generado`, features, bytes, bbox, segundos, los conteos de los
    dominios y --lo importante-- EL ORDEN de las tablas. gj_io.codificar ordena
    por frecuencia, asi que dos corridas del mismo ETL sobre el mismo Excel dan
    ordenes distintos en cuanto cambie una sola fila. Meter el orden en la
    huella la haria inutilmente fragil; dejarlo fuera es lo que hace que la
    huella signifique "mismo esquema" y no "mismos datos".
    """
    partes = []
    for capa in sorted(man.get("capas", {})):
        m = man["capas"][capa]
        partes.append([
            capa, m.get("archivo"), m.get("formato"), m.get("geometria"),
            sorted(m.get("codificados") or []),
            sorted(m.get("filtros") or []),
            [[c, len(t), hashlib.sha1(" ".join(sorted(t)).encode("utf-8")).hexdigest()]
             for c, t in sorted((m.get("tablas") or {}).items())],
        ])
    canon = json.dumps(partes, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def archivos_huerfanos(man, datos=None):
    """Archivos de datos en disco que ninguna capa del manifest declara."""
    d = Path(datos or man.get("_ruta") or "")
    if not d.is_dir():
        return []
    declarados = {m["archivo"] for m in man.get("capas", {}).values()}
    declarados |= {man.get("kpis") or "kpis.json", "manifest.json"}
    return sorted(
        p.name for p in d.iterdir()
        if p.is_file() and p.suffix in (".geojson", ".pmtiles", ".json")
        and p.name not in declarados
    )


def exigir_contrato(man, *, estricto=True):
    """Comprueba que el manifest es de la generacion esperada. Devuelve avisos.

    Falla RUIDOSAMENTE y nombrando el diff concreto. Es el chequeo que habria
    cazado el desfase real que existia en este repo: el manifest en disco
    declaraba 7 campos codificados mientras ETL/build_incendios.CATEGORICOS
    declaraba 12, y el resultado no era un error sino un DataFrame plausible al
    que le faltaban los codigos oficiales de causa.
    """
    avisos = []
    inc = (man.get("capas") or {}).get("incendios")
    if inc is None:
        raise ContratoDesfasado("el manifest no declara la capa 'incendios'")

    cod = set(inc.get("codificados") or [])
    if cod != CODIFICADOS_ESPERADOS:
        faltan = sorted(CODIFICADOS_ESPERADOS - cod)
        sobran = sorted(cod - CODIFICADOS_ESPERADOS)
        msg = (
            "el manifest (" + str(man.get("generado")) + ") no es de la "
            "generacion " + ESQUEMA + ".\n"
            "  campos codificados que FALTAN: " + str(faltan or "ninguno") + "\n"
            "  campos codificados que SOBRAN: " + str(sobran or "ninguno") + "\n"
            "  Sincroniza con `cd frontend && npm run datos`, o actualiza "
            "CODIFICADOS_ESPERADOS si el ETL cambio a proposito."
        )
        if estricto:
            raise ContratoDesfasado(msg)
        avisos.append(msg)

    tablas = inc.get("tablas") or {}
    if set(tablas) != cod:
        raise ContratoDesfasado(
            "`codificados` y `tablas` no coinciden: "
            + str(sorted(set(tablas) ^ cod)) + " aparece solo en uno de los dos"
        )

    for campo, tabla in tablas.items():
        if len(set(tabla)) != len(tabla):
            raise ContratoDesfasado(
                "la tabla '" + campo + "' tiene etiquetas repetidas; el indice "
                "deja de ser reversible"
            )

    # Invariante de gj_io.codificar: dominios[campo][k]['i'] == k.
    for capa, m in man["capas"].items():
        for campo, dom in (m.get("dominios") or {}).items():
            if dom and "i" in dom[0] and any(d["i"] != k for k, d in enumerate(dom)):
                raise ContratoDesfasado(
                    capa + ".dominios." + campo + " no cumple dominios[k]['i'] == k"
                )

    faltan_capas = [c for c in CAPAS_GEOJSON if c not in man["capas"]]
    if faltan_capas:
        avisos.append("el manifest no declara las capas " + str(faltan_capas))

    huerfanos = archivos_huerfanos(man)
    if huerfanos:
        avisos.append(
            "archivos publicados que el manifest NO declara: " + str(huerfanos)
            + " (su validacion seria parcial: sin features/bytes/bbox declarados)"
        )
    return avisos


def leer_manifest(datos=None, *, estricto=True, avisar=True):
    """El contrato. Se valida ANTES de tocar un solo byte de las capas."""
    d = Path(datos) if datos else ruta_datos()
    man = _leer_json(Path(d) / "manifest.json")
    man["_ruta"] = str(d)
    man["_huella"] = huella(man)
    for a in exigir_contrato(man, estricto=estricto):
        if avisar:
            warnings.warn(a, stacklevel=2)
    return man


def tabla(man, campo, capa="incendios"):
    """indice -> etiqueta, como Serie. Es LA fuente del vocabulario."""
    t = man["capas"][capa]["tablas"][campo]
    return pd.Series(t, index=pd.RangeIndex(len(t)), name=campo, dtype="string")


def dominios(man, campo, capa="incendios"):
    """DataFrame i / v / n con el histograma que declaro el ETL."""
    return pd.DataFrame(man["capas"][capa]["dominios"][campo])


# ---------------------------------------------------------------------------
# Lectura de las capas
# ---------------------------------------------------------------------------

def _abrir_capa(man, capa):
    """Devuelve (features, meta) y comprueba tamano en disco y numero de filas.

    El chequeo de bytes es el equivalente aqui del sha256 del catastro: el
    manifest declara `bytes` y el frontend lo ENSENA al usuario pero nunca lo
    contrasta (SeccionDescargas.jsx:32). Es seguro porque gj_io escribe el
    GeoJSON compacto en una sola linea: no hay saltos que ningun checkout pueda
    normalizar.
    """
    meta = man["capas"][capa]
    ruta = Path(man["_ruta"]) / meta["archivo"]
    if not ruta.exists():
        raise DatosAusentes("falta " + str(ruta) + " (declarado en el manifest)")
    real = ruta.stat().st_size
    if "bytes" in meta and real != meta["bytes"]:
        raise ValueError(
            str(ruta) + " mide " + es(real) + " bytes y el manifest declara "
            + es(meta["bytes"]) + ". El archivo esta truncado o es de otra "
            "corrida del ETL."
        )
    gj = _leer_json(ruta)
    if gj.get("type") != "FeatureCollection":
        raise ValueError(str(ruta) + " no es una FeatureCollection")
    feats = gj["features"]
    if "features" in meta and len(feats) != meta["features"]:
        raise ValueError(
            capa + ": el archivo trae " + es(len(feats)) + " features y el "
            "manifest declara " + es(meta["features"])
        )
    return feats, meta


def _coords_punto(feats):
    lon = np.empty(len(feats), dtype=np.float64)
    lat = np.empty(len(feats), dtype=np.float64)
    for i, f in enumerate(feats):
        c = f["geometry"]["coordinates"]
        lon[i] = c[0]
        lat[i] = c[1]
    return lon, lat


def _revisar_geometria(capa, lon, lat):
    if not np.isfinite(lon).all() or not np.isfinite(lat).all():
        raise ValueError(capa + ": hay coordenadas NaN o infinitas")
    fuera = (lon < CHILE[0]) | (lon > CHILE[2]) | (lat < CHILE[1]) | (lat > CHILE[3])
    if fuera.any():
        raise ValueError(
            capa + ": " + es(int(fuera.sum())) + " geometrias caen fuera del "
            "rectangulo de Chile " + str(CHILE)
        )


def _categorica(codigos, etiquetas):
    """Categorical desde indices, con -1 = ausente.

    Las categorias van EN EL ORDEN DE LA TABLA del manifest, que es por
    frecuencia descendente. Eso hace que cualquier groupby o plot ordenado
    salga por frecuencia sin reordenar a mano.
    """
    return pd.Categorical.from_codes(codigos, categories=list(etiquetas))


def _entero(codigos):
    """Int16 nullable: -1 pasa a NA."""
    return pd.arrays.IntegerArray(codigos.astype(np.int16), mask=(codigos < 0))


def cargar(datos=None, *, etiquetas=True, verificar=True, centinelas=True,
           man=None):
    """Devuelve el DataFrame de los 14.705 incendios que pinta el visor.

    Columnas, en orden:

      id            Int64 (6 ausentes)     n_incendio  string (3 ausentes)
      nombre        string                 lon, lat    float64 (SIEMPRE f64)
      <campo>       category   etiqueta legible; categorias en el orden de la
                               tabla del manifest (frecuencia descendente)
      <campo>_cod   Int16      POSICION en esa tabla. NO es un codigo oficial:
                               cambia entre corridas del ETL. Ver trampa 3.
      comuna_norm   category   clave de agrupacion; las 310 comunas reales
      comuna_canon  category   etiqueta representativa del grupo, para rotular
      superficie_ha float64                superficie_cero  bool
      <fecha>       datetime64[ns] para inicio_r20 / inv_inicio / inv_fin
      hora_r20      string                 informe     string
      utm_x, utm_y  float64                utm_epsg    Int32

    Los `<campo>` salen de manifest.capas.incendios.codificados: si manana el
    ETL codifica un campo mas, sale una columna mas sin tocar este archivo.

    REGLA PARA COMUNA, y esta escrita aqui porque es la que mas cuesta: agrupa
    por `comuna_norm`, rotula con `comuna_canon`, y cita `comuna` cuando
    reportes una fila concreta. Un ranking comunal hecho sobre `comuna` o sobre
    `comuna_cod` reparte San Pedro de la Paz entre 6 codigos y Talcahuano entre
    3, y ambas caen del lugar que les toca.

    `etiquetas=False` deja solo los indices crudos: mas rapido y mas ligero,
    util cuando el analisis va a agregar por indice y traducir al final.
    `centinelas=False` conserva 'Sin registro' y compania como categoria.
    `verificar=False` salta los chequeos contra el manifest.
    """
    man = man or leer_manifest(datos)
    feats, meta = _abrir_capa(man, "incendios")
    n = len(feats)
    props = [f["properties"] for f in feats]

    lon, lat = _coords_punto(feats)
    if verificar:
        _revisar_geometria("incendios", lon, lat)

    df = pd.DataFrame({"lon": lon, "lat": lat})

    df["id"] = pd.array([p.get("id") for p in props], dtype="Int64")
    df["n_incendio"] = pd.array([p.get("n_incendio") for p in props], dtype="string")
    df["nombre"] = pd.array([p.get("nombre") for p in props], dtype="string")

    codificados = list(meta["codificados"])
    tablas = meta["tablas"]
    aplicados = {}

    for campo in codificados:
        t = tablas[campo]
        cod = np.fromiter(
            (p.get(campo, -1) for p in props), dtype=np.int32, count=n
        )
        fuera = (cod >= len(t)) | (cod < -1)
        if fuera.any():
            # Un indice fuera de rango no es un centinela: es un GeoJSON que no
            # corresponde a este manifest, y hay que verlo, no absorberlo.
            raise ContratoDesfasado(
                str(int(fuera.sum())) + " filas indexan fuera de la tabla '"
                + campo + "' (" + str(len(t)) + " entradas). El GeoJSON y el "
                "manifest.json no son de la misma corrida del ETL."
            )
        if not etiquetas:
            df[campo] = _entero(cod)
            continue

        if centinelas:
            # Se anulan los CODIGOS cuya etiqueta es un centinela, antes de
            # construir la categorica: asi la categoria ni siquiera existe.
            malos = [i for i, v in enumerate(t) if es_centinela(v)]
            if malos:
                mascara = np.isin(cod, malos)
                if mascara.any():
                    aplicados[campo] = {
                        t[i]: int((cod == i).sum()) for i in malos
                        if (cod == i).any()
                    }
                    cod = np.where(mascara, -1, cod)

        df[campo] = _categorica(cod, t)
        df[campo + "_cod"] = _entero(cod)

    if etiquetas and "comuna" in codificados:
        norm, canon = _canon_comuna(man)
        cc = df["comuna_cod"].to_numpy(dtype="float64")
        idx = np.where(np.isnan(cc), -1, np.nan_to_num(cc)).astype(np.int32)
        df["comuna_norm"] = _categorica(
            np.where(idx < 0, -1, [norm["cod"].get(i, -1) for i in idx]),
            norm["vals"],
        )
        df["comuna_canon"] = _categorica(
            np.where(idx < 0, -1, [canon["cod"].get(i, -1) for i in idx]),
            canon["vals"],
        )

    # f64 a proposito: ver la trampa 1 de la cabecera del modulo.
    sup = np.fromiter(
        (float(p["superficie_ha"]) if "superficie_ha" in p else np.nan
         for p in props), dtype=np.float64, count=n,
    )
    df["superficie_ha"] = sup
    # 71 filas valen exactamente 0,0 y no se sabe si es "muy pequeno" o "no
    # registrado": se marca, no se interpreta.
    df["superficie_cero"] = sup == 0.0

    auditoria = {}
    for campo in FECHAS:
        crudo = pd.Series([p.get(campo) for p in props], dtype="object")
        df[campo] = pd.to_datetime(crudo, format="%Y-%m-%d", errors="coerce")
        aud = _auditar_fechas(crudo, df[campo], man["generado"][:10])
        if aud:
            auditoria[campo] = aud
    df["hora_r20"] = pd.array([p.get("hora_r20") for p in props], dtype="string")
    df["informe"] = pd.array([p.get("informe") for p in props], dtype="string")

    # Investigacion que termina antes de empezar. 24 filas. No se corrige --no
    # se sabe cual de las dos fechas esta mal-- pero cualquier calculo de
    # duracion tiene que excluirlas a proposito, no sin querer.
    if "inv_inicio" in df and "inv_fin" in df:
        df["inv_incoherente"] = (
            df["inv_inicio"].notna() & df["inv_fin"].notna()
            & (df["inv_inicio"] > df["inv_fin"])
        )
        n_inc = int(df["inv_incoherente"].sum())
        if n_inc:
            auditoria["inv_inicio/inv_fin"] = {"incoherentes": {"n": n_inc}}

    for campo, tipo in (("utm_x", "float64"), ("utm_y", "float64"), ("utm_epsg", "Int32")):
        if any(campo in p for p in props[:50]):
            vals = [p.get(campo) for p in props]
            df[campo] = pd.array(vals, dtype=tipo) if tipo == "Int32" else np.array(
                [np.nan if v is None else float(v) for v in vals], dtype=np.float64)

    df.attrs.update({
        "capa": "incendios",
        "generado": man["generado"],
        "huella": man["_huella"][:12],
        "esquema": ESQUEMA,
        "leidos": meta.get("leidos"),
        "descartados": meta.get("descartados"),
        "centinelas_aplicados": aplicados,
        "fechas_sospechosas": auditoria,
        "tablas": tablas,
        "advertencia": ADVERTENCIA_PRINCIPAL,
    })

    if verificar:
        _verificar_incendios(df, man, meta)
    return df


def _auditar_fechas(crudo, convertido, corte):
    """Fechas que el ETL dio por buenas y no pueden serlo.

    `norm_fecha` (ETL/build_incendios.py:124-150) valida el FORMATO, no el
    calendario: un ano tecleado al reves pasa el strptime tan campante. Aqui se
    miran tres cosas y NINGUNA se arregla, solo se reporta -- corregir una
    fecha es inventar un dato:

      fuera_de_rango  la cadena existe pero pandas no puede representarla en
                      datetime64[ns] (1677-09-21 .. 2262-04-11), asi que
                      to_datetime(errors='coerce') la convierte en NaT SIN
                      DECIR NADA. Medido: 3 filas de `inv_fin` con ano 0203
                      ('0203-01-25', '0203-03-07', '0203-03-14'), casi con
                      seguridad 2023 tecleado al reves. Es la diferencia entre
                      los 3.342 ausentes reales de inv_fin y los 3.345 NaT que
                      salen tras convertir.
      posteriores     fechas mas nuevas que la propia corrida del ETL, o sea
                      imposibles. Medido: inicio_r20 1 ('2028-01-18'),
                      inv_inicio 1 ('2026-12-10'), inv_fin 2 ('2029-06-10').
    """
    presentes = crudo.notna()
    perdidas = presentes & convertido.isna()
    fuera = sorted(crudo[perdidas].dropna().astype(str).unique())
    posteriores = sorted(
        crudo[presentes & (crudo.astype(str) > corte)].astype(str).unique())
    out = {}
    if fuera:
        out["fuera_de_rango"] = {"n": int(perdidas.sum()), "valores": fuera}
    if posteriores:
        out["posteriores_al_etl"] = {
            "n": int((presentes & (crudo.astype(str) > corte)).sum()),
            "valores": posteriores, "corte": corte}
    return out


def _canon_comuna(man):
    """Construye las dos columnas extra de comuna a partir del manifest.

    `comuna_norm`  clave normalizada -> las 310 comunas reales.
    `comuna_canon` etiqueta representativa de cada grupo: la variante con mas
                   filas segun `dominios`, y a igualdad la primera
                   alfabeticamente. El desempate es determinista para que dos
                   corridas den exactamente lo mismo.
    """
    t = man["capas"]["incendios"]["tablas"]["comuna"]
    conteo = {d["i"]: d["n"] for d in man["capas"]["incendios"]["dominios"]["comuna"]}

    grupos = {}
    for i, v in enumerate(t):
        if es_centinela(v):
            continue
        grupos.setdefault(clave(v), []).append(i)

    claves = sorted(grupos)
    rep = {}
    for k in claves:
        mejor = sorted(grupos[k], key=lambda i: (-conteo.get(i, 0), t[i]))[0]
        rep[k] = t[mejor]

    vals_norm = claves
    pos_norm = {k: j for j, k in enumerate(vals_norm)}
    vals_canon = [rep[k] for k in claves]
    # Puede haber dos claves distintas con la misma etiqueta representativa? No:
    # rep[k] normaliza a k, asi que etiquetas iguales implican claves iguales.
    pos_canon = {k: j for j, k in enumerate(claves)}

    return (
        {"vals": vals_norm,
         "cod": {i: pos_norm[k] for k in claves for i in grupos[k]}},
        {"vals": vals_canon,
         "cod": {i: pos_canon[k] for k in claves for i in grupos[k]}},
    )


def _verificar_incendios(df, man, meta):
    """Los chequeos que ETL/verify.py hace sobre la salida, del lado del lector."""
    f32 = [c for c in df.columns if str(df[c].dtype) == "float32"]
    if f32:
        raise ValueError("columnas en float32 (ver trampa 1): " + str(f32))

    bbox = [round(v, man["precision"]) for v in
            (df.lon.min(), df.lat.min(), df.lon.max(), df.lat.max())]
    if "bbox" in meta and bbox != [round(v, man["precision"]) for v in meta["bbox"]]:
        raise ValueError(
            "el bbox calculado " + str(bbox) + " no coincide con el del "
            "manifest " + str(meta["bbox"])
        )

    if meta.get("leidos") is not None and meta.get("descartados") is not None:
        if meta["leidos"] - meta["descartados"] != meta["features"]:
            raise ValueError(
                "leidos - descartados != features: " + str(meta["leidos"]) + " - "
                + str(meta["descartados"]) + " != " + str(meta["features"])
            )

    # Reversibilidad del indice: tabla[cod] tiene que devolver la etiqueta.
    for campo in meta["codificados"]:
        if campo + "_cod" not in df.columns:
            continue
        t = pd.Series(meta["tablas"][campo], dtype="object")
        cod = df[campo + "_cod"]
        ok = cod.notna()
        if not ok.any():
            continue
        esperado = t.reindex(cod[ok].astype("int64").to_numpy()).to_numpy()
        obtenido = df.loc[ok, campo].astype("object").to_numpy()
        if not (esperado == obtenido).all():
            raise ContratoDesfasado(
                "tabla['" + campo + "'][cod] no reproduce la etiqueta: el "
                "GeoJSON y el manifest no son de la misma corrida"
            )

    faltan = [c for c in meta.get("filtros", []) if c not in df.columns]
    if faltan:
        raise ValueError("faltan campos de filtro declarados: " + str(faltan))

    # Regiones canonizadas contra ETL/geo.py, como verify.py:170-186.
    try:
        canon = esquema_del_etl()["regiones"]
    except FileNotFoundError:
        canon = None
    if canon:
        intrusos = sorted(
            set(map(norm_region, df["region"].dropna().unique())) - set(canon)
        )
        if intrusos:
            raise ValueError("regiones no canonizadas: " + str(intrusos))


def cargar_lineas(capa, datos=None, *, verificar=True, man=None, geometria=True):
    """oecv (1.863 lineas) u oecv_verificado (1.114). Propiedades como strings.

    NO se aplican centinelas: en esta capa 'Sin determinar' es una categoria
    OFICIAL de titularidad (Memo N 3045/2025), no una ausencia.

    `longitud_km` es la que MIDIO EL ETL de forma geodesica sobre la geometria
    ORIGINAL y antes de simplificar a 10 m (ETL/build_oecv.py:74-81). Volver a
    medirla sobre la geometria publicada da otra cifra, mas corta. Son dos
    cosas distintas y no se sustituye una por la otra.
    """
    man = man or leer_manifest(datos)
    feats, meta = _abrir_capa(man, capa)
    props = [f["properties"] for f in feats]

    claves = []
    for p in props:
        for k in p:
            if k not in claves:
                claves.append(k)

    df = pd.DataFrame(index=pd.RangeIndex(len(feats)))
    for k in claves:
        if k == "longitud_km":
            df[k] = np.array(
                [float(p[k]) if k in p else np.nan for p in props], dtype=np.float64)
        else:
            df[k] = pd.array([p.get(k) for p in props], dtype="string")

    if geometria:
        df["geometria"] = [f["geometry"] for f in feats]
        df["n_vertices"] = [_contar_vertices(f["geometry"]) for f in feats]

    if verificar:
        lon, lat = [], []
        for f in feats:
            for x, y in _aplanar(f["geometry"]):
                lon.append(x)
                lat.append(y)
        _revisar_geometria(capa, np.array(lon), np.array(lat))
        if "longitud_km" in df and meta.get("longitud_km") is not None:
            d = abs(df["longitud_km"].sum() - meta["longitud_km"])
            if d > 0.05:
                raise ValueError(
                    capa + ": la suma de longitud_km da "
                    + es(df["longitud_km"].sum(), 3) + " y el manifest declara "
                    + es(meta["longitud_km"], 1)
                )

    df.attrs.update({
        "capa": capa, "generado": man["generado"],
        "huella": man["_huella"][:12],
        "km_por_region": meta.get("km_por_region"),
    })
    return df


def cargar_puntos(datos=None, *, verificar=True, man=None):
    """Los 327 puntos stand-by, en 7 de las 16 regiones.

    La ausencia es DE REGISTRO EN LA FUENTE, no necesariamente de brigadas
    (frontend/src/components/PanelIndicadores.jsx:706-718). No se puede concluir
    que una region sin puntos no tenga posiciones de espera.
    """
    man = man or leer_manifest(datos)
    feats, meta = _abrir_capa(man, "puntos_standby")
    props = [f["properties"] for f in feats]
    lon, lat = _coords_punto(feats)
    if verificar:
        _revisar_geometria("puntos_standby", lon, lat)

    claves = []
    for p in props:
        for k in p:
            if k not in claves:
                claves.append(k)
    df = pd.DataFrame({"lon": lon, "lat": lat})
    for k in claves:
        df[k] = pd.array([p.get(k) for p in props], dtype="string")
    df.attrs.update({
        "capa": "puntos_standby", "generado": man["generado"],
        "advertencia": "La ausencia es de registro en la fuente, no "
                       "necesariamente de brigadas.",
    })
    return df


def cargar_kpis(datos=None, *, man=None):
    """Avance OECV por region. Una fila por region, columnas del propio JSON.

    DOS TRAMPAS DEL ARCHIVO, las dos reales y las dos desactivadas aqui:

    1. La clave de O'Higgins viene con acento agudo U+00B4 y las capas usan el
       apostrofo U+0027. Un join literal pierde la 2a region del pais por km
       planificados. El indice va normalizado con norm_region(); la clave
       original queda en `region_bruta`.
    2. 'Arica y Parinacota' NO trae la clave 'reportado' --solo Planificado y
       FNDR, ambos en 0-- asi que un kpis['por_region'][r]['reportado'] revienta
       con KeyError. Aqui entra como NA.
    """
    man = man or leer_manifest(datos)
    ruta = Path(man["_ruta"]) / (man.get("kpis") or "kpis.json")
    k = _leer_json(ruta)["oecv"]
    por = k["por_region"]

    columnas = []
    for fila in por.values():
        for c in fila:
            if c not in columnas:
                columnas.append(c)

    df = pd.DataFrame(
        [[fila.get(c, np.nan) for c in columnas] for fila in por.values()],
        columns=columnas, dtype="float64",
    )
    df.insert(0, "region_bruta", list(por))
    df.index = pd.Index([norm_region(r) for r in por], name="region")

    if "Planificado" in df and "reportado" in df:
        with np.errstate(divide="ignore", invalid="ignore"):
            df["avance_pct"] = np.where(
                df["Planificado"] > 0, 100.0 * df["reportado"] / df["Planificado"], np.nan)
        df["reportado_supera_plan"] = df["reportado"] > df["Planificado"]

    df.attrs.update({
        "km_planificados": k.get("km_planificados"),
        "km_reportados": k.get("km_reportados"),
        "avance_pct": k.get("avance_pct"),
        "generado": man["generado"],
    })
    return df


def _aplanar(geom):
    salida = []

    def _walk(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            salida.append((c[0], c[1]))
        else:
            for x in c:
                _walk(x)

    _walk(geom["coordinates"])
    return salida


def _contar_vertices(geom):
    return len(_aplanar(geom))


# ---------------------------------------------------------------------------
# Capas de teselas: metadatos, nunca features
# ---------------------------------------------------------------------------

def _header_pmtiles(ruta):
    """Header PMTiles v3 (spec: 127 bytes, magic 'PMTiles').

    Mismos offsets que ETL/verify.py:60-74, que es el unico parseo binario del
    repo. Se reimplementa aqui en vez de importarlo para no acoplar el lector
    al paquete plano de ETL/.
    """
    head = Path(ruta).read_bytes()[:127]
    if len(head) < 127 or head[0:7] != b"PMTiles":
        return None
    minlon, minlat, maxlon, maxlat = struct.unpack_from("<4i", head, 102)
    return {
        "version": head[7],
        "minzoom": head[100], "maxzoom": head[101],
        "bbox": [minlon / 1e7, minlat / 1e7, maxlon / 1e7, maxlat / 1e7],
    }


def meta_teselas(capa, datos=None, *, man=None):
    """Lo que el manifest sabe de rutas / redvial. NO devuelve features.

    Son MVT dentro de PMTiles y ETL/_build/ esta vacio, asi que no hay GeoJSON
    intermedio. Y aunque se decodificara el MVT, el teselado corre con
    --drop-densest-as-needed (ETL/tiles.py:53-67): lo que se recuperase estaria
    fragmentado por tesela y diezmado por densidad, o sea NO reconciliaria con
    los 13.964 / 5.278 features que declara el manifest.

    Si de verdad hacen falta como features, la via honesta es regenerarlas:
        python ETL/run.py --layers redvial --no-tiles --out <carpeta_aparte>
    nunca sobre frontend/public/data.
    """
    man = man or leer_manifest(datos)
    meta = dict(man["capas"][capa])
    ruta = Path(man["_ruta"]) / meta["archivo"]
    if ruta.exists():
        meta["_bytes_en_disco"] = ruta.stat().st_size
        meta["_header"] = _header_pmtiles(ruta)
    meta["_legible_como_features"] = False
    return meta


# ---------------------------------------------------------------------------
# Agregacion honesta
# ---------------------------------------------------------------------------

def agrupar(datos, por, valor=None, *, aggfunc="sum", avisar=True):
    """groupby que NO pierde filas en silencio: conserva los NA y avisa.

    dropna=False (pandas usa True) y observed=True (con dtype category,
    observed=False materializa el producto cartesiano: 351 x 16 x 9 filas de
    ceros).

    Medido sobre este dataset, tras aplicar los centinelas: agrupar por
    'comuna' con el dropna por omision pierde 67 filas, y por 'provincia' 74.
    Por 'inv_inicio', 4.890 (33,25 %). Este helper las conserva y, si el total
    no cuadra, lo dice con la cifra exacta.
    """
    g = datos.groupby(por, observed=True, dropna=False)
    t = g.size().rename("n") if valor is None else getattr(g[valor], aggfunc)()

    # Cuantas filas caen en un grupo NA: son EXACTAMENTE las que un groupby por
    # defecto habria descartado sin decir nada. Se avisa aunque aqui no se
    # pierdan, porque el numero es el que hay que citar al comparar con
    # cualquier cifra calculada de la otra forma.
    campos = [por] if isinstance(por, str) else list(por)
    na = datos[campos].isna().any(axis=1)
    n_na = int(na.sum())
    if avisar and n_na:
        warnings.warn(
            es(n_na) + " filas (" + es(100.0 * n_na / len(datos), 2) + " %) caen "
            "en el grupo NA de " + str(por) + "; un groupby por omision las "
            "habria descartado en silencio", stacklevel=2)

    # Con `valor`, ademas, sum() ignora los NaN del propio valor.
    if valor is not None:
        perdido = float(datos[valor].sum()) - float(t.sum())
        if avisar and abs(perdido) > 0.01:
            warnings.warn(
                "el agrupamiento deja fuera " + es(perdido, 2) + " de " + valor,
                stacklevel=2)
        return t.sort_values(ascending=False)
    return t


def fragmentacion(man, campo, capa="incendios"):
    """Cuantos codigos distintos comparten la misma clave normalizada.

    No modifica nada: audita. Medido en comuna: 35 grupos, 76 codigos, 2.450
    filas (16,7 %), y 351 codigos que colapsan a 310 comunas reales.
    """
    t = man["capas"][capa]["tablas"][campo]
    conteo = {d["i"]: d["n"] for d in man["capas"][capa]["dominios"][campo]}
    grupos = {}
    for i, v in enumerate(t):
        grupos.setdefault(clave(v), []).append(i)
    filas = []
    for k, idxs in grupos.items():
        if len(idxs) < 2:
            continue
        filas.append({
            "clave": k,
            "codigos": idxs,
            "variantes": [t[i] for i in idxs],
            "n_codigos": len(idxs),
            "filas": sum(conteo.get(i, 0) for i in idxs),
        })
    out = pd.DataFrame(filas)
    if not out.empty:
        out = out.sort_values("filas", ascending=False).reset_index(drop=True)
    out.attrs.update({"codigos": len(t), "claves": len(grupos)})
    return out


def colisiones_entre_campos(man, capa="incendios"):
    """Etiquetas que aparecen en MAS DE UN vocabulario, con su indice en cada uno.

    Se calcula, no se hardcodea. Hoy da 88 filas: 'Valparaiso' es region[5],
    provincia[13] y comuna[7]; 'Sin registro' es provincia[33] y comuna[71].
    """
    donde = {}
    for campo, t in man["capas"][capa]["tablas"].items():
        for i, v in enumerate(t):
            donde.setdefault(v, []).append((campo, i))
    filas = [
        {"etiqueta": v, "campos": [c for c, _ in d], "indices": [i for _, i in d]}
        for v, d in donde.items() if len({c for c, _ in d}) > 1
    ]
    return pd.DataFrame(filas).sort_values("etiqueta").reset_index(drop=True)


def pares_etiqueta_codigo(df, etiqueta, codigo):
    """Tabla cruzada etiqueta x codigo oficial, con el conteo de cada par.

    Es lo que demuestra que en causa_general ni la etiqueta ni el codigo bastan
    solos: 14 etiquetas producen 23 pares, nueve etiquetas tienen mas de un
    codigo, y los codigos 4.1 y 1.1 llevan dos etiquetas distintas cada uno.
    """
    t = (df.groupby([etiqueta, codigo], observed=True, dropna=False)
           .size().rename("n").reset_index())
    return t[t["n"] > 0].sort_values("n", ascending=False).reset_index(drop=True)


def duplicados_coordenada(df):
    """Ubicaciones con mas de un incendio.

    Medido: 116 ubicaciones, 238 features implicados, 122 puntos que quedan
    TAPADOS al dibujar. Importa para el mapa: un scatter no puede mostrar
    densidad donde los puntos coinciden exactamente.
    """
    g = df.groupby(["lon", "lat"], observed=True).size().rename("n")
    rep = g[g > 1].sort_values(ascending=False)
    return pd.DataFrame({
        "ubicaciones": [len(rep)],
        "features": [int(rep.sum())],
        "ocultos": [int(rep.sum() - len(rep))],
    }), rep


# ---------------------------------------------------------------------------
# Paleta y advertencias del visor
# ---------------------------------------------------------------------------

ADVERTENCIA_PRINCIPAL = "Este visor no muestra incendios activos"

# Cada advertencia lleva un ANCLA: una subcadena distintiva que se busca en su
# archivo. Si el visor reescribe el texto, `verificar_advertencias` lo marca en
# vez de propagar en silencio una frase que la app ya no dice.
ADVERTENCIAS = (
    ("frontend/src/config.js", "Este visor no muestra incendios activos",
     "Este visor no muestra incendios activos."),
    ("frontend/src/components/CartelContexto.jsx", "no son todos los incendios",
     "Cada punto es un incendio que la UAD investigo despues para determinar su "
     "causa; no son todos los incendios del pais."),
    ("frontend/src/components/PanelIndicadores.jsx", "no la totalidad de los incendios",
     "Incendios investigados por la UAD, no la totalidad de los incendios del pais."),
    ("frontend/src/components/PanelIndicadores.jsx", "no debe leerse como aumento",
     "El alza del numero refleja tambien la ampliacion de la cobertura de "
     "investigacion de la UAD; no debe leerse como aumento de la ocurrencia."),
    ("frontend/src/components/PanelIndicadores.jsx", "La comparacion no implica causalidad",
     "Descriptivo. Las OECV se emplazan por exposicion, no en proporcion a la "
     "superficie quemada. La comparacion no implica causalidad."),
    ("frontend/src/components/PanelIndicadores.jsx", "no necesariamente de brigadas",
     "La ausencia es de registro en la fuente, no necesariamente de brigadas."),
    ("frontend/src/components/PanelIndicadores.jsx", "no una lista de recomendaciones",
     "Es un recuento de lo ocurrido, no una lista de recomendaciones ni una norma."),
)


def verificar_advertencias(raiz=None):
    """Comprueba que cada advertencia citada sigue en su archivo."""
    r = Path(raiz) if raiz else raiz_repo()
    filas = []
    for archivo, ancla, texto in ADVERTENCIAS:
        p = r / archivo
        presente = False
        if p.exists():
            fuente = p.read_bytes().decode("utf-8")
            presente = clave(ancla) in clave(fuente)
        filas.append({
            "archivo": archivo, "ancla": ancla, "texto": texto,
            "sincronizada": presente,
        })
    return pd.DataFrame(filas)


_PALETAS = {
    "causa": ("COLOR_CAUSA", 5),
    "oecv": ("COLOR_OECV", 3),
}


def paleta_del_visor(cual="causa", raiz=None, clases=None):
    """Extrae la paleta de frontend/src/config.js (lineas 229-253).

    NO se eligen colores aqui. La de causa es Okabe-Ito (distinguible con
    daltonismo, que importa cuando el color es la unica codificacion) y la de
    OECV es simbologia OFICIAL del Memo N 3045/2025 de la Gerencia de Proteccion
    contra Incendios Forestales de CONAF. Volver a escogerlas a ojo tiraria esa
    validacion.

    Falla con PaletaIncompleta si `clases` trae alguna que la paleta no cubre.
    El visor degrada en silencio a COLOR_CAUSA_OTRA (App.jsx:533) y a
    'Sin determinar' (App.jsx:536); aqui eso esconderia un cambio de vocabulario
    del ETL.

    OJO CON EL CONTRASTE, y esta medido en el propio repo
    (frontend/src/components/graficos.jsx:72): '#E69F00' (Negligentes) da 2,18:1
    sobre el panel claro, por debajo de 3:1. El visor lo compensa escribiendo
    siempre el valor numerico junto a la barra; conviene hacer lo mismo.
    """
    if cual not in _PALETAS:
        raise KeyError("paleta desconocida: " + str(cual))
    nombre, esperadas = _PALETAS[cual]
    r = Path(raiz) if raiz else raiz_repo()
    fuente = (r / "frontend" / "src" / "config.js").read_bytes().decode("utf-8")

    m = re.search(r"export const " + nombre + r"\s*=\s*\{", fuente)
    if not m:
        raise PaletaIncompleta("no encuentro " + nombre + " en frontend/src/config.js")
    # Recorte por conteo de llaves: mas robusto que un .*? con re.S, que se
    # comeria la constante siguiente si alguien anida un objeto.
    i = fuente.index("{", m.start())
    prof, j = 0, i
    while j < len(fuente):
        if fuente[j] == "{":
            prof += 1
        elif fuente[j] == "}":
            prof -= 1
            if prof == 0:
                break
        j += 1
    bloque = fuente[i + 1:j]
    bloque = re.sub(r"//[^\n]*", "", bloque)

    pares = re.findall(r"'([^']+)'\s*:\s*'(#[0-9a-fA-F]{6})'", bloque)
    pares += re.findall(r"(?m)^\s*([A-Za-zÀ-ÿ][\w]*)\s*:\s*'(#[0-9a-fA-F]{6})'", bloque)
    colores = {k: v for k, v in pares}

    if len(colores) != esperadas:
        raise PaletaIncompleta(
            nombre + ": esperaba " + str(esperadas) + " clases y encontre "
            + str(len(colores)) + " " + str(sorted(colores))
        )
    if clases is not None:
        huerfanas = [c for c in clases if c is not None and c not in colores]
        if huerfanas:
            raise PaletaIncompleta(
                "estas clases estan en los datos y no en " + nombre + ": "
                + str(huerfanas) + ". El visor las pintaria con el color de "
                "reserva sin avisar; aqui eso seria esconder un cambio de "
                "vocabulario del ETL."
            )
    return colores


def color_otros(raiz=None):
    """COLOR_CAUSA_OTRA: el gris de reserva del visor."""
    r = Path(raiz) if raiz else raiz_repo()
    fuente = (r / "frontend" / "src" / "config.js").read_bytes().decode("utf-8")
    m = re.search(r"COLOR_CAUSA_OTRA\s*=\s*'(#[0-9a-fA-F]{6})'", fuente)
    return m.group(1) if m else "#7F7F7F"


# Albers equivalente para Chile. Paralelos estandar -19 y -51, meridiano -71.
# Se usa SOLO donde el area importa (densidad por celda): una rejilla hexagonal
# sobre lon/lat tendria celdas de area distinta segun la latitud, y en un pais
# de 38 grados de latitud eso no es un detalle.
PROJ_MAPA = ("+proj=aea +lat_1=-19 +lat_2=-51 +lat_0=-36 +lon_0=-71 "
             "+datum=WGS84 +units=m +no_defs")


def proyectar(lon, lat, proj=PROJ_MAPA):
    """lon/lat -> metros en una proyeccion equivalente. Requiere pyproj."""
    from pyproj import Transformer
    tr = Transformer.from_crs("EPSG:4326", proj, always_xy=True)
    return tr.transform(np.asarray(lon, dtype="float64"),
                        np.asarray(lat, dtype="float64"))


def aspecto_por_latitud(lat):
    """Factor de aspecto para dibujar lon/lat sin aplastar el mapa.

    Es el apano de una sola escala: correcto en UNA latitud y peor cuanto mas
    lejos. En Chile cos(lat) va de 0,952 en Arica (-17,9) a 0,570 en el extremo
    sur (-55,2), asi que cualquier factor unico deforma un extremo. Sirve para
    ver la distribucion; para medir area, `proyectar`.
    """
    return 1.0 / np.cos(np.radians(float(np.mean(lat))))


def orden_dibujo(man, campo="causa_grupo", capa="incendios"):
    """De fondo a frente: la clase MAS frecuente primero, la mas rara al final.

    Se deriva del manifest, no se elige a dedo: gj_io.codificar ya ordena las
    tablas por frecuencia DESCENDENTE, asi que recorrerlas tal cual pinta
    primero la clase mayoritaria --que queda debajo-- y ultima la rara, que
    queda encima. Sin esto, 'Naturales' (96 filas) queda enterrada bajo
    'Negligentes' (8.730) y el mapa insinua que no existe.

    Se devuelve una lista y no un iterador para poder imprimirla en el
    notebook antes de dibujar: el orden es una afirmacion sobre la figura y
    tiene que quedar escrito, no supuesto.
    """
    return list(man["capas"][capa]["tablas"][campo])


# ---------------------------------------------------------------------------
# Reconciliacion contra las cifras publicadas
# ---------------------------------------------------------------------------

def reconciliar(man=None, datos=None):
    """Contrasta lo medido contra TODA cifra publicada que hay en el repo.

    Fuentes: el propio manifest (features, bytes, longitud_km, km_por_region),
    kpis.json (km_planificados, km_reportados, avance_pct) y la constante
    KM_OFICIAL_NACIONAL de ETL/build_oecv.py, que es la unica cifra oficial
    independiente del ETL.
    """
    man = man or leer_manifest(datos)
    filas = []

    def chk(nombre, medido, esperado, tol=0.0, nota=""):
        if medido is None or esperado is None:
            ok = None
        elif isinstance(medido, (int, np.integer)) and isinstance(esperado, (int, np.integer)):
            ok = medido == esperado
        else:
            ok = abs(float(medido) - float(esperado)) <= tol
        filas.append({"chequeo": nombre, "medido": medido, "publicado": esperado,
                      "ok": ok, "nota": nota})

    for capa in man["capas"]:
        meta = man["capas"][capa]
        ruta = Path(man["_ruta"]) / meta["archivo"]
        if ruta.exists():
            chk(capa + ": bytes en disco", ruta.stat().st_size, meta.get("bytes"),
                nota="el manifest lo declara y el visor nunca lo contrasta")

    inc = man["capas"]["incendios"]
    chk("incendios: leidos - descartados", inc["leidos"] - inc["descartados"],
        inc["features"], nota="14.985 filas de origen menos 280 descartadas")

    for capa in ("oecv", "oecv_verificado"):
        if capa not in man["capas"]:
            continue
        df = cargar_lineas(capa, man=man, verificar=False, geometria=False)
        meta = man["capas"][capa]
        chk(capa + ": features", len(df), meta.get("features"))
        chk(capa + ": km", round(float(df["longitud_km"].sum()), 3),
            meta.get("longitud_km"), tol=0.05)
        for reg, km in (meta.get("km_por_region") or {}).items():
            sub = df[df["region"] == reg]["longitud_km"].sum()
            chk(capa + ": km " + reg, round(float(sub), 3), km, tol=0.06,
                nota="el manifest redondea a 1 decimal")

    etl = esquema_del_etl()
    if etl.get("km_oficial") and "oecv" in man["capas"]:
        med = man["capas"]["oecv"]["longitud_km"]
        desvio = 100.0 * (med - etl["km_oficial"]) / etl["km_oficial"]
        filas.append({
            "chequeo": "oecv: geometria vs KM_OFICIAL_NACIONAL",
            "medido": round(desvio, 2), "publicado": etl["tolerancia_pct"],
            "ok": abs(desvio) <= etl["tolerancia_pct"],
            "nota": "desvio % contra la cifra de la planilla oficial "
                    "(build_oecv.py:32); tolerancia +-" + str(etl["tolerancia_pct"]) + " %",
        })

    k = cargar_kpis(man=man)
    chk("kpis: suma Planificado", round(float(k["Planificado"].sum()), 3),
        k.attrs["km_planificados"], tol=0.001)
    chk("kpis: suma reportado", round(float(k["reportado"].sum()), 3),
        k.attrs["km_reportados"], tol=0.001)
    chk("kpis: avance_pct", round(100.0 * k["reportado"].sum() / k["Planificado"].sum(), 1),
        k.attrs["avance_pct"], tol=0.05)

    # El join que el bug de U+00B4 rompe.
    regiones_capa = set(man["capas"]["incendios"]["tablas"]["region"])
    literal = len(set(k["region_bruta"]) & regiones_capa)
    normal = len(set(k.index) & regiones_capa)
    filas.append({
        "chequeo": "kpis x capas: regiones que casan",
        "medido": str(literal) + " literal / " + str(normal) + " con norm_region",
        "publicado": len(regiones_capa), "ok": normal >= literal,
        "nota": "kpis.json escribe O'Higgins con U+00B4; sin normalizar se "
                "pierde la 2a region por km planificados",
    })

    return pd.DataFrame(filas)


# ---------------------------------------------------------------------------
# Resumen y CLI
# ---------------------------------------------------------------------------

def resumen(df, man):
    """Lo minimo para saber, de un vistazo, que se cargo lo correcto."""
    inc = man["capas"]["incendios"]
    lin = []
    lin.append("esquema        " + ESQUEMA + "   huella " + man["_huella"][:12])
    lin.append("generado       " + man["generado"])
    lin.append("filas          " + es(len(df)) + "   (leidos " + es(inc["leidos"])
               + " - descartados " + es(inc["descartados"]) + ")")
    lin.append("columnas       " + str(len(df.columns)))
    lin.append("memoria        " + es(df.memory_usage(deep=True).sum() / 1e6, 1) + " MB")
    lin.append("superficie     " + es(df["superficie_ha"].sum(), 2) + " ha   ("
               + es(int(df["superficie_ha"].isna().sum())) + " sin dato, "
               + es(int(df["superficie_cero"].sum())) + " en cero exacto)")
    lin.append("bbox           lon [" + f"{df.lon.min():.5f}, {df.lon.max():.5f}"
               + "]  lat [" + f"{df.lat.min():.5f}, {df.lat.max():.5f}" + "]")

    ap = df.attrs.get("centinelas_aplicados") or {}
    lin.append("")
    if ap:
        lin.append("centinelas traducidos a NA (trampa 2):")
        for campo, d in ap.items():
            total = sum(d.values())
            lin.append("  " + campo.ljust(20) + es(total).rjust(7) + " filas   "
                       + ", ".join(f"{k!r}={es(v)}" for k, v in d.items()))
    else:
        lin.append("centinelas: ninguno aplicado")

    fs = df.attrs.get("fechas_sospechosas") or {}
    if fs:
        lin.append("")
        lin.append("fechas que el ETL dio por buenas y no pueden serlo "
                   "(no se corrigen, se reportan):")
        for campo, d in fs.items():
            if "fuera_de_rango" in d:
                v = d["fuera_de_rango"]
                lin.append("  " + campo.ljust(20) + es(v["n"]).rjust(7)
                           + " fuera del rango de datetime64[ns] -> NaT: "
                           + ", ".join(v["valores"][:5]))
            if "posteriores_al_etl" in d:
                v = d["posteriores_al_etl"]
                lin.append("  " + campo.ljust(20) + es(v["n"]).rjust(7)
                           + " posteriores al ETL (" + v["corte"] + "): "
                           + ", ".join(v["valores"][:5]))
            if "incoherentes" in d:
                lin.append("  " + campo.ljust(20)
                           + es(d["incoherentes"]["n"]).rjust(7)
                           + " con la investigacion terminando antes de empezar")

    lin.append("")
    lin.append("sin dato por columna (trampa 4: groupby los descarta por defecto):")
    for c in df.columns:
        n = int(df[c].isna().sum())
        if n:
            lin.append("  " + c.ljust(20) + es(n).rjust(7) + "  ("
                       + es(100.0 * n / len(df), 2) + " %)")
    return "\n".join(lin)


def main():
    p = argparse.ArgumentParser(description="Lee las capas publicadas del visor.")
    p.add_argument("--datos", default=None, help="carpeta con manifest.json")
    p.add_argument("--capa", default="incendios", choices=list(CAPAS_GEOJSON) + list(CAPAS_TESELAS))
    p.add_argument("--parquet", metavar="RUTA", help="exporta a Parquet y termina")
    p.add_argument("--sin-verificar", action="store_true")
    p.add_argument("--sin-centinelas", action="store_true")
    p.add_argument("--laxo", action="store_true",
                   help="degrada el contrato a aviso en vez de error")
    a = p.parse_args()

    man = leer_manifest(a.datos, estricto=not a.laxo)

    if a.capa in CAPAS_TESELAS:
        meta = meta_teselas(a.capa, man=man)
        print(json.dumps({k: v for k, v in meta.items() if k != "dominios"},
                         ensure_ascii=False, indent=2))
        print("\nEsta capa NO es legible como features: ver meta_teselas().")
        return 0

    if a.capa == "incendios":
        df = cargar(man=man, verificar=not a.sin_verificar,
                    centinelas=not a.sin_centinelas)
        print(resumen(df, man))
    elif a.capa == "puntos_standby":
        df = cargar_puntos(man=man, verificar=not a.sin_verificar)
        print(df.dtypes.to_string())
    else:
        df = cargar_lineas(a.capa, man=man, verificar=not a.sin_verificar)
        print(df.drop(columns=["geometria"], errors="ignore").head(10).to_string())

    print("\n-- reconciliacion contra las cifras publicadas --")
    rec = reconciliar(man=man)
    malos = rec[rec["ok"] == False]  # noqa: E712
    for _, f in rec.iterrows():
        marca = "ok " if f["ok"] else ("?? " if f["ok"] is None else "DIF")
        print("  " + marca + " " + str(f["chequeo"]).ljust(40)
              + str(f["medido"]).rjust(18) + "  vs  " + str(f["publicado"]))
    print("\n" + str(len(rec) - len(malos)) + "/" + str(len(rec)) + " chequeos cuadran")

    if a.parquet:
        salida = Path(a.parquet)
        salida.parent.mkdir(parents=True, exist_ok=True)
        exportable = df.drop(columns=["geometria"], errors="ignore")
        exportable.to_parquet(salida, index=False, compression="zstd")
        # Sin las tablas al lado, un CSV/Parquet con <campo>_cod es
        # indescifrable en otra corrida del ETL: el indice es posicional.
        lado = salida.with_name(salida.stem + "_tablas.json")
        lado.write_bytes(json.dumps({
            "esquema": ESQUEMA, "generado": man["generado"],
            "huella": man["_huella"],
            "aviso": "los <campo>_cod son POSICIONES en estas tablas, no "
                     "codigos oficiales; cambian entre corridas del ETL",
            "tablas": man["capas"]["incendios"]["tablas"],
        }, ensure_ascii=False, indent=2).encode("utf-8"))
        print("\nescrito " + str(salida) + " ("
              + es(salida.stat().st_size / 1e6, 1) + " MB) y " + lado.name)

    return 0 if malos.empty else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
