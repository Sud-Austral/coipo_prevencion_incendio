// Captura del mapa a un lienzo, para el PNG y para el informe.
//
// LAS TESELAS SE PIDEN APARTE, con fetch(), en vez de poner crossOrigin en la
// capa viva de Leaflet. Los dos caminos llegan a un lienzo sin contaminar --los
// tres servidores de teselas mandan Access-Control-Allow-Origin: *, comprobado
// con curl-- pero el crossOrigin en la capa tiene dos costes que este no tiene:
//
//   1. Invertiria la decision documentada en index.html:18-29, que deja el
//      <link rel="preconnect"> SIN crossorigin a proposito porque Leaflet pide
//      las teselas con <img> en modo no-CORS. Con la capa en modo CORS, ese
//      preconnect precalentaria el pool equivocado y el apreton se pagaria dos
//      veces en vez de cero.
//   2. Convertiria una cabecera ACAO ausente en un mapa base EN BLANCO para
//      todo el mundo, no solo para quien exporta.
//
// Asi el coste --volver a bajar las teselas de la vista -- lo paga solo quien
// pulsa el boton de descargar, que es exactamente cuando importa.

import { BASEMAPS } from './config'

const TESELA = 256

/**
 * Rango de teselas que cubre la vista actual, en el sistema de coordenadas de
 * pixeles del zoom actual. Se toma de Leaflet en vez de recalcular la
 * proyeccion: `getPixelBounds` ya devuelve el rectangulo visible en pixeles
 * globales, y dividir entre 256 da la rejilla de teselas.
 */
function rejilla(map) {
  const z = Math.round(map.getZoom())
  const b = map.getPixelBounds()
  return {
    z,
    x0: Math.floor(b.min.x / TESELA),
    y0: Math.floor(b.min.y / TESELA),
    x1: Math.ceil(b.max.x / TESELA) - 1,
    y1: Math.ceil(b.max.y / TESELA) - 1,
    // Origen en pixeles: lo que hay que restar para llevar la rejilla global al
    // (0,0) del lienzo.
    ox: b.min.x,
    oy: b.min.y,
  }
}

const urlTesela = (plantilla, x, y, z) =>
  plantilla
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y)
    // {r} es el sufijo de alta densidad (@2x). Se deja vacio: se captura a 1x
    // (ver el comentario de escala mas abajo).
    .replace('{r}', '')
    .replace('{s}', 'a')

/**
 * Dibuja el mapa tal como se ve en un <canvas> y lo devuelve.
 *
 * Devuelve el LIENZO y no un data URI: el PNG sale mejor por toBlob (sin la ida
 * y vuelta por base64, que multiplica por 1,33 la memoria) y el informe necesita
 * toDataURL. Que elija cada uno.
 *
 * @returns {Promise<{lienzo: HTMLCanvasElement, teselas: number, fallidas: number}>}
 */
export async function capturarMapa(map, base = 'Claro') {
  if (!map) throw new Error('sin mapa')
  const cont = map.getContainer()
  const caja = cont.getBoundingClientRect()
  const ancho = Math.round(caja.width)
  const alto = Math.round(caja.height)
  if (!ancho || !alto) throw new Error('el mapa no tiene tamaño')

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')

  // Fondo del contenedor: los huecos entre teselas que no cargaron deben salir
  // del color del mapa vacio, no en negro ni transparentes.
  ctx.fillStyle = getComputedStyle(cont).backgroundColor || '#dfe3e8'
  ctx.fillRect(0, 0, ancho, alto)

  // ---- teselas ----
  const cfg = BASEMAPS[base] ?? BASEMAPS.Claro
  const g = rejilla(map)
  const peticiones = []
  for (let x = g.x0; x <= g.x1; x++) {
    for (let y = g.y0; y <= g.y1; y++) {
      const dx = x * TESELA - g.ox
      const dy = y * TESELA - g.oy
      peticiones.push(
        fetch(urlTesela(cfg.url, x, y, g.z), { mode: 'cors', credentials: 'omit' })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
          .then(createImageBitmap)
          .then((bm) => ({ bm, dx, dy }))
          // Una tesela que falta deja un hueco del color de fondo; no se
          // aborta la captura entera por eso.
          .catch(() => null),
      )
    }
  }
  const teselas = await Promise.all(peticiones)
  let fallidas = 0
  for (const t of teselas) {
    if (!t) {
      fallidas++
      continue
    }
    ctx.drawImage(t.bm, t.dx, t.dy, TESELA, TESELA)
    t.bm.close?.()
  }

  // ---- capas vectoriales ----
  // Se leen del DOM con getBoundingClientRect relativo al contenedor: asi las
  // transformaciones de Leaflet (pane, contenedor de teselas, animacion de
  // zoom) las resuelve el navegador y no hay que replicar su aritmetica.
  for (const c of cont.querySelectorAll('canvas')) {
    // El lienzo de las teselas de protomaps y el del renderer vectorial viven
    // los dos aqui; ambos se dibujan igual.
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) continue
    try {
      ctx.drawImage(c, r.left - caja.left, r.top - caja.top, r.width, r.height)
    } catch {
      /* un lienzo contaminado no debe tumbar la captura entera */
    }
  }

  // ---- atribucion ----
  // NO es decorativa: OSM, Esri y EOX la exigen, y los controles de Leaflet son
  // HTML, asi que no entran en el lienzo por si solos. Una captura sin
  // atribucion es una infraccion de licencia esperando a publicarse.
  const texto = String(cfg.attribution ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&copy;/g, '©')
    .replace(/&middot;/g, '·')
    .trim()
  if (texto) {
    ctx.font = '11px system-ui, sans-serif'
    // SE ENVUELVE, y no es refinamiento. Las atribuciones de Esri son largas:
    // la de Topografico son ~110 caracteres YA ACORTADA (el copyrightText
    // integro son 232), o sea unos 715 px a 11 px de fuente, contra los 510 px
    // utiles que quedan cuando el mapa esta en su minimo (MIN_MAPA, 520). En
    // una sola linea el rectangulo arrancaba en x NEGATIVO y la atribucion
    // salia cortada por la izquierda: justo la infraccion que este bloque
    // existe para evitar, y encima dentro del archivo que el usuario descarga
    // y reparte. Se parte por palabras y se apilan las lineas que hagan falta,
    // asi que tampoco hay que volver aqui si manana una capa trae otra mas.
    const anchoMax = ancho - 10
    const lineas = []
    let linea = ''
    for (const palabra of texto.split(/\s+/)) {
      const cand = linea ? `${linea} ${palabra}` : palabra
      if (linea && ctx.measureText(cand).width > anchoMax) {
        lineas.push(linea)
        linea = palabra
      } else {
        linea = cand
      }
    }
    if (linea) lineas.push(linea)

    const ALTO_LINEA = 13
    const w = Math.min(anchoMax, Math.max(...lineas.map((l) => ctx.measureText(l).width))) + 10
    const h = lineas.length * ALTO_LINEA + 5
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillRect(ancho - w, alto - h, w, h)
    ctx.fillStyle = '#333'
    lineas.forEach((l, i) => ctx.fillText(l, ancho - w + 5, alto - h + ALTO_LINEA * (i + 1)))
  }

  return { lienzo, teselas: teselas.length, fallidas }
}

/** PNG como Blob. */
export function lienzoAPng(lienzo) {
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('no se pudo generar el PNG'))), 'image/png'),
  )
}
