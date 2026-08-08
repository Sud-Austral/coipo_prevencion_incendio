import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'

/** LineString | MultiLineString -> array de arrays de [lat, lon] para Leaflet. */
function latlngs(geom) {
  const partes = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates
  return partes.map((p) => p.map(([lon, lat]) => [lat, lon]))
}

/**
 * Capa de lineas sobre canvas, con el mismo patron de pool que CapaPuntos:
 * construir una vez, filtrar cambiando la pertenencia al grupo.
 *
 * Se usa para OECV siempre, y para rutas/red vial cuando el ETL corrio sin
 * tippecanoe (desarrollo local). En produccion esas dos llegan como PMTiles.
 */
export default function CapaLineas({
  map,
  data,
  visible,
  pasa,
  color,
  weight = 2,
  opacity = 0.9,
  onSeleccion,
  onCuenta,
}) {
  // Sin `renderer` propio: se usa el compartido del mapa (App.jsx). Uno por
  // capa rompe los clics de todas menos la de encima.
  const grupo = useMemo(() => L.layerGroup(), [])
  const pool = useRef([])

  useEffect(() => {
    if (!data) return
    const lineas = data.features.map((f) => {
      const l = L.polyline(latlngs(f.geometry), {
        color: typeof color === 'function' ? color(f.properties) : color,
        weight,
        opacity,
        // Sin esto el clic solo acierta encima del pixel exacto de la linea.
        bubblingMouseEvents: false,
      })
      l._p = f.properties
      if (onSeleccion) l.on('click', () => onSeleccion(l._p))
      return l
    })
    pool.current = lineas
    return () => {
      grupo.clearLayers()
      pool.current = []
    }
  }, [data, grupo, color, weight, opacity, onSeleccion])

  useEffect(() => {
    if (!pool.current.length) return
    grupo.clearLayers()
    let n = 0
    for (const l of pool.current) {
      if (!pasa || pasa(l._p)) {
        grupo.addLayer(l)
        n++
      }
    }
    onCuenta?.(n)
  }, [pasa, grupo, onCuenta, data])

  useEffect(() => {
    if (!map) return
    if (visible) map.addLayer(grupo)
    else map.removeLayer(grupo)
    return () => {
      map.removeLayer(grupo)
    }
  }, [map, grupo, visible])

  return null
}
