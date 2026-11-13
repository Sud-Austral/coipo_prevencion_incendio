# -*- coding: utf-8 -*-
"""Catálogo de capturas y su asociación a funcionalidades y casos de uso.

Las produce scripts/capturar_pantallas.py (recorrido en scripts/capturas_lista.py) contra la
compilación del visor servida en 127.0.0.1 con datos FICTICIOS (scripts/demo_datos.py).
Nombres: NN[letra]-<prefijo>-<pantalla>.png; prefijo «vis» (Usuario del visor).
"""
import os

from .comun import RAIZ_DOC

DIR = os.path.join(RAIZ_DOC, "_imagenes")
_F = " Datos ficticios de demostración; el fondo liso reemplaza al mapa base externo."

# clave -> (archivo, título, pie)
CATALOGO = {
    "visor": ("01-vis-visor.png", "Visor, pestaña Incendios (pantalla de llegada)",
              "Panel izquierdo con ámbito, filtros, mapa y leyenda; mapa con incendios, OECV y stand-by; "
              "indicadores a la derecha; cartel de contexto abajo." + _F),
    "temporada": ("01b-vis-filtro-temporada.png", "Filtro Temporada abierto",
                  "Cada temporada con cuántos incendios quedan con los filtros puestos." + _F),
    "territorio": ("01c-vis-territorio.png", "Elección de Territorio",
                   "Regiones con su conteo; «Todo Chile» por defecto." + _F),
    "capas": ("01d-vis-capas.png", "Capas", "Las seis capas, tres encendidas por defecto." + _F),
    "mapa_base": ("01e-vis-mapa-base.png", "Mapa base", "Los siete fondos disponibles." + _F),
    "ficha": ("02-vis-ficha.png", "Ficha de un incendio investigado",
              "Predio, jefe de brigada e investigador son FICTICIOS («Predio Ficticio 194», «Brigadista Ficticio "
              "188»). Las fechas de investigación no concuerdan con la temporada porque la demo sortea la "
              "temporada (scripts/demo_datos.py), no por un defecto de la app."),
    "descargar": ("03-vis-descargar.png", "Descargar", "Informe PDF, imagen PNG y datos del ámbito por capa." + _F),
    "compartir": ("04-vis-compartir.png", "Compartir", "«Compartir esta vista» copia el enlace con el estado." + _F),
    "informacion": ("05-vis-informacion.png", "Información", "Qué muestra el visor, fuentes y procedencia." + _F),
    "riesgo": ("06-vis-riesgo.png", "Pestaña Riesgo sin comuna",
               "Manchas de riesgo de todo el país por teselas (cartografía del modelo publicado)." + _F),
    "riesgo_comuna": ("06b-vis-riesgo-comuna.png", "Riesgo de una comuna (Concepción)",
                      "Áreas con la clase SORTEADA por la demo, no la del modelo. La lista de infraestructura "
                      "muestra claves técnicas (H-01, H-10)."),
    "electrico": ("07-vis-lineas-electricas.png", "Incendios por líneas eléctricas",
                  "Página aparte: ámbito, capas, hora de inicio, resumen y subcausas." + _F),
    "oscuro": ("08-vis-visor-oscuro.png", "Visor en tema oscuro",
               "El tema sigue la preferencia del sistema operativo (prefers-color-scheme)." + _F),
}

POR_ROL = {"usuario_visor": list(CATALOGO)}

POR_FUNCIONALIDAD = {
    ("usuario_visor", "Consultar los incendios investigados"): "visor",
    ("usuario_visor", "Descargar los datos del ámbito"): "descargar",
    ("usuario_visor", "Compartir esta vista"): "compartir",
    ("usuario_visor", "Consultar la información"): "informacion",
    ("usuario_visor", "Consultar el riesgo de incendio forestal"): "riesgo",
    ("usuario_visor", "Consultar los incendios por líneas eléctricas"): "electrico",
}

POR_CASO = {"UC-03": "temporada", "UC-04": "territorio", "UC-05": "capas", "UC-06": "mapa_base",
            "UC-07": "ficha", "UC-14": "riesgo_comuna"}


def ruta(clave):
    if clave not in CATALOGO:
        return None
    r = os.path.join(DIR, CATALOGO[clave][0])
    return r if os.path.exists(r) else None


def titulo(clave):
    return CATALOGO[clave][1]


def pie(clave):
    return CATALOGO[clave][2]
