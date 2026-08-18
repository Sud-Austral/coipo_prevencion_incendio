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

export const BASEMAPS = {
  // Fondo neutro y claro: es el unico que deja leer ~15.000 puntos superpuestos.
  //
  // Host SIN {s}: el reparto por subdominios (a/b/c/d) era una tecnica de
  // HTTP/1.1 para saltarse el limite de 6 conexiones por host. Sobre HTTP/2 una
  // sola conexion multiplexa todas las teselas, asi que los tres apretones de
  // mano extra son perdida pura. Comprobado que el host desnudo responde igual.
  //
  // ACOPLADO a dos sitios: al <link rel="preconnect"> de index.html (que
  // precalienta este host exacto) y al patron con comodin de TILES en
  // scripts/verify-banner.mjs y scripts/verify-panel.mjs, que bloquean la red
  // con '*basemaps.cartocdn.com*'. No lo reescribas con hosts literales.
  Claro: {
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &middot; &copy; CARTO',
    maxZoom: 19,
  },
  Calles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  // Permite ver el combustible vegetal junto a las fajas OECV.
  //
  // `fecha` declara COMO se sabe de cuando es la imagen, para que la etiqueta
  // del mapa no tenga que conocer cada proveedor: 'esri' se consulta al vuelo
  // por punto y zoom (ver src/hooks/useFechaImagen.js), 'fijo' es una fecha
  // conocida de antemano, y sin `fecha` no se muestra nada.
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

export const radioPorZoom = (z) => (z < 7 ? 2.5 : z < 10 ? 3.5 : 5)

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

// Filtros del panel: que campo miran y a que capas afectan.
export const FILTROS = [
  // "ver solo mi región" no es adorno: es el filtro que busca cualquiera que
  // llega de fuera, y con la etiqueta a secas nadie sabia que al elegir una
  // region el visor entero --mapa e indicadores-- pasa a hablar solo de ella.
  {
    campo: 'region',
    etiqueta: 'Región · ver solo mi región',
    capas: ['incendios', 'oecv', 'puntos_standby', 'rutas', 'redvial'],
  },
  { campo: 'temporada', etiqueta: 'Temporada', capas: ['incendios'] },
  { campo: 'causa_grupo', etiqueta: 'Grupo de causa', capas: ['incendios'] },
  { campo: 'causa_general', etiqueta: 'Causa general', capas: ['incendios'] },
  { campo: 'tipo', etiqueta: 'Titularidad (OECV)', capas: ['oecv'] },
  { campo: 'inst', etiqueta: 'Institución (OECV)', capas: ['oecv'] },
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
