// Configuracion del visor: rutas de datos, vista inicial, basemaps y simbologia.

// NUNCA '/data': el repo se publica en Pages bajo /coipo_prevencion_incendio/,
// y una ruta absoluta pediria los datos a la raiz del dominio.
export const DATA = import.meta.env.BASE_URL + 'data'

export const VISTA_INICIAL = { center: [-38.0, -72.0], zoom: 6 }
export const LIMITES = [
  [-57, -78],
  [-17, -64],
]

// ---------------------------------------------------------------------------
// Geometria de los paneles.
//
// ACOPLADO a las media queries de App.css: los cortes viven en los dos sitios
// porque una media query no puede leer una constante de JS y JS necesita saber
// en que regimen esta para decidir si la X pliega una pista o cierra un cajon.
// La duplicacion es inevitable; lo que NO es inevitable es que se desincronicen,
// y por eso .app publica data-regimen y la asercion B12 comprueba que coincida
// con el numero de pistas que resuelve el CSS en los diez anchos.
// ---------------------------------------------------------------------------

/** Por encima: los dos paneles anclados. Por debajo, el derecho pasa a cajon. */
export const CORTE_KPI = 1200
/** Por encima: el panel izquierdo anclado. Por debajo, pasa a cajon. */
export const CORTE_PANEL = 900

export const MIN_PANEL = 280
export const MAX_PANEL = 560
export const ANCHO_PANEL = 320
/**
 * Ancho POR OMISION y minimo del panel derecho. ACOPLADO a --ancho-kpi de
 * index.css, que sigue siendo el ancho del cajon (<= 1200 px) y el valor de
 * los graficos: el lienzo SVG de 288 px se dibuja 1:1 a 320 de panel. Por eso
 * el panel se puede AMPLIAR pero no encoger por debajo de 320: mas angosto,
 * los filetes de 1 px de los graficos se emborronarian con escala fraccionaria.
 * Al ampliar no pasa nada de eso: max-width:100% solo encoge, nunca estira,
 * asi que los graficos se quedan en 288 y lo que gana espacio es el texto --
 * las notas metodologicas y los nombres de causa, que es lo que se recorta.
 */
export const ANCHO_KPI = 320
export const MAX_KPI = 560

/**
 * Suelo de ancho del mapa. No es estetico: a 1201 px con los dos paneles
 * anclados quedan 561 px de mapa, y por debajo de ~520 Chile continental a z6
 * deja de ser legible. La asercion B4 ya lo exigia; ahora ademas ACOTA EL
 * TIRADOR, de modo que arrastrar no pueda violar lo que B4 comprueba.
 */
export const MIN_MAPA = 520

/**
 * Marcas diacriticas combinantes (U+0300..U+036F), las que deja sueltas
 * normalize('NFD'). Se construye desde una CADENA y no como literal de regex
 * para que el rango viaje en ASCII puro: escrito como literal, el archivo acaba
 * guardando los combinantes de verdad, que son invisibles al revisar el diff y
 * los destruye cualquier herramienta que normalice el fuente.
 *
 * Vive aqui y no en PanelLateral porque lo usan tambien los nombres de archivo
 * de las descargas: dos copias de esta regex acabarian divergiendo.
 */
export const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g')

// ---------------------------------------------------------------------------
// LAS CLAVES DE ESTE OBJETO SON UN CONTRATO PUBLICO. No se renombran.
//
// Cada clave es TRES cosas a la vez: la etiqueta visible del selector (que
// PanelLateral pinta con Object.keys), el valor de `?base=` que urlState escribe
// en cada moveend, y el literal contra el que App.jsx y mapaPNG.js comparan.
// Renombrar una clave ya publicada cambia el significado de todo enlace
// compartido: quien guardo `?base=Claro` acabaria en otro mapa base, o en el de
// respaldo. Se cambia la URL de la capa; la clave se queda.
//
// Anadir una clave nueva es libre; retirarla, no: `BASEMAPS[base] ?? .Claro`
// degrada en silencio y el enlace viejo deja de decir lo que decia.
//
// -- Sobre el proveedor -------------------------------------------------------
// El fondo claro vivia en basemaps.cartocdn.com hasta que CARTO cerro el acceso
// anonimo (2026-08). NO devolvio un 4xx: sigue respondiendo 200 OK con un PNG
// valido, pero le estampa «API KEY REQUIRED / carto.com/basemaps/apikey» DENTRO
// DE LOS PIXELES. Un sitio estatico servido por Pages no puede guardar un
// secreto --ni siquiera una clave restringida por dominio, que igual viaja en el
// bundle--, asi que la salida fue un proveedor sin clave.
//
// El servicio nuevo tampoco es eterno. Como el fallo de CARTO no lo detecta
// ningun codigo HTTP, aqui quedan las tres sondas que si lo detectan:
//
//   1. TEXTO EN LA IMAGEN. Bajar una tesela sobre la zona del dato y ABRIRLA.
//      Mirar los pixeles, no el status.
//        curl -so t.jpg "https://server.arcgisonline.com/ArcGIS/rest/services/\
//        Canvas/World_Light_Gray_Base/MapServer/tile/11/1254/612"
//   2. NIVEL AGOTADO. La AUTORIDAD es el endpoint /tilemap, no `tileInfo`:
//        .../MapServer/tilemap/{z}/{y}/{x}/8/8
//      devuelve {"data":[1,0,...]} con un bit por tesela del bloque, 1 = existe.
//      Pasado el cache real, la tesela sigue llegando con 200 OK y un JPEG gris
//      de 2.521 B que dice «Map data not yet available», el mismo byte a byte
//      en Arica, Valdivia y Patagonia: sin maxNativeZoom se cambia la marca de
//      agua de CARTO por un cartel gris en ingles, que es peor.
//      NO se mide por el tamano del archivo. Una tesela pequena puede ser dato
//      legitimo: World_Topo_Map devuelve 2.419 B de crema en blanco sobre el
//      secano a z18 --que es el mapa diciendo correctamente «aqui no hay
//      nada»--, y confundir eso con agotamiento cuesta tres zooms de detalle
//      real. /tilemap distingue las dos cosas; el peso del PNG no.
//   3. TOKEN. MapServer?f=json responde {"error":{"code":499}}, o aparecen
//      "tokenServicesUrl" / "licenseInfo" donde antes no habia nada.
//
// -- Sobre los zooms ----------------------------------------------------------
// maxNativeZoom NO sale de `MapServer?f=json`: ese `maxLOD` describe la rejilla,
// no lo que hay cacheado sobre Chile, y mintio en 5 de los 7 servicios que se
// evaluaron (Light Gray declara 23 y se agota en 16; Terrain_Base declara 13 y
// se agota en 9). La autoridad es /tilemap, medido en seis puntos --Arica,
// Valparaiso, Nuble, Biobio, Araucania y Punta Arenas--, que dieron el MISMO
// techo en los seis:
//
//     Canvas/World_Light_Gray_Base   declara 23 -> real 16
//     Canvas/World_Dark_Gray_Base    declara 23 -> real 16
//     World_Shaded_Relief            declara 13 -> real 13
//     World_Topo_Map                 declara 23 -> real 19  (sin techo)
//     World_Street_Map               declara 23 -> real 19  (no se usa)
//     NatGeo_World_Map               declara 16 -> real 12  (descartada)
//     World_Terrain_Base             declara 13 -> real  9  (descartada)
//
// Con maxNativeZoom, Leaflet estira la ultima tesela real; sin el, el visor
// ensena el cartel gris de Esri en ingles.
//
// -- Sobre el contraste -------------------------------------------------------
// El mapa base es telon de fondo, no el mensaje. Cada capa de abajo lleva
// medido cuantas de las 13 clases de la simbologia de este visor (las 5 causas
// Okabe-Ito, la triada oficial OECV, rutas, red vial, stand-by y verificado)
// quedan por debajo de 3:1 --el umbral de WCAG 1.4.11 para graficos-- contra el
// tono DOMINANTE de esa capa sobre la zona del dato (Nuble, Biobio y Araucania
// a z9/z11/z13). La referencia es CARTO light_all, el fondo que habia hasta
// ahora: 5 de 13. Ese es el liston, no el cero.
//
// La medicion se rehace bajando teselas y componiendo encima los colores reales
// de COLOR_CAUSA y COLOR_OECV. NO se hereda de otro visor: la misma capa que es
// un telon excelente para una paleta es el peor posible para otra.
// ---------------------------------------------------------------------------
export const BASEMAPS = {
  // ORDEN DEL SELECTOR, y no es casual: primero las que igualan el contraste de
  // CARTO (Claro, Calles, Topografico), luego las dos que lo empeoran a
  // sabiendas (Relieve, Oscuro) y al final la imagen. Se ordena por lo fiable
  // que es cada una como telon, que es lo que le sirve a quien elige, y no por
  // genero cartografico.

  // Fondo neutro y claro: es el unico que deja leer ~15.000 puntos superpuestos.
  // POR OMISION, y el unico que lo es.
  //
  // CONTRASTE 5/13 bajo 3:1 (tono dominante #f0f0f0, 99% del area). Es
  // EXACTAMENTE el mismo numero y el mismo tono que CARTO light_all: la
  // migracion no le costo legibilidad a nadie.
  //
  // LO QUE SI SE PERDIO: los toponimos. CARTO light_all los traia incrustados;
  // Esri los sirve aparte, en Canvas/World_Light_Gray_Reference. Se decidio
  // dejar el fondo MUDO y no superponer ese overlay, porque el silencio es
  // justamente la virtud de esta capa y el overlay costaria dos peticiones de
  // tesela por celda en el fondo que ve todo el mundo al entrar. Quien necesita
  // nombres tiene «Topografico» a un clic, que ademas los trae mejores para el
  // campo. Si algun dia se reconsidera, el servicio es ese y su cobertura es la
  // misma que la de esta capa (z16 en /tilemap).
  //
  // Host SIN {s}: el reparto por subdominios (a/b/c/d) era una tecnica de
  // HTTP/1.1 para saltarse el limite de 6 conexiones por host. Sobre HTTP/2 una
  // sola conexion multiplexa todas las teselas, asi que los tres apretones de
  // mano extra son perdida pura. Comprobado que el host desnudo responde igual.
  //
  // ACOPLADO a dos sitios: al <link rel="preconnect"> de index.html (que
  // precalienta este host exacto) y al patron con comodin de TILES en
  // scripts/verify-banner.mjs y scripts/verify-panel.mjs, que bloquean la red
  // con '*server.arcgisonline.com*'. No lo reescribas con hosts literales.
  //
  // OJO con el orden de la ruta: Esri sirve {z}/{y}/{x}, FILA ANTES QUE COLUMNA,
  // al reves que la plantilla {z}/{x}/{y} de OSM. Invertirlos no da error: da un
  // mapa de otro sitio del planeta, con 200 y sin ningun sintoma.
  Claro: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    // copyrightText literal del servicio, con el «(c)» pasado a la entidad que
    // usa el resto del archivo: Leaflet la pinta como © y mapaPNG.js ya la
    // traduce al volcarla al lienzo.
    attribution:
      'Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community',
    maxZoom: 19,
    maxNativeZoom: 16,
  },
  Calles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  // Toponimia rural, hidrografia, curvas de nivel y areas protegidas. No duplica
  // a Calles: OSM cubre bien lo urbano y se vacia en el secano y la
  // precordillera, que es justo donde estan las fajas OECV y los puntos
  // stand-by. Aqui se lee el nombre del estero o del fundo con el que la gente
  // de la region se ubica, y es ademas la respuesta a la mudez de «Claro».
  //
  // CONTRASTE 5/13 bajo 3:1 (dominante #f0f0f0, 79% del area): paridad exacta
  // con CARTO pese a las manchas verdes de vegetacion, porque son locales y el
  // crema sigue mandando. Comprobado componiendo la simbologia encima, no
  // deducido del estilo de la capa.
  //
  // SIN maxNativeZoom, a proposito y contra la primera impresion: sobre el
  // secano de Nuble y Biobio devuelve a z17-19 una tesela crema casi vacia, que
  // por peso (2.419 B) parece agotamiento y NO lo es --/tilemap responde 1 en
  // los seis puntos de control hasta z19--. Es el mapa diciendo «aqui no hay
  // nada mas que dibujar», que es cierto: no hay calle ni curva de nivel en ese
  // potrero. Ponerle techo regalaria tres zooms de detalle real en las ciudades.
  'Topográfico': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    // ATRIBUCION ACORTADA, y es una decision, no un descuido. El copyrightText
    // de este servicio son 232 caracteres con 17 proveedores; a 11 px de fuente
    // mide ~1.560 px, casi el triple de los 520 px de MIN_MAPA. Se nombran los
    // que aportan el dato de Chile y se enlaza al servicio, donde la lista
    // integra es publica y siempre esta al dia:
    //   .../World_Topo_Map/MapServer?f=json  ->  campo copyrightText
    attribution:
      'Sources: Esri, HERE, Garmin, GEBCO, USGS, FAO, NPS, IGN, &copy; OpenStreetMap contributors y otros (<a href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer?f=pjson">lista completa</a>)',
    maxZoom: 19,
  },
  // Solo la forma del terreno, sin un solo rotulo. Responde lo que no responde
  // ninguna otra capa: por donde sube la ladera y donde esta la quebrada. La
  // pendiente gobierna como avanza el fuego y si una brigada llega.
  //
  // CONTRASTE 9/13 bajo 3:1, PEOR que CARTO (5/13), y el porque importa: su
  // tono dominante #d0d0d0 solo cubre el 45% del area porque el sombreado es
  // pardo-CALIDO y variado, y ese pardo se come la familia naranja/amarilla de
  // la paleta -- Negligentes #E69F00 cae a 1,46, OECV «Sin determinar» #F9A825
  // a 1,28, OECV Privado #EF6C00 a 2,00. Los azules y verdes aguantan.
  //
  // Entra igualmente porque quien la elige quiere leer el TERRENO y acepta el
  // intercambio a sabiendas. NUNCA por omision: eso lo garantiza el literal
  // 'Claro' de App.jsx, no este comentario.
  Relieve: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    // copyrightText LITERAL del servicio, tal cual, incluido el «Copyright:»
    // pegado. Es lo unico que Esri publica como atribucion de esta capa: su
    // `description` NO nombra GTOPO30, SRTM ni NED --solo declara resoluciones
    // (30 m en EE.UU., 90 m entre 60°N y 56°S, 1 km mas al sur)--, asi que citar
    // esas fuentes seria atribuir lo que el proveedor no dice. Para Chile eso
    // significa 90 m hasta Tierra del Fuego y 1 km al sur de 56°S, o sea el
    // extremo de Magallanes.
    attribution: 'Copyright:(c) 2014 Esri',
    maxZoom: 19,
    // 13 es el dato REAL segun /tilemap en los seis puntos de control, y
    // coincide con el maxLOD declarado: la excepcion, no la regla, en este
    // proveedor. Estirar no duele: el sombreado es informacion de baja
    // frecuencia y ampliarlo no inventa una ladera.
    maxNativeZoom: 13,
  },
  // El mismo lienzo neutro de «Claro» en oscuro, para proyectar en sala y para
  // quien trabaja con el tema oscuro del sistema.
  //
  // CONTRASTE 10/13 bajo 3:1 contra su dominante #505050 (98% del area): el
  // PEOR de los siete, y el doble de malo que el fondo por omision. Solo tres
  // clases lo superan -- Negligentes 3,58, OECV «Sin determinar» 4,09, Red vial
  // 3,01 --. Stand-by #6A1B9A se desploma a 1,16, que es tanto como decir que
  // desaparece; OECV Fiscal 1,57, Rutas 1,69, Accidentales 1,55.
  //
  // Se deja como opcion DELIBERADA y jamas por omision, con el numero escrito
  // aqui para que la proxima revision no tenga que volver a medirlo ni pueda
  // promoverla por descuido. Si algun dia se quiere un fondo oscuro usable, lo
  // que hay que cambiar es la PALETA para ese fondo, no el fondo.
  Oscuro: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community',
    maxZoom: 19,
    maxNativeZoom: 16,
  },
  Satelital: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    fecha: { tipo: 'esri' },
  },

  // Sentinel-2 cloudless de EOX: mosaico ANUAL sin nubes a 10 m, no la imagen
  // de la ultima pasada. Sentinel-2 revisita cada ~5 dias, pero acceder a esas
  // escenas sueltas exige credenciales de Copernicus Data Space --comprobado:
  // el endpoint sin clave responde 404--, y este sitio es estatico y no puede
  // guardar un secreto. Lo que si es gratis y sin clave es este compuesto.
  //
  // LICENCIA: CC BY-NC-SA 4.0, o sea NO COMERCIAL (la version 2016 es la unica
  // CC BY sin esa clausula, pero tiene una decada y para prevencion no sirve).
  // CONAF es una institucion sin fines de lucro del Estado de Chile y este
  // visor entrega informacion publica de prevencion de incendios de forma
  // gratuita: ese es el encaje con la clausula, y lo decidio CONAF, no este
  // codigo. Si algun dia el visor se usara con fin comercial, hay que revisarlo
  // con EOX (https://cloudless.eox.at). La atribucion de abajo es obligacion de
  // la licencia y no se toca.
  //
  // maxNativeZoom 14: el dato nativo son 10 m/pixel, que a la latitud de Chile
  // se agota cerca de z14. Mas alla el servidor sigue entregando teselas, pero
  // son interpolacion: se deja que Leaflet estire la ultima real en vez de
  // pedir detalle que no existe.
  'Sentinel-2': {
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    attribution:
      'Sentinel-2 cloudless 2025 por <a href="https://cloudless.eox.at">EOX</a> (datos Copernicus Sentinel modificados) &middot; CC BY-NC-SA 4.0',
    maxZoom: 18,
    maxNativeZoom: 14,
    // "sin fecha única" va en la ETIQUETA y no solo en la nota del panel: decir
    // solo "mosaico de 2025" invita a preguntar de que mes es, y la respuesta
    // es que no hay uno. Comprobado contra el WMTS de EOX: la capa no declara
    // dimension TIME, no trae ningun campo de fecha y GetFeatureInfo responde
    // 400, asi que no existe forma de saber la fecha de un pixel.
    fecha: { tipo: 'fijo', texto: 'Compuesto de todo 2025 · sin fecha única' },
  },
}

// Simbologia OFICIAL por titularidad del terreno, definida en el Memo N 3045/2025
// de la Gerencia de Proteccion contra Incendios Forestales de CONAF.
export const COLOR_OECV = {
  Fiscal: '#2E7D32', // verde
  Privado: '#EF6C00', // naranjo
  'Sin determinar': '#F9A825', // amarillo
}

// Paleta Okabe-Ito: distinguible con daltonismo, que importa cuando el color es
// la unica codificacion de la causa.
export const COLOR_CAUSA = {
  Intencionales: '#D55E00',
  Negligentes: '#E69F00',
  Accidentales: '#0072B2',
  Naturales: '#009E73',
  Indeterminadas: '#999999',
}
export const COLOR_CAUSA_OTRA = '#7F7F7F'

export const COLOR_RUTA = '#1F78B4'
export const COLOR_REDVIAL = '#9E9E9E'
export const COLOR_STANDBY = '#6A1B9A'
// Cian oscuro: no choca con la simbología oficial OECV (verde/naranjo/amarillo)
// ni con el azul de rutas, y sigue distinguible con daltonismo.
export const COLOR_VERIFICADO = '#00838F'

export const radioPorZoom = (z) => (z < 7 ? 2.5 : z < 10 ? 3.5 : 5)

// ---------- riesgo de incendio forestal ----------

// LAS CLAVES SON CONTRATO PUBLICO, igual que las de BASEMAPS: son el valor de
// ?vista= en la URL. Anadir una vista es libre; renombrar o retirar una ya
// publicada cambia el significado de todo enlace compartido.
export const VISTAS = [
  { id: 'incendios', etiqueta: 'Incendios' },
  { id: 'riesgo', etiqueta: 'Riesgo' },
]

// Vistas ya publicadas con otro id. La segunda pestaña se llamo «priorizacion»
// mientras mostraba el modelo compuesto de 3 comunas; el 2026-09-15 paso a
// mostrar el riesgo nacional y a llamarse «riesgo» (DECISIONES.md §S). Los
// enlaces que ya circulan con ?vista=priorizacion tienen que seguir abriendo
// esta pestaña, no caer a la de incendios.
export const ALIAS_VISTA = { priorizacion: 'riesgo' }

/** Id de vista valido para un valor de ?vista=, con alias; 'incendios' si no se reconoce. */
export const vistaValida = (v) => {
  const id = ALIAS_VISTA[v] ?? v
  return VISTAS.some((x) => x.id === id) ? id : 'incendios'
}

// Un color por NIVEL de riesgo (0 = Muy Bajo ... 4 = Muy Alto), por indice y no
// por etiqueta: los nombres de las clases y sus cortes vienen del manifest
// (`capas.riesgo.clases`, sacado de parametros.json del modelo), y el visor no
// los escribe en ningun sitio. Las claves en femenino del modelo anterior
// («Muy Alta») dejaban el mapa entero gris sin un error cuando las clases
// pasaron a masculino; por indice eso no puede volver a pasar.
//
// Es la rampa con la que el autor del modelo publica sus mapas (notebook 4 de
// lab/priorizacion, construir_notebook4.py:439), no una reinventada aqui: que el
// visor y el informe del modelo se vean igual es lo que permite cotejarlos. El
// notebook la eligio contra la OrRd del modelo anterior porque el primer paso de
// esa (#FEF0D9) tiene 1,10:1 contra el fondo, y el desierto del norte -casi todo
// Muy Bajo- se leia igual que el blanco de «sin dato».
export const COLOR_NIVEL = ['#F9A129', '#DC7709', '#BB4F04', '#912902', '#650101']

// Rampa del modo normalizado. Es una familia cromatica DISTINTA de la
// categorica a proposito: las dos lecturas no se pueden confundir de un
// vistazo, y quien vea morado sabe que esta mirando contraste interno de una
// comuna y no la clase del modelo.
export const RAMPA_NORMALIZADA = ['#F2F0F7', '#DADAEB', '#BCBDDC', '#9E9AC8', '#807DBA', '#6A51A3', '#4A1486']

// Por debajo de este zoom los iconos de infraestructura no se dibujan.
// MEDIDO mirando la captura con el modelo anterior: con las tres comunas
// encuadradas --Biobio y Aysen estan a ~1.000 km-- los 696 iconos colapsaban en
// dos cumulos que no dejaban ver NINGUNA mancha. A 9 cabe una comuna entera en
// pantalla y los iconos ya se separan.
export const ZOOM_ICONOS = 9

// Un color por familia de infraestructura. Se evitan a proposito los tres de
// COLOR_OECV y los cinco de COLOR_CAUSA.
export const COLOR_FAMILIA = {
  educacion: '#1F6FEB',
  escuelas_prep: '#0E7490',
  salud: '#DC2626',
  ssr: '#0891B2',
  antenas: '#7C3AED',
  subestaciones: '#CA8A04',
  aeropuerto: '#4B5563',
  penitenciaria: '#9D174D',
}

// Definicion de las capas: orden del panel, clave en el manifest y estilo.
//
// `descripcion` traduce la etiqueta para quien no trabaja en el programa. Las
// definiciones NO se inventan aqui: salen de las cabeceras de los modulos del
// ETL, que a su vez citan la norma. OECV de ETL/build_oecv.py ("Obras de
// Eliminacion de Combustible Vegetal (cortafuegos preventivos, fajas
// cortacombustible)", Memo N 3045/2025) y stand-by de ETL/build_puntos.py
// ("posiciones de espera de brigadas").
export const CAPAS = [
  {
    id: 'incendios',
    etiqueta: 'Incendios investigados',
    descripcion: 'Incendios ya ocurridos que la UAD investigó después para determinar su causa',
    tipo: 'puntos-incendios',
    porDefecto: true,
  },
  {
    id: 'oecv',
    etiqueta: 'OECV (cortafuegos)',
    descripcion:
      'Obras de Eliminación de Combustible Vegetal: cortafuegos y fajas que se construyen para frenar el avance del fuego',
    tipo: 'lineas',
    porDefecto: true,
    weight: 3,
  },
  {
    id: 'oecv_verificado',
    etiqueta: 'OECV verificado (terreno)',
    // Definición en la cabecera de ETL/build_verificado.py: es la evidencia
    // tal como la enviaron las regiones, NO el avance oficial de kpis.json.
    descripcion:
      'Evidencia enviada por las regiones de obras ya verificadas en terreno; no es el avance oficial',
    tipo: 'lineas',
    porDefecto: false,
    color: COLOR_VERIFICADO,
    weight: 3,
  },
  {
    id: 'puntos_standby',
    etiqueta: 'Puntos stand-by',
    descripcion: 'Posiciones donde una brigada espera para llegar antes a un incendio',
    tipo: 'puntos',
    porDefecto: true,
  },
  {
    id: 'rutas',
    etiqueta: 'Rutas de despliegue',
    descripcion: 'Caminos por los que las brigadas llegan a la zona',
    tipo: 'lineas',
    porDefecto: false,
    color: COLOR_RUTA,
    weight: 2,
  },
  {
    id: 'redvial',
    etiqueta: 'Red vial MOP 2024',
    descripcion: 'Caminos y rutas del Ministerio de Obras Públicas, como contexto del territorio',
    tipo: 'lineas',
    porDefecto: false,
    color: COLOR_REDVIAL,
    weight: 1,
    opacity: 0.55,
  },
]

/*
 * Que cuenta UNA feature de cada capa, [singular, plural], para escribir la
 * cuenta entre parentesis de las opciones de filtro. Sale de lo que es cada
 * feature en su ficha (src/fichas.js) y en la cabecera de su modulo del ETL:
 *   · oecv: una obra por feature (fichaOECV la titula «Obra de eliminacion…»).
 *   · oecv_verificado: NO se dice «obras». Cada feature es una linea de la
 *     evidencia que mando una region, y ETL/build_verificado.py avisa de que
 *     Valparaiso mezcla obras y accesos en el mismo KMZ: «obras verificadas»
 *     prometeria mas de lo que la capa sabe.
 *   · rutas: «rutas de despliegue» entero y no «rutas». Medido el 2026-09-14
 *     con ?capas=redvial: «Ripio (1.892 rutas)» se leia como «caminos», que es
 *     justo lo que dibuja la red vial. El rotulo «Tipo de carpeta» no lo
 *     desambigua, porque cuenta en rutas O en red vial segun cual este encendida.
 *     Tiene un coste, visto en captura el 2026-09-15 a 1440 px: en el select
 *     de 287 px se cortan 2 de las 7 carpetas, y elegida, «Pavimento Doble
 *     Calzada (220 rutas de despliegue)» queda en «…(220 rutas de d». En la
 *     misma captura ya se cortaban 6 de las 14 causas generales. Se prefiere
 *     una cifra cortada a una que dice otra cosa.
 *   · redvial: «tramos», que es como la ficha llama a cada feature (fichaRuta,
 *     «Tramo vial»).
 */
export const UNIDAD_CAPA = {
  incendios: ['incendio', 'incendios'],
  oecv: ['obra', 'obras'],
  oecv_verificado: ['tramo verificado', 'tramos verificados'],
  puntos_standby: ['punto stand-by', 'puntos stand-by'],
  rutas: ['ruta de despliegue', 'rutas de despliegue'],
  redvial: ['tramo', 'tramos'],
}

// Filtros del panel: que campo miran y a que capas afectan.
/*
 * `capas`  las capas a las que el filtro RECORTA, EN ORDEN DE PRIORIDAD. Decide
 *          cuando se muestra (si hay alguna encendida), de que capas salen sus
 *          opciones y en cual se cuenta.
 * `porque` por que ese orden.
 *
 * La cuenta entre parentesis de cada opcion sale de UNA sola capa: la PRIMERA
 * de `capas` que este ENCENDIDA y publique ese campo en su `dominios`, escrita
 * con la unidad de ESA capa (UNIDAD_CAPA). Si ninguna cumple, el filtro no se
 * muestra. Lo vigila B27 de verify-panel.mjs, que recalcula la capa y la cuenta
 * con codigo propio en varias combinaciones de capas.
 *
 * Por que una sola capa: la cuenta sumaba los `dominios` de TODAS las capas del
 * manifest. Medido el 2026-09-14 sobre el manifest de CI, «Biobío (5.049)» eran
 * 2.820 incendios + 379 obras OECV + 62 puntos stand-by + 1.020 tramos de red
 * vial + 768 rutas: un numero que no cuenta nada, junto a unos indicadores que
 * decian 2.820. Y como recorria todas, no solo las de `capas`, «Titularidad
 * (OECV)» ofrecia 31 opciones de las que 28 eran tipos de infraestructura de la
 * vista de priorizacion («Monoposte (74)»).
 *
 * Por que la primera ENCENDIDA y no una capa duena fija: con una duena fija,
 * medido el 2026-09-14, ?capas=redvial ofrecia «Ripio (1.892 rutas)» --cifra de
 * Rutas de despliegue, apagada-- junto a un mapa que dibujaba 4.916 tramos de
 * ripio, y ?capas=oecv decia «Antofagasta (8 incendios)» con solo obras a la
 * vista. La cifra tiene que hablar de lo que se ve.
 * Si una opcion no esta en la capa que cuenta (sale de otra capa del filtro),
 * su cuenta es 0 y se dice: nunca se suman entidades distintas.
 */
export const FILTROS = [
  // "ver solo mi región" no es adorno: es el filtro que busca cualquiera que
  // llega de fuera, y con la etiqueta a secas nadie sabia que al elegir una
  // region el visor entero --mapa e indicadores-- pasa a hablar solo de ella.
  // Orden: incendios primero, porque es la capa de la que hablan los
  // indicadores y el cartel; despues las del programa en el orden del panel de
  // capas, y la red vial al final, porque es contexto del territorio.
  {
    campo: 'region',
    etiqueta: 'Región · ver solo mi región',
    capas: ['incendios', 'oecv', 'oecv_verificado', 'puntos_standby', 'rutas', 'redvial'],
  },
  // Una sola capa: incendios es la unica con temporada y causa, y oecv la unica
  // a la que recortan tipo e inst (App.jsx: pasaOECV).
  { campo: 'temporada', etiqueta: 'Temporada', capas: ['incendios'] },
  { campo: 'causa_grupo', etiqueta: 'Grupo de causa', capas: ['incendios'] },
  { campo: 'causa_general', etiqueta: 'Causa general', capas: ['incendios'] },
  { campo: 'tipo', etiqueta: 'Titularidad (OECV)', capas: ['oecv'] },
  { campo: 'inst', etiqueta: 'Institución (OECV)', capas: ['oecv'] },
  // Orden: rutas antes que red vial. Traen las mismas 7 carpetas, pero rutas es
  // la capa operativa del programa --por donde llegan las brigadas-- y la red
  // vial es contexto. Con las dos encendidas cuenta rutas de despliegue.
  { campo: 'carpeta', etiqueta: 'Tipo de carpeta', capas: ['rutas', 'redvial'] },
]

export const fmt = new Intl.NumberFormat('es-CL')
export const fmt1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

const fechaES = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * `manifest.generado` es un instante ISO en UTC. Formatearlo con
 * `new Date(iso)` lo pasa a hora local, y en Chile (UTC-4/-3) todo lo generado
 * antes de las 03:00/04:00 UTC retrocede un dia: el ETL que corrio la madrugada
 * del 7 se anunciaria como del 6. Se toman los componentes de la fecha tal cual
 * vienen y se arma una fecha local, que es lo que el dato significa.
 */
export function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? fechaES.format(new Date(+m[1], +m[2] - 1, +m[3])) : null
}

/* ---------------------------------------------------------------------------
   COPIA CANONICA para quien llega de fuera del programa

   TRES superficies afirman a la vez que estos incendios YA OCURRIERON: el
   encabezado del panel izquierdo, el cartel sobre el mapa y el aviso de
   descarga. Quien abre el visor en un telefono solo ve una de ellas, asi que
   las tres tienen que decir EXACTAMENTE lo mismo. Viven aqui y no en cada
   componente porque tres redacciones paralelas divergen a la primera edicion
   y el visor termina contradiciendose a si mismo.
   Al tocar cualquiera de estas constantes, releer las tres en una sola
   pantalla antes de subir.
   --------------------------------------------------------------------------- */

/* El malentendido mas caro del visor. Miles de puntos naranjos sobre una
   region, bajo un encabezado que nombra la temporada en curso, se leen como
   incendios ACTIVOS ahora mismo. Es lo primero que hay que desmontar. */
export const NO_ACTIVOS = 'Este visor no muestra incendios activos'

/**
 * Rango de temporadas realmente presente en la capa de incendios, leido de los
 * `dominios` del manifest. El encabezado anuncia la temporada del PROGRAMA
 * (2025-2026), pero la capa cubre todas las investigadas: anunciar una sola
 * sobre nueve mostradas es falso respecto de lo que se ve.
 * No se hardcodea ninguna temporada: una nueva aparece sola.
 * Devuelve null sin manifest o con una sola temporada, donde la frase sobra.
 */
export function temporadasIncendios(manifest) {
  const v = (manifest?.capas?.incendios?.dominios?.temporada ?? []).map((d) => d.v).sort()
  return v.length > 1 ? { primera: v[0], ultima: v.at(-1) } : null
}

/**
 * Aviso civico: a quien avisar, que numero llamar, que no hacer.
 *
 * null a proposito, y NO es un pendiente que se pueda rellenar aqui por
 * conveniencia. Cualquier telefono, correo o llamado a la accion debe venir
 * REDACTADO Y AUTORIZADO por la Unidad de Informacion y Analisis de CONAF:
 * este visor publica bajo la marca institucional, y un numero inventado o
 * copiado de otra fuente le atribuye a CONAF un mensaje que no ha emitido.
 * Cuando exista, se escribe aqui como texto plano y la interfaz lo pinta sola.
 */
export const AVISO_CIVICO = null

/**
 * Canal de contacto para quien crea que un dato esta mal.
 *
 * null por la MISMA razon que AVISO_CIVICO, y hay una tentacion concreta que
 * conviene nombrar para que nadie la repita: el repositorio de GitHub donde
 * vive este codigo NO es un canal institucional de CONAF -- pertenece a la
 * consultora que lo desarrolla --, asi que enviar ahi el reclamo de un vecino
 * le inventa a la institucion una via de atencion que no ha publicado.
 * Cuando la Unidad entregue un correo o formulario oficial, se escribe aqui.
 */
export const CONTACTO = null
