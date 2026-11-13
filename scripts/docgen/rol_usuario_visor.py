# -*- coding: utf-8 -*-
"""Usuario del visor: el único rol (sitio estático, sin sesión).

Nombre del rol (prompt v4, 5 bis): no hay v1 y la app no muestra etiqueta de rol; se usa
«Usuario del visor», el mismo nombre que el paquete de coipo_firms para un visor sin sesión.
Funcionalidades: verbo + rótulo de la app; el rótulo va en ROTULOS para comprobar la cobertura.
"""
from .comun import PV
from .datos_base import ROL_NOMBRE

M = "Visor de prevención"
Q = ROL_NOMBRE + "."

# funcionalidad -> rótulo tal como lo muestra la app (dónde: notas al lado)
ROTULOS = {
    "Ingresar al visor": "Prevención de Incendios Forestales",                 # PanelLateral.jsx
    "Consultar los incendios investigados": "Incendios",                       # pestaña, config.js VISTAS
    "Consultar los indicadores": "Indicadores",                                # PanelIndicadores.jsx
    "Descargar el informe con el mapa": "Informe con el mapa (PDF)",           # SeccionDescargas.jsx:251
    "Descargar la imagen del mapa": "Imagen del mapa (PNG)",                   # SeccionDescargas.jsx:258
    "Descargar los datos del ámbito": "Datos del ámbito",                      # SeccionDescargas.jsx
    "Compartir esta vista": "Compartir esta vista",                            # ModalesPanel.jsx
    "Consultar la información": "Información",                                 # ModalesPanel.jsx titulo
    "Consultar el riesgo de incendio forestal": "Riesgo de incendio forestal", # PanelRiesgo.jsx
    "Descargar las áreas de riesgo": "Áreas (CSV)",                            # PanelRiesgo.jsx:381
    "Descargar la infraestructura crítica": "Infraestructura (CSV)",           # PanelRiesgo.jsx:387
    "Consultar los incendios por líneas eléctricas": "Incendios por líneas eléctricas",  # lineas-electricas.html
}


def _f(nombre, objetivo, pre, pasos, resultado, val=(), err=(), cons=(), restr=(), alt=()):
    return {"nombre": nombre, "objetivo": objetivo, "quien": Q, "precondiciones": list(pre), "pasos": list(pasos),
            "resultado": resultado, "validaciones": list(val), "errores": [list(e) for e in err],
            "consideraciones": list(cons), "restricciones": list(restr), "alternativos": list(alt)}


FUNCIONALIDADES = [
    _f("Ingresar al visor", "Abrir el visor. No hay puerta de ingreso: es un sitio público (RN-01).",
       ["Conocer la dirección del visor (" + PV + ": la publicada en GitHub Pages según CLAUDE.md)."],
       ["Abrir la dirección del visor en el navegador.",
        "Esperar el membrete de CONAF, las pestañas «Incendios» y «Riesgo» y el panel «Prevención de Incendios Forestales».",
        "Leer el cartel de contexto y pulsar «Entendido», «Ver capas y filtros» o «Ver indicadores».",
        "Para salir, cerrar la pestaña: no hay sesión que cerrar."],
       "La pestaña Incendios con tres capas encendidas, mapa base Claro y el panel de indicadores abierto.",
       val=["Los parámetros desconocidos de la dirección no rompen la carga (ver H-02 a H-05)."],
       cons=["La dirección guarda el estado: se puede marcar como favorito o compartir (RN-03)."],
       alt=["Entrar directo a la vista Riesgo con ?vista=riesgo.", "Entrar a lineas-electricas.html."]),
    _f("Consultar los incendios investigados",
       "Ver dónde ocurrieron los incendios investigados por la UAD, filtrar por territorio, temporada y causa, "
       "y ver las obras OECV, puntos stand-by, rutas y red vial.",
       ["Visor abierto en la pestaña «Incendios»."],
       ["En ÁMBITO, pulsar «Territorio» y elegir región, provincia o comuna; «Listo» para cerrar.",
        "En FILTROS, pulsar «Temporada», «Grupo de causa», «Causa general», «Titularidad» o «Institución» y elegir; "
        "cada opción muestra cuántos incendios quedan.",
        "En MAPA, pulsar «Capas» para encender o apagar las seis capas y «Mapa base» para cambiar el fondo.",
        "Revisar la LEYENDA: colores por grupo de causa, titularidad OECV y punto stand-by.",
        "Pulsar un punto o una línea del mapa para abrir su ficha; con teclado, centrar y pulsar Enter (RN-14).",
        "En la ficha, «Vista satelital» o «Street View» abren Google en el punto; × o Escape la cierran.",
        "«Quitar el filtro» vuelve a todos los incendios."],
       "El mapa, la leyenda y los indicadores muestran solo lo que cumple el ámbito y los filtros.",
       val=["Filtros en cascada: las opciones sin incendios con los demás filtros no aparecen (RN-05)."],
       err=[["Ningún incendio investigado cumple los filtros actuales.", "Los filtros dejan cero incendios (panel de indicadores)."],
            ["No hay ninguna figura en el centro del mapa. Desplázalo con las flechas y vuelve a pulsar Enter.",
             "Enter con el mapa enfocado y sin figura bajo el centro."]],
       cons=["No muestra incendios activos (RN-02).",
             "La ficha muestra el jefe de brigada y quién investigó (H-06).",
             "Rutas y red vial se cargan por teselas al acercar."],
       restr=["Solo lectura."],
       alt=["Abrir el visor con los filtros en la dirección (?region=…&temporada=…)."]),
    _f("Consultar los indicadores",
       "Leer cifras de los incendios del ámbito: evitables, conductas, cobertura preventiva y series.",
       ["Visor abierto en la pestaña «Incendios»."],
       ["Mirar el panel «Indicadores» a la derecha (o abrirlo con «Ver indicadores»).",
        "Leer INCENDIOS EVITABLES, QUÉ ESTABAN HACIENDO y COBERTURA PREVENTIVA VS PRESIÓN.",
        "Desplegar las tablas de detalle para ver las cifras completas.",
        "Cerrar con × o ajustar su ancho con el tirador."],
       "Indicadores calculados sobre el ámbito y los filtros activos (RN-15).",
       cons=["Las indeterminadas quedan en el denominador: la cifra de evitables es conservadora."]),
    _f("Descargar el informe con el mapa",
       "Obtener un informe imprimible con el mapa y los indicadores del ámbito.",
       ["Visor con el ámbito y los filtros deseados."],
       ["Pulsar «Descargar» al pie del panel.", "Pulsar «Informe con el mapa (PDF)».",
        "En la pestaña que se abre, usar el diálogo de impresión y elegir «Guardar como PDF»."],
       "Un informe en una pestaña nueva, listo para imprimir o guardar como PDF.",
       err=[["Generando el informe…", "Mientras se captura el mapa."]],
       cons=["El navegador puede bloquear la pestaña nueva; hay que permitir ventanas emergentes.",
             "Las teselas de mapa base que fallen quedan en blanco en el informe."]),
    _f("Descargar la imagen del mapa", "Guardar el mapa visible como imagen PNG.",
       ["Visor con el encuadre deseado."],
       ["Pulsar «Descargar».", "Pulsar «Imagen del mapa (PNG)».", "El navegador guarda el archivo."],
       "Un PNG del mapa con las capas visibles.", cons=["RN-08: el nombre lleva el ámbito y la fecha."]),
    _f("Descargar los datos del ámbito",
       "Obtener en CSV o GeoJSON los incendios, OECV, OECV verificado o puntos stand-by del ámbito.",
       ["Visor con el ámbito y los filtros deseados."],
       ["Pulsar «Descargar».", "En «Datos del ámbito», pulsar CSV o GeoJSON en la fila de la capa.",
        "Para OECV verificado, encender antes la capa («enciende la capa para poder exportarla»).",
        "Para el archivo completo sin filtrar, seguir el enlace «archivo publicado»."],
       "Archivo <capa>_<ámbito>_<fecha>.csv o .geojson con lo filtrado (RN-08, RN-09).",
       val=["Rutas y Red vial no se exportan: «se sirve por teselas y no hay figuras en el navegador» (RN-10)."],
       cons=["El CSV usa «;» y coma decimal (RN-09)."]),
    _f("Compartir esta vista", "Copiar un enlace que reproduce capas, filtros y encuadre.",
       ["Visor con la vista deseada."],
       ["Pulsar «Compartir» al pie del panel.", "Pulsar «Compartir esta vista».",
        "Pegar el enlace donde se necesite."],
       "La dirección actual, con todo el estado, queda copiada (RN-03).",
       cons=["El enlace guarda las capas, los filtros y el encuadre actuales."]),
    _f("Consultar la información", "Saber qué muestra el visor, sus fuentes y quién lo publica.",
       ["Visor abierto."], ["Pulsar «Información» al pie del panel.", "Leer «Qué muestra este visor», «Fuentes» y «Procedencia».",
                            "Cerrar con «Listo»."],
       "Texto de contexto con las ocho fuentes de datos."),
    _f("Consultar el riesgo de incendio forestal",
       "Ver el nivel de riesgo del modelo nacional por áreas dentro de una comuna, con la infraestructura crítica.",
       ["Visor abierto."],
       ["Pulsar la pestaña «Riesgo».", "En COMUNA, elegir una comuna en «Ver una comuna» (el número es la cantidad de áreas).",
        "Usar «Centrar el mapa en <comuna>» o «Normalizar dentro de <comuna>» (RN-12).",
        "Ajustar «Opacidad de las áreas» y marcar o desmarcar las familias de INFRAESTRUCTURA CRÍTICA.",
        "Pulsar un área o un elemento para ver su ficha.", "Leer «Qué muestra esta vista» si hace falta."],
       "Las áreas de la comuna coloreadas por clase de riesgo, con la infraestructura encima.",
       cons=["Sin comuna elegida se ven las manchas de todo el país por teselas (RN-11).",
             "Las familias de infraestructura aparecen con su clave técnica (H-01)."]),
    _f("Descargar las áreas de riesgo", "Obtener las áreas de riesgo de la comuna elegida.",
       ["Comuna elegida en la vista Riesgo."],
       ["En DESCARGAR del panel de Riesgo, pulsar «Áreas (CSV)» o «Áreas (GeoJSON)»."],
       "Archivo con las áreas de la comuna, como en el mapa.",
       val=["Sin comuna los botones están desactivados: «Elige una comuna para descargar sus áreas.»"]),
    _f("Descargar la infraestructura crítica", "Obtener los elementos de infraestructura de la comuna elegida.",
       ["Comuna elegida con infraestructura."],
       ["Pulsar «Infraestructura (CSV)» o «Infraestructura (GeoJSON)»."],
       "Archivo con los elementos de las familias marcadas.",
       val=["Desactivado si la comuna no tiene infraestructura."]),
    _f("Consultar los incendios por líneas eléctricas",
       "Ver dónde, de qué subcausa y a qué hora comenzaron los incendios causados por líneas eléctricas.",
       ["Conocer la dirección lineas-electricas.html."],
       ["Abrir lineas-electricas.html.", "Elegir el ÁMBITO (todo el país o una región).",
        "Encender CAPAS: concentración histórica, incendios por subcausa, comunas.",
        "Ajustar INTENSIDAD DEL CALOR y MAPA BASE.",
        "Leer HORA DE INICIO, COMUNAS CON MÁS INCENDIOS, RESUMEN y SUBCAUSA; tocar una comuna acerca el mapa.",
        "Volver con «Ir al visor de prevención»."],
       "Mapa y cifras de los incendios de causa general «Líneas eléctricas».",
       cons=["Los incendios sin coordenadas no aparecen; la página dice cuántos son.",
             "La concentración histórica no es riesgo (lo dice la propia página)."]),
]

ROL = {
    "clave": "usuario_visor", "nombre": ROL_NOMBRE, "archivo": "Rol_Usuario_Visor",
    "resumen": "Manual de la persona que usa el visor de prevención de incendios forestales: mapa de incendios "
               "investigados, indicadores, descargas, vista de riesgo y página de líneas eléctricas. Sitio "
               "público sin sesión.",
    "acceso": "Abrir la dirección pública del visor. No hay login (RN-01).",
    "objetivo": "Explicar cómo consultar los incendios investigados por la UAD, las obras de prevención y el riesgo "
                "de incendio forestal por comuna, y cómo descargar y compartir lo que se ve.",
    "alcance": ["La pestaña Incendios: ámbito, filtros, capas, mapa base, leyenda y fichas.",
                "El panel de indicadores.", "Descargar, Compartir e Información.", "La pestaña Riesgo.",
                "La página Incendios por líneas eléctricas."],
    "fuera_alcance": ["El ETL que genera los datos (ETL/run.py).", "El despliegue en GitHub Pages.",
                      "La interpretación técnica del modelo de riesgo (lab/priorizacion)."],
    "requisitos": ["Navegador actualizado con JavaScript.",
                   "Conexión a Internet para los mapas base externos (sin ella el mapa se ve sin fondo).",
                   "No se necesita cuenta, contraseña ni rol."],
    "interfaz": [
        ["Membrete y pestañas", "Logos de CONAF y la UIA; pestañas «Incendios» y «Riesgo»."],
        ["Panel izquierdo", "Prevención de Incendios Forestales: ÁMBITO, FILTROS, MAPA, LEYENDA y, al pie, "
                            "«Información», «Descargar» y «Compartir»."],
        ["Mapa", "Leaflet con zoom, escala y atribución; se maneja con ratón o teclado."],
        ["Panel derecho", "Indicadores del ámbito; se cierra con × y se ensancha con el tirador."],
        ["Cartel de contexto", "Aviso inicial: los incendios ya ocurrieron; botones «Ver capas y filtros», "
                               "«Ver indicadores», «Entendido»."],
        ["Ficha", "Atributos de la figura elegida, con «Vista satelital» y «Street View»."],
    ],
    "funcionalidades": FUNCIONALIDADES,
    "errores_frecuentes": [
        ["El mapa se ve sin fondo", "Sin acceso a los servidores de mapas base", "Revisar la conexión o cambiar de mapa base."],
        ["No aparece ningún punto", "Filtros que dejan cero incendios", "«Quitar el filtro» o revisar la dirección (H-02)."],
        ["No se abre el informe", "Ventanas emergentes bloqueadas", "Permitirlas para el sitio."],
        ["OECV verificado no se puede exportar", "La capa está apagada", "Encenderla en «Capas» (RN-10)."],
        ["Los botones de descarga de Riesgo están grises", "No hay comuna elegida", "Elegir una comuna."],
    ],
    "buenas_practicas": ["Usar «Compartir esta vista» en vez de describir los filtros por escrito.",
                         "Leer el ámbito en el encabezado de Indicadores antes de citar una cifra.",
                         "Recordar que los datos son incendios investigados, no todos los incendios ni activos."],
    "faq": [["¿Muestra incendios en curso?", "No (RN-02)."],
            ["¿Necesito usuario?", "No: el visor es público."],
            ["¿Las descargas traen todo?", "Traen lo filtrado; el archivo completo está en «archivo publicado»."],
            ["¿Qué es «Normalizar dentro de»?", "Un cambio de colores relativo a la comuna; el dato no cambia (RN-12)."]],
}

CAMPOS = {
    "Consultar los incendios investigados": [
        ["Territorio", "No", "Región, provincia o comuna de la lista", "Por defecto «Todo Chile»"],
        ["Temporada", "No", "Una de las 9 temporadas", "Por defecto «Todas»"],
        ["Grupo de causa", "No", "Intencionales, Negligentes, Accidentales, Naturales, Indeterminadas", ""],
        ["Causa general", "No", "Lista del manifest", ""],
        ["Titularidad", "No", "Privado, Fiscal, Sin determinar", "Filtra OECV"],
        ["Institución", "No", "Lista del manifest", "Filtra OECV"],
    ],
}

ENDPOINTS = [
    ["GET", "data/manifest.json", "Capas, dominios de filtros y metadatos", "Cualquiera"],
    ["GET", "data/<capa>.geojson", "Incendios, OECV, OECV verificado, stand-by, infraestructura", "Cualquiera"],
    ["GET", "data/kpis.json", "Cifras precalculadas de OECV", "Cualquiera"],
    ["GET (Range)", "data/rutas.pmtiles y data/redvial.pmtiles", "Teselas de rutas y red vial", "Cualquiera"],
    ["GET", "data/riesgo/<cut>.geojson y riesgo/atributos/<cut>.json", "Áreas de riesgo de una comuna", "Cualquiera"],
    ["GET (Range)", "data/riesgo/teselas/<región>.pmtiles", "Manchas de riesgo por región", "Cualquiera"],
    ["GET", "Servicios externos de mapas base y Google", "Fondo del mapa; vista del punto", "Cualquiera"],
]


def _c(id_, nombre, func, flujo, resultado, desc=None, pre=None, entradas=(), fa=(), fe=(), rn=(), verifica="",
       pantalla="Pestaña Incendios"):
    return {"id": id_, "nombre": nombre, "objetivo": nombre + ".", "descripcion": desc or nombre,
            "permisos": "Ninguno (sitio público)", "precondiciones": pre or ["Visor abierto en un navegador."],
            "entradas": list(entradas), "flujo": list(flujo), "resultado": resultado,
            "fa": [list(x) for x in fa], "fe": [list(x) for x in fe], "rn": list(rn), "validaciones": [],
            "datos": "Ninguno: solo lectura.", "secundarios": "—", "verifica": verifica,
            "traz": [M, func, pantalla, "Archivos estáticos de data/", "—"]}


CASOS = [
    _c("UC-01", "Ingresar al visor sin sesión", "Ingresar al visor",
       ["Abrir la dirección del visor.", "Ver el panel «Prevención de Incendios Forestales» y el cartel.",
        "Pulsar «Entendido»."], "Pestaña Incendios con tres capas encendidas.", rn=["RN-01", "RN-02"],
       verifica="Observado en la demo (captura 01)."),
    _c("UC-02", "Ingresar con una vista compartida", "Ingresar al visor",
       ["Abrir un enlace con ?region=Biobío y capas en la dirección.", "Ver el visor en «Prevención de Incendios Forestales» con esos filtros."],
       "El visor aplica territorio, capas y encuadre del enlace.", rn=["RN-03"], verifica="Observado: ?region=Biobío centra en la región."),
    _c("UC-03", "Filtrar los incendios por temporada", "Consultar los incendios investigados",
       ["En la pestaña Incendios, pulsar «Temporada».", "Elegir una temporada.", "Pulsar «Listo»."],
       "Mapa e indicadores muestran solo esa temporada.", rn=["RN-05"], verifica="Observado: captura 01b."),
    _c("UC-04", "Filtrar los incendios por territorio", "Consultar los incendios investigados",
       ["En la pestaña Incendios, pulsar «Territorio».", "Elegir una región.", "Pulsar «Listo»."],
       "El mapa se encuadra en la región y los conteos se recalculan.",
       fe=[["FE-01", "Territorio inexistente en la dirección: se acepta sin aviso (H-02)."]], rn=["RN-05"],
       verifica="Observado: captura 01c y sonda ?region=Marte."),
    _c("UC-05", "Encender y apagar capas", "Consultar los incendios investigados",
       ["En la pestaña Incendios, pulsar «Capas».", "Marcar «OECV verificado (terreno)» y desmarcar «Puntos stand-by».", "Pulsar «Listo»."],
       "El mapa y la leyenda cambian; el botón dice cuántas capas están encendidas.",
       fe=[["FE-01", "Capa inexistente en la dirección: se cuenta como encendida (H-03)."]], rn=["RN-06"],
       verifica="Observado: captura 01d."),
    _c("UC-06", "Cambiar el mapa base", "Consultar los incendios investigados",
       ["En la pestaña Incendios, pulsar «Mapa base».", "Elegir «Satelital».", "Pulsar «Listo»."], "El fondo cambia; los datos no.",
       fe=[["FE-01", "Mapa base inexistente en la dirección: el botón muestra ese nombre (H-04)."]], rn=["RN-07"],
       verifica="Observado: captura 01e."),
    _c("UC-07", "Abrir la ficha de un incendio", "Consultar los incendios investigados",
       ["En la pestaña Incendios, acercar el mapa a un punto.", "Pulsar el punto.", "Leer la ficha.", "Cerrar con ×."],
       "Ficha con región, comuna, temporada, causa, superficie, jefe de brigada e investigador.",
       fa=[["FA-01", "Con teclado: centrar el punto y pulsar Enter (RN-14)."]],
       fe=[["FE-01", "Enter sin figura al centro: «No hay ninguna figura en el centro del mapa…»."]],
       rn=["RN-13", "RN-14"], verifica="Observado: captura 02 (datos ficticios)."),
    _c("UC-08", "Ver el punto en Google desde la ficha", "Consultar los incendios investigados",
       ["En la pestaña Incendios, abrir la ficha de un incendio.", "Pulsar «Vista satelital».", "Cambiar a «Street View».", "Cerrar la vista."],
       "Google embebido en el punto de la ficha.", rn=["RN-13"],
       verifica="No lo comprobé: la demo no tiene red externa."),
    _c("UC-09", "Filtros que no dejan incendios", "Consultar los incendios investigados",
       ["En la pestaña Incendios, abrir el visor con ?temporada=1999-2000.", "Mirar el mapa y los indicadores.", "Pulsar «Quitar el filtro»."],
       "Indicadores dicen «Ningún incendio investigado cumple los filtros actuales.»; al quitar el filtro vuelven todos.",
       rn=["RN-05"], verifica="Observado en la sonda (cero incendios). «Quitar el filtro» observado en pantalla, no pulsado."),
    _c("UC-10", "Leer los indicadores del ámbito", "Consultar los indicadores",
       ["Abrir el panel «Indicadores».", "Elegir una región en Territorio.", "Leer INCENDIOS EVITABLES."],
       "El encabezado dice el ámbito y las cifras se recalculan.", rn=["RN-15"], verifica="Observado: captura 01."),
    _c("UC-11", "Generar el informe con el mapa", "Descargar el informe con el mapa",
       ["Pulsar «Descargar».", "Pulsar «Informe con el mapa (PDF)».", "Guardar como PDF desde el diálogo de impresión."],
       "Pestaña con el informe listo para imprimir.", rn=["RN-08"], verifica="No lo comprobé (abre otra pestaña)."),
    _c("UC-12", "Descargar la imagen del mapa", "Descargar la imagen del mapa",
       ["Pulsar «Descargar».", "Pulsar «Imagen del mapa (PNG)»."], "Archivo PNG del mapa.", rn=["RN-08"],
       verifica="No lo comprobé."),
    _c("UC-13", "Descargar los incendios filtrados en CSV", "Descargar los datos del ámbito",
       ["Filtrar por una región.", "Pulsar «Descargar».", "En «Datos del ámbito», pulsar CSV de «Incendios investigados»."],
       "CSV con «;» y coma decimal, solo con los incendios de la región.",
       fa=[["FA-01", "GeoJSON en vez de CSV."], ["FA-02", "OECV, OECV verificado (con la capa encendida) o puntos stand-by."]],
       fe=[["FE-01", "Rutas y Red vial: «se sirve por teselas y no hay figuras en el navegador» (RN-10)."]],
       rn=["RN-08", "RN-09", "RN-10"], verifica="Panel observado (captura 03); el archivo descargado no lo comprobé."),
    _c("UC-14", "Consultar el riesgo de una comuna", "Consultar el riesgo de incendio forestal",
       ["Pulsar la pestaña «Riesgo» (panel «Riesgo de incendio forestal»).", "En «Ver una comuna», elegir Concepción.", "Mirar las áreas y la leyenda.",
        "Pulsar «Normalizar dentro de Concepción»."],
       "Áreas coloreadas por clase; al normalizar cambian los colores, no el dato.",
       fe=[["FE-01", "Las familias de infraestructura salen con su clave técnica (H-01)."],
           ["FE-02", "Comuna inexistente en la dirección: se ignora sin aviso (H-07)."]],
       rn=["RN-11", "RN-12"], verifica="Observado: capturas 06 y 06b.", pantalla="Pestaña Riesgo"),
    _c("UC-15", "Descargar las áreas de riesgo de la comuna", "Descargar las áreas de riesgo",
       ["En la pestaña Riesgo, elegir una comuna.", "Pulsar «Áreas (CSV)»."], "Archivo con las áreas de la comuna.",
       fe=[["FE-01", "Sin comuna: botones desactivados, «Elige una comuna para descargar sus áreas.»"]],
       rn=["RN-11"], verifica="Leído en PanelRiesgo.jsx:374-391; no lo comprobé.", pantalla="Pestaña Riesgo"),
    _c("UC-16", "Descargar la infraestructura de la comuna", "Descargar la infraestructura crítica",
       ["En la pestaña Riesgo, elegir una comuna con infraestructura.", "Pulsar «Infraestructura (CSV)»."],
       "Archivo con los elementos de las familias marcadas.", rn=["RN-11"],
       verifica="Leído en PanelRiesgo.jsx:386-390; no lo comprobé.", pantalla="Pestaña Riesgo"),
    _c("UC-17", "Compartir la vista actual", "Compartir esta vista",
       ["Filtrar y encuadrar.", "Pulsar «Compartir».", "Pulsar «Compartir esta vista».", "Abrir el enlace en otra pestaña."],
       "La otra pestaña muestra la misma vista.", rn=["RN-03"], verifica="Panel observado (captura 04); la copia no lo comprobé."),
    _c("UC-18", "Leer la información del visor", "Consultar la información",
       ["Pulsar «Información».", "Leer las fuentes.", "Pulsar «Listo»."], "Texto con qué muestra el visor, fuentes y procedencia.",
       verifica="Observado (captura 05)."),
    _c("UC-19", "Consultar los incendios por líneas eléctricas de una región", "Consultar los incendios por líneas eléctricas",
       ["Abrir lineas-electricas.html («Incendios por líneas eléctricas»).", "Elegir una región en ÁMBITO.",
        "Leer HORA DE INICIO y SUBCAUSA.", "Pulsar «Ir al visor de prevención»."],
       "Mapa y cifras de la región; el botón vuelve al visor.", rn=["RN-16"],
       verifica="Observado (captura 07, todo el país).", pantalla="lineas-electricas.html"),
    _c("UC-20", "Manejar el mapa solo con teclado", "Consultar los incendios investigados",
       ["En la pestaña Incendios, enfocar el mapa con Tab.", "Desplazar con flechas y acercar con +.", "Pulsar Enter sobre una figura.", "Escape."],
       "Se abre la ficha de la figura bajo el centro y Escape la cierra.", rn=["RN-14"], verifica="Leído en App.jsx:925-971; no lo comprobé."),
]
