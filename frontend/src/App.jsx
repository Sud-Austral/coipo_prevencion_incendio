import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  BASEMAPS,
  CAPAS,
  COLOR_CAUSA,
  COLOR_CAUSA_OTRA,
  COLOR_OECV,
  COLOR_STANDBY,
  LIMITES,
  VISTA_INICIAL,
} from './config'
import { useGeoJSON, useKpis, useManifest } from './hooks/useDatos'
import { popupIncendio, popupOECV, popupRuta, popupStandBy } from './popups'
import CapaLineas from './components/CapaLineas'
import CapaPuntos from './components/CapaPuntos'
import CapaTiles from './components/CapaTiles'
import PanelLateral from './components/PanelLateral'
import { escribirURL, leerURL } from './urlState'
import './App.css'

const inicial = leerURL()

export default function App() {
  const { manifest, error } = useManifest()
  const kpis = useKpis()

  const [map, setMap] = useState(null)
  const contenedor = useRef(null)
  const capaBase = useRef(null)

  const [base, setBase] = useState(inicial.base ?? 'Claro')
  const [capasActivas, setCapasActivas] = useState(
    inicial.capas ?? CAPAS.filter((c) => c.porDefecto).map((c) => c.id),
  )
  const [filtros, setFiltros] = useState(inicial.filtros ?? {})
  const [cuentas, setCuentas] = useState({})
  const [panelAbierto, setPanelAbierto] = useState(false)

  // ---------- mapa ----------
  // Se crea una sola vez. El cleanup DEBE devolver el estado a null: en
  // StrictMode React monta, desmonta y vuelve a montar, y si los efectos que
  // dependen del mapa siguen viendo la instancia ya destruida, su getPane()
  // devuelve undefined y Leaflet revienta al añadir la capa base.
  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, {
      // Todo se dibuja en canvas: con ~15.000 puntos y 19.000 lineas, un nodo
      // SVG por feature haria inusable el paneo.
      preferCanvas: true,
      center: inicial.center ?? VISTA_INICIAL.center,
      zoom: inicial.zoom ?? VISTA_INICIAL.zoom,
      minZoom: 4,
      maxBounds: LIMITES,
      maxBoundsViscosity: 0.5,
      zoomControl: true,
      attributionControl: true,
    })
    L.control.scale({ imperial: false }).addTo(m)
    setMap(m)
    return () => {
      m.remove()
      setMap(null)
    }
  }, [])

  // Encuadre inicial a partir del bbox real de los datos, no de constantes:
  // Chile es muy alargado y cualquier zoom fijo desperdicia media pantalla.
  // Solo aplica si la URL no traia ya un encuadre.
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!map || !manifest || encuadrado.current) return
    encuadrado.current = true
    if (inicial.center) return
    const bboxes = Object.values(manifest.capas)
      .map((c) => c.bbox)
      .filter(Boolean)
    if (!bboxes.length) return
    const b = bboxes.reduce((a, c) => [
      Math.min(a[0], c[0]),
      Math.min(a[1], c[1]),
      Math.max(a[2], c[2]),
      Math.max(a[3], c[3]),
    ])
    map.fitBounds(
      [
        [b[1], b[0]],
        [b[3], b[2]],
      ],
      { padding: [16, 16] },
    )
  }, [map, manifest])

  useEffect(() => {
    if (!map) return
    if (capaBase.current) map.removeLayer(capaBase.current)
    const cfg = BASEMAPS[base] ?? BASEMAPS.Claro
    capaBase.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map)
    capaBase.current.bringToBack()
  }, [map, base])

  // La URL refleja el estado para poder compartir y reproducir vistas.
  useEffect(() => {
    if (!map) return
    const sync = () =>
      escribirURL({
        center: [map.getCenter().lat, map.getCenter().lng],
        zoom: map.getZoom(),
        capas: capasActivas,
        filtros,
        base,
      })
    sync()
    map.on('moveend', sync)
    return () => map.off('moveend', sync)
  }, [map, capasActivas, filtros, base])

  // ---------- datos ----------
  const capaMeta = useCallback((id) => manifest?.capas?.[id], [manifest])
  const activa = useCallback((id) => capasActivas.includes(id), [capasActivas])

  const esGeoJSON = (meta) => meta && meta.formato !== 'pmtiles'

  const incendios = useGeoJSON(capaMeta('incendios')?.archivo, activa('incendios'))
  const oecv = useGeoJSON(capaMeta('oecv')?.archivo, activa('oecv'))
  const standby = useGeoJSON(capaMeta('puntos_standby')?.archivo, activa('puntos_standby'))
  const rutas = useGeoJSON(
    esGeoJSON(capaMeta('rutas')) ? capaMeta('rutas')?.archivo : null,
    activa('rutas'),
  )
  const redvial = useGeoJSON(
    esGeoJSON(capaMeta('redvial')) ? capaMeta('redvial')?.archivo : null,
    activa('redvial'),
  )

  const cargando = {
    incendios: incendios.cargando,
    oecv: oecv.cargando,
    puntos_standby: standby.cargando,
    rutas: rutas.cargando,
    redvial: redvial.cargando,
  }

  // ---------- decodificacion de categoricos ----------
  // Los campos de incendios vienen como indices enteros contra tablas del
  // manifest (bajan el archivo de 6,0 a 3,9 MiB). Se resuelven una sola vez.
  const tablas = capaMeta('incendios')?.tablas
  const decode = useCallback(
    (campo, codigo) => (tablas?.[campo] ? tablas[campo][codigo] : codigo),
    [tablas],
  )

  // ---------- filtros ----------
  const pasaIncendio = useMemo(() => {
    const f = filtros
    if (!tablas) return null
    // Se traducen las etiquetas del filtro a codigos UNA vez, y luego cada
    // marker se compara con enteros en vez de strings.
    const cod = {}
    for (const campo of ['region', 'temporada', 'causa_grupo', 'causa_general']) {
      if (!f[campo]) continue
      const i = tablas[campo]?.indexOf(f[campo])
      cod[campo] = i == null || i < 0 ? -1 : i
    }
    if (!Object.keys(cod).length) return null
    return (p) => {
      for (const campo in cod) if (p[campo] !== cod[campo]) return false
      return true
    }
  }, [filtros, tablas])

  const pasaPorCampos = useCallback(
    (campos) => {
      const activos = campos.filter((c) => filtros[c])
      if (!activos.length) return null
      return (p) => activos.every((c) => p[c] === filtros[c])
    },
    [filtros],
  )

  const pasaOECV = useMemo(() => pasaPorCampos(['region', 'tipo', 'inst']), [pasaPorCampos])
  const pasaVial = useMemo(() => pasaPorCampos(['region', 'carpeta']), [pasaPorCampos])
  const pasaStandby = useMemo(() => pasaPorCampos(['region']), [pasaPorCampos])

  // ---------- colores ----------
  const colorIncendio = useCallback(
    (p) => COLOR_CAUSA[decode('causa_grupo', p.causa_grupo)] ?? COLOR_CAUSA_OTRA,
    [decode],
  )
  const colorOECV = useCallback((p) => COLOR_OECV[p.tipo] ?? COLOR_OECV['Sin determinar'], [])

  const popIncendio = useCallback((p) => popupIncendio(p, decode), [decode])
  const popOECV = useCallback((p) => popupOECV(p, colorOECV(p)), [colorOECV])

  const setCuenta = useCallback(
    (id) => (n) => setCuentas((c) => (c[id] === n ? c : { ...c, [id]: n })),
    [],
  )

  const toggleCapa = (id) =>
    setCapasActivas((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]))

  const setFiltro = (campo, valor) =>
    setFiltros((f) => {
      const n = { ...f }
      if (valor) n[campo] = valor
      else delete n[campo]
      return n
    })

  if (error) {
    return (
      <div className="error">
        <h1>No se pudieron cargar los datos</h1>
        <p>{String(error.message)}</p>
        <p>
          Genera las capas con <code>python ETL/run.py</code> y recarga.
        </p>
      </div>
    )
  }

  const metaRutas = capaMeta('rutas')
  const metaRedvial = capaMeta('redvial')

  return (
    <div className="app">
      <button className="abrir" onClick={() => setPanelAbierto(true)} aria-label="Abrir panel">
        ☰
      </button>

      <PanelLateral
        manifest={manifest}
        kpis={kpis}
        capasActivas={capasActivas}
        onToggleCapa={toggleCapa}
        filtros={filtros}
        onFiltro={setFiltro}
        onLimpiar={() => setFiltros({})}
        cuentas={cuentas}
        cargando={cargando}
        base={base}
        onBase={setBase}
        basemaps={BASEMAPS}
        abierto={panelAbierto}
        onCerrar={() => setPanelAbierto(false)}
      />

      <div className="mapa" ref={contenedor} />

      {/* Red vial primero: es contexto y debe quedar bajo el resto. */}
      {metaRedvial &&
        (esGeoJSON(metaRedvial) ? (
          <CapaLineas
            map={map}
            data={redvial.data}
            visible={activa('redvial')}
            pasa={pasaVial}
            color={CAPAS.find((c) => c.id === 'redvial').color}
            weight={1}
            opacity={0.55}
            popup={popupRuta}
            onCuenta={setCuenta('redvial')}
          />
        ) : (
          <CapaTiles
            map={map}
            meta={metaRedvial}
            visible={activa('redvial')}
            color={CAPAS.find((c) => c.id === 'redvial').color}
            weight={1}
            opacity={0.55}
            filtroRegion={filtros.region}
          />
        ))}

      {metaRutas &&
        (esGeoJSON(metaRutas) ? (
          <CapaLineas
            map={map}
            data={rutas.data}
            visible={activa('rutas')}
            pasa={pasaVial}
            color={CAPAS.find((c) => c.id === 'rutas').color}
            weight={2}
            popup={popupRuta}
            onCuenta={setCuenta('rutas')}
          />
        ) : (
          <CapaTiles
            map={map}
            meta={metaRutas}
            visible={activa('rutas')}
            color={CAPAS.find((c) => c.id === 'rutas').color}
            weight={2}
            filtroRegion={filtros.region}
          />
        ))}

      <CapaLineas
        map={map}
        data={oecv.data}
        visible={activa('oecv')}
        pasa={pasaOECV}
        color={colorOECV}
        weight={3}
        popup={popOECV}
        onCuenta={setCuenta('oecv')}
      />

      <CapaPuntos
        map={map}
        data={standby.data}
        visible={activa('puntos_standby')}
        pasa={pasaStandby}
        color={COLOR_STANDBY}
        radio={5}
        popup={popupStandBy}
        onCuenta={setCuenta('puntos_standby')}
      />

      <CapaPuntos
        map={map}
        data={incendios.data}
        visible={activa('incendios')}
        pasa={pasaIncendio}
        color={colorIncendio}
        popup={popIncendio}
        onCuenta={setCuenta('incendios')}
      />
    </div>
  )
}
