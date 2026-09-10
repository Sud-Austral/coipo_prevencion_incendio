import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'

/** Polygon | MultiPolygon -> anillos [lat, lon] para Leaflet (el 1.o exterior). */
function latlngs(geom) {
  const partes = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  return partes.map((poly) => poly.map((anillo) => anillo.map(([lon, lat]) => [lat, lon])))
}

/**
 * Capa de poligonos sobre el canvas compartido, con el patron de pool de
 * CapaLineas: construir una vez, filtrar cambiando la pertenencia al grupo.
 *
 * TRES REGLAS QUE NO SE PUEDEN ROMPER AQUI:
 *
 * 1. NI `renderer` NI `pane` propios. DECISIONES.md §H documenta el primero: un
 *    canvas por capa y solo la de encima recibe los clics. El segundo no estaba
 *    documentado y es la misma trampa por otra puerta -- Map.getRenderer evalua
 *    `layer.options.renderer || this._getPaneRenderer(layer.options.pane) ||
 *    this.options.renderer`, y _getPaneRenderer CREA un renderer nuevo para
 *    cualquier pane que no sea overlayPane, con precedencia sobre el compartido.
 *    O sea que basta declarar un pane para reintroducir el bug sin haber
 *    escrito la palabra `renderer`.
 *
 * 2. bringToBack() al montar. Canvas._onClick se queda con la ULTIMA figura
 *    dibujada que contenga el punto, y _initPath anade al final. Como estos
 *    poligonos llegan por red, uno que termine de descargarse despues de los
 *    incendios se comeria los clics de los 14.705 puntos en toda su superficie.
 *    Ir primero en el JSX no basta: el orden real lo decide quien acaba antes.
 *
 * 3. `estilo` es una FUNCION de las propiedades y se recibe ya construida. La
 *    capa no calcula colores ni sabe de escalas: si lo hiciera, cambiar de
 *    comuna obligaria a reconstruir el pool entero en vez de repintar.
 */
export default function CapaPoligonos({
  map,
  data,
  visible,
  pasa,
  estilo,
  onSeleccion,
  onCuenta,
}) {
  const grupo = useMemo(() => L.layerGroup(), [])
  const pool = useRef([])

  // 1) Pool: una sola vez por dataset. NO depende de `estilo`, para que
  //    normalizar no reconstruya 572 poligonos.
  useEffect(() => {
    if (!data) return
    const poligonos = data.features.map((f) => {
      const g = L.polygon(latlngs(f.geometry), {
        weight: 0.6,
        opacity: 0.9,
        fillOpacity: 0.65,
        // Sin esto el clic atraviesa al mapa y las capas de teselas pisan la
        // ficha del area con la del camino que pase por debajo.
        bubblingMouseEvents: false,
      })
      g._p = f.properties
      if (onSeleccion) g.on('click', (e) => onSeleccion(g._p, e.latlng))
      return g
    })
    pool.current = poligonos
    return () => {
      grupo.clearLayers()
      pool.current = []
    }
  }, [data, grupo, onSeleccion])

  // 2) Estilo: repintar SIN reconstruir. Es lo que hace que el boton
  //    «Normalizar» sea instantaneo con 572 poligonos.
  useEffect(() => {
    if (!estilo) return
    for (const g of pool.current) g.setStyle(estilo(g._p))
  }, [estilo, data])

  // 3) Filtrado por pertenencia al grupo.
  useEffect(() => {
    if (!pool.current.length) return
    grupo.clearLayers()
    let n = 0
    for (const g of pool.current) {
      if (!pasa || pasa(g._p)) {
        grupo.addLayer(g)
        n++
      }
    }
    onCuenta?.(n)
  }, [pasa, grupo, onCuenta, data])

  // 4) Visibilidad. El bringToBack va DESPUES de addLayer y en cada montaje:
  //    ver la regla 2 de la cabecera.
  useEffect(() => {
    if (!map) return
    if (visible) {
      map.addLayer(grupo)
      grupo.eachLayer((g) => g.bringToBack())
    } else {
      map.removeLayer(grupo)
    }
    return () => {
      map.removeLayer(grupo)
    }
  }, [map, grupo, visible, data])

  return null
}
