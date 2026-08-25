// Descarga del ambito filtrado: CSV para Excel y GeoJSON para SIG.
//
// Sin dependencias: Blob + URL.createObjectURL + un <a download> sintetico. Esto
// es una pagina normal, no un artefacto en zona de pruebas, asi que el atributo
// download funciona.

import { DATA, DIACRITICOS } from './config'

// ---------------------------------------------------------------------------
// Nombres de archivo
// ---------------------------------------------------------------------------

export const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** Fecha LOCAL en ISO. `toISOString()` daria UTC y en Chile adelantaria el dia
 *  la mayor parte de la tarde -- el mismo error que fechaLarga() ya evita. */
export const hoy = () => new Date().toLocaleDateString('en-CA')

/**
 * Resume el filtro activo para el nombre de archivo. Todos los filtros y no
 * solo la region: dos descargas del mismo dia con filtros distintos deben poder
 * convivir en la carpeta de descargas sin pisarse.
 */
export function ambitoSlug(filtros) {
  const partes = Object.values(filtros ?? {}).filter(Boolean).map(slug).filter(Boolean)
  return partes.length ? partes.join('-').slice(0, 60) : 'nacional'
}

export const nombreArchivo = (capa, filtros, ext) => `${capa}_${ambitoSlug(filtros)}_${hoy()}.${ext}`

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

export function guardar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.style.display = 'none'
  // Firefox exige que el <a> este EN el documento para que el clic descargue.
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revocar de inmediato aborta la descarga en Chrome: el navegador aun no ha
  // leido el blob cuando el clic vuelve.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob.size
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Separador ';' y decimales con coma: es lo que Excel en es-CL parsea al doble
// clic. Con ',' de separador y '.' de decimal, cada superficie se parte en dos
// columnas o se lee como texto, y este archivo existe para abrirse en Excel.
const SEP = ';'
// Sin el BOM, Windows lee el archivo en su pagina de codigos ANSI y "Biobío" y
// "Ñuble" salen rotos. Es el detalle que decide si el archivo sirve o no.
const BOM = '\uFEFF'

/**
 * Escapado RFC 4180 mas guardia contra inyeccion de formulas: un campo que
 * empieza por = + @ TAB o CR lo ejecuta Excel al abrir. Los datos vienen de un
 * Excel de terceros, asi que la guardia no es teorica.
 * El '-' NO se prefija: los numeros negativos son legitimos.
 */
function celda(v) {
  if (v == null) return ''
  let s = String(v)
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`
  return /[";\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Numero con coma decimal. Nulo se queda VACIO, nunca 0: «sin superficie» es
 *  una categoria real del dato y escribir 0 seria inventar una medicion. */
const num = (v) => (v == null ? '' : String(v).replace('.', ','))

function armarCSV(cabeceras, filas) {
  const lineas = [cabeceras.join(SEP)]
  for (const f of filas) lineas.push(f.map(celda).join(SEP))
  // join y no concatenacion en bucle: con 14.705 filas la diferencia es entre
  // una pasada y ~15.000 cadenas intermedias.
  return BOM + lineas.join('\r\n') + '\r\n'
}

const coords = (g) => (g?.type === 'Point' ? g.coordinates : [null, null])
const red6 = (v) => (v == null ? null : +v.toFixed(6))

/**
 * Los categoricos de incendios son indices contra manifest.capas.incendios
 * .tablas. En el archivo descargado se escriben ya resueltos: quien lo abre no
 * tiene el manifest.
 */
export function csvIncendios(features, tablas, pasa) {
  const t = (campo, i) => tablas?.[campo]?.[i] ?? i
  const filas = []
  for (const f of features ?? []) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    const [lon, lat] = coords(f.geometry)
    filas.push([
      p.id,
      t('region', p.region),
      t('provincia', p.provincia),
      t('comuna', p.comuna),
      t('temporada', p.temporada),
      p.n_incendio,
      p.nombre,
      t('causa_codigo', p.causa_codigo),
      t('causa_especifica', p.causa_especifica),
      t('causa_general', p.causa_general),
      t('causa_general_codigo', p.causa_general_codigo),
      t('causa_grupo', p.causa_grupo),
      p.utm_x,
      p.utm_y,
      p.utm_epsg,
      num(p.superficie_ha),
      t('jefe_brigada', p.jefe_brigada),
      t('mes_investigacion', p.mes_investigacion),
      t('investigado_por', p.investigado_por),
      p.inicio_r20,
      p.hora_r20,
      p.inv_inicio,
      p.inv_fin,
      p.informe,
      num(red6(lon)),
      num(red6(lat)),
    ])
  }
  return {
    texto: armarCSV(
      // LAS 23 COLUMNAS DE LA FUENTE, EN EL ORDEN DEL EXCEL, mas lon/lat al
      // final. El orden no es estetico: quien recibe este CSV lo cruza contra
      // 'BBDD INVESTIGACION UAD CONSOLIDADA COMPLETA.xlsx', y esa comparacion
      // solo es directa si las columnas van en el mismo orden.
      // lon/lat van al FINAL y no junto a utm_x/utm_y porque no son columnas de
      // la fuente: son la reproyeccion que calcula el ETL.
      [
        'id',
        'region',
        'provincia',
        'comuna',
        'temporada',
        'n_incendio',
        'nombre',
        'causa_codigo',
        'causa_especifica',
        'causa_general',
        'causa_general_codigo',
        'causa_grupo',
        'utm_x',
        'utm_y',
        'utm_epsg',
        'superficie_ha',
        'jefe_brigada',
        'mes_investigacion',
        'investigado_por',
        'inicio_r20',
        'hora_r20',
        'inv_inicio',
        'inv_fin',
        'informe',
        'lon',
        'lat',
      ],
      filas,
    ),
    n: filas.length,
  }
}

/** La geometria de OECV son lineas y no cabe en una celda: para eso esta el
 *  GeoJSON. Aqui van los atributos y la longitud ya calculada. */
export function csvOECV(features, pasa) {
  const filas = []
  for (const f of features ?? []) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    filas.push([p.nombre, p.tipo, p.inst, p.region, p.grupo, num(p.longitud_km)])
  }
  return { texto: armarCSV(['nombre', 'tipo', 'inst', 'region', 'grupo', 'longitud_km'], filas), n: filas.length }
}

export function csvVerificado(features, pasa) {
  const filas = []
  for (const f of features ?? []) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    filas.push([p.nombre, p.inst, p.region, p.origen, num(p.longitud_km)])
  }
  return { texto: armarCSV(['nombre', 'inst', 'region', 'origen', 'longitud_km'], filas), n: filas.length }
}

export function csvStandby(features, pasa) {
  const filas = []
  for (const f of features ?? []) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    const [lon, lat] = coords(f.geometry)
    filas.push([
      p.nombre,
      p.descripcion,
      p.responsable,
      p.codigo,
      p.region,
      p.fuente,
      num(red6(lon)),
      num(red6(lat)),
    ])
  }
  return {
    texto: armarCSV(
      ['nombre', 'descripcion', 'responsable', 'codigo', 'region', 'fuente', 'lon', 'lat'],
      filas,
    ),
    n: filas.length,
  }
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

/** Redondeo de coordenadas a 6 decimales (~11 cm). Recorre la geometria sea
 *  cual sea su anidamiento, que en LineString y MultiLineString cambia. */
function redondear(c) {
  return typeof c[0] === 'number' ? c.map((v) => +v.toFixed(6)) : c.map(redondear)
}

/**
 * FeatureCollection del ambito filtrado.
 *
 * Las propiedades llevan ETIQUETA y CODIGO a la vez (`region` y `region_cod`).
 * Los enteros son un artefacto del formato de transporte --bajan el archivo de
 * 6,0 a 3,9 MiB-- y un archivo descargado debe leerse sin el manifest; pero
 * tirarlos impediria volver a unirlo con los datos publicados.
 *
 * SIN miembro `crs`: RFC 7946 obliga a WGS84 y prohibe declararlo. El bloque
 * `coipo` es un miembro foraneo, que el mismo RFC si permite (§6.1), y lleva la
 * procedencia para que el archivo no acabe circulando sin saber de donde salio.
 */
export function geojsonDe(capa, features, pasa, { tablas, codificados = [], meta }) {
  const salida = []
  for (const f of features ?? []) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    const props = {}
    for (const [k, v] of Object.entries(p)) {
      if (codificados.includes(k) && tablas?.[k]) {
        props[k] = tablas[k][v] ?? null
        props[`${k}_cod`] = v
      } else props[k] = v
    }
    salida.push({
      type: 'Feature',
      geometry: f.geometry ? { ...f.geometry, coordinates: redondear(f.geometry.coordinates) } : null,
      properties: props,
    })
  }
  return {
    texto: JSON.stringify({
      type: 'FeatureCollection',
      name: capa,
      coipo: { ...meta, capa, n: salida.length },
      features: salida,
    }),
    n: salida.length,
  }
}

/** Enlace al archivo publicado: exacto, cacheado y gratis. Se ofrece junto al
 *  filtrado porque para rehacer un analisis completo es lo que se quiere. */
export const urlPublicada = (archivo) => `${DATA}/${archivo}`
