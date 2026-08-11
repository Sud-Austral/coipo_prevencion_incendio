// Estado en la URL: capas activas, filtros y encuadre.
//
// Vale las ~40 lineas por dos razones: produce enlaces compartibles (un jefe
// provincial manda "mira esto" y llega a la misma vista), y hace reproducibles
// las capturas de verificacion sin tener que simular clics.

export function leerURL() {
  const q = new URLSearchParams(window.location.search)
  const estado = { filtros: {} }

  const lat = parseFloat(q.get('lat'))
  const lon = parseFloat(q.get('lon'))
  const z = parseInt(q.get('z'), 10)
  if (Number.isFinite(lat) && Number.isFinite(lon)) estado.center = [lat, lon]
  if (Number.isFinite(z)) estado.zoom = z

  const capas = q.get('capas')
  if (capas !== null) estado.capas = capas ? capas.split(',') : []

  if (q.get('base')) estado.base = q.get('base')

  for (const [k, v] of q.entries()) {
    if (['lat', 'lon', 'z', 'capas', 'base'].includes(k)) continue
    if (v) estado.filtros[k] = v
  }
  return estado
}

let pendiente = null
let ultimo = null
// Acumulado y NO un parametro del setTimeout: hay UN SOLO temporizador
// compartido, asi que un moveend que caiga dentro de los 250 ms siguientes a un
// cambio de filtro CANCELA la escritura de ese filtro (clearTimeout) y se queda
// con la suya. Sin acumular, encender una capa y mover el mapa a la vez perdia
// la entrada de historial de la capa en silencio.
let empujar = false

/**
 * @param {object} estado
 * @param {boolean} [opciones.push] crea una entrada de historial en vez de
 *   reemplazar la actual. Se reserva para los cambios que el usuario reconoce
 *   como "hice algo" --capas, filtros, mapa base--; el paneo sigue siendo
 *   replace, o cada arrastre del mapa llenaria el historial de basura.
 */
export function escribirURL({ center, zoom, capas, filtros, base }, { push = false } = {}) {
  ultimo = { center, zoom, capas, filtros, base }
  empujar ||= push
  // Se agrupa: moveend dispara muchas veces durante un paneo.
  clearTimeout(pendiente)
  pendiente = setTimeout(aplicar, 250)
}

function aplicar() {
  clearTimeout(pendiente)
  pendiente = null
  if (!ultimo) return
  const { center, zoom, capas, filtros, base } = ultimo
  const q = new URLSearchParams()
  if (center) {
    q.set('lat', center[0].toFixed(4))
    q.set('lon', center[1].toFixed(4))
  }
  if (zoom != null) q.set('z', String(zoom))
  if (capas) q.set('capas', capas.join(','))
  if (base) q.set('base', base)
  for (const [k, v] of Object.entries(filtros ?? {})) if (v) q.set(k, v)

  const url = `${window.location.pathname}?${q.toString()}`
  if (empujar) window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
  empujar = false
}

/**
 * Vuelca ya la escritura pendiente. Lo necesita "Compartir esta vista": sin
 * esto, copiar el enlace justo despues de mover el mapa entrega el encuadre
 * ANTERIOR, porque la URL se escribe con 250 ms de retraso.
 */
export function flush() {
  if (pendiente) aplicar()
}
