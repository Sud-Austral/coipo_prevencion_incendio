# -*- coding: utf-8 -*-
"""Contenido del paquete documental (versión 2). Los documentos se GENERAN desde aquí.

Todo lo que se afirma sale de leer el código del repositorio; las referencias
archivo:línea son del árbol de trabajo del día de la generación. Lo que no se pudo
determinar va como [POR VALIDAR].
"""

VERSION = "2"
SISTEMA = "Visor de Prevención de Incendios Forestales (CONAF)"
RAIZ_DOC = "docs/Documentacion_Sistema2"

# ----------------------------------------------------------------------------- rol
ROL = {
    "clave": "usuario",
    "nombre": "Usuario",
    "archivo": "Usuario",
    "resumen": (
        "Cualquier persona que abre el visor en el navegador: público general, equipos regionales de "
        "CONAF, municipios o investigadores. No hay cuentas ni perfiles: todos ven lo mismo."
    ),
    "acceso": (
        "Se entra con la dirección pública del sitio (https://sud-austral.github.io/coipo_prevencion_incendio/). "
        "No se pide usuario ni contraseña: el sitio es estático (frontend/vite.config.js:9-11) y no existe "
        "servidor de aplicación, inicio de sesión, token ni cookie en el código (búsqueda de «login», «auth», "
        "«token» y «password» en frontend/src sin resultados funcionales)."
    ),
    "objetivo": (
        "Consultar en un mapa los incendios forestales ya ocurridos e investigados por la UAD, las obras "
        "preventivas (OECV), los puntos de espera de brigadas, las rutas y la red vial; leer indicadores "
        "calculados sobre lo filtrado; consultar el riesgo de incendio por comuna con su infraestructura "
        "crítica; y descargar o compartir lo que ve."
    ),
    "alcance": [
        "Vista «Incendios»: territorio, filtros, capas, mapa base, fichas, indicadores, descargas, compartir.",
        "Vista «Riesgo»: comuna, leyenda, opacidad, normalización comunal, ficha de área, infraestructura crítica, descargas.",
        "Página aparte «Incendios por líneas eléctricas» (lineas-electricas.html).",
        "Disposición de paneles en escritorio y en celular.",
    ],
    "fuera_alcance": [
        "Incendios activos o en curso: el visor no los muestra (frontend/src/config.js:588).",
        "Editar, cargar o corregir datos: el visor es de solo lectura; los datos los produce el ETL en GitHub Actions.",
        "Avisos ciudadanos o teléfonos de contacto: AVISO_CIVICO y CONTACTO son null a propósito (config.js:613 y 625).",
    ],
    "requisitos": [
        "Navegador moderno con JavaScript (Chrome, Edge, Firefox o Safari recientes).",
        "Conexión a internet: los mapas base y las vistas de Google se cargan desde servicios externos.",
        "Para el informe PDF: permitir ventanas emergentes del sitio (SeccionDescargas.jsx:145-148).",
    ],
    "interfaz": [
        ("Banner y pestañas", "Arriba: banner institucional y las pestañas «Incendios» y «Riesgo»."),
        ("Panel izquierdo", "Ámbito (Territorio), Filtros, Mapa (Capas y Mapa base), Leyenda y los botones Información, Descargar y Compartir."),
        ("Mapa", "Centro: mapa Leaflet con acercar y alejar, escala y atribución."),
        ("Panel derecho", "Indicadores calculados sobre lo filtrado (sólo en la vista Incendios)."),
        ("Cartel de contexto", "Aviso sobre el mapa al entrar: qué muestra y qué no; se cierra con «Entendido»."),
    ],
}

# ----------------------------------------------------------------------------- funcionalidades
# Cada una: nombre, objetivo, quien, precondiciones, pasos, resultado, validaciones, errores,
# consideraciones, restricciones, alternativos, imagenes (claves de CAPTURAS)
F = []


def func(**k):
    k.setdefault("quien", "Usuario")
    k.setdefault("restricciones", [])
    k.setdefault("alternativos", [])
    k.setdefault("imagenes", [])
    F.append(k)


func(
    nombre="Ingreso al visor",
    objetivo="Abrir el visor. No hay inicio de sesión: el sitio es público.",
    precondiciones=["Tener la dirección del sitio o un enlace compartido."],
    pasos=[
        "Abra la dirección del visor en el navegador.",
        "Espere a que se carguen los datos: el panel izquierdo muestra «datos al» y la fecha de generación.",
        "Lea el cartel de contexto que aparece sobre el mapa.",
    ],
    resultado="Se ve la vista «Incendios» con los incendios investigados, las obras OECV y los puntos stand-by encendidos.",
    validaciones=["No se pide usuario ni contraseña.", "Si el enlace trae parámetros (?region=, ?capas=, ?vista=), la vista se abre con ese estado."],
    errores=["«No pudimos cargar los datos del visor»: el archivo manifest.json no respondió (App.jsx:1181)."],
    consideraciones=["La fecha «datos al» es la de la última ejecución del ETL, no la de hoy."],
    imagenes=["01_inicio.png"],
)
func(
    nombre="Leer el cartel de contexto",
    objetivo="Entender qué representa el mapa antes de interpretarlo.",
    precondiciones=["Vista «Incendios» abierta."],
    pasos=[
        "Lea el cartel: cada punto es un incendio YA OCURRIDO e investigado por la UAD.",
        "Pulse «Ver capas y filtros» o «Ver indicadores» para ir a ese panel, o «Entendido» para cerrarlo.",
    ],
    resultado="El cartel se cierra y el mapa queda libre.",
    validaciones=["El cartel no aparece en la vista «Riesgo» (App.jsx:1406)."],
    errores=[],
    consideraciones=["El cartel vuelve a aparecer al recargar la página: no se recuerda el cierre (App.jsx:197, estado en memoria)."],
    imagenes=["01_inicio.png", "02_visor_paneles.png"],
)
func(
    nombre="Elegir el territorio",
    objetivo="Recortar todo el visor a una región, provincia o comuna.",
    precondiciones=["Vista «Incendios» con el panel izquierdo visible."],
    pasos=[
        "En «Ámbito», pulse «Territorio».",
        "Elija una región. Aparecen entonces Provincia y Comuna con su cuenta de incendios.",
        "Opcional: elija provincia y comuna; o pulse «Centrar el mapa en …».",
        "Pulse «Listo». Para deshacer, «Volver a todo Chile».",
    ],
    resultado="El mapa, los filtros, los indicadores y las descargas pasan a ser de ese territorio; el botón muestra su nombre.",
    validaciones=[
        "La cifra entre paréntesis se cuenta en la primera capa encendida a la que aplica el filtro, con su unidad (config.js:482 y 520).",
        "Si la comuna viene de la vista Riesgo y no existe con ese nombre en los incendios, se avisa: «La comuna «…» no aparece con ese nombre en los incendios investigados, así que ese filtro no se está aplicando.» (PanelLateral.jsx:90 y 209).",
    ],
    errores=[],
    consideraciones=["El encabezado del modal dice «Las cifras de todo el visor son de este territorio» cuando hay región elegida."],
    imagenes=["03_territorio.png", "04_territorio_biobio.png", "05_filtro_region.png"],
)
func(
    nombre="Aplicar y quitar filtros",
    objetivo="Ver sólo los incendios u obras que cumplen una condición.",
    precondiciones=["Al menos una capa encendida a la que el filtro aplique."],
    pasos=[
        "En «Filtros», pulse el botón del filtro (Temporada, Grupo de causa, Causa general, Titularidad, Institución o Tipo de carpeta).",
        "Elija una opción; cada una muestra cuántos elementos tiene.",
        "Pulse «Listo». El número junto a «Filtros» indica cuántos hay puestos.",
        "Para quitarlos: «Quitar el filtro» / «Quitar los N filtros», o «Quitar este filtro» dentro del modal.",
    ],
    resultado="El mapa, los indicadores y las descargas responden a los filtros activos.",
    validaciones=[
        "Un filtro sólo se muestra si alguna capa a la que aplica está encendida (config.js:520-552).",
        "Las opciones salen del manifest; el visor no tiene temporadas, regiones ni causas escritas a mano.",
    ],
    errores=["Con rutas o red vial servidas por teselas y sin cruce publicado: «Esta capa se sirve por tramos y esta publicación no trae el cruce con los demás…» (GrupoFiltro.jsx:172)."],
    consideraciones=["Una opción con 0 elementos se muestra igual, con su cero."],
    imagenes=["06_filtro_temporada.png"],
)
func(
    nombre="Encender y apagar capas",
    objetivo="Elegir qué se dibuja en el mapa.",
    precondiciones=["Vista «Incendios»."],
    pasos=["En «Mapa», pulse «Capas».", "Marque o desmarque cada capa; lea su descripción.", "Pulse «Listo»."],
    resultado="El mapa dibuja sólo las capas marcadas; el botón dice cuántas están encendidas.",
    validaciones=[
        "Por omisión: Incendios investigados, OECV (cortafuegos) y Puntos stand-by (config.js:404-470).",
        "Las capas pesadas se descargan al encenderlas; mientras tanto dicen «cargando…» y, si fallan, ofrecen «Reintentar» (ControlesPanel.jsx:146 y 163).",
    ],
    errores=["Fallo de descarga de una capa: aparece «Reintentar» en su fila."],
    consideraciones=["OECV verificado es evidencia enviada por las regiones, no el avance oficial."],
    imagenes=["07_capas.png"],
)
func(
    nombre="Cambiar el mapa base",
    objetivo="Elegir el fondo del mapa.",
    precondiciones=[],
    pasos=["En «Mapa», pulse «Mapa base».", "Elija Claro, Calles, Topográfico, Relieve, Oscuro, Satelital o Sentinel-2.", "Pulse «Listo»."],
    resultado="El fondo cambia y la elección queda en la URL (?base=).",
    validaciones=["Un valor desconocido en ?base= cae en «Claro» (App.jsx:305)."],
    errores=["Con Satelital, si no responde el servicio de fechas: «No se pudo consultar la fecha de la imagen.» (FechaImagen.jsx:21)."],
    consideraciones=["Con Satelital se informa la fecha de la imagen del centro de la vista."],
    imagenes=["08_mapa_base.png"],
)
func(
    nombre="Consultar la ficha de un elemento",
    objetivo="Ver los atributos de un incendio, obra, tramo, punto stand-by o ruta.",
    precondiciones=["La capa del elemento está encendida."],
    pasos=[
        "Haga clic sobre el punto o la línea en el mapa.",
        "Lea la ficha: región, comuna, temporada, causas, superficie, fechas, etc.",
        "Opcional: «Vista satelital» o «Street View» abren el punto en Google dentro del visor; desde ahí, «Abrir en Google Earth».",
        "Cierre con la X o con Escape.",
    ],
    resultado="Se ve la ficha del elemento elegido.",
    validaciones=["La vista de Google se abre en un segundo diálogo hermano de la ficha; cerrarla no cierra la ficha (ModalVistaGoogle.jsx)."],
    errores=["Si una figura no trae atributos: «Esta figura no trae más atributos.» (ModalFicha.jsx:127)."],
    consideraciones=["Street View sólo tiene imágenes junto a calles o caminos (ModalVistaGoogle.jsx:116)."],
    imagenes=["09_ficha_incendio.png", "10_vista_google.png"],
)
func(
    nombre="Leer los indicadores",
    objetivo="Interpretar las cifras calculadas sobre los incendios investigados y el avance OECV.",
    precondiciones=["Vista «Incendios»; panel derecho abierto."],
    pasos=[
        "Lea el ámbito bajo «Indicadores» (por ejemplo «nacional · todas las temporadas»).",
        "Recorra: Incendios evitables, Qué estaban haciendo, Cobertura preventiva vs presión, Riesgo por tendido eléctrico, Avance OECV 2025-2026, Incendios por temporada, Composición de causas, Causas generales y Puntos de espera de brigadas.",
    ],
    resultado="Cifras del ámbito y filtros activos.",
    validaciones=["Los indicadores hablan sólo de incendios investigados por la UAD, no de la totalidad del país (PanelIndicadores.jsx:198)."],
    errores=["Sin incendios que cumplan los filtros: «Ningún incendio investigado cumple los filtros actuales.» (PanelIndicadores.jsx:248)."],
    consideraciones=["El alza del número por temporada refleja también la mayor cobertura de investigación (PanelIndicadores.jsx:677)."],
    imagenes=["02_visor_paneles.png", "11_indicadores.png", "12_indicadores_avance.png"],
)
func(
    nombre="Descargar datos e imágenes",
    objetivo="Llevarse lo que se ve: datos, imagen o informe.",
    precondiciones=["Vista «Incendios»."],
    pasos=[
        "Pulse «Descargar» en el panel izquierdo.",
        "Elija «Informe con el mapa (PDF)», «Imagen del mapa (PNG)», o CSV / GeoJSON de cada capa cargada.",
        "Para el informe: se abre una pestaña; en el diálogo de impresión elija «Guardar como PDF».",
    ],
    resultado="Se descarga el archivo; debajo se informa su nombre y tamaño.",
    validaciones=[
        "Todo respeta el filtro activo (SeccionDescargas.jsx:247).",
        "CSV con «;» y coma decimal (descargas.js:66).",
        "Capas apagadas: «enciende la capa para poder exportarla»; capas por teselas: «se sirve por teselas y no hay figuras en el navegador» (SeccionDescargas.jsx:234).",
    ],
    errores=["Si alguna tesela no carga, el PNG se genera igual y se informa cuántas faltaron."],
    consideraciones=["El enlace «archivo publicado» baja el GeoJSON completo, sin filtrar y con los códigos originales."],
    imagenes=["13_descargas.png"],
)
func(
    nombre="Compartir la vista",
    objetivo="Enviar a otra persona exactamente lo que se está viendo.",
    precondiciones=[],
    pasos=["Pulse «Compartir».", "Pulse «Compartir esta vista».", "Pegue el enlace donde lo necesite."],
    resultado="Se usa el diálogo nativo de compartir o se copia el enlace («Enlace copiado»).",
    validaciones=[
        "El enlace guarda capas, filtros, mapa base, vista y encuadre (urlState.js).",
        "Sin permiso de portapapeles, el enlace aparece seleccionado para copiarlo a mano (PanelLateral.jsx:142-148).",
    ],
    errores=[],
    consideraciones=["Un enlace con región abre cifras regionales: el aviso «El enlace guarda las capas, los filtros y el encuadre actuales.» lo recuerda."],
    imagenes=["14_compartir.png"],
)
func(
    nombre="Consultar información y fuentes",
    objetivo="Saber qué muestra el visor, de qué fuentes sale y quién lo publica.",
    precondiciones=[],
    pasos=["Pulse «Información».", "Lea «Qué muestra este visor», «Fuentes» y «Procedencia».", "Pulse «Listo»."],
    resultado="Se ven las fuentes declaradas en el manifest y la fecha de generación.",
    validaciones=["La lista de fuentes sale del manifest, no está escrita a mano."],
    errores=["Antes de llegar el manifest: «Aún no ha llegado el manifest con las fuentes.» (ModalesPanel.jsx:43)."],
    consideraciones=["Publica: CONAF · Unidad de Información y Análisis."],
    imagenes=["15_informacion.png"],
)
func(
    nombre="Consultar el riesgo por comuna",
    objetivo="Ver el nivel de riesgo de incendio forestal del modelo nacional y la infraestructura crítica.",
    precondiciones=["Pestaña «Riesgo»."],
    pasos=[
        "Pulse la pestaña «Riesgo».",
        "En «Comuna», elija una comuna en «Ver una comuna» (el número es cuántas áreas tiene).",
        "Ajuste la «Opacidad de las áreas» si lo necesita.",
        "Opcional: «Normalizar dentro de <comuna>» para el contraste interno; «Volver a la escala del modelo» para deshacer.",
        "Haga clic en un área para ver su ficha; marque o desmarque familias de infraestructura crítica.",
        "Descargue «Áreas (CSV)», «Áreas (GeoJSON)», «Infraestructura (CSV/GeoJSON)» o la «Imagen del mapa (PNG)».",
    ],
    resultado="El mapa muestra las áreas de la comuna con su clase y los íconos de infraestructura de esa comuna.",
    validaciones=[
        "La comuna se cruza por código CUT, no por nombre (App.jsx:115).",
        "Sin comuna, la normalización se apaga sola (App.jsx:619-621).",
        "Los colores van por nivel 0 a 4 y las etiquetas salen del manifest.",
        "Sin teselas publicadas: «Esta publicación no trae las teselas de riesgo, así que las áreas no se pueden dibujar.» (PanelRiesgo.jsx:216).",
    ],
    errores=["Las descargas de áreas quedan deshabilitadas sin comuna: «Elige una comuna para descargar sus áreas.»"],
    consideraciones=["Mide la amenaza del territorio, no la exposición; no es un ranking (ModalesPanel.jsx:81-96)."],
    imagenes=["16_riesgo_nacional.png", "17_riesgo_comuna.png", "18_riesgo_normalizado.png", "19_riesgo_ficha_area.png"],
)
func(
    nombre="Consultar los incendios por líneas eléctricas",
    objetivo="Ver dónde, por qué subcausa y a qué hora comenzaron los incendios atribuidos a líneas eléctricas.",
    precondiciones=["Abrir lineas-electricas.html (página aparte)."],
    pasos=[
        "Abra la página «Incendios por líneas eléctricas».",
        "Elija el ámbito (Todo el país o una región).",
        "Encienda o apague: concentración histórica (calor), incendios (color = subcausa) y comunas.",
        "Ajuste la intensidad del calor y el mapa base; lea el resumen, la subcausa y la hora de inicio.",
        "Vuelva con «Ir al visor de prevención».",
    ],
    resultado="Mapa y paneles del ámbito elegido.",
    validaciones=["Si el manifest no declara las columnas esperadas, la página se niega a dibujar y lo dice (electrico/main.js:94-107)."],
    errores=["«No se pudo mostrar la vista» con el motivo (lineas-electricas.html:42)."],
    consideraciones=["La concentración es histórica: no es riesgo ni predicción."],
    imagenes=["20_lineas_electricas.png"],
)
func(
    nombre="Ajustar la disposición de la pantalla",
    objetivo="Ganar espacio de mapa o leer mejor los paneles.",
    precondiciones=[],
    pasos=[
        "Cierre un panel con su X; vuelva a abrirlo con los botones del borde del mapa («Abrir capas y filtros», «Abrir indicadores»).",
        "Arrastre el tirador entre panel y mapa para ensanchar; doble clic vuelve al ancho normal.",
        "En celular, los paneles son cajones que se abren con los botones sobre el mapa y se cierran con Escape o con la X.",
    ],
    resultado="La disposición se recuerda en ese navegador (clave coipo.disposicion).",
    validaciones=["Valores corruptos guardados en el navegador vuelven a los por omisión (preferencias.js)."],
    errores=[],
    consideraciones=["Si el navegador bloquea el almacenamiento, el visor funciona igual pero no recuerda la disposición."],
    imagenes=["21_movil.png", "22_tema_oscuro.png"],
)
func(
    nombre="Recuperarse de un error de carga",
    objetivo="Saber qué hacer si el visor no carga.",
    precondiciones=["El visor no pudo leer sus datos."],
    pasos=["Lea el mensaje «No pudimos cargar los datos del visor».", "Pulse «Reintentar» (recarga la página).", "Si persiste, abra «Detalle técnico» y comuníquelo."],
    resultado="El visor vuelve a cargar cuando el sitio responde.",
    validaciones=[],
    errores=["El mensaje técnico queda dentro de «Detalle técnico» (App.jsx:1189)."],
    consideraciones=["Puede deberse a la conexión o a una actualización en curso de los datos."],
    imagenes=["23_error_datos.png"],
)

# ----------------------------------------------------------------------------- capturas
CAPTURAS = {
    "01_inicio.png": "Entrada al visor: paneles, mapa y cartel de contexto (datos ficticios).",
    "02_visor_paneles.png": "Visor con el cartel cerrado: panel de control e indicadores.",
    "03_territorio.png": "Modal «Territorio» con las regiones y su cuenta.",
    "04_territorio_biobio.png": "Territorio con una región elegida: provincias y comunas.",
    "05_filtro_region.png": "Visor recortado a una región: el botón Territorio la nombra.",
    "06_filtro_temporada.png": "Modal del filtro «Temporada».",
    "07_capas.png": "Modal «Capas» con descripción y cuenta de cada capa.",
    "08_mapa_base.png": "Modal «Mapa base» con los siete fondos.",
    "09_ficha_incendio.png": "Ficha de un incendio investigado (ficticio).",
    "10_vista_google.png": "Vista del punto en Google dentro del visor (simulada sin red).",
    "11_indicadores.png": "Indicadores: causas generales y puntos stand-by.",
    "12_indicadores_avance.png": "Indicadores: avance OECV e incendios por temporada.",
    "13_descargas.png": "Modal «Descargar»: informe, PNG, CSV y GeoJSON.",
    "14_compartir.png": "Modal «Compartir».",
    "15_informacion.png": "Modal «Información»: qué muestra, fuentes y procedencia.",
    "16_riesgo_nacional.png": "Vista Riesgo sin comuna elegida.",
    "17_riesgo_comuna.png": "Vista Riesgo con una comuna: áreas e infraestructura.",
    "18_riesgo_normalizado.png": "Vista Riesgo normalizada dentro de la comuna.",
    "19_riesgo_ficha_area.png": "Ficha de un área de riesgo.",
    "20_lineas_electricas.png": "Página «Incendios por líneas eléctricas».",
    "21_movil.png": "Visor en un celular (390 px de ancho).",
    "22_tema_oscuro.png": "Visor con el sistema en tema oscuro.",
    "23_error_datos.png": "Pantalla de error cuando no cargan los datos.",
}

# ----------------------------------------------------------------------------- reglas
REGLAS = [
    ["RN-01", "Acceso público sin autenticación", "El visor es un sitio estático; no hay inicio de sesión, cuentas ni permisos por persona.", "frontend/vite.config.js:9-11; sin backend (CLAUDE.md §1)"],
    ["RN-02", "No muestra incendios activos", "Cada punto es un incendio ya ocurrido e investigado; se dice en tres superficies.", "frontend/src/config.js:588"],
    ["RN-03", "La cuenta de un filtro sale de una sola capa", "Se cuenta en la primera capa encendida a la que el filtro aplica, con la unidad de esa capa.", "frontend/src/config.js:482 y 520"],
    ["RN-04", "Los vocabularios salen del manifest", "Temporadas, regiones, causas e instituciones no están escritas en el frontend.", "frontend/src/filtros.js; CLAUDE.md §4"],
    ["RN-05", "El estado de la vista vive en la URL", "Capas, filtros, mapa base, vista y encuadre se escriben en la URL con 250 ms de retraso.", "frontend/src/urlState.js"],
    ["RN-06", "La disposición se guarda en el navegador", "Anchos y paneles abiertos en localStorage, acotados y con valores por omisión si están corruptos.", "frontend/src/preferencias.js"],
    ["RN-07", "Las descargas respetan el ámbito", "CSV, GeoJSON, PNG e informe salen del filtro activo.", "frontend/src/components/SeccionDescargas.jsx:247"],
    ["RN-08", "Formato del CSV", "Separador «;» y coma decimal, para Excel en español de Chile.", "frontend/src/descargas.js:66"],
    ["RN-09", "Capas por teselas no se exportan", "Sin figuras en el navegador la fila de descarga dice el motivo.", "frontend/src/components/SeccionDescargas.jsx:234"],
    ["RN-10", "La comuna de riesgo se cruza por código CUT", "Acepta CUT, nombre con o sin tildes y alias publicados.", "frontend/src/App.jsx:115"],
    ["RN-11", "La normalización comunal no cambia el dato", "Es un contraste interno; sin comuna se apaga sola; el contorno mantiene la clase.", "frontend/src/App.jsx:619-621; escalas.js"],
    ["RN-12", "Colores de riesgo por nivel", "Nivel 0 a 4; etiquetas y cortes salen del manifest.", "frontend/src/config.js:375"],
    ["RN-13", "Vista desconocida cae en Incendios", "?vista= con un valor no reconocido abre Incendios; «priorizacion» es alias de Riesgo.", "frontend/src/config.js:354-360"],
    ["RN-14", "Mapa base desconocido cae en Claro", "?base= con un valor no reconocido usa el fondo Claro.", "frontend/src/App.jsx:305"],
    ["RN-15", "Escape cierra sólo cajones", "Con paneles anclados, Escape no los pliega; con un diálogo abierto, cierra sólo el diálogo.", "frontend/src/App.jsx:1082-1096"],
    ["RN-16", "Sin aviso cívico ni contacto", "AVISO_CIVICO y CONTACTO son null hasta que la Unidad de Información y Análisis los autorice.", "frontend/src/config.js:613 y 625"],
    ["RN-17", "Los indicadores son de incendios investigados", "No representan la totalidad de incendios del país.", "frontend/src/components/PanelIndicadores.jsx:198"],
]

# ----------------------------------------------------------------------------- recursos (no hay API)
ENDPOINTS = [
    ["GET", "data/manifest.json", "Contrato: capas, dominios, tablas, fechas.", "Público"],
    ["GET", "data/kpis.json", "Avance OECV por región.", "Público"],
    ["GET", "data/<capa>.geojson", "Capas de puntos y líneas.", "Público"],
    ["GET (Range)", "data/*.pmtiles", "Rutas, red vial y teselas de riesgo; exigen HTTP Range.", "Público"],
    ["GET", "data/riesgo/atributos/<CUT>.json", "Atributos de las áreas de una comuna.", "Público"],
    ["GET", "Servicios externos de mapas", "Teselas de Esri, OpenStreetMap y EOX; metadatos de fecha de Esri.", "Público"],
]

CAMPOS = {
    "Elegir el territorio": [["Región", "No", "Una de las regiones del manifest", "Al elegirla aparecen Provincia y Comuna"],
                             ["Provincia", "No", "Provincias de la región elegida", ""],
                             ["Comuna", "No", "Comunas de la región/provincia", "En Riesgo se resuelve por CUT"]],
    "Consultar el riesgo por comuna": [["Ver una comuna", "No", "Comunas con partes en el manifest", "Número = áreas de riesgo"],
                                       ["Opacidad de las áreas", "No", "Deslizador 0 a 100 %", "Por omisión 65 %"]],
}

# ----------------------------------------------------------------------------- casos de uso
# traz = [módulo, funcionalidad, pantalla, componente, recursos]
C = []


def caso(**k):
    k.setdefault("permisos", "Ninguno: acceso público.")
    k.setdefault("fa", [])
    k.setdefault("fe", [])
    k.setdefault("rn", [])
    k.setdefault("validaciones", [])
    k.setdefault("secundarios", "Ninguno")
    C.append(k)


caso(id="CU-01", nombre="Abrir el visor", objetivo="Entrar al visor sin credenciales.",
     descripcion="El usuario abre la dirección pública y el visor carga sus datos.",
     precondiciones=["Sitio publicado y accesible."], entradas=["Dirección del sitio"],
     flujo=["El usuario abre la dirección.", "El visor descarga manifest.json y las capas por omisión.", "Se muestran paneles, mapa y cartel de contexto."],
     resultado="Vista Incendios cargada; «datos al <fecha>» en el panel.",
     fa=["FA-1: el enlace trae parámetros; el visor abre con ese estado."],
     fe=["FE-1: manifest no responde; se muestra «No pudimos cargar los datos del visor» con «Reintentar»."],
     rn=["RN-01", "RN-02"], datos="Ninguno", traz=["Visor", "Ingreso al visor", "Inicio", "App.jsx", "manifest.json"],
     verifica="No se pide usuario ni contraseña y la fecha «datos al» coincide con manifest.generado.")
caso(id="CU-02", nombre="Cerrar el cartel de contexto", objetivo="Leer y descartar el aviso inicial.",
     descripcion="El cartel explica que los puntos son incendios ya ocurridos.",
     precondiciones=["Vista Incendios abierta."], entradas=["Clic en «Entendido», «Ver capas y filtros» o «Ver indicadores»"],
     flujo=["El usuario lee el cartel.", "Pulsa «Entendido».", "El cartel desaparece."],
     resultado="Mapa sin cartel.", fa=["FA-1: «Ver capas y filtros» abre el panel izquierdo.", "FA-2: «Ver indicadores» abre el panel derecho."],
     rn=["RN-02"], datos="Ninguno", traz=["Visor", "Leer el cartel de contexto", "Mapa", "CartelContexto.jsx", "—"],
     verifica="El cartel no aparece en la vista Riesgo y reaparece al recargar.")
caso(id="CU-03", nombre="Recortar a una región", objetivo="Ver sólo una región.",
     descripcion="El usuario elige una región en Territorio.",
     precondiciones=["Panel izquierdo visible."], entradas=["Región"],
     flujo=["Pulsa «Territorio».", "Elige una región.", "Pulsa «Listo»."],
     resultado="Mapa, indicadores y descargas de esa región; ?region= en la URL.",
     fa=["FA-1: elige además provincia y comuna.", "FA-2: «Centrar el mapa en <región>»."],
     fe=["FE-1: comuna sin equivalencia en incendios; se avisa que el filtro no se aplica."],
     rn=["RN-03", "RN-04", "RN-05"], datos="Región ficticia «Biobío» del doble de datos",
     traz=["Visor", "Elegir el territorio", "Modal Territorio", "ControlesPanel.jsx", "manifest.json"],
     verifica="La cuenta de la región en el modal coincide con el total del panel de indicadores.")
caso(id="CU-04", nombre="Volver a todo Chile", objetivo="Deshacer el recorte territorial.",
     descripcion="El usuario quita la región elegida.",
     precondiciones=["Hay una región elegida."], entradas=["Clic en «Volver a todo Chile»"],
     flujo=["Abre Territorio.", "Pulsa «Volver a todo Chile».", "Pulsa «Listo»."],
     resultado="Ámbito nacional; desaparece ?region= de la URL.", rn=["RN-05"], datos="Ninguno",
     traz=["Visor", "Elegir el territorio", "Modal Territorio", "ControlesPanel.jsx", "—"],
     verifica="El indicador vuelve a decir «nacional».")
caso(id="CU-05", nombre="Filtrar por temporada y causa", objetivo="Ver incendios de una temporada y causa.",
     descripcion="El usuario combina filtros de incendios.",
     precondiciones=["Capa Incendios encendida."], entradas=["Temporada", "Grupo de causa", "Causa general"],
     flujo=["Pulsa «Temporada» y elige una.", "Pulsa «Grupo de causa» y elige uno.", "Revisa mapa e indicadores."],
     resultado="Sólo los incendios que cumplen ambos filtros; contador de filtros = 2.",
     fa=["FA-1: «Quitar los 2 filtros»."], fe=["FE-1: ningún incendio cumple; los indicadores lo dicen."],
     rn=["RN-03", "RN-04"], datos="Temporada 2024-2025, Negligentes",
     traz=["Visor", "Aplicar y quitar filtros", "Modal de filtro", "GrupoFiltro.jsx; filtros.js", "incendios.geojson"],
     verifica="Las cifras entre paréntesis cambian al combinar filtros.")
caso(id="CU-06", nombre="Filtro que no aplica a capas encendidas", objetivo="Comprobar que un filtro sin capa no se ofrece.",
     descripcion="Con sólo red vial encendida, los filtros de incendios desaparecen.",
     precondiciones=["Capas: sólo Red vial."], entradas=["?capas=redvial"],
     flujo=["Abre el visor con ?capas=redvial.", "Revisa la sección Filtros."],
     resultado="Sólo se ofrecen Región y Tipo de carpeta, contados en tramos.", rn=["RN-03"], datos="Ninguno",
     traz=["Visor", "Aplicar y quitar filtros", "Panel izquierdo", "PanelLateral.jsx", "manifest.json"],
     verifica="La unidad entre paréntesis es «tramos», no «incendios» ni «rutas».")
caso(id="CU-07", nombre="Encender una capa bajo demanda", objetivo="Cargar Rutas de despliegue.",
     descripcion="La capa se descarga al encenderla.",
     precondiciones=["Capa apagada."], entradas=["Casilla de la capa"],
     flujo=["Abre Capas.", "Marca «Rutas de despliegue».", "Espera a que deje de decir «cargando…»."],
     resultado="La capa se dibuja; el botón suma una capa encendida.",
     fe=["FE-1: la descarga falla; aparece «Reintentar»."], rn=["RN-09"], datos="Ninguno",
     traz=["Visor", "Encender y apagar capas", "Modal Capas", "ControlesPanel.jsx; CapaTiles.jsx", "rutas.pmtiles"],
     verifica="Con PMTiles, el servidor responde 206 a las peticiones Range.")
caso(id="CU-08", nombre="Cambiar el mapa base", objetivo="Usar otro fondo.",
     descripcion="El usuario elige Satelital.", precondiciones=[], entradas=["Fondo"],
     flujo=["Abre Mapa base.", "Elige «Satelital».", "Pulsa «Listo»."],
     resultado="Fondo satelital y fecha de la imagen; ?base=Satelital.",
     fe=["FE-1: el servicio de fechas no responde; «No se pudo consultar la fecha de la imagen.»"],
     rn=["RN-05", "RN-14"], datos="Ninguno",
     traz=["Visor", "Cambiar el mapa base", "Modal Mapa base", "App.jsx; FechaImagen.jsx", "Esri"],
     verifica="Un ?base=Inexistente abre con Claro.")
caso(id="CU-09", nombre="Ver la ficha de un incendio", objetivo="Consultar los atributos de un incendio.",
     descripcion="Clic en un punto del mapa.", precondiciones=["Capa Incendios encendida."], entradas=["Clic en el punto"],
     flujo=["Hace clic en un punto.", "Lee la ficha.", "Cierra con X o Escape."],
     resultado="Ficha con región, comuna, temporada, causas, superficie y fechas.",
     fa=["FA-1: «Vista satelital» o «Street View» abren Google dentro del visor."],
     rn=["RN-15"], datos="Incendio «Sector Ficticio 5» del doble",
     traz=["Visor", "Consultar la ficha de un elemento", "Ficha", "ModalFicha.jsx; fichas.js", "incendios.geojson"],
     verifica="Escape con la ficha abierta cierra sólo la ficha, no el cajón de debajo.")
caso(id="CU-10", nombre="Ver el punto en Google", objetivo="Mirar el lugar en imagen satelital o Street View.",
     descripcion="Desde la ficha se abre el segundo diálogo.", precondiciones=["Ficha abierta."], entradas=["Clic en «Vista satelital»"],
     flujo=["Pulsa «Vista satelital».", "Cambia a «Street View» con la pestaña.", "Opcional: «Abrir en Google Earth»."],
     resultado="Vista del punto dentro del visor.", rn=[], datos="Ninguno",
     traz=["Visor", "Consultar la ficha de un elemento", "Vista del punto", "ModalVistaGoogle.jsx; enlacesGoogle.js", "google.com"],
     verifica="Al cerrar la vista de Google la ficha sigue abierta.")
caso(id="CU-11", nombre="Leer indicadores filtrados", objetivo="Interpretar cifras del ámbito.",
     descripcion="Con una región elegida, los indicadores se recalculan.",
     precondiciones=["Región elegida."], entradas=["—"],
     flujo=["Abre el panel de indicadores.", "Revisa «Ámbito: <región> · todas las temporadas».", "Recorre las secciones."],
     resultado="Cifras de la región.", fe=["FE-1: sin incendios; «Ningún incendio investigado cumple los filtros actuales.»"],
     rn=["RN-17"], datos="Región Biobío del doble",
     traz=["Visor", "Leer los indicadores", "Panel Indicadores", "PanelIndicadores.jsx; indicadores.js", "incendios.geojson; kpis.json"],
     verifica="Avance OECV regional usa el planificado de esa región.")
caso(id="CU-12", nombre="Descargar CSV del ámbito", objetivo="Bajar los incendios filtrados.",
     descripcion="Descarga desde el modal Descargar.", precondiciones=["Capa Incendios cargada."], entradas=["Clic en CSV"],
     flujo=["Pulsa «Descargar».", "En «Incendios investigados» pulsa «CSV».", "Abre el archivo en Excel."],
     resultado="Archivo CSV con «;» y coma decimal, sólo con lo filtrado.",
     fa=["FA-1: GeoJSON.", "FA-2: «archivo publicado» sin filtrar."], fe=["FE-1: capa apagada; «enciende la capa para poder exportarla»."],
     rn=["RN-07", "RN-08", "RN-09"], datos="Ninguno",
     traz=["Visor", "Descargar datos e imágenes", "Modal Descargar", "SeccionDescargas.jsx; descargas.js", "incendios.geojson"],
     verifica="El número de filas coincide con el total del indicador.")
caso(id="CU-13", nombre="Generar el informe PDF", objetivo="Obtener un informe imprimible con el mapa.",
     descripcion="Se abre una pestaña con el informe.", precondiciones=["Ventanas emergentes permitidas."], entradas=["Clic en «Informe con el mapa (PDF)»"],
     flujo=["Pulsa el botón.", "Se abre una pestaña «Generando el informe…».", "En el diálogo de impresión elige «Guardar como PDF»."],
     resultado="Informe con el mapa y las cifras del ámbito.",
     fe=["FE-1: el navegador bloquea la ventana emergente. [POR VALIDAR] el mensaje exacto que se muestra en ese caso."],
     rn=["RN-07"], datos="Ninguno",
     traz=["Visor", "Descargar datos e imágenes", "Modal Descargar", "SeccionDescargas.jsx; informe.js; mapaPNG.js", "—"],
     verifica="El informe dice el mismo ámbito que el panel.")
caso(id="CU-14", nombre="Compartir la vista", objetivo="Enviar el estado actual.",
     descripcion="Copia el enlace con el estado.", precondiciones=[], entradas=["Clic en «Compartir esta vista»"],
     flujo=["Pulsa «Compartir».", "Pulsa «Compartir esta vista».", "Ve «Enlace copiado» o el diálogo nativo."],
     resultado="Enlace con capas, filtros, base, vista y encuadre.",
     fa=["FA-1: sin permiso de portapapeles, el enlace aparece seleccionado para copiar a mano."],
     rn=["RN-05"], datos="Ninguno",
     traz=["Visor", "Compartir la vista", "Modal Compartir", "PanelLateral.jsx; urlState.js", "—"],
     verifica="Abrir el enlace en otra ventana reproduce la misma vista.")
caso(id="CU-15", nombre="Consultar el riesgo de una comuna", objetivo="Ver las áreas de riesgo de una comuna.",
     descripcion="Pestaña Riesgo con comuna elegida.", precondiciones=["Pestaña Riesgo."], entradas=["Comuna"],
     flujo=["Pulsa «Riesgo».", "Elige una comuna en «Ver una comuna».", "Revisa áreas, leyenda e infraestructura."],
     resultado="Mapa encuadrado en la comuna, con ?vista=riesgo&comuna= en la URL.",
     fa=["FA-1: ?comuna= con nombre sin tildes o alias también funciona."],
     fe=["FE-1: publicación sin teselas; el panel lo dice."], rn=["RN-10", "RN-12"], datos="Comuna Mulchén (08305), áreas ficticias",
     traz=["Riesgo", "Consultar el riesgo por comuna", "Panel Riesgo", "PanelRiesgo.jsx; CapaRiesgoTeselas.jsx", "riesgo/teselas/*.pmtiles; riesgo/atributos/<CUT>.json"],
     verifica="El número junto a la comuna coincide con «En el mapa».")
caso(id="CU-16", nombre="Normalizar dentro de la comuna", objetivo="Ver el contraste interno.",
     descripcion="Cambia la rampa a relativa.", precondiciones=["Comuna elegida."], entradas=["Clic en «Normalizar dentro de <comuna>»"],
     flujo=["Pulsa el botón.", "La leyenda pasa a «Contraste interno · <comuna>» con el distintivo RELATIVO.", "«Volver a la escala del modelo» lo deshace."],
     resultado="Colores relativos; el contorno conserva la clase.", rn=["RN-11"], datos="Mulchén",
     traz=["Riesgo", "Consultar el riesgo por comuna", "Panel Riesgo", "PanelRiesgo.jsx; escalas.js", "—"],
     verifica="Al quitar la comuna la escala vuelve sola a la del modelo.")
caso(id="CU-17", nombre="Ver la ficha de un área de riesgo", objetivo="Consultar los atributos de un área.",
     descripcion="Clic sobre un área.", precondiciones=["Áreas dibujadas."], entradas=["Clic en el área"],
     flujo=["Hace clic en un área.", "Lee comuna, clase, nivel medio, rango, posición y superficie."],
     resultado="Ficha «Área de riesgo».", rn=["RN-12"], datos="Área 08305-demo0073",
     traz=["Riesgo", "Consultar el riesgo por comuna", "Ficha", "fichas.js (fichaMancha)", "riesgo/atributos/<CUT>.json"],
     verifica="La clase de la ficha coincide con el color del contorno.")
caso(id="CU-18", nombre="Descargar áreas e infraestructura", objetivo="Bajar los datos de riesgo de una comuna.",
     descripcion="Botones de descarga del panel Riesgo.", precondiciones=["Comuna elegida."], entradas=["Clic en «Áreas (CSV)» u otro"],
     flujo=["Pulsa «Áreas (CSV)», «Áreas (GeoJSON)», «Infraestructura (CSV)» o «Infraestructura (GeoJSON)».", "Revisa el archivo."],
     resultado="Archivos sólo de la comuna elegida.", fe=["FE-1: sin comuna, los botones de áreas están deshabilitados."],
     rn=["RN-07", "RN-08"], datos="Mulchén",
     traz=["Riesgo", "Consultar el riesgo por comuna", "Panel Riesgo", "PanelRiesgo.jsx; descargas.js", "riesgo/<CUT>.geojson"],
     verifica="El CSV trae las mismas áreas que la cuenta del panel.")
caso(id="CU-19", nombre="Consultar incendios por líneas eléctricas", objetivo="Usar la página aparte.",
     descripcion="Mapa de calor, subcausas y hora de inicio.", precondiciones=["Página lineas-electricas.html."], entradas=["Ámbito", "Capas", "Intensidad"],
     flujo=["Abre la página.", "Elige una región.", "Ajusta capas e intensidad.", "Lee resumen, subcausas y horas."],
     resultado="Paneles del ámbito elegido.", fe=["FE-1: manifest sin columnas esperadas; «No se pudo mostrar la vista»."],
     rn=["RN-02"], datos="Derivado lineas_electricas del doble",
     traz=["Líneas eléctricas", "Consultar los incendios por líneas eléctricas", "lineas-electricas.html", "electrico/main.js; calculos.js", "lineas_electricas.geojson"],
     verifica="«Ir al visor de prevención» vuelve al visor.")
caso(id="CU-20", nombre="Usar el visor en un celular", objetivo="Consultar desde una pantalla angosta.",
     descripcion="Paneles como cajones.", precondiciones=["Pantalla de menos de 900 px."], entradas=["Botones del mapa"],
     flujo=["Abre el visor.", "Pulsa el botón de capas y filtros o el de indicadores.", "Cierra con X o Escape."],
     resultado="El mapa ocupa la pantalla; los paneles se superponen.", rn=["RN-15", "RN-06"], datos="Ninguno",
     traz=["Visor", "Ajustar la disposición de la pantalla", "Cajones", "App.jsx; Tirador.jsx", "localStorage"],
     verifica="El cartel de contexto cabe en 390 px.")
caso(id="CU-21", nombre="Enlace manipulado a mano", objetivo="Comprobar que parámetros inválidos no rompen el visor.",
     descripcion="El usuario edita la URL con valores que no existen.", precondiciones=[], entradas=["?vista=xyz&base=Nada&region=Inventada"],
     flujo=["Abre el enlace manipulado.", "Observa la vista, el fondo y el territorio."],
     resultado="Abre Incendios con fondo Claro. [POR VALIDAR] cómo se presenta una región inexistente: no se ejecutó este caso.",
     rn=["RN-13", "RN-14"], datos="Ninguno",
     traz=["Visor", "Ingreso al visor", "Inicio", "urlState.js; config.js", "—"],
     verifica="No hay pantalla en blanco ni error en consola.")
caso(id="CU-22", nombre="Recuperarse de un fallo de datos", objetivo="Reintentar cuando no cargan los datos.",
     descripcion="El manifest no responde.", precondiciones=["manifest.json no disponible."], entradas=["Clic en «Reintentar»"],
     flujo=["Ve «No pudimos cargar los datos del visor».", "Pulsa «Reintentar».", "Si sigue, abre «Detalle técnico»."],
     resultado="Recarga la página.", rn=[], datos="Fallo simulado (503) en el doble",
     traz=["Visor", "Recuperarse de un error de carga", "Pantalla de error", "App.jsx:1178-1200", "manifest.json"],
     verifica="El detalle técnico no es lo primero que se lee.")

# ----------------------------------------------------------------------------- pruebas extra del checklist
PRUEBAS_EXTRA = [
    ["QA-N1", "Negativa", "Abrir ?vista=priorizacion", "Abre la vista Riesgo (alias)."],
    ["QA-N2", "Negativa", "Guardar en localStorage coipo.disposicion = «{basura»", "El visor arranca con la disposición por omisión."],
    ["QA-N3", "Negativa", "Bloquear el almacenamiento del sitio", "El visor funciona; sólo no recuerda la disposición."],
    ["QA-N4", "Negativa", "Servir dist sin HTTP Range", "[POR VALIDAR] mensaje en pantalla; CLAUDE.md §5 cita el error de PMTiles en consola."],
    ["QA-C1", "Concurrencia", "Dos pestañas con distinta disposición", "La última que guarda gana en localStorage; no hay datos compartidos entre personas."],
    ["QA-C2", "Concurrencia", "Recargar durante una actualización de datos del sitio", "Si el manifest no responde, pantalla de error con «Reintentar»."],
    ["QA-I1", "Proveedor de identidad", "Buscar inicio de sesión", "No existe: no hay proveedor de identidad (RN-01). Caso no aplicable."],
]

# ----------------------------------------------------------------------------- problemas (id estable)
CRITERIO_GRAVEDAD = [
    ["Crítica", "Impide usar el visor o muestra una cifra falsa como verdadera."],
    ["Alta", "Una funcionalidad principal falla o induce a error sin aviso."],
    ["Media", "Falla parcial, inconsistencia entre datos y código, o riesgo de que aparezca una de las anteriores."],
    ["Baja", "Molestia, documentación desfasada o riesgo de desarrollo, sin efecto en lo publicado."],
]
PROBLEMAS = [
    dict(id="P-001", titulo="Datos versionados desfasados del código de infraestructura crítica", gravedad="Media",
         modulo="Vista Riesgo / frontend/public/data",
         evidencia="frontend/public/data/manifest.json (generado 2026-09-16T10:40:30): capas.infra_puntos sin «familias» ni «tablas», 696 elementos de 3 comunas; ETL/build_infra_puntos.py:319 publica «familias»; App.jsx:582-587 las lee; config.js:385-394 no tiene color para «escuelas_prep».",
         certeza="Verificado en el código y en el manifest versionado; el efecto en pantalla con esos datos NO lo comprobé.",
         estado="Abierto",
         causa="El último commit de datos (c9c8960, 2026-09-16 10:48 UTC) es anterior al cambio de ETL/build_infra_puntos.py (c0ce757, 2026-09-16 10:08 -0300). Quien use «npm run datos» o el repositorio como fuente recibe un contrato viejo.",
         solucion="Volver a ejecutar el workflow de despliegue para que commitee las capas del ETL actual.",
         descartadas="Corregir el manifest a mano: CLAUDE.md §2 dice que su único productor válido es Actions.",
         pasos=["Disparar «ETL y despliegue a GitHub Pages» (workflow_dispatch o un cambio en ETL/).", "Comprobar que el commit «datos: capas del ETL <fecha>» trae capas.infra_puntos.familias.", "Correr verify:priorizacion (C19) contra los datos nuevos."],
         prueba="C19 de frontend/scripts/verify-priorizacion.mjs con VERIFY_DATOS apuntando al manifest viejo debe ponerse roja; con el nuevo, verde.",
         aceptacion="manifest.json versionado con «familias» y con cobertura nacional de infraestructura.",
         riesgos="El commit de datos es grande (~370 MB en public/data); no commitear mientras corren mutantes (CLAUDE.md §3).",
         dependencias="Ninguna. Decide: mantenedor del repositorio.", esfuerzo="1-2 h (estimación)", fase="Inmediato"),
    dict(id="P-002", titulo="Sin canal de aviso cívico ni de contacto en un visor público", gravedad="Media",
         modulo="Visor (todas las vistas)",
         evidencia="frontend/src/config.js:613 (AVISO_CIVICO = null) y 625 (CONTACTO = null); DECISIONES.md §Ñ.",
         certeza="Verificado en el código.", estado="Abierto (decisión pendiente)",
         causa="Decisión deliberada: cualquier teléfono o canal debe venir autorizado por la Unidad de Información y Análisis.",
         solucion="Obtener el texto autorizado y asignarlo a las constantes.",
         descartadas="Poner un teléfono genérico: atribuiría a CONAF un mensaje que no ha emitido.",
         pasos=["Pedir a la Unidad de Información y Análisis el texto y el canal autorizados.", "Asignarlos en config.js.", "Ajustar B28 si cambian las superficies de aviso."],
         prueba="Una aserción del arnés del panel que exija el texto autorizado; debe verse roja con null.",
         aceptacion="El visor muestra el aviso autorizado en las superficies definidas.",
         riesgos="Ninguno técnico; riesgo institucional si el texto no está autorizado.",
         dependencias="¿Quién autoriza el texto y el canal? (pregunta abierta a la Unidad de Información y Análisis).", esfuerzo="2 h de desarrollo, más el plazo de la decisión (estimación)", fase="Corto plazo"),
    dict(id="P-003", titulo="Build local (frontend/dist) más viejo que el código fuente", gravedad="Baja",
         modulo="Herramientas de desarrollo",
         evidencia="frontend/dist/index.html del 2026-10-23 17:58; frontend/src/App.jsx modificado después (find -newer). Los arneses sirven dist tal como está (CLAUDE.md §3).",
         certeza="Observado (fechas de archivo).", estado="Abierto",
         causa="dist/ no se versiona y no se reconstruye solo antes de los arneses.",
         solucion="Que cada verify-*.mjs compare la fecha de dist con la de src y se niegue a medir un build viejo.",
         descartadas="Reconstruir siempre dentro del arnés: alarga cada corrida y oculta errores de build.",
         pasos=["Añadir en cada verify-*.mjs una comprobación de mtime de dist/index.html contra src/**.", "Salir con código distinto de 0 y un mensaje claro."],
         prueba="Tocar src/App.jsx y correr verify:banner: debe fallar antes de medir.",
         aceptacion="Ningún arnés mide un dist anterior al código.",
         riesgos="Falsos positivos si sólo cambió un comentario; aceptable.",
         dependencias="Ninguna.", esfuerzo="1-2 h (estimación)", fase="Corto plazo"),
    dict(id="P-004", titulo="Ruta del intérprete de Python en CLAUDE.md no corresponde a esta estación", gravedad="Baja",
         modulo="Documentación del repositorio",
         evidencia="CLAUDE.md §3 cita un python.exe bajo el perfil de otro usuario; en esta estación el intérprete real es C:\\ProgramData\\anaconda3\\python.exe.",
         certeza="Observado (la ruta citada no existe aquí).", estado="Abierto",
         causa="La nota se escribió en otra estación de trabajo.",
         solucion="Escribir la regla general (usar el intérprete real, no el alias de WindowsApps) y dejar las rutas como ejemplos por estación.",
         descartadas="Reemplazar una ruta por otra: volvería a quedar desfasada.",
         pasos=["Editar CLAUDE.md §3."], prueba="No aplica (documentación).", aceptacion="La nota no depende de un perfil concreto.",
         riesgos="Ninguno.", dependencias="Ninguna.", esfuerzo="15 min (estimación)", fase="Inmediato"),
]

# ----------------------------------------------------------------------------- novedades / cambios
NOVEDADES_POR_ROL = {
    "usuario": [
        ["Primera versión del paquete", "Antes no existía manual; este documenta el visor tal como está en el código del 2026-11-15."],
    ]
}
CAMBIOS_VN = [
    ["2026-11-15", "Se crea el paquete Documentacion_Sistema2 (no existía una versión 1 en el repositorio).", "Todo el paquete"],
]
ROLES_NO_DOCUMENTADOS = [
    ["Administrador / editor", "No existe: el visor no tiene cuentas ni pantallas de administración. Los datos los produce el ETL en GitHub Actions (.github/workflows/deploy.yml)."],
    ["Mantenedor del ETL", "No es un rol de la aplicación sino de desarrollo; trabaja con ETL/ y CLAUDE.md, fuera de la interfaz."],
]

ROL["errores_frecuentes"] = [
    ["Leer los puntos como incendios activos", "Son incendios ya ocurridos e investigados; el visor no muestra incendios en curso."],
    ["Citar una cifra regional como nacional", "Revise el ámbito bajo «Indicadores» y el botón «Territorio» antes de citar."],
    ["Buscar un filtro que no aparece", "Los filtros sólo se muestran si hay una capa encendida a la que aplican: encienda la capa."],
    ["Descarga deshabilitada", "Encienda la capa; las capas servidas por teselas no se pueden exportar desde el navegador."],
    ["El informe PDF no se abre", "Permita ventanas emergentes para el sitio y vuelva a pulsar el botón."],
    ["Comparar colores de riesgo entre comunas en modo normalizado", "La normalización es relativa a una comuna; para comparar use la escala del modelo."],
]
ROL["buenas_practicas"] = [
    "Antes de citar una cifra, anote el ámbito y la fecha «datos al».",
    "Use «Compartir esta vista» para que otra persona vea exactamente lo mismo.",
    "Para análisis propios, descargue el CSV del ámbito o el archivo publicado completo.",
    "En la vista Riesgo, elija la comuna desde el selector: se cruza por código CUT y evita confusiones de grafía.",
]
ROL["faq"] = [
    ["¿Necesito una cuenta?", "No. El visor es público y no tiene inicio de sesión."],
    ["¿Muestra incendios de hoy?", "No. Muestra incendios ya ocurridos e investigados por la UAD."],
    ["¿Cada cuánto se actualizan los datos?", "Cuando corre el ETL en GitHub Actions; la fecha está en «datos al». [POR VALIDAR] la periodicidad oficial."],
    ["¿Por qué el número de incendios sube cada temporada?", "En parte por la mayor cobertura de investigación de la UAD, no sólo por más ocurrencia."],
    ["¿Qué significa el número junto a una comuna en Riesgo?", "Cuántas áreas de riesgo tiene esa comuna en el modelo; no es un puntaje."],
    ["¿Se guarda algo de lo que hago?", "Sólo la disposición de paneles, en su propio navegador (localStorage). Nada se envía a un servidor del visor."],
]

caso(id="CU-23", nombre="Consultar fuentes y procedencia", objetivo="Saber de dónde salen los datos y quién publica.",
     descripcion="Modal Información del panel izquierdo.", precondiciones=["Manifest cargado."], entradas=["Clic en «Información»"],
     flujo=["Pulsa «Información».", "Lee «Qué muestra este visor», «Fuentes» y «Procedencia».", "Pulsa «Listo»."],
     resultado="Lista de fuentes del manifest y fecha de generación.",
     fe=["FE-1: el manifest aún no llega; «Aún no ha llegado el manifest con las fuentes.»"],
     rn=["RN-04", "RN-16"], datos="Ninguno",
     traz=["Visor", "Consultar información y fuentes", "Modal Información", "ModalesPanel.jsx", "manifest.json"],
     verifica="La fecha coincide con «datos al» del encabezado del panel.")
