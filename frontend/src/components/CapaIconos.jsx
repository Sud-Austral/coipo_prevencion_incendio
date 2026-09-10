import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { htmlIcono } from '../iconos'
import { ZOOM_ICONOS } from '../config'

/**
 * Elementos de infraestructura critica con icono reconocible.
 *
 * ES LA UNICA CAPA DEL VISOR QUE NO VA SOBRE CANVAS, y es deliberado. El resto
 * usa L.circleMarker porque con 14.705 incendios un nodo del DOM por punto haria
 * inusable el paneo; aqui son 696 y lo que se pide es que una escuela se vea
 * como una escuela, cosa que un circulo de color no da.
 *
 * POR QUE NO ROMPE LOS CLICS DE LAS DEMAS CAPAS (comprobado en el fuente de
 * Leaflet 1.9.4, no supuesto): el canvas del renderer se marca
 * `_leaflet_disable_events` y engancha sus propios listeners, asi que
 * Map._handleDOMEvent descarta todo evento cuyo target sea ese canvas. Un
 * Marker no es un Path, nunca llama a getRenderer() y su icono se registra con
 * addInteractiveTarget. Son dos caminos de eventos DISJUNTOS: el hit-test del
 * navegador entrega el clic al icono o al canvas, nunca a los dos. Lo que
 * DECISIONES.md §H describe es otra cosa -- varios canvas compitiendo por ser
 * el target-- y un pane de marcadores no compite.
 *
 * markerPane tiene z-index 600 y overlayPane 400 (leaflet.css), asi que los
 * iconos quedan por encima de las areas priorizadas sin tocar ningun z-index.
 */
export default function CapaIconos({
  map,
  data,
  familiasActivas,
  pasa,
  onSeleccion,
  onCuenta,
  onLejos,
}) {
  const grupo = useMemo(() => L.layerGroup(), [])
  const pool = useRef([])
  // Los iconos solo se dibujan con suficiente acercamiento: ver ZOOM_ICONOS.
  const [lejos, setLejos] = useState(() => (map ? map.getZoom() < ZOOM_ICONOS : true))

  useEffect(() => {
    if (!map) return
    const mirar = () => {
      const l = map.getZoom() < ZOOM_ICONOS
      setLejos(l)
      onLejos?.(l)
    }
    mirar()
    map.on('zoomend', mirar)
    return () => map.off('zoomend', mirar)
  }, [map, onLejos])

  useEffect(() => {
    if (!data) return
    const marcadores = data.features.map((f) => {
      const p = f.properties
      const [lon, lat] = f.geometry.coordinates
      const m = L.marker([lat, lon], {
        icon: L.divIcon({
          html: htmlIcono(p.familia),
          className: 'icono-infra',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11],
        }),
        // Por omision Leaflet pone tabIndex=0 en CADA icono: con 696 puntos
        // serian 696 paradas de tabulacion nuevas entre el mapa y el panel
        // derecho. La capa se explora con el raton; el recorrido por teclado
        // del visor pasa por el panel, no por los marcadores.
        keyboard: false,
        // Resuelve el amontonamiento sin clustering: en Los Angeles hay 456 de
        // los 696 puntos y al pasar por encima el de interes sube al frente.
        riseOnHover: true,
        alt: `${p.grupo}: ${p.nombre ?? 'sin nombre'}`,
      })
      m._p = p
      if (onSeleccion) m.on('click', () => onSeleccion(m._p, m.getLatLng()))
      return m
    })
    pool.current = marcadores
    return () => {
      grupo.clearLayers()
      pool.current = []
    }
  }, [data, grupo, onSeleccion])

  // Filtrado: familias encendidas + el filtro de comuna. Solo cambia la
  // pertenencia al grupo, no se reconstruye ningun marcador.
  useEffect(() => {
    if (!pool.current.length) return
    grupo.clearLayers()
    let n = 0
    for (const m of pool.current) {
      if (familiasActivas && !familiasActivas.includes(m._p.familia)) continue
      if (pasa && !pasa(m._p)) continue
      n++
      if (!lejos) grupo.addLayer(m)
    }
    // La cuenta es la de los que PASAN el filtro, esten dibujados o no: el
    // panel dice cuantos hay, y anadir «0 elementos» al alejar el mapa se
    // leeria como que no existen.
    onCuenta?.(n)
  }, [familiasActivas, pasa, grupo, onCuenta, data, lejos])

  useEffect(() => {
    if (!map) return
    if (map.hasLayer(grupo)) map.removeLayer(grupo)
    map.addLayer(grupo)
    return () => {
      map.removeLayer(grupo)
    }
  }, [map, grupo])

  return null
}
