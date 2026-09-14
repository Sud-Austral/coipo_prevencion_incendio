// Calculos de la vista de lineas electricas. Funciones PURAS: sin DOM, sin
// Leaflet y sin estado, para que se puedan leer y probar aisladas.
//
// El arnes NO importa este archivo y no debe hacerlo: recalcula lo esperado
// con codigo propio. Importarlo verificaria que una funcion es igual a si
// misma (CLAUDE.md §4).
import { DIACRITICOS } from '../config.js'

// Cabeceras REALES del Excel, tal como las declara manifest.derivados.
// lineas_electricas.columnas. main.js comprueba al cargar que cada una este en
// el manifest y, si falta alguna, se niega a dibujar: un renombre en el Excel
// no puede convertirse en columnas vacias en silencio.
export const CAMPO = {
  id: 'ID',
  region: 'Región',
  provincia: 'Provincia',
  comuna: 'Comuna',
  temporada: 'Temporada',
  incendio: 'N° Incendio',
  nombre: 'Nombre',
  codigo: 'Causa investigada 2023',
  subcausa: 'Nombre causa específica 2023',
  grupo: 'Grupo causas 2023',
  superficie: 'Superficie',
  fecha: 'Inicio R20',
  hora: 'Hora R20',
}

/** Ventana horaria propuesta: 13:00 a 17:59, o sea 13 <= HH <= 17. */
export const VENTANA = { desde: 13, hasta: 17 }

export const TOP_COMUNAS = 12

const colator = new Intl.Collator('es')

/** NFKD, sin diacriticos, minusculas y espacios colapsados. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

/**
 * Clave de agrupacion de una comuna: `region|comuna normalizada`. Dentro de la
 * region, porque el mismo nombre en dos regiones son dos comunas distintas; y
 * normalizada porque el Excel trae la misma comuna con dos grafias (CABRERO y
 * Cabrero, Isla De Maipo e Isla de Maipo): contadas por etiqueta cruda serian
 * 226 comunas donde hay 220.
 */
export function claveComuna(region, comuna) {
  return `${region ?? ''}|${normalizar(comuna)}`
}

/** 'Sin registro' (y el vacio) no es una comuna: suma al total, no a comunas. */
export function esComunaValida(comuna) {
  const n = normalizar(comuna)
  return n !== '' && n !== 'sin registro'
}

/** Features del ambito: todas con region '' y solo las de esa region si no. */
export function filtrar(features, region) {
  if (!region) return features
  return features.filter((f) => f.properties[CAMPO.region] === region)
}

/**
 * Regiones del selector: union de las de los puntos y las de los incendios sin
 * coordenadas, para que una region cuyos incendios no tengan ninguno
 * georreferenciado siga siendo elegible y su aviso se pueda leer.
 */
export function regiones(features, porRegion = {}) {
  const s = new Set()
  for (const f of features) {
    const r = f.properties[CAMPO.region]
    if (r) s.add(r)
  }
  for (const [r, n] of Object.entries(porRegion ?? {})) {
    if (r !== 'Sin región' && n > 0) s.add(r)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/** Agrupa las comunas validas del ambito. Devuelve un Map clave -> grupo. */
export function comunas(features) {
  const grupos = new Map()
  for (const f of features) {
    const p = f.properties
    if (!esComunaValida(p[CAMPO.comuna])) continue
    const clave = claveComuna(p[CAMPO.region], p[CAMPO.comuna])
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, n: 0, sumaLat: 0, sumaLon: 0, ha: 0, grafias: new Map() }
      grupos.set(clave, g)
    }
    g.n++
    g.sumaLat += p.lat
    g.sumaLon += p.lon
    g.ha += Number(p[CAMPO.superficie]) || 0
    g.grafias.set(p[CAMPO.comuna], (g.grafias.get(p[CAMPO.comuna]) ?? 0) + 1)
  }
  for (const g of grupos.values()) {
    // Grafia mas frecuente; en empate, la primera por localeCompare('es').
    g.etiqueta = [...g.grafias].sort((a, b) => b[1] - a[1] || colator.compare(a[0], b[0]))[0][0]
    g.lat = g.sumaLat / g.n
    g.lon = g.sumaLon / g.n
    g.ha = Math.round(g.ha * 100) / 100
  }
  return grupos
}

/** Totales del ambito. `ha`: suma de Superficie con null = 0, a 2 decimales. */
export function resumen(features) {
  let ha = 0
  for (const f of features) ha += Number(f.properties[CAMPO.superficie]) || 0
  return {
    total: features.length,
    comunas: comunas(features).size,
    ha: Math.round(ha * 100) / 100,
  }
}

/** Las `top` comunas con mas incendios; desempate por etiqueta en espanol. */
export function ranking(features, top = TOP_COMUNAS) {
  return [...comunas(features).values()]
    .sort((a, b) => b.n - a.n || colator.compare(a.etiqueta, b.etiqueta))
    .slice(0, top)
}

/** Hora 0..23 de 'HH:MM', o null si no hay hora legible. */
export function horaDe(texto) {
  const m = /^(\d{1,2}):\d{2}/.exec(String(texto ?? ''))
  if (!m) return null
  const h = Number(m[1])
  return h >= 0 && h <= 23 ? h : null
}

/**
 * 24 barras por hora de inicio y la ventana 13-17. El porcentaje se calcula
 * sobre los incendios CON hora, no sobre el total: los que no la tienen no
 * pueden estar ni dentro ni fuera de la ventana.
 */
export function histograma(features) {
  const barras = Array(24).fill(0)
  let conHora = 0
  let enVentana = 0
  for (const f of features) {
    const h = horaDe(f.properties[CAMPO.hora])
    if (h === null) continue
    barras[h]++
    conHora++
    if (h >= VENTANA.desde && h <= VENTANA.hasta) enVentana++
  }
  return {
    barras,
    conHora,
    sinHora: features.length - conHora,
    enVentana,
    // Sin ningun incendio con hora no hay porcentaje que dar: '0.0' y el texto
    // lo dice, en vez de publicar un NaN.
    pct: conHora ? ((100 * enVentana) / conHora).toFixed(1) : '0.0',
  }
}

/** Orden de codigos por segmento numerico: 4.9.2 < 4.9.10 < 4.10.1. */
export function compararCodigos(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true })
}

/**
 * Una entrada por codigo de subcausa presente en el ambito, ordenadas por
 * codigo. `nombre` y `grupo` son los mas frecuentes del codigo en los datos,
 * no una tabla escrita a mano.
 */
export function leyenda(features, paleta, respaldo) {
  const porCodigo = new Map()
  for (const f of features) {
    const p = f.properties
    const codigo = String(p[CAMPO.codigo] ?? '')
    let e = porCodigo.get(codigo)
    if (!e) {
      e = { codigo, n: 0, nombres: new Map(), grupos: new Map() }
      porCodigo.set(codigo, e)
    }
    e.n++
    e.nombres.set(p[CAMPO.subcausa], (e.nombres.get(p[CAMPO.subcausa]) ?? 0) + 1)
    e.grupos.set(p[CAMPO.grupo], (e.grupos.get(p[CAMPO.grupo]) ?? 0) + 1)
  }
  const masFrecuente = (m) =>
    [...m].sort((a, b) => b[1] - a[1] || colator.compare(String(a[0]), String(b[0])))[0]?.[0] ?? null
  return [...porCodigo.values()]
    .sort((a, b) => compararCodigos(a.codigo, b.codigo))
    .map((e) => {
      const propio = Object.hasOwn(paleta, e.codigo)
      return {
        codigo: e.codigo,
        n: e.n,
        nombre: masFrecuente(e.nombres),
        grupo: masFrecuente(e.grupos),
        // Familia = los dos primeros segmentos (1.9, 4.9): agrupa la leyenda.
        familia: e.codigo.split('.').slice(0, 2).join('.'),
        color: propio ? paleta[e.codigo] : respaldo,
        respaldo: !propio,
      }
    })
}

/**
 * Celda mas cargada de una rejilla de `celda` px sobre puntos ya proyectados a
 * pixeles del zoom actual. Es la misma rejilla que usa leaflet.heat (lado =
 * (radio + desenfoque) / 2), y sirve para fijar el tope de la escala de calor
 * en funcion de la densidad real a ese zoom.
 */
export function maxCelda(pixeles, celda) {
  const cuenta = new Map()
  let max = 0
  for (const [x, y] of pixeles) {
    const k = `${Math.floor(x / celda)},${Math.floor(y / celda)}`
    const n = (cuenta.get(k) ?? 0) + 1
    cuenta.set(k, n)
    if (n > max) max = n
  }
  return max
}

/**
 * 'YYYY-MM-DD' -> 'dd-mm-aaaa' con los componentes del ISO. NUNCA con
 * new Date(iso): eso lo interpreta como medianoche UTC y en Chile retrocede un
 * dia la fecha del incendio.
 */
export function fechaDMA(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Primera y ultima temporada presentes, o null si no hay ninguna. */
export function rangoTemporadas(features) {
  const t = [...new Set(features.map((f) => f.properties[CAMPO.temporada]).filter(Boolean))].sort()
  return t.length ? { primera: t[0], ultima: t.at(-1) } : null
}
