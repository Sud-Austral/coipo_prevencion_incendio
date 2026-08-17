import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  BASEMAPS,
  CAPAS,
  COLOR_CAUSA,
  COLOR_CAUSA_OTRA,
  COLOR_OECV,
  COLOR_REDVIAL,
  COLOR_RUTA,
  COLOR_STANDBY,
  ANCHO_KPI,
  CORTE_KPI,
  CORTE_PANEL,
  LIMITES,
  MAX_PANEL,
  MIN_MAPA,
  MIN_PANEL,
  VISTA_INICIAL,
  fmt,
} from './config'
import { useGeoJSON, useKpis, useManifest } from './hooks/useDatos'
import { fichaIncendio, fichaOECV, fichaRuta, fichaStandBy } from './fichas'
import Banner from './components/Banner'
import CartelContexto from './components/CartelContexto'
import ModalFicha from './components/ModalFicha'
import CapaLineas from './components/CapaLineas'
import CapaPuntos from './components/CapaPuntos'
import CapaTiles from './components/CapaTiles'
import PanelLateral from './components/PanelLateral'
import PanelIndicadores from './components/PanelIndicadores'
import Tirador from './components/Tirador'
import SeccionDescargas from './components/SeccionDescargas'
import { IconoIndicadores } from './components/graficos'
import { escribirURL, leerURL } from './urlState'
import { guardarDisposicion, leerDisposicion } from './preferencias'
import './App.css'

const inicial = leerURL()
// Objeto MUTABLE a proposito: guarda la ultima disposicion elegida con los
// paneles anclados, para poder restaurarla al volver de un regimen de cajon.
const disposicion = leerDisposicion()

/**
 * Regimen de disposicion, que decide si la X pliega una pista o cierra un cajon:
 *   1 · los dos paneles anclados          (> CORTE_KPI)
 *   2 · izquierdo anclado, derecho cajon  (> CORTE_PANEL)
 *   3 · los dos en cajon
 * ACOPLADO a las media queries de App.css; ver el comentario de CORTE_KPI en
 * config.js. La asercion B12 comprueba que no se desincronicen.
 */
const regimenDe = (ancho) => (ancho > CORTE_KPI ? 1 : ancho > CORTE_PANEL ? 2 : 3)

/** El sistema operativo pide menos movimiento. Se consulta en cada uso porque
 *  la preferencia puede cambiar sin recargar. */
const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Bounds de Leaflet que cubren TODAS las capas del manifest, a partir de sus
 * bbox [minLon, minLat, maxLon, maxLat]. Vive fuera del componente porque lo
 * usan dos efectos: el encuadre inicial y el retorno al limpiar el filtro de
 * region. Duplicarlo era la via mas corta a que los dos encuadres divergieran.
 */
function limitesDelManifest(manifest) {
  const bboxes = Object.values(manifest?.capas ?? {})
    .map((c) => c.bbox)
    .filter(Boolean)
  if (!bboxes.length) return null
  const b = bboxes.reduce((a, c) => [
    Math.min(a[0], c[0]),
    Math.min(a[1], c[1]),
    Math.max(a[2], c[2]),
    Math.max(a[3], c[3]),
  ])
  return [
    [b[1], b[0]],
    [b[3], b[2]],
  ]
}

/**
 * Bounds de los incendios de UNA region, calculados de las features cargadas y
 * no de una tabla de coordenadas escrita a mano: si el ETL incorpora una region
 * nueva, esto la encuadra solo.
 * Devuelve null si ninguna feature cae en la region -- un fitBounds con bounds
 * vacio lanza.
 */
function limitesDeRegion(features, codigoRegion) {
  let minLat = Infinity
  let minLon = Infinity
  let maxLat = -Infinity
  let maxLon = -Infinity
  for (const f of features) {
    if (f.properties.region !== codigoRegion) continue
    const [lon, lat] = f.geometry.coordinates
    if (lat < minLat) minLat = lat
    if (lon < minLon) minLon = lon
    if (lat > maxLat) maxLat = lat
    if (lon > maxLon) maxLon = lon
  }
  if (minLat === Infinity) return null
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ]
}

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
  // ---------- disposicion de los paneles ----------
  // Un solo booleano por panel para los dos regimenes: anclado significa que su
  // pista de la rejilla mide 0, y en cajon significa que el cajon esta cerrado.
  // Anclado nace como quedo la ultima vez; en cajon nace SIEMPRE cerrado, o al
  // estrechar la ventana aparecerian dos cajones tapando el mapa sin pedirlo.
  const [regimen, setRegimen] = useState(() => regimenDe(window.innerWidth))
  const panelAnclado = regimen < 3
  const kpiAnclado = regimen < 2
  const [panelVisible, setPanelVisible] = useState(
    () => regimenDe(window.innerWidth) < 3 && disposicion.panel,
  )
  const [kpiVisible, setKpiVisible] = useState(
    () => regimenDe(window.innerWidth) < 2 && disposicion.kpi,
  )
  const [anchoPanel, setAnchoPanel] = useState(disposicion.ancho)
  const [redimensionando, setRedimensionando] = useState(false)

  // Cartel de contexto sobre el mapa: visible de entrada y descartable. Que se
  // haya leido NO se recuerda: el unico almacenamiento del visor es la
  // disposicion de los paneles (ver src/preferencias.js), y nada de lo que
  // hace el visitante entra ahi. El precio es que cada recarga lo vuelve a
  // mostrar, y se acepta.
  const [cartelVisible, setCartelVisible] = useState(true)
  // Figura seleccionada en el mapa. Es un objeto de ficha ya armado, no las
  // propiedades crudas: quien sabe interpretar cada capa es el handler.
  const [ficha, setFicha] = useState(null)

  // ---------- mapa ----------
  // Se crea una sola vez. El cleanup DEBE devolver el estado a null: en
  // StrictMode React monta, desmonta y vuelve a montar, y si los efectos que
  // dependen del mapa siguen viendo la instancia ya destruida, su getPane()
  // devuelve undefined y Leaflet revienta al añadir la capa base.
  useEffect(() => {
    if (!contenedor.current) return
    // Las tres animaciones de Leaflet valen true por omision. Se consulta una
    // sola vez, al crear el mapa: cambiar la preferencia del sistema a mitad de
    // sesion es raro y recrear el mapa por eso costaria mas de lo que arregla.
    const quieto = menosMovimiento()
    const m = L.map(contenedor.current, {
      zoomAnimation: !quieto,
      fadeAnimation: !quieto,
      markerZoomAnimation: !quieto,
      // Todo se dibuja en canvas: con ~15.000 puntos y 19.000 lineas, un nodo
      // SVG por feature haria inusable el paneo.
      preferCanvas: true,
      // UN SOLO renderer para todas las capas vectoriales, y por eso se declara
      // aqui y no en cada componente. Leaflet engancha los eventos de raton al
      // ELEMENTO <canvas> (Canvas._initContainer), asi que con un canvas por
      // capa solo el de encima recibe los clics y los de debajo no llegan a
      // consultarse nunca. Cual queda encima lo decide el orden en que terminan
      // de descargarse las capas, o sea el tamano del archivo: incendios son
      // 3,9 MB, siempre llega el ultimo y tapaba los clics de OECV y stand-by.
      // Con un renderer compartido, Canvas._onClick recorre TODAS las figuras y
      // se queda con la de mas arriba que contenga el punto.
      // tolerance: la brocha de acierto del canvas, en pixeles. Por omision es
      // 0, o sea que hay que tocar el disco EXACTO: a z6 radioPorZoom da 2,5 px
      // de radio, un blanco de ~6 px de diametro contra una yema de dedo de
      // ~40. Abrir la ficha de un incendio es LA interaccion del visor, y hasta
      // ahora en un telefono habia que intentarlo varias veces.
      // Los 8 px son los mismos que este proyecto ya eligio y argumento para el
      // clic sobre teselas (queryTileFeaturesDebug en CapaTiles.jsx).
      //
      // EL COSTE, que es real: Canvas._onClick se queda con la ULTIMA figura en
      // orden de dibujo que contenga el punto, no con la mas cercana al dedo.
      // A mayor tolerancia, mayor probabilidad de abrir la ficha de un incendio
      // que a z6 esta a varios kilometros de donde se toco. Por eso 8 y no 12.
      renderer: L.canvas({ padding: 0.5, tolerance: 8 }),
      center: inicial.center ?? VISTA_INICIAL.center,
      zoom: inicial.zoom ?? VISTA_INICIAL.zoom,
      minZoom: 4,
      maxBounds: LIMITES,
      maxBoundsViscosity: 0.5,
      // Se instancia a mano mas abajo para poder traducir los tooltips: los
      // unicos dos controles del mapa se anunciaban «Zoom in» y «Zoom out»
      // dentro de una interfaz integramente en español de un servicio del
      // Estado chileno, y eso lo ve tambien cualquier usuario con raton.
      zoomControl: false,
      attributionControl: true,
    })
    // Leaflet copia el title al aria-label, asi que esto arregla de una vez el
    // tooltip y lo que anuncia el lector de pantalla.
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(m)
    L.control.scale({ imperial: false }).addTo(m)
    setMap(m)
    return () => {
      m.remove()
      setMap(null)
    }
  }, [])

  // El alto del banner es proporcional al ancho del viewport, y Leaflet solo se
  // entera de los resize de VENTANA. Los atributos width/height del <img> ya
  // hacen que el primer encuadre salga bien (el alto esta reservado antes de
  // que este efecto corra); esto es el seguro para lo que venga despues: que
  // alguien cambie el asset u --alto-minimo-banner y la banda cambie de alto
  // sin que la ventana se mueva. Se observa .mapa y no el banner porque es el
  // tamano que le importa a Leaflet, y asi cubre cualquier causa.
  useEffect(() => {
    const nodo = contenedor.current
    if (!map || !nodo) return
    let pendiente = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(pendiente)
      pendiente = requestAnimationFrame(() => map.invalidateSize({ animate: false }))
    })
    ro.observe(nodo)
    return () => {
      cancelAnimationFrame(pendiente)
      ro.disconnect()
    }
  }, [map])

  // Encuadre inicial a partir del bbox real de los datos, no de constantes:
  // Chile es muy alargado y cualquier zoom fijo desperdicia media pantalla.
  // Solo aplica si la URL no traia ya un encuadre.
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!map || !manifest || encuadrado.current) return
    encuadrado.current = true
    if (inicial.center) return
    const b = limitesDelManifest(manifest)
    // animate:false SIEMPRE, no solo con prefers-reduced-motion: es el primer
    // encuadre, y animarlo desde la vista por omision es un vuelo sobre Chile
    // que no aporta nada porque nadie estaba mirando el punto de partida.
    if (b) map.fitBounds(b, { padding: [16, 16], animate: false })
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
  //
  // Hasta ahora TODO se escribia con replaceState, asi que el visor no dejaba ni
  // una entrada de historial: quien encendia una capa, filtraba su region y
  // pulsaba Atras salia del sitio de un golpe. En movil, donde Atras es el gesto
  // principal de navegacion, eso se lee como que la pagina se cerro sola.
  const montado = useRef(false)
  const reponiendo = useRef(false)
  // Declarada aqui y no junto a su efecto porque el manejador de popstate, mas
  // abajo, tiene que poder marcarla.
  const regionEncuadrada = useRef(undefined)
  useEffect(() => {
    if (!map) return
    const estado = () => ({
      center: [map.getCenter().lat, map.getCenter().lng],
      zoom: map.getZoom(),
      capas: capasActivas,
      filtros,
      base,
    })
    // Se EMPUJA solo lo que el usuario reconoce como "hice algo": capas,
    // filtros y mapa base, que son las tres cosas de las que depende este
    // efecto. La escritura de montaje va con replace --una entrada al cargar
    // dejaria un Atras que no saca del sitio-- y tampoco se empuja mientras se
    // repone un estado desde popstate, o cada Atras crearia una entrada nueva y
    // no se podria retroceder nunca.
    escribirURL(estado(), { push: montado.current && !reponiendo.current })
    montado.current = true
    reponiendo.current = false

    // El paneo sigue siendo replace: una entrada por arrastre convertiria el
    // boton Atras en inservible.
    const sync = () => {
      escribirURL(estado())
      // Segunda via para bajar la bandera. El setView de popstate dispara un
      // moveend asincrono, pero solo si la vista cambio de verdad: si el estado
      // repuesto difiere unicamente en el encuadre, este efecto no vuelve a
      // correr y sin esto la bandera se quedaria arriba bloqueando el siguiente
      // push legitimo.
      reponiendo.current = false
    }
    map.on('moveend', sync)
    return () => map.off('moveend', sync)
  }, [map, capasActivas, filtros, base])

  // Atras y Adelante reponen el estado en vez de sacar del sitio.
  useEffect(() => {
    if (!map) return
    const alVolver = () => {
      const e = leerURL()
      reponiendo.current = true
      // El encuadre exacto lo trae la propia URL, asi que la region se da por
      // encuadrada de antemano: sin esto, el efecto de fitBounds por region
      // veria un cambio de filtro y pisaria el setView de tres lineas mas
      // abajo, y volver atras dejaria un encuadre distinto del que se compartio.
      regionEncuadrada.current = e.filtros?.region ?? ''
      setCapasActivas(e.capas ?? CAPAS.filter((c) => c.porDefecto).map((c) => c.id))
      setFiltros(e.filtros ?? {})
      setBase(e.base ?? 'Claro')
      if (e.center) map.setView(e.center, e.zoom ?? map.getZoom(), { animate: false })
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [map])

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

  // useGeoJSON siempre devolvio `error` y NADIE lo consumia. El resultado era el
  // peor modo de fallo del visor y ademas silencioso: si incendios.geojson se
  // cortaba a medias, no salia ninguna pantalla de error --esa solo cubre el
  // manifest--, el panel derecho degradaba a «Enciende la capa», la fila de la
  // capa seguia mostrando su tamaño y el mapa quedaba vacio SIN DECIR NADA. Un
  // vecino concluye entonces que en su comuna no hubo incendios, que es una
  // afirmacion sobre el dato salida de un fallo de red.
  const errores = {
    incendios: incendios.error,
    oecv: oecv.error,
    puntos_standby: standby.error,
    rutas: rutas.error,
    redvial: redvial.error,
  }
  const reintentos = {
    incendios: incendios.reintentar,
    oecv: oecv.reintentar,
    puntos_standby: standby.reintentar,
    rutas: rutas.reintentar,
    redvial: redvial.reintentar,
  }

  // Aviso de descarga. Los dos unicos avisos de carga que existian
  // (PanelLateral y PanelIndicadores) viven DENTRO de los cajones, que en movil
  // nacen cerrados: el usuario miraba una banda verde y un mapa vacio mientras
  // bajaban varios MB. Este se ve desde el primer render, antes incluso de que
  // llegue el manifest.
  const descargando = !manifest || Object.values(cargando).some(Boolean)
  const nIncendios = manifest?.capas?.incendios?.features
  // El calificativo "investigados por la UAD" es obligatorio: sin el, la frase
  // contradice a PanelIndicadores, que declara que estos NO son la totalidad de
  // los incendios del pais. Y solo se enriquece mientras la capa de incendios
  // esta de verdad en vuelo: si esta apagada, anunciar su conteo seria falso.
  const textoDescarga =
    cargando.incendios && nIncendios != null
      ? `Descargando ${fmt.format(nIncendios)} incendios investigados por la UAD…`
      : 'Descargando los datos del mapa…'

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

  /**
   * Encuadra el mapa en una region (o en el pais entero con region vacia).
   *
   * INCONDICIONAL a proposito: no consulta `regionEncuadrada`, solo la
   * actualiza. Es lo que permite que el boton «Centrar el mapa en …» funcione
   * siempre, incluso cuando la bandera ya trae esa region -- que es justo el
   * estado en el que el efecto de abajo no puede hacer nada.
   *
   * Devuelve false si no pudo encuadrar (capa sin cargar, region desconocida o
   * ninguna feature en ella) y en ese caso NO marca la bandera, para que el
   * efecto lo reintente cuando lleguen los datos.
   */
  const encuadrarRegion = useCallback(
    (region) => {
      if (!map) return false
      if (!region) {
        const b = limitesDelManifest(manifest)
        if (b) map.fitBounds(b, { padding: [16, 16], animate: !menosMovimiento() })
        regionEncuadrada.current = ''
        return !!b
      }
      const fs = incendios.data?.features
      const codigo = tablas?.region?.indexOf(region)
      if (!fs || codigo == null || codigo < 0) return false
      const b = limitesDeRegion(fs, codigo)
      // Si ninguna feature cargada cae en la region, el mapa se queda quieto: un
      // fitBounds con bounds vacio lanza.
      if (b) map.fitBounds(b, { padding: [16, 16], animate: !menosMovimiento() })
      regionEncuadrada.current = region
      return !!b
    },
    [map, manifest, incendios.data, tablas],
  )

  // Encuadre al cambiar de region. Sin esto, elegir "Biobío" dejaba el mapa
  // mostrando Chile entero con menos puntos encima, y la reaccion natural de
  // quien lo hace es "no pasó nada" o "se rompió".
  //
  // Depende de `filtros.region`, la CADENA, y nunca del objeto `filtros`, que
  // setFiltro recrea en cada llamada: con el objeto, cambiar de temporada o de
  // causa reencuadraria el mapa sin que nadie lo haya pedido.
  // (regionEncuadrada se declara mas arriba, junto a las banderas de la URL.)
  useEffect(() => {
    if (!map) return
    const region = filtros.region ?? ''

    // Primera ejecucion. Se SELLA la bandera solo en dos casos: cuando no hay
    // region que encuadrar, y cuando la URL trae su PROPIO encuadre, que hay
    // que reproducir tal cual -- esa es la razon de ser de esta guarda, porque
    // `inicial` se lee una sola vez al cargar el modulo y no hay una segunda
    // oportunidad de aplicarlo.
    //
    // Antes se sellaba SIEMPRE, y eso mataba el encuadre de cualquier enlace
    // que ya trajera region=: la bandera nacia valiendo "Biobío" antes de que
    // existieran el manifest y las features, y el corte por igualdad de la
    // linea siguiente no dejaba encuadrar nunca mas. Medido: ?region=Biobío,
    // ?region=Los Ríos y ?region=Antofagasta daban las tres el mismo centro
    // nacional que sin filtro. Y como al filtrar la region entra en la URL,
    // bastaba recargar --o abrir el enlace de «Compartir esta vista»-- para
    // caer ahi, sin ninguna salida: reelegir la misma opcion no emite change.
    if (regionEncuadrada.current === undefined) {
      if (!region || inicial.center) {
        regionEncuadrada.current = region
        return
      }
      // Con region= y sin encuadre propio se cae al camino normal de abajo. La
      // bandera sigue en undefined, asi que esta rama es idempotente: si los
      // datos aun no han llegado, la proxima pasada vuelve a entrar por aqui.
    }
    if (regionEncuadrada.current === region) return

    encuadrarRegion(region)
  }, [map, filtros.region, incendios.data, tablas, manifest, encuadrarRegion])
  const pasaStandby = useMemo(() => pasaPorCampos(['region']), [pasaPorCampos])

  // ---------- colores ----------
  const colorIncendio = useCallback(
    (p) => COLOR_CAUSA[decode('causa_grupo', p.causa_grupo)] ?? COLOR_CAUSA_OTRA,
    [decode],
  )
  const colorOECV = useCallback((p) => COLOR_OECV[p.tipo] ?? COLOR_OECV['Sin determinar'], [])

  // ---------- seleccion ----------
  // Cada capa traduce sus propiedades a una ficha; el modal solo pinta.
  //
  // Todas pasan por abrirFicha para dejar una marca SINCRONA de que hubo
  // acierto. La necesita la ruta de teclado: dispatchEvent y los manejadores de
  // Leaflet corren de forma sincrona, asi que al volver del despacho la bandera
  // ya dice si Enter encontro algo, sin tener que esperar a que React repinte.
  const acierto = useRef(false)
  const abrirFicha = useCallback((f) => {
    acierto.current = true
    setFicha(f)
  }, [])

  const selIncendio = useCallback(
    (p) => abrirFicha(fichaIncendio(p, decode, colorIncendio(p))),
    [abrirFicha, decode, colorIncendio],
  )
  const selOECV = useCallback((p) => abrirFicha(fichaOECV(p, colorOECV(p))), [abrirFicha, colorOECV])
  const selStandby = useCallback(
    (p) => abrirFicha(fichaStandBy(p, COLOR_STANDBY)),
    [abrirFicha],
  )
  const selRuta = useCallback(
    (p, etiqueta = 'Ruta de despliegue') => abrirFicha(fichaRuta(p, etiqueta, COLOR_RUTA)),
    [abrirFicha],
  )
  const selVial = useCallback(
    (p, etiqueta = 'Red vial MOP') => abrirFicha(fichaRuta(p, etiqueta, COLOR_REDVIAL)),
    [abrirFicha],
  )

  // Ruta de teclado hacia las fichas.
  //
  // Las 14.705 figuras de incendio, las 1.863 lineas OECV y los 327 puntos
  // stand-by NO son elementos del DOM: se pintan en un unico <canvas> y la
  // seleccion colgaba EXCLUSIVAMENTE del evento click de raton. Numero de
  // incendio, temporada, comuna, causa y superficie eran inalcanzables sin
  // raton ni dedo, y ninguna TablaKpi lo cubre porque esas exponen agregados
  // del panel, no atributos de las figuras. Es un fallo de WCAG 2.1.1, nivel A:
  // el organismo publica un dato que le niega a una clase de ciudadanos.
  const [avisoMapa, setAvisoMapa] = useState('')
  useEffect(() => {
    if (!map) return
    const cont = map.getContainer()
    const alPulsar = (e) => {
      // Solo con el foco en el mapa: si esta en un boton de zoom, el target es
      // ese <a> y Enter tiene que seguir activandolo.
      if (e.key !== 'Enter' || e.target !== cont) return
      e.preventDefault()
      const centro = map.getCenter()
      const punto = map.latLngToContainerPoint(centro)
      const caja = cont.getBoundingClientRect()
      const opciones = {
        clientX: caja.left + punto.x,
        clientY: caja.top + punto.y,
        bubbles: true,
        cancelable: true,
        view: window,
      }

      acierto.current = false
      // El <canvas> del renderer solo existe cuando hay alguna capa VECTORIAL
      // montada -- Leaflet lo añade al entrar el primer path --, asi que con
      // unicamente capas PMTiles encendidas, o antes de que lleguen los datos,
      // esta consulta devuelve null y sin la guarda esto reventaria.
      const lienzo = map.getPane('overlayPane')?.querySelector('canvas')
      if (lienzo) {
        // Se despacha el MISMO evento que emitiria el raton y Leaflet hace todo
        // lo demas: Canvas._onClick recorre las figuras, resuelve el acierto
        // con la tolerancia del renderer (la de acceso-3, que _clickTolerance
        // suma) y llama a _fireDOMEvent. Si no acierta ninguna, _findEventTargets
        // cae en [map] y el manejador de teselas de CapaTiles corre igual. No se
        // duplica una sola linea del codigo de seleccion.
        // ACOPLADO a las tripas de Leaflet: Canvas._onClick, el
        // _leaflet_disable_events del canvas (que evita que el mapa lo maneje
        // dos veces) y Keyboard._onMouseDown, mas abajo. Ninguna asercion de CI
        // cubre este camino.
        lienzo.dispatchEvent(new MouseEvent('click', opciones))
      } else {
        map.fire('click', {
          latlng: centro,
          containerPoint: punto,
          layerPoint: map.containerPointToLayerPoint(punto),
          originalEvent: new MouseEvent('click', opciones),
        })
      }

      // Al acertar, el <dialog> modal se anuncia solo al recibir el foco; lo
      // que no daba ninguna señal era fallar. (Dos fallos seguidos con el mismo
      // texto pueden no re-anunciarse: la region viva compara contenido.)
      setAvisoMapa(
        acierto.current
          ? ''
          : 'No hay ninguna figura en el centro del mapa. Desplázalo con las flechas y vuelve a pulsar Enter.',
      )
    }
    cont.addEventListener('keydown', alPulsar)
    return () => cont.removeEventListener('keydown', alPulsar)
  }, [map])
  const cerrarFicha = useCallback(() => setFicha(null), [])

  const setCuenta = useCallback(
    (id) => (n) => setCuentas((c) => (c[id] === n ? c : { ...c, [id]: n })),
    [],
  )

  // ---------- regimen ----------
  // matchMedia y no un listener de resize: se despierta solo al CRUZAR el corte,
  // no en cada pixel de un arrastre de ventana.
  useEffect(() => {
    const anclaKpi = window.matchMedia(`(min-width: ${CORTE_KPI + 1}px)`)
    const anclaPanel = window.matchMedia(`(min-width: ${CORTE_PANEL + 1}px)`)
    const al = () => setRegimen(anclaKpi.matches ? 1 : anclaPanel.matches ? 2 : 3)
    anclaKpi.addEventListener('change', al)
    anclaPanel.addEventListener('change', al)
    al()
    return () => {
      anclaKpi.removeEventListener('change', al)
      anclaPanel.removeEventListener('change', al)
    }
  }, [])

  // Al pasar a cajon se cierra; al volver a anclado se restaura lo que habia.
  // Se salta el primer render, que ya nacio coherente, o restauraria en el
  // montaje algo que el usuario no ha pedido todavia.
  const primerRegimen = useRef(true)
  useEffect(() => {
    if (primerRegimen.current) {
      primerRegimen.current = false
      return
    }
    setPanelVisible(panelAnclado && disposicion.panel)
    setKpiVisible(kpiAnclado && disposicion.kpi)
  }, [panelAnclado, kpiAnclado])

  // ---------- mostrar y ocultar ----------
  // Abrir y cerrar un CAJON no es una preferencia de disposicion: solo se
  // recuerda lo que se elige con el panel anclado.
  const mostrarPanel = useCallback(
    (v) => {
      setPanelVisible(v)
      if (panelAnclado) {
        disposicion.panel = v
        guardarDisposicion(disposicion)
      }
    },
    [panelAnclado],
  )
  const mostrarKpi = useCallback(
    (v) => {
      setKpiVisible(v)
      if (kpiAnclado) {
        disposicion.kpi = v
        guardarDisposicion(disposicion)
      }
    },
    [kpiAnclado],
  )

  // Ocultar un panel devuelve el foco al boton que lo recupera. Sin esto el foco
  // se queda dentro de un subarbol que acaba de volverse invisible y el
  // siguiente Tab reempieza desde el principio del documento.
  //
  // El foco NO se puede pedir en el mismo manejador: el boton esta display:none
  // hasta que React aplica la clase .sin-panel, y focus() sobre un elemento sin
  // caja no hace nada. Por eso se apunta a quien enfocar y se hace en un efecto,
  // que corre despues de que el DOM este actualizado.
  const btnPanel = useRef(null)
  const btnKpi = useRef(null)
  const aEnfocar = useRef(null)
  useEffect(() => {
    if (!aEnfocar.current) return
    const boton = aEnfocar.current === 'panel' ? btnPanel.current : btnKpi.current
    aEnfocar.current = null
    boton?.focus()
  }, [panelVisible, kpiVisible])

  const cerrarPanel = useCallback(() => {
    aEnfocar.current = 'panel'
    mostrarPanel(false)
  }, [mostrarPanel])
  const cerrarKpi = useCallback(() => {
    aEnfocar.current = 'kpi'
    mostrarKpi(false)
  }, [mostrarKpi])

  // Escape solo cierra CAJONES. Anclado, plegar un panel no es «salir» de nada y
  // hacerlo con Escape seria una sorpresa: el mapa se reordenaria bajo el cursor
  // al pulsar una tecla que el usuario asocia a cancelar.
  useEffect(() => {
    const hayCajonAbierto = (!panelAnclado && panelVisible) || (!kpiAnclado && kpiVisible)
    if (!hayCajonAbierto) return
    const alPulsar = (e) => {
      if (e.key !== 'Escape') return
      // ModalFicha es un <dialog> modal: el navegador ya cierra con Escape y su
      // keydown burbujea hasta aqui. Sin esta guarda, un Escape cerraria la
      // ficha Y el cajon de debajo de una vez.
      if (document.querySelector('dialog[open]')) return
      if (!kpiAnclado && kpiVisible) cerrarKpi()
      else cerrarPanel()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [panelAnclado, kpiAnclado, panelVisible, kpiVisible, cerrarPanel, cerrarKpi])

  // ---------- ancho del panel ----------
  // El ancho de ventana entra como ESTADO y no se lee en el render: `regimen`
  // solo cambia al cruzar un corte, asi que estirar la ventana de 1300 a 1900
  // dejaria el techo del tirador congelado en el valor de 1300.
  const [anchoVentana, setAnchoVentana] = useState(() => window.innerWidth)
  useEffect(() => {
    let pendiente = 0
    const al = () => {
      cancelAnimationFrame(pendiente)
      pendiente = requestAnimationFrame(() => setAnchoVentana(window.innerWidth))
    }
    window.addEventListener('resize', al)
    return () => {
      cancelAnimationFrame(pendiente)
      window.removeEventListener('resize', al)
    }
  }, [])

  // El techo es DINAMICO y no MAX_PANEL a secas: con los dos paneles anclados a
  // 1201 px, 560 de panel dejarian 321 px de mapa. Acotarlo aqui es lo que hace
  // que el tirador no pueda violar el suelo que la asercion B4 comprueba.
  const maxPanel = Math.max(
    MIN_PANEL,
    Math.min(MAX_PANEL, anchoVentana - MIN_MAPA - (kpiAnclado && kpiVisible ? ANCHO_KPI : 0)),
  )

  const cambiarAncho = useCallback(
    (px) => {
      const v = Math.round(Math.min(maxPanel, Math.max(MIN_PANEL, px)))
      setAnchoPanel(v)
      disposicion.ancho = v
      guardarDisposicion(disposicion)
    },
    [maxPanel],
  )

  // Al encoger la ventana el techo baja, y un ancho guardado mayor dejaria el
  // mapa por debajo de su suelo sin que nadie haya tocado el tirador.
  useEffect(() => {
    setAnchoPanel((a) => Math.min(a, maxPanel))
  }, [maxPanel])

  const toggleCapa = (id) =>
    setCapasActivas((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]))

  const setFiltro = (campo, valor) =>
    setFiltros((f) => {
      const n = { ...f }
      if (valor) n[campo] = valor
      else delete n[campo]
      return n
    })

  // Sin <Banner/> a proposito: la pantalla de error no debe depender de que
  // cargue una imagen (§9 de INSUMO_GRAFICO/implementacion_banner.md). NO lo
  // subas a main.jsx por encima de <App/> para "no duplicarlo": la asercion
  // A10 de scripts/verify-banner.mjs comprueba que este arbol no lo lleva.
  if (error) {
    return (
      <div className="error">
        <h1>No pudimos cargar los datos del visor</h1>
        <p>Puede ser tu conexión o una actualización en curso. Vuelve a intentarlo en unos minutos.</p>
        <button className="reintentar" onClick={() => location.reload()}>
          Reintentar
        </button>
        {/* El mensaje tecnico deja de ser lo primero que lee un ciudadano, pero
            no se pierde: sigue estando a un clic para quien lo necesite. */}
        <details>
          <summary>Detalle técnico</summary>
          <p>{String(error.message)}</p>
        </details>
        {/* Instruccion para quien tiene el repo delante, no para el publico:
            nadie que abra el sitio publicado puede ejecutar esto. */}
        {import.meta.env.DEV && (
          <p>
            En local, genera las capas con <code>python ETL/run.py</code> y recarga.
          </p>
        )}
      </div>
    )
  }

  const metaRutas = capaMeta('rutas')
  const metaRedvial = capaMeta('redvial')

  // Un solo juego de props para el panel de indicadores: lo pinta la barra
  // derecha Y lo reutiliza el informe, que lo renderiza a markup. Describirlas
  // dos veces era la via mas corta a que el PDF y la pantalla divergieran.
  const propsIndicadores = {
    manifest,
    kpis,
    incendios: incendios.data,
    oecv: oecv.data,
    filtros,
    capasActivas,
    pasaIncendio,
    onToggleCapa: toggleCapa,
    cargando,
  }

  // data-regimen lo publica JS para que la verificacion pueda comprobar que
  // coincide con el numero de pistas que resuelve el CSS: los cortes viven en
  // los dos sitios y esa duplicacion es la que B12 vigila.
  const clases = [
    'app',
    panelVisible ? '' : 'sin-panel',
    kpiVisible ? '' : 'sin-kpi',
    redimensionando ? 'redimensionando' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={clases}
      data-regimen={regimen}
      // La variable en linea SOLO cuando el panel se ve. Plegarlo es cosa de la
      // clase .sin-panel, y un estilo en linea le ganaria siempre en
      // especificidad: escribir aqui '0px' y dejar que el CSS lo repita seria
      // duplicar la regla; escribir el ancho y esperar que la clase lo pise, un
      // error silencioso.
      style={panelVisible ? { '--pista-panel': `${anchoPanel}px` } : undefined}
    >
      <Banner />

      {/* aria-expanded y aria-controls, que .abrir-kpi ya tenia y este no. */}
      <button
        ref={btnPanel}
        className="abrir"
        onClick={() => mostrarPanel(true)}
        aria-label="Abrir capas y filtros"
        aria-expanded={panelVisible}
        aria-controls="panel-control"
      >
        ☰
      </button>

      <PanelLateral
        manifest={manifest}
        capasActivas={capasActivas}
        onToggleCapa={toggleCapa}
        filtros={filtros}
        onFiltro={setFiltro}
        onLimpiar={() => setFiltros({})}
        cuentas={cuentas}
        cargando={cargando}
        errores={errores}
        onReintentar={(id) => reintentos[id]?.()}
        onEncuadrarRegion={encuadrarRegion}
        base={base}
        onBase={setBase}
        basemaps={BASEMAPS}
        abierto={panelVisible}
        onCerrar={cerrarPanel}
      >
        <SeccionDescargas
          manifest={manifest}
          filtros={filtros}
          capasActivas={capasActivas}
          datos={{ incendios: incendios.data, oecv: oecv.data, puntos_standby: standby.data }}
          predicados={{ incendios: pasaIncendio, oecv: pasaOECV, puntos_standby: pasaStandby }}
          map={map}
          base={base}
          propsIndicadores={propsIndicadores}
        />
      </PanelLateral>

      {/* Hermano del panel y no hijo suyo: .panel scrollea, y dentro quedaba
          recortado por su overflow y se iba con el scroll. Ver .tirador en
          App.css. */}
      <Tirador
        ancho={anchoPanel}
        min={MIN_PANEL}
        max={maxPanel}
        onAncho={cambiarAncho}
        onArrastre={setRedimensionando}
      />

      {/* <main> y no <div>: el elemento mas grande de la pantalla no tenia
          landmark ni nombre, asi que no habia salto rapido al contenido y
          Leaflet le pone tabIndex 0 -- un destino de tabulacion que el lector
          anunciaba como «grupo, en blanco».
          <header class="banner"> sigue siendo el landmark banner porque es
          HERMANO de este <main>, no descendiente. No se añade <nav>: no hay
          navegacion que marcar. */}
      <main
        className="mapa"
        ref={contenedor}
        aria-label="Mapa de incendios forestales ya investigados"
        aria-describedby="mapa-ayuda"
      />

      {/* Punto de mira: marca DONDE va a mirar Enter. Solo aparece con el mapa
          enfocado por teclado -- ver el comentario de .mira en App.css. */}
      <div className="mira" aria-hidden="true" />

      {/* Fuera del contenedor del mapa a proposito: Leaflet gestiona los hijos
          de .mapa y meter ahi un nodo de React es pedir que uno pise al otro.
          aria-describedby resuelve por id, no por parentesco. */}
      <p id="mapa-ayuda" className="solo-lectores">
        Usa las flechas para desplazar el mapa, las teclas más y menos para acercar y alejar, Enter
        para abrir la ficha de la figura que quede en el centro, y Escape para soltar el foco.
      </p>

      <p className="solo-lectores" aria-live="polite">
        {avisoMapa}
      </p>

      {descargando && (
        <p className="descargando" role="status">
          {textoDescarga}
        </p>
      )}

      {/* Fixed, no item de la rejilla: ver el comentario de .cartel en App.css.
          Los dos botones de navegacion tambien lo descartan, porque con los
          paneles anclados (>1200 px) abrirlos no cambia nada visible y el
          cartel se quedaria en pantalla como si el boton no funcionara. */}
      {cartelVisible && (
        <CartelContexto
          manifest={manifest}
          capasActivas={capasActivas}
          onAbrirPanel={() => {
            mostrarPanel(true)
            setCartelVisible(false)
          }}
          onAbrirKpi={() => {
            mostrarKpi(true)
            setCartelVisible(false)
          }}
          onCerrar={() => setCartelVisible(false)}
        />
      )}

      {/* DESPUES de .mapa a proposito: la rejilla coloca por orden del DOM y
          esta es la tercera columna. Los Capa* de abajo devuelven null y no
          ocupan celda, y ModalFicha es un <dialog> que vive en la top layer. */}
      <div className="funda-kpi">
        <PanelIndicadores {...propsIndicadores} abierto={kpiVisible} onCerrar={cerrarKpi} />
      </div>

      <button
        ref={btnKpi}
        className="abrir-kpi"
        onClick={() => mostrarKpi(true)}
        aria-label="Abrir indicadores"
        aria-expanded={kpiVisible}
        aria-controls="panel-indicadores"
      >
        <IconoIndicadores />
      </button>

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
            onSeleccion={selVial}
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
            etiqueta="Red vial MOP"
            onSeleccion={selVial}
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
            onSeleccion={selRuta}
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
            etiqueta="Ruta de despliegue"
            onSeleccion={selRuta}
          />
        ))}

      <CapaLineas
        map={map}
        data={oecv.data}
        visible={activa('oecv')}
        pasa={pasaOECV}
        color={colorOECV}
        weight={3}
        onSeleccion={selOECV}
        onCuenta={setCuenta('oecv')}
      />

      <CapaPuntos
        map={map}
        data={standby.data}
        visible={activa('puntos_standby')}
        pasa={pasaStandby}
        color={COLOR_STANDBY}
        radio={5}
        onSeleccion={selStandby}
        onCuenta={setCuenta('puntos_standby')}
      />

      <CapaPuntos
        map={map}
        data={incendios.data}
        visible={activa('incendios')}
        pasa={pasaIncendio}
        color={colorIncendio}
        onSeleccion={selIncendio}
        onCuenta={setCuenta('incendios')}
      />

      <ModalFicha ficha={ficha} onCerrar={cerrarFicha} />
    </div>
  )
}
