import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { radioPorZoom } from '../config'

/**
 * Capa de puntos sobre un unico <canvas>.
 *
 * Con 14.705 incendios, lo caro es CONSTRUIR los markers (new + proyeccion), no
 * filtrarlos. Por eso el pool se crea una sola vez cuando llegan los datos y
 * despues filtrar solo cambia la pertenencia al LayerGroup: ~1 repintado en vez
 * de 14.705 objetos nuevos.
 *
 * Se usa circleMarker y no Marker a proposito: 14.705 Markers serian 14.705
 * nodos del DOM, mientras que los circleMarker se dibujan todos en el mismo
 * canvas. De paso evita el clasico icono roto de Leaflet con bundlers.
 */
export default function CapaPuntos({
  map,
  data,
  visible,
  pasa,
  color,
  radio,
  popup,
  onCuenta,
}) {
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), [])
  const grupo = useMemo(() => L.layerGroup(), [])
  const pool = useRef([])

  // 1) Construccion del pool: una sola vez por dataset.
  useEffect(() => {
    if (!data) return
    const markers = data.features.map((f) => {
      const [lon, lat] = f.geometry.coordinates
      const m = L.circleMarker([lat, lon], {
        renderer,
        radius: radio ?? 4,
        weight: 1,
        color: '#fff',
        opacity: 0.85,
        fillColor: typeof color === 'function' ? color(f.properties) : color,
        fillOpacity: 0.9,
      })
      m._p = f.properties
      // El popup se genera solo al abrirlo: crear 14.705 strings HTML de
      // antemano gastaria varios MB de memoria para nada.
      if (popup) m.bindPopup(() => popup(m._p), { maxWidth: 340 })
      return m
    })
    pool.current = markers
    return () => {
      grupo.clearLayers()
      pool.current = []
    }
  }, [data, renderer, grupo, color, radio, popup])

  // 2) Filtrado: solo cambia que markers estan en el grupo.
  useEffect(() => {
    if (!pool.current.length) return
    grupo.clearLayers()
    let n = 0
    for (const m of pool.current) {
      if (!pasa || pasa(m._p)) {
        grupo.addLayer(m)
        n++
      }
    }
    onCuenta?.(n)
  }, [pasa, grupo, onCuenta, data])

  // 3) Visibilidad.
  useEffect(() => {
    if (!map) return
    if (visible) map.addLayer(grupo)
    else map.removeLayer(grupo)
    return () => {
      map.removeLayer(grupo)
    }
  }, [map, grupo, visible])

  // 4) El radio se adapta al zoom: a escala nacional los puntos se solapan.
  useEffect(() => {
    if (!map || radio) return
    const ajustar = () => {
      const r = radioPorZoom(map.getZoom())
      grupo.eachLayer((m) => m.setRadius(r))
    }
    ajustar()
    map.on('zoomend', ajustar)
    return () => map.off('zoomend', ajustar)
  }, [map, grupo, radio])

  return null
}
