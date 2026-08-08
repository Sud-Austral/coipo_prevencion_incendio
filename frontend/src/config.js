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
  Claro: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
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
export const CAPAS = [
  {
    id: 'incendios',
    etiqueta: 'Incendios investigados',
    tipo: 'puntos-incendios',
    porDefecto: true,
  },
  { id: 'oecv', etiqueta: 'OECV (cortafuegos)', tipo: 'lineas', porDefecto: true, weight: 3 },
  { id: 'puntos_standby', etiqueta: 'Puntos stand-by', tipo: 'puntos', porDefecto: true },
  {
    id: 'rutas',
    etiqueta: 'Rutas de despliegue',
    tipo: 'lineas',
    porDefecto: false,
    color: COLOR_RUTA,
    weight: 2,
  },
  {
    id: 'redvial',
    etiqueta: 'Red vial MOP 2024',
    tipo: 'lineas',
    porDefecto: false,
    color: COLOR_REDVIAL,
    weight: 1,
    opacity: 0.55,
  },
]

// Filtros del panel: que campo miran y a que capas afectan.
export const FILTROS = [
  { campo: 'region', etiqueta: 'Región', capas: ['incendios', 'oecv', 'puntos_standby', 'rutas', 'redvial'] },
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
