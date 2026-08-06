import { useEffect } from 'react'
import { PMTiles } from 'pmtiles'
import { LineSymbolizer, leafletLayer } from 'protomaps-leaflet'
import { DATA } from '../config'

/**
 * Capa vial servida como teselas vectoriales PMTiles.
 *
 * Es el camino de PRODUCCION para rutas y red vial: juntas son 19.000 lineas y
 * 5,7 M de vertices, y como GeoJSON obligarian a descargar el pais entero a
 * detalle completo solo para ver el mapa nacional. Con teselas el navegador pide
 * por HTTP Range unicamente el viewport al zoom actual (~300 KB) y tippecanoe ya
 * dejo horneada la simplificacion de cada nivel.
 *
 * En desarrollo local no hay tippecanoe (es C++ con Makefile y no corre nativo
 * en Windows), asi que el ETL emite GeoJSON y App.jsx monta CapaLineas en lugar
 * de esta. El manifest dice cual toca.
 */
export default function CapaTiles({
  map,
  meta,
  visible,
  color,
  weight = 1.5,
  opacity = 0.9,
  filtroRegion,
}) {
  useEffect(() => {
    if (!map || !visible || !meta) return

    const pmtiles = new PMTiles(`${DATA}/${meta.archivo}`)
    const capa = meta.capa_mvt

    const layer = leafletLayer({
      attribution: 'MOP / CONAF',
      // SourceOptions espera `url`, no `source`.
      sources: { [capa]: { url: pmtiles, maxDataZoom: meta.maxzoom } },
      maxDataZoom: meta.maxzoom,
      paintRules: [
        {
          dataSource: capa,
          dataLayer: capa,
          // Filtrar es una regla de pintado, no una recarga: las teselas ya
          // estan en memoria. La firma es (zoom, feature) y los atributos
          // viven en feature.props.
          filter: filtroRegion ? (_z, f) => f.props.region === filtroRegion : undefined,
          symbolizer: new LineSymbolizer({
            color,
            width: weight,
            opacity,
            lineCap: 'round',
            lineJoin: 'round',
          }),
        },
      ],
      labelRules: [],
    })

    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [map, meta, visible, color, weight, opacity, filtroRegion])

  return null
}
