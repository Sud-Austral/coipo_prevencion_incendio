import { useEffect, useMemo, useRef } from 'react'
import L from '../cumulos'
import { htmlIcono } from '../iconos'

/**
 * Infraestructura crítica y comunidades preparadas, en cúmulos numerados.
 *
 * DE 696 PUNTOS A 35.905. Hasta el 2026-09-16 el insumo eran tres comunas y
 * cada elemento se dibujaba como un icono suelto, con un umbral de zoom para no
 * tapar las manchas. El insumo nuevo es nacional --18.002 antenas, 11.122
 * establecimientos educacionales…-- y un icono por elemento es inviable: sólo
 * en la Metropolitana hay miles en una pantalla. Luis eligió cúmulos numerados
 * (2026-09-16).
 *
 * ES LA UNICA CAPA DEL VISOR QUE NO VA SOBRE CANVAS, y sigue siendo deliberado:
 * lo que se pide es que una escuela se vea como una escuela, y eso un círculo de
 * color no lo da. Los cúmulos son divIcon, del mismo camino de eventos.
 *
 * POR QUE NO ROMPE LOS CLICS DE LAS DEMAS CAPAS (comprobado en el fuente de
 * Leaflet 1.9.4, no supuesto): el canvas del renderer se marca
 * `_leaflet_disable_events` y engancha sus propios listeners, así que
 * Map._handleDOMEvent descarta todo evento cuyo target sea ese canvas. Un
 * Marker no es un Path, nunca llama a getRenderer() y su icono se registra con
 * addInteractiveTarget. Son dos caminos de eventos DISJUNTOS. Lo que
 * DECISIONES.md §H describe es otra cosa --varios canvas compitiendo por ser el
 * target-- y un pane de marcadores no compite.
 *
 * markerPane tiene z-index 600 y overlayPane 400 (leaflet.css), así que los
 * iconos y los cúmulos quedan por encima de las manchas sin tocar ningún
 * z-index.
 */

/** Cúmulo: disco grafito con la cuenta. Tres tamaños, como en la página eléctrica. */
function iconoCumulo(cumulo) {
  const n = cumulo.getChildCount()
  const [clase, lado] = n < 10 ? ['chico', 30] : n < 100 ? ['medio', 38] : ['grande', 46]
  // `n` es un entero que cuenta Leaflet, no texto de un .dbf: puede ir como html.
  return L.divIcon({
    html: `<div><span>${n}</span></div>`,
    className: `marker-cluster cumulo-${clase}`,
    iconSize: L.point(lado, lado),
  })
}

export default function CapaIconos({
  map,
  data,
  // `familia` viaja como INDICE contra esta tabla del manifest (pesaba 0,71 MiB
  // repetida en cada punto): se resuelve aqui, una vez por marcador.
  tablaFamilia,
  familias,
  familiasActivas,
  pasa,
  onSeleccion,
  onCuenta,
}) {
  const grupo = useMemo(
    () =>
      L.markerClusterGroup({
        // 50 y no los 30 de la página eléctrica: allí son 1.248 puntos y aquí
        // 35.905. Con 30, a escala nacional salían ~1.900 discos y el mapa se
        // leía como una cortina de cifras.
        maxClusterRadius: 50,
        // SIN `disableClusteringAtZoom`, y esto está medido, no elegido: con el
        // umbral en 12 --el mismo zoom con el que antes aparecían los iconos--
        // a z14 sobre Santiago se dibujaban 6.767 iconos sueltos y tapaban por
        // completo las manchas de riesgo, que es lo que la vista viene a
        // mostrar. Sin umbral manda el radio: dos elementos se separan cuando
        // en pantalla distan más de 50 px, a la escala que sea.
        // Los 35.905 marcadores entran por tandas para no congelar la pestaña.
        chunkedLoading: true,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: iconoCumulo,
      }),
    [],
  )
  const pool = useRef([])

  // Los marcadores se crean UNA vez por archivo y se reparten después: crear
  // 35.905 marcadores en cada cambio de filtro cuesta segundos.
  useEffect(() => {
    if (!data) {
      pool.current = []
      return
    }
    pool.current = data.features.map((f) => {
      const p = f.properties
      const familia = tablaFamilia?.[p.familia] ?? p.familia
      const [lon, lat] = f.geometry.coordinates
      const m = L.marker([lat, lon], {
        icon: L.divIcon({
          html: htmlIcono(familia),
          className: 'icono-infra',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11],
        }),
        // Por omisión Leaflet pone tabIndex=0 en CADA icono: serían 35.905
        // paradas de tabulación nuevas entre el mapa y el panel derecho. La capa
        // se explora con el ratón; el recorrido por teclado pasa por el panel.
        keyboard: false,
        riseOnHover: true,
        alt: `${familias?.[familia] ?? 'Infraestructura'}: ${p.nombre ?? 'sin nombre'}`,
      })
      m._p = p
      m._familia = familia
      if (onSeleccion) m.on('click', () => onSeleccion(m._p, m.getLatLng()))
      return m
    })
    return () => {
      grupo.clearLayers()
      pool.current = []
    }
  }, [data, grupo, onSeleccion, familias, tablaFamilia])

  // Filtrado: familias encendidas y, si hay comuna elegida, su CUT. Se reparte
  // en bloque con addLayers, que es lo que markercluster optimiza.
  useEffect(() => {
    grupo.clearLayers()
    const dentro = pool.current.filter(
      (m) => (!familiasActivas || familiasActivas.includes(m._familia)) && (!pasa || pasa(m._p)),
    )
    if (dentro.length) grupo.addLayers(dentro)
    onCuenta?.(dentro.length)
  }, [familiasActivas, pasa, grupo, onCuenta, data])

  // ESPERAR AL maxZoom, y no es defensivo porque si: markercluster lanza
  // "Map has no maxZoom specified" en su onAdd si `map.getMaxZoom()` no es
  // finito (leaflet.markercluster-src.js:605), y en este visor ese maxZoom lo
  // aporta la CAPA BASE, que añade un efecto del propio App. Los efectos de los
  // hijos corren ANTES que los del padre, asi que al montar el mapa todavia
  // responde Infinity: la excepcion subia hasta React y tumbaba la aplicacion
  // entera --panel en blanco, cero KPIs-- con un solo error en consola.
  //
  // No se le pone `maxZoom` al mapa para taparlo: el del visor sale de la capa
  // base elegida (18 o 19 segun el proveedor, config.js) y fijarlo en las
  // opciones lo congelaria para todas. Ademas, sin `disableClusteringAtZoom`
  // ese maxZoom es el que decide cuantos niveles de rejilla construye
  // markercluster (misma fuente, linea 963), asi que anadir el grupo antes de
  // que la capa base este puesta no solo revienta: construiria la rejilla con
  // el numero equivocado.
  useEffect(() => {
    if (!map) return
    let puesto = false
    const poner = () => {
      if (puesto || !isFinite(map.getMaxZoom())) return
      puesto = true
      map.addLayer(grupo)
    }
    poner()
    if (!puesto) map.on('layeradd', poner)
    return () => {
      map.off('layeradd', poner)
      if (puesto) map.removeLayer(grupo)
    }
  }, [map, grupo])

  return null
}
