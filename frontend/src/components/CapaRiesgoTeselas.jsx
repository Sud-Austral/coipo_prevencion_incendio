import { useEffect, useRef } from 'react'
import { PMTiles } from 'pmtiles'
import { PolygonSymbolizer, leafletLayer } from 'protomaps-leaflet'
import { DATA } from '../config'

/**
 * Manchas de riesgo servidas como teselas vectoriales, una fuente PMTiles por
 * region en UNA sola capa de protomaps-leaflet.
 *
 * Por que teselas y no CapaPoligonos: el pais son 110.708 manchas y 6,0 M de
 * vertices. Como poligonos de Leaflet, Natales sola (25.278 manchas) tardaba
 * 8,4 s en cargar y 2,1 s por cada repintado con la CPU a x4 (medido el
 * 2026-09-15). Una tesela solo dibuja lo que cae en ella.
 *
 * Por que una capa con 16 fuentes y no 16 capas: cada capa de Leaflet es una
 * rejilla con sus propios canvas y su propio clic; con una sola, el clic
 * pregunta una vez a todas las regiones (DECISIONES.md §H y §T).
 *
 * El estilo y la opacidad se leen de refs y se aplican con rerenderTiles(): no
 * recrean la capa, que perderia la cache de teselas ya descargadas. La opacidad
 * va DENTRO del dibujo y no como opacidad CSS de la rejilla: el PNG exportado y
 * la verificacion leen los pixeles del canvas, y la opacidad CSS no los toca.
 */
export default function CapaRiesgoTeselas({ map, teselas, visible, estilo, opacidad, onSeleccion }) {
  const capaRef = useRef(null)
  const estiloRef = useRef(estilo)
  const opacidadRef = useRef(opacidad)
  const seleccionRef = useRef(onSeleccion)
  estiloRef.current = estilo
  opacidadRef.current = opacidad
  seleccionRef.current = onSeleccion

  useEffect(() => {
    if (!map || !visible || !teselas?.regiones) return
    // levelDiff 0: protomaps pide por omision los datos de UN zoom menos que el
    // que dibuja (teselas de 512 px). Las teselas empiezan en z4 y el pais entero
    // se ve a z4, asi que con el valor por omision la vista nacional pedia z3 y no
    // pintaba nada (visto en captura el 2026-09-15).
    const fuentes = Object.fromEntries(
      Object.entries(teselas.regiones).map(([nn, r]) => [
        nn,
        { url: new PMTiles(`${DATA}/${r.archivo}`), maxDataZoom: teselas.maxzoom, levelDiff: 0 },
      ]),
    )
    const simbolo = new PolygonSymbolizer({
      fill: (_z, f) => estiloRef.current(f.props).relleno,
      stroke: (_z, f) => estiloRef.current(f.props).contorno,
      // Contorno fino a escala nacional, donde las manchas miden pocos pixeles
      // y un borde de 1 px las taparia enteras.
      width: (z) => (z >= 11 ? 0.8 : z >= 8 ? 0.4 : 0),
      opacity: () => opacidadRef.current,
      perFeature: true,
    })
    const capa = leafletLayer({
      sources: fuentes,
      maxDataZoom: teselas.maxzoom,
      attribution: 'CONAF · modelo de riesgo',
      paintRules: Object.keys(fuentes).map((nn) => ({
        dataSource: nn,
        dataLayer: teselas.capa_mvt,
        symbolizer: simbolo,
      })),
      labelRules: [],
    })
    capa.addTo(map)
    capaRef.current = capa

    // Una figura de tesela no es un objeto de Leaflet ni un nodo del DOM: se le
    // pregunta a protomaps que hay bajo el punto, contra las teselas en memoria.
    // Para poligonos la consulta es punto-en-poligono; la brocha solo importa en
    // el borde.
    const alClic = (e) => {
      const halladas = capa.queryTileFeaturesDebug(e.latlng.lng, e.latlng.lat, 4)
      const f = halladas ? [...halladas.values()].flat().find((x) => x.feature?.props?.mancha_id) : null
      if (f) seleccionRef.current?.(f.feature.props, e.latlng)
    }
    map.on('click', alClic)

    return () => {
      map.off('click', alClic)
      map.removeLayer(capa)
      capaRef.current = null
    }
  }, [map, visible, teselas])

  useEffect(() => {
    capaRef.current?.rerenderTiles()
  }, [estilo, opacidad])

  return null
}
