// Configuracion del visor: rutas de datos, vista inicial, basemaps y simbologia.

// NUNCA '/data': el repo se publica en Pages bajo /coipo_prevencion_incendio/,
// y una ruta absoluta pediria los datos a la raiz del dominio.
export const DATA = import.meta.env.BASE_URL + 'data'

export const VISTA_INICIAL = { center: [-38.0, -72.0], zoom: 6 }
export const LIMITES = [
  [-57, -78],
  [-17, -64],
]

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
  Satelital: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
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
