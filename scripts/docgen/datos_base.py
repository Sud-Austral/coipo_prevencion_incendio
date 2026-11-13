# -*- coding: utf-8 -*-
"""Datos comunes del análisis: rol, reglas, hallazgos, sondas y pruebas transversales.

Origen de cada afirmación: «verificado en el código» = se leyó la línea citada;
«observado» = se ejecutó el visor compilado con datos FICTICIOS en 127.0.0.1 el 2026-11-13
(scripts/demo_datos.py + scripts/demo_servidor.py + Chrome por CDP); «leído» = se leyó y no
se ejecutó (no lo comprobé).
"""
from .comun import PV

ROL_NOMBRE = "Usuario del visor"

MATRIZ_ROLES = [
    [ROL_NOMBRE,
     "Cualquier persona que abre el visor publicado: equipos de prevención de CONAF, analistas, jefaturas "
     "y público general.",
     "Sin sesión: se abre la dirección pública (GitHub Pages). No hay login, ni IAM, ni Clave Única.",
     "Mapa de incendios investigados con filtros, capas y fichas; indicadores; descargas; compartir; "
     "vista Riesgo por comuna; página de incendios por líneas eléctricas.",
     "Solo lectura. El sitio es estático: no existe ninguna acción que escriba datos."],
]

ROLES_NO_APLICABLES = [
    ["Roles de un sistema de identidad (IAM, Clave Única)",
     "No existen en este repositorio",
     "El sitio es estático, sin backend (CLAUDE.md §1: «no hay backend, y es deliberado»). No hay "
     "constantes de rol, ni rutas protegidas, ni menú por rol: se buscó en frontend/src y no aparece ninguno."],
    ["Operador del ETL",
     "Quien corre `python ETL/run.py` para regenerar frontend/public/data",
     "Tarea de consola, sin pantalla. Fuera del alcance de los manuales."],
    ["Flujo de despliegue (.github/workflows/deploy.yml)",
     "Publica frontend/ en GitHub Pages en cada push",
     "Actor del sistema, no una persona."],
]

# id, nombre, descripción, dónde vive
REGLAS_NEGOCIO = [
    ["RN-01", "Acceso público sin sesión", "Todo el visor y sus datos se entregan sin autenticación: son archivos "
     "estáticos. Riesgo aceptado (H-09).", "vite.config.js; .github/workflows/deploy.yml; CLAUDE.md §1"],
    ["RN-02", "No muestra incendios activos", "Cada punto es un incendio ya ocurrido e investigado por la UAD "
     "(temporadas 2017-2018 a 2025-2026). El aviso se repite en el panel, el cartel de contexto y la página "
     "de líneas eléctricas.", "config.js NO_ACTIVOS; CartelContexto.jsx"],
    ["RN-03", "Estado en la dirección", "Encuadre (lat, lon, z), capas, mapa base, vista y filtros viven en la "
     "URL; «Compartir esta vista» copia esa dirección. Los cambios de capas, filtros y mapa base crean una "
     "entrada de historial; el paneo no.", "urlState.js"],
    ["RN-04", "Vistas", "Dos pestañas: Incendios (por defecto) y Riesgo. ?vista=priorizacion abre Riesgo "
     "(nombre anterior). Un valor desconocido abre Incendios.", "config.js VISTAS; App.jsx vistaValida"],
    ["RN-05", "Filtros en cascada", "Territorio (región, provincia, comuna), Temporada, Grupo de causa y Causa "
     "general filtran la capa de incendios; Titularidad e Institución filtran la de OECV. Cada botón muestra "
     "cuántas opciones quedan con los filtros puestos.", "config.js (campos de filtro); filtros.js"],
    ["RN-06", "Capas", "Seis capas: Incendios investigados, OECV (cortafuegos), OECV verificado (terreno), Puntos "
     "stand-by, Rutas de despliegue y Red vial MOP 2024. Por defecto se encienden tres (incendios, OECV y "
     "stand-by). Rutas y red vial se piden por teselas, solo el trozo visible.", "config.js CAPAS"],
    ["RN-07", "Mapas base", "Siete: Claro (por defecto), Calles, Topográfico, Relieve, Oscuro, Satelital y "
     "Sentinel-2. Las teselas vienen de servicios externos (Esri, OpenStreetMap, EOX).", "config.js BASEMAPS"],
    ["RN-08", "Descargas respetan el filtro", "Todo lo que se descarga desde «Descargar» respeta el ámbito y los "
     "filtros activos. Nombre: <capa>_<ámbito>_<fecha local>.<ext>.", "descargas.js:36; SeccionDescargas.jsx"],
    ["RN-09", "Formato CSV", "Separador «;» y coma decimal, para Excel en español de Chile. El archivo publicado "
     "sin filtrar queda enlazado aparte.", "descargas.js armarCSV; SeccionDescargas.jsx"],
    ["RN-10", "Exportables", "Se exportan como datos solo las capas que llegan como GeoJSON. OECV verificado exige "
     "tener la capa encendida; Rutas y Red vial no se exportan («se sirve por teselas»).",
     "SeccionDescargas.jsx EXPORTABLES"],
    ["RN-11", "Riesgo por comuna", "La vista Riesgo descarga el archivo de una comuna solo al elegirla; sin comuna "
     "muestra las manchas por región en teselas. Clases: Muy Bajo (<0,5), Bajo, Medio, Alto y Muy Alto (≥3,5).",
     "PanelRiesgo.jsx; manifest capas.riesgo.clases"],
    ["RN-12", "Normalizar dentro de la comuna", "«Normalizar dentro de <comuna>» cambia solo los colores a una "
     "escala relativa a la comuna; no cambia el dato. «Volver a la escala del modelo» lo deshace.",
     "PanelRiesgo.jsx:232"],
    ["RN-13", "Ficha y vista de Google", "Al elegir una figura se abre su ficha. «Vista satelital» y «Street View» "
     "abren Google embebido en el punto; nada de Google se pide hasta pulsar.", "ModalFicha.jsx:93; ModalVistaGoogle.jsx"],
    ["RN-14", "Accesibilidad del mapa", "Con el mapa enfocado: flechas desplazan, + y − acercan, Enter abre la "
     "ficha de la figura bajo el centro y Escape suelta el foco.", "App.jsx:925-971"],
    ["RN-15", "Indicadores", "Panel derecho con los incendios evitables (negligentes + intencionales sobre el total, "
     "indeterminadas en el denominador), conductas, cobertura preventiva frente a presión y series por temporada, "
     "siempre sobre el ámbito y los filtros activos.", "indicadores.js; PanelIndicadores.jsx"],
    ["RN-16", "Líneas eléctricas", "Página aparte con los incendios cuya «Causa general 2023» es «Líneas "
     "eléctricas»: ámbito por región, capas de calor, puntos y comunas, hora de inicio y subcausas.",
     "lineas-electricas.html; src/electrico/main.js"],
]

# id, severidad, hallazgo, estado y evidencia, efecto
HALLAZGOS = [
    ["H-01", "Media",
     "Los datos publicados de infraestructura crítica no corresponden al código: el manifest trae 696 elementos "
     "de 8 familias, sin la clave «familias» con las etiquetas largas, y una familia «escuelas_prep» que el código "
     "no conoce (config.js COLOR_FAMILIA usa «comunidades_prep»). CLAUDE.md afirma 35.905 elementos nacionales. "
     "En la vista Riesgo, las familias aparecen con su clave técnica («antenas», «educacion») en vez de su nombre.",
     "Verificado: frontend/public/data/manifest.json (capas.infra_puntos: features 696, sin «familias»); "
     "App.jsx:586-587 cae a la clave cuando falta la etiqueta. Observado en la captura 06b.",
     "Caso UC-14 lo documenta como comportamiento actual."],
    ["H-02", "Baja",
     "Un territorio inexistente en la dirección (?region=Marte) se acepta sin aviso: el botón Territorio dice "
     "«Marte», su contador sube a 17 y todo queda en cero.",
     "Observado: sonda de valor de lista falso sobre la demo.", "Caso UC-04, flujo de excepción."],
    ["H-03", "Baja",
     "Una capa inexistente en la dirección (?capas=noexiste) se cuenta como encendida: «1 encendidas» con el mapa "
     "vacío.", "Observado: sonda sobre la demo.", "—"],
    ["H-04", "Baja",
     "Un mapa base inexistente (?base=Inexistente) se muestra con ese nombre en el botón «Mapa base», aunque se "
     "dibuja otro.", "Observado: sonda sobre la demo. config.js:75 dice que degrada en silencio a Claro.", "—"],
    ["H-05", "Baja",
     "El cartel de contexto dice el total de incendios del archivo (p. ej. «2.451 incendios investigados») aunque "
     "los filtros de la dirección dejen cero.",
     "Observado en la sonda ?region=Marte. No lo comprobé con filtros elegidos a mano.", "—"],
    ["H-06", "Baja",
     "La ficha del incendio y los derivados publican los nombres de los jefes de brigada y de los investigadores "
     "(columnas «jefe brigada****» e «Investigado por») en un sitio público.",
     "Verificado: manifest.json capas.incendios.codificados incluye jefe_brigada e investigado_por; la ficha los "
     "muestra (captura 02 con nombres ficticios). Si es una decisión aceptada, " + PV + ".",
     "Las capturas de este paquete usan nombres ficticios."],
    ["H-07", "Baja",
     "La vista Riesgo no avisa cuando la comuna de la dirección no existe (?comuna=00000&vista=riesgo): queda en "
     "la vista nacional sin decir que ignoró el parámetro.", "Observado: sonda sobre la demo.", "—"],
    ["H-08", "Baja",
     "README_CANDIDATE.md (borrador del bot) y LINEA_BASE_PUBLICADO.md conviven con el README vigente; CLAUDE.md "
     "aclara que no mandan.", "Verificado leyendo CLAUDE.md §1.", "Este paquete documenta el código."],
    ["H-09", "Riesgo aceptado",
     "Sin autenticación: cualquiera descarga todos los datos publicados.",
     "Decisión de diseño: sitio estático en GitHub Pages (CLAUDE.md §1).", "No es un defecto."],
]

HALLAZGOS_CAPTURAS = [
    ["H-10", "Baja",
     "En la vista Riesgo, la lista de infraestructura crítica muestra claves técnicas sin tilde («educacion»). "
     "Es el mismo origen que H-01.", "Observado en la captura 06b-vis-riesgo-comuna.png. Ver H-01.", "—"],
    ["H-11", "Baja",
     "El orden de la lista de regiones de Territorio no es alfabético estricto ni norte-sur: «Antofagasta», "
     "«La Araucanía», «Arica y Parinacota»… (ordena ignorando el artículo). " + PV + " si es intencional.",
     "Observado en la captura 01c-vis-territorio.png.", "—"],
]

SONDAS = [
    ["Borrarse a sí mismo", "No hay usuarios ni sesión.", "No aplica"],
    ["Datos solapados", "No hay escritura de ningún dato.", "No aplica"],
    ["Inicio posterior al fin", "No hay rangos de fecha editables (la temporada es una lista).", "No aplica"],
    ["Dígito verificador", "No hay RUT ni otro identificador nacional.", "No aplica"],
    ["Fuera de ámbito", "No hay ámbito por usuario: todos ven todo (RN-01).", "No aplica"],
    ["Valor de lista falso", "En la dirección: vista=xx, temporada=1999-2000, region=Marte, base=Inexistente, "
     "capas=noexiste, comuna=00000 con vista=riesgo, z=99 con lat/lon fuera de rango",
     "Observado (sin servidor de API: no hay código HTTP; todos los archivos respondieron 200): vista=xx abre "
     "Incendios; z se acota a 19; temporada y región falsas dan cero sin aviso (H-02); capa y mapa base falsos "
     "se muestran como válidos (H-03, H-04); comuna falsa se ignora (H-07)."],
    ["Datos personales por la API", "Archivos publicados en data/",
     "Verificado: incendios.geojson y los derivados traen nombres de jefes de brigada e investigadores (H-06)."],
]

NEGATIVAS = [
    "Valores falsos en la dirección (vista, temporada, region, base, capas, comuna).",
    "Encuadre fuera de rango en la dirección (z=99, lat=999).",
    "Filtros que dejan cero incendios: mapa, indicadores y descargas coherentes.",
    "Descargar con cero incendios en el ámbito.",
    "Exportar OECV verificado con la capa apagada.",
    "Sin conexión a los mapas base externos: el mapa sigue funcionando con los datos.",
    "Pérdida de conexión durante la carga del manifest.",
    "Recarga de la página con filtros en la dirección.",
    "Botón Atrás del navegador tras cambiar capas y filtros.",
    "Elegir una comuna en Riesgo y cambiar de pestaña antes de que cargue.",
    "Ventana angosta (teléfono): paneles y botones accesibles.",
    "Teclado solo: abrir una ficha con Enter y cerrarla con Escape.",
]

ACCESO = [
    ["QA-AC-01", "Abrir la dirección del visor sin sesión", "Carga la pestaña Incendios; no pide credenciales"],
    ["QA-AC-02", "Abrir ?vista=riesgo directamente", "Carga la pestaña Riesgo"],
    ["QA-AC-03", "Abrir ?vista=priorizacion (enlace antiguo)", "Abre la pestaña Riesgo"],
    ["QA-AC-04", "Abrir lineas-electricas.html", "Carga la página de incendios por líneas eléctricas"],
    ["QA-AC-05", "Pedir data/manifest.json directamente", "Se entrega sin autenticación (RN-01, riesgo aceptado)"],
]
