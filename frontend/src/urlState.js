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

export function escribirURL({ center, zoom, capas, filtros, base }) {
  // Se agrupa: moveend dispara muchas veces durante un paneo.
  clearTimeout(pendiente)
  pendiente = setTimeout(() => {
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
    window.history.replaceState(null, '', url)
  }, 250)
}
