// Vista publicada de incendios por lineas electricas (lineas-electricas.html).
//
// Pagina independiente del visor: sin React, un solo modulo que lee el
// manifest, baja derivados.lineas_electricas y pinta mapa y paneles. El
// contrato DOM que lee el arnes (ids y data-*) esta fijado de antemano; los
// nombres de este archivo lo siguen al pie de la letra.

// ORDEN DE IMPORTS CON CONSECUENCIAS: leaflet-global primero, porque los dos
// plugins se cuelgan del `L` global al evaluarse (ver leaflet-global.js).
import L from './leaflet-global.js'
import 'leaflet.markercluster'
import 'leaflet.heat'
// El CSS de Leaflet ANTES que el nuestro para que nuestros overrides ganen.
// Solo MarkerCluster.css (animaciones), no MarkerCluster.Default.css: sus
// cumulos verde-amarillo-naranja se confundirian con la paleta de subcausas.
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import './electrico.css'

import { BASEMAPS, CAPAS, DATA, NO_ACTIVOS, fechaLarga, fmt, fmt1 } from '../config.js'
import {
  CAMPO,
  VENTANA,
  comunas,
  fechaDMA,
  filtrar,
  histograma,
  leyenda,
  maxCelda,
  rangoTemporadas,
  ranking,
  regiones,
  resumen,
} from './calculos.js'
import {
  BASE_POR_OMISION,
  COLOR_CONTORNO,
  COLOR_RESPALDO,
  COLOR_SUBCAUSA,
  GRADIENTE_CALOR,
  PRESETS_CALOR,
} from './paleta.js'

const $ = (id) => document.getElementById(id)
const fmt2 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
// Porcentaje de la ventana SIEMPRE con un decimal ("53,0 %" y no "53 %"): es
// el mismo numero que data-pct, que se fija con toFixed(1).
const fmtPct = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Crea un elemento. Los hijos de texto van SIEMPRE como nodos de texto, nunca
 * como HTML: los textos del Excel (nombres de incendio, comunas) no se
 * interpretan, asi que una comuna con «<» no rompe ni inyecta nada.
 */
function el(tag, attrs = {}, hijos = []) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') n.className = v
    else if (k === 'style') Object.assign(n.style, v)
    else n.setAttribute(k, String(v))
  }
  for (const h of [].concat(hijos)) {
    if (h === null || h === undefined || h === false) continue
    n.append(h instanceof Node ? h : document.createTextNode(String(h)))
  }
  return n
}

// El aviso va ANTES de cargar nada: tiene que estar tambien en la pantalla de
// error y mientras carga. La copia es la canonica de src/config.js, y la
// explicacion es la `descripcion` de la capa de incendios del visor, no una
// tercera redaccion.
{
  const descripcion = CAPAS.find((c) => c.id === 'incendios')?.descripcion
  $('aviso-activos').replaceChildren(
    el('strong', {}, `${NO_ACTIVOS}.`),
    descripcion ? ` ${descripcion}.` : '',
  )
}

function mostrarError(error) {
  $('app').dataset.estado = 'error'
  $('cargando').hidden = true
  $('error').querySelector('.motivo').textContent = error?.message ?? String(error)
  $('error').hidden = false
  console.error(error)
}

async function cargar() {
  const r = await fetch(`${DATA}/manifest.json`)
  if (!r.ok) throw new Error(`manifest.json respondió HTTP ${r.status}.`)
  const manifest = await r.json()
  const meta = manifest?.derivados?.lineas_electricas
  // Sin degradar en silencio: una vista que dibuja un mapa vacio parece decir
  // «no hubo incendios por lineas electricas», que es falso.
  if (!meta?.archivo) {
    throw new Error(
      'El manifest no declara derivados.lineas_electricas.archivo: la capa de incendios por líneas eléctricas no está publicada.',
    )
  }
  const faltan = Object.values(CAMPO).filter((c) => !meta.columnas?.includes(c))
  if (faltan.length) {
    throw new Error(`El manifest no declara las columnas ${faltan.join(', ')}.`)
  }
  if (!Number.isInteger(meta.sin_coordenadas?.n)) {
    throw new Error('El manifest no declara cuántos incendios quedaron sin coordenadas.')
  }
  const r2 = await fetch(`${DATA}/${meta.archivo}`)
  if (!r2.ok) throw new Error(`${meta.archivo} respondió HTTP ${r2.status}.`)
  const gj = await r2.json()
  if (!Array.isArray(gj?.features)) throw new Error(`${meta.archivo} no es una FeatureCollection.`)
  return { manifest, meta, features: gj.features }
}

// ---------------------------------------------------------------------------

function iniciar({ manifest, meta, features }) {
  const colorDe = (codigo) => COLOR_SUBCAUSA[codigo] ?? COLOR_RESPALDO

  // ---- textos que salen del manifest ----
  $('titulo').textContent = meta.titulo ?? 'Incendios por líneas eléctricas'
  document.title = `${meta.titulo ?? 'Incendios por líneas eléctricas'} — CONAF`
  if (meta.filtro) {
    $('bajada').textContent =
      `Incendios forestales investigados por las UAD cuya «${meta.filtro.campo}» es «${meta.filtro.valor}»: ` +
      'dónde se concentraron, de qué subcausa fueron y a qué hora comenzaron.'
  }
  const fecha = fechaLarga(manifest.generado)
  $('pie').replaceChildren(
    fecha ? `Datos al ${fecha}. ` : '',
    meta.fuente ? `Fuente: ${meta.fuente}.` : '',
  )

  // ---- selector de region ----
  const opcionesRegion = regiones(features, meta.sin_coordenadas.por_region)
  const selRegion = $('region')
  for (const r of opcionesRegion) selRegion.append(el('option', { value: r }, r))
  const pedida = new URL(location.href).searchParams.get('region') ?? ''
  const regionInicial = opcionesRegion.includes(pedida) ? pedida : ''

  // ---- mapa ----
  // preferCanvas: un solo renderer de canvas para TODAS las capas vectoriales
  // (puntos, circulos comunales, patas del spiderfy). Ninguna capa declara
  // `renderer` ni `pane`: con un canvas por capa solo la de encima recibe los
  // clics, y un pane propio crea otro renderer aunque no se escriba la palabra
  // (DECISIONES.md §H).
  const map = L.map('map', { preferCanvas: true, zoomControl: false, minZoom: 3 })
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map)

  const mapaEl = $('map')
  map.on('moveend', () => {
    const b = map.getBounds()
    mapaEl.dataset.encuadre = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
      .map((v) => v.toFixed(4))
      .join(',')
  })

  // Relleno del encuadre: en escritorio los paneles flotan SOBRE el mapa, y un
  // fitBounds sin descontarlos esconde la region bajo ellos.
  const relleno = () => {
    const m = mapaEl.getBoundingClientRect()
    // 8 px arriba y abajo, no 24: a 1440x900 los puntos de Chile (-27,3 a
    // -52,9) miden 767 px de alto a z5 y el mapa tiene 795; con 24+24 de
    // relleno el encuadre caia a z4 y el pais quedaba de la mitad.
    const tl = [24, 8]
    const br = [24, 8]
    const flota = (e) => getComputedStyle(e).position === 'absolute'
    const izq = $('panel-izq')
    const der = $('panel-der')
    if (flota(izq)) tl[0] = Math.max(24, izq.getBoundingClientRect().right - m.left + 16)
    if (flota(der)) br[0] = Math.max(24, m.right - der.getBoundingClientRect().left + 16)
    // Con menos de 200 px utiles el encuadre degenera a zoom minimo: mejor
    // tapar un borde que perder la region entera.
    if (m.width - tl[0] - br[0] < 200) {
      tl[0] = 24
      br[0] = 24
    }
    return { paddingTopLeft: tl, paddingBottomRight: br }
  }

  let ambito = []
  const encuadrar = () => {
    const base = ambito.length ? ambito : features
    if (!base.length) return
    const b = L.latLngBounds(base.map((f) => [f.properties.lat, f.properties.lon]))
    // maxZoom 12: una region con un solo punto (Magallanes) daria un bbox de
    // area cero y Leaflet encuadraria al zoom maximo, sin contexto alrededor.
    map.fitBounds(b, { ...relleno(), maxZoom: 12, animate: false })
  }

  // ---- mapa base ----
  const selBase = $('base')
  for (const clave of Object.keys(BASEMAPS)) selBase.append(el('option', { value: clave }, clave))
  selBase.value = BASE_POR_OMISION
  let capaBase = null
  const ponerBase = (clave) => {
    const cfg = BASEMAPS[clave] ?? BASEMAPS[BASE_POR_OMISION]
    if (capaBase) map.removeLayer(capaBase)
    capaBase = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      // Medido contra /tilemap en config.js: por encima, Leaflet estira la
      // ultima tesela real en vez de mostrar el cartel gris de Esri.
      maxNativeZoom: cfg.maxNativeZoom,
    }).addTo(map)
    capaBase.bringToBack()
    // Las dos imagenes tienen fecha y un mapa dibujado no. Sentinel-2 la trae
    // escrita en config.js. La de Esri World Imagery cambia escena a escena y
    // el visor la consulta a un servicio para el centro de la vista; aqui no
    // se duplica esa consulta (vive en un hook de React), pero tampoco se calla.
    const f = cfg.fecha
    const nota = $('base-nota')
    nota.hidden = !f
    if (f?.tipo === 'fijo') nota.textContent = f.texto
    else if (f?.tipo === 'esri') {
      nota.textContent =
        'Mosaico de imágenes de fechas distintas. Esta vista no consulta la fecha de captura; el visor de prevención la informa para el centro del mapa.'
    }
  }
  selBase.addEventListener('change', () => ponerBase(selBase.value))

  // ---- popups ----
  // El autoPan de Leaflet solo conoce el borde del mapa, no los paneles que
  // flotan encima: un popup junto al borde izquierdo se abria con media ficha
  // debajo del panel (visto en la captura de la RM a z12). El relleno se lee
  // AL HACER CLIC, porque depende del ancho de ventana y del regimen: el
  // oyente se registra ANTES que bindPopup y Leaflet dispara los oyentes en
  // orden de registro, asi que las opciones ya estan puestas cuando el popup
  // se abre y calcula el desplazamiento.
  const enlazarPopup = (capa, construir, opciones = {}) => {
    capa.on('click', () => {
      const r = relleno()
      Object.assign(capa.getPopup().options, {
        autoPanPaddingTopLeft: [r.paddingTopLeft[0], 12],
        autoPanPaddingBottomRight: [r.paddingBottomRight[0], 12],
      })
    })
    return capa.bindPopup(construir, opciones)
  }

  // ---- puntos ----
  // Un marcador por incendio, creado una vez. El popup se construye al abrirse
  // (funcion), no los 1.248 por adelantado.
  const marcadorDe = new Map()
  for (const f of features) {
    const p = f.properties
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 6,
      color: COLOR_CONTORNO,
      weight: 1.5,
      fillColor: colorDe(p[CAMPO.codigo]),
      fillOpacity: 0.95,
    })
    enlazarPopup(m, () => popupIncendio(p), { maxWidth: 320, minWidth: 220 })
    marcadorDe.set(f, m)
  }

  const iconoCumulo = (cumulo) => {
    const n = cumulo.getChildCount()
    const [clase, lado] = n < 10 ? ['chico', 30] : n < 100 ? ['medio', 38] : ['grande', 46]
    // `n` es un entero que cuenta Leaflet, no texto del Excel: puede ir como html.
    return L.divIcon({
      html: `<div><span>${n}</span></div>`,
      className: `marker-cluster cumulo-${clase}`,
      iconSize: L.point(lado, lado),
    })
  }
  const grupo = L.markerClusterGroup({
    // 30 y no los 45 de la referencia: con 45, en la Metropolitana a z9 los 195
    // puntos quedaban en 26 cumulos grafito y apenas cuatro puntos sueltos, o
    // sea casi ningun color de subcausa a la vista (visto en la captura).
    maxClusterRadius: 30,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: iconoCumulo,
  })

  // ---- circulos comunales ----
  const capaComunas = L.layerGroup()

  // ---- calor ----
  // maxZoom: 0 A PROPOSITO. leaflet.heat pesa cada punto por
  // 1/2^(maxZoom - zoom): con el maxZoom 14 de la referencia, a zoom nacional
  // (4-5) cada incendio vale 1/512 y el calor sale casi invisible. Con 0 el
  // exponente se recorta a 0 y cada incendio vale 1 a cualquier zoom; lo que
  // cambia con el zoom es la densidad por pixel, y eso lo absorbe `max`, que se
  // recalcula en cada zoomend con la celda mas cargada del ambito.
  let intensidad = Number($('heat-intensity').value) || 2
  let puntosCalor = []
  const opcionesCalor = () => {
    const preset = PRESETS_CALOR[intensidad] ?? PRESETS_CALOR[2]
    const z = map.getZoom()
    // A zoom nacional Chile mide ~60-100 px de ancho: un radio de 28 px
    // desbordaria el pais entero hacia el mar. Se escala hasta 0,5 por debajo
    // de z9 (a z5 queda en la mitad).
    const escala = Math.min(1, Math.max(0.8, (z - 1) / 8))
    const radius = Math.max(4, Math.round(preset.radius * escala))
    const blur = Math.max(3, Math.round(preset.blur * escala))
    const celda = (radius + blur) / 2
    const pix = puntosCalor.map((ll) => {
      const q = map.project(ll, z)
      return [q.x, q.y]
    })
    const max = Math.max(1, maxCelda(pix, celda)) * preset.factor
    return { radius, blur, max }
  }
  const calor = L.heatLayer([], {
    maxZoom: 0,
    minOpacity: 0.35,
    gradient: GRADIENTE_CALOR,
  })
  const actualizarCalor = () => {
    // Solo con la capa en el mapa: leaflet.heat redibuja en setOptions y
    // setLatLngs, y fuera del mapa eso lanza (su _map ya es null). Al volver a
    // encenderla se llama de nuevo.
    if (!map.hasLayer(calor)) return
    calor.setOptions(opcionesCalor())
    calor.setLatLngs(puntosCalor)
  }
  map.on('zoomend', actualizarCalor)

  // ---- controles de capas ----
  const tHeat = $('toggle-heat')
  const tPoints = $('toggle-points')
  const tComunas = $('toggle-comunas')
  tHeat.addEventListener('change', () => {
    if (tHeat.checked) {
      calor.addTo(map)
      actualizarCalor()
    } else map.removeLayer(calor)
  })
  tPoints.addEventListener('change', () => {
    if (tPoints.checked) grupo.addTo(map)
    else map.removeLayer(grupo)
  })
  tComunas.addEventListener('change', () => {
    if (tComunas.checked) capaComunas.addTo(map)
    else map.removeLayer(capaComunas)
  })
  // El deslizador NO reconstruye la capa: setOptions sobre la misma. Una capa
  // nueva volveria a anadir su canvas al final del overlayPane.
  $('heat-intensity').addEventListener('input', (e) => {
    intensidad = Number(e.target.value) || 2
    actualizarCalor()
  })

  // ---- paneles ----
  const pintarResumen = (region) => {
    const s = resumen(ambito)
    $('titulo-resumen').textContent = `Resumen · ${region || 'Todo el país'}`
    const poner = (id, valor, texto) => {
      $(id).dataset.valor = String(valor)
      $(id).textContent = texto
    }
    poner('stat-total', s.total, fmt.format(s.total))
    poner('stat-comunas', s.comunas, fmt.format(s.comunas))
    poner('stat-ha', s.ha, fmt1.format(s.ha))
    const t = rangoTemporadas(ambito)
    $('stat-total-label').textContent =
      `incendios con coordenadas` +
      (t ? (t.primera === t.ultima ? ` (temporada ${t.primera})` : ` (temporadas ${t.primera} a ${t.ultima})`) : '')

    const sc = meta.sin_coordenadas
    const n = region ? (sc.por_region?.[region] ?? 0) : sc.n
    const aviso = $('aviso-sin-coord')
    aviso.dataset.n = String(n)
    aviso.classList.toggle('sin-faltantes', n === 0)
    aviso.textContent =
      n === 0
        ? 'Todos los incendios de esta causa en este ámbito tienen coordenadas.'
        : `${fmt.format(n)} ${n === 1 ? 'incendio' : 'incendios'} de esta causa no ${n === 1 ? 'tiene' : 'tienen'} coordenadas: no ${n === 1 ? 'aparece' : 'aparecen'} en el mapa ni en estas cifras.`
  }

  const pintarRanking = () => {
    const top = ranking(ambito)
    const lista = $('rank-list')
    if (!top.length) {
      lista.replaceChildren(el('p', { class: 'nota' }, 'No hay comunas con registro en este ámbito.'))
      return
    }
    const max = top[0].n
    lista.replaceChildren(
      ...top.map((g) => {
        const fila = el('button', { type: 'button', class: 'rank-item', 'data-clave': g.clave, 'data-n': g.n }, [
          el('span', { class: 'rank-name' }, g.etiqueta),
          el('span', { class: 'rank-bar-wrap', 'aria-hidden': 'true' }, [
            el('span', { class: 'rank-bar', style: { width: `${(100 * g.n) / max}%` } }),
          ]),
          el('span', { class: 'rank-count' }, fmt.format(g.n)),
        ])
        fila.title = `${g.etiqueta}: ${fmt.format(g.n)} incendios`
        fila.addEventListener('click', () => map.setView([g.lat, g.lon], 12))
        return fila
      }),
    )
  }

  const pintarHorario = () => {
    const h = histograma(ambito)
    const max = Math.max(...h.barras)
    $('hourly-chart').replaceChildren(
      ...h.barras.map((n, hora) => {
        const dentro = hora >= VENTANA.desde && hora <= VENTANA.hasta
        const alto = max > 0 ? Math.max(n > 0 ? 3 : 1, Math.round((100 * n) / max)) : 1
        return el('div', { class: 'hbar-wrap', title: `${hora}:00–${hora}:59 · ${fmt.format(n)} incendios` }, [
          el('div', {
            class: dentro ? 'hbar in-window' : 'hbar',
            'data-hora': hora,
            'data-n': n,
            style: { height: `${alto}%` },
          }),
        ])
      }),
    )
    $('hourly-labels').replaceChildren(
      ...h.barras.map((_, hora) => el('span', {}, hora % 3 === 0 ? String(hora) : '')),
    )
    const c = $('window-callout')
    c.dataset.enVentana = String(h.enVentana)
    c.dataset.conHora = String(h.conHora)
    c.dataset.pct = h.pct
    const pct = fmtPct.format(Number(h.pct))
    c.replaceChildren(
      ...(h.conHora
        ? [
            el('b', {}, `${pct} %`),
            ` (${fmt.format(h.enVentana)} de ${fmt.format(h.conHora)} con hora registrada) comenzaron dentro de la ventana `,
            el('b', {}, '13:00–17:59 h'),
            '.',
          ]
        : ['No hay horas de inicio en este ámbito: 0 de 0 con hora registrada.']),
      h.sinHora
        ? el(
            'span',
            { class: 'nota' },
            ` ${fmt.format(h.sinHora)} sin hora registrada no ${h.sinHora === 1 ? 'entra' : 'entran'} en el cálculo.`,
          )
        : '',
    )
  }

  const pintarLeyenda = () => {
    const items = leyenda(ambito, COLOR_SUBCAUSA, COLOR_RESPALDO)
    const hijos = []
    let familia = null
    for (const it of items) {
      if (it.familia !== familia) {
        familia = it.familia
        hijos.push(el('div', { class: 'legend-grupo' }, `${it.grupo ?? 'Sin grupo'} · ${familia}`))
      }
      hijos.push(
        el(
          'div',
          {
            class: 'legend-item',
            'data-codigo': it.codigo,
            'data-n': it.n,
            'data-color': it.color,
            'data-respaldo': it.respaldo ? '1' : null,
          },
          [
            el('span', { class: 'legend-dot', style: { background: it.color }, 'aria-hidden': 'true' }),
            el('span', { class: 'legend-texto' }, [
              el('span', { class: 'legend-codigo' }, it.codigo || 'sin código'),
              ' ',
              it.nombre ?? '',
              it.respaldo ? el('span', { class: 'nota' }, ' (código nuevo, sin color asignado)') : '',
            ]),
            el('span', { class: 'legend-n' }, fmt.format(it.n)),
          ],
        ),
      )
    }
    $('leyenda').replaceChildren(...hijos)
  }

  const reconstruirComunas = () => {
    capaComunas.clearLayers()
    const grupos = [...comunas(ambito).values()]
    const maxN = Math.max(1, ...grupos.map((g) => g.n))
    for (const g of grupos) {
      const c = L.circleMarker([g.lat, g.lon], {
        radius: 6 + 22 * Math.sqrt(g.n / maxN),
        color: '#141414',
        weight: 1.5,
        fillColor: '#ffffff',
        fillOpacity: 0.35,
      })
      enlazarPopup(c, () => popupComuna(g)).addTo(capaComunas)
    }
  }

  // ---- aplicar un ambito ----
  const aplicarRegion = (region, escribirURL) => {
    ambito = filtrar(features, region)
    puntosCalor = ambito.map((f) => [f.properties.lat, f.properties.lon])
    grupo.clearLayers()
    grupo.addLayers(ambito.map((f) => marcadorDe.get(f)))
    reconstruirComunas()
    pintarResumen(region)
    pintarRanking()
    pintarHorario()
    pintarLeyenda()
    encuadrar()
    actualizarCalor()
    if (escribirURL) {
      const u = new URL(location.href)
      if (region) u.searchParams.set('region', region)
      else u.searchParams.delete('region')
      history.replaceState(history.state, '', u)
    }
  }

  // Orden de arranque: primero el encuadre (MarkerClusterGroup exige que el
  // mapa ya tenga centro y zoom al anadirse), despues las capas.
  selRegion.value = regionInicial
  ambito = filtrar(features, regionInicial)
  encuadrar()
  ponerBase(BASE_POR_OMISION)
  if (tHeat.checked) calor.addTo(map)
  if (tPoints.checked) grupo.addTo(map)
  if (tComunas.checked) capaComunas.addTo(map)
  // Una ?region= que no existe se borra de la URL en vez de quedarse mintiendo.
  aplicarRegion(regionInicial, pedida !== regionInicial)
  selRegion.addEventListener('change', () => aplicarRegion(selRegion.value, true))
}

// ---------------------------------------------------------------------------
// Popups. Todo texto del Excel entra como nodo de texto (ver `el`).

function fila(etiqueta, valor) {
  return el('div', { class: 'popup-fila' }, [
    el('span', { class: 'popup-k' }, etiqueta),
    el('span', { class: 'popup-v' }, valor ?? 'sin dato'),
  ])
}

function popupIncendio(p) {
  const sup = p[CAMPO.superficie]
  return el('div', { class: 'popup-incendio', 'data-id': p[CAMPO.id], 'data-codigo': p[CAMPO.codigo] }, [
    el('div', { class: 'popup-titulo' }, `${p[CAMPO.comuna] ?? 'Comuna sin registro'} · ${p[CAMPO.region] ?? ''}`),
    fila('Inicio', [fechaDMA(p[CAMPO.fecha]) ?? 'sin fecha', p[CAMPO.hora] ? `${p[CAMPO.hora]} h` : 'sin hora'].join(' · ')),
    fila('Temporada', p[CAMPO.temporada]),
    fila('Subcausa', `${p[CAMPO.codigo] ?? ''} · ${p[CAMPO.subcausa] ?? ''}`),
    fila('Superficie', sup === null || sup === undefined ? null : `${fmt2.format(sup)} ha`),
    fila('Incendio', [p[CAMPO.incendio], p[CAMPO.nombre]].filter(Boolean).join(' · ') || null),
    fila('ID', p[CAMPO.id]),
  ])
}

function popupComuna(g) {
  return el('div', { class: 'popup-comuna', 'data-clave': g.clave }, [
    el('div', { class: 'popup-titulo' }, g.etiqueta),
    fila('Incendios', fmt.format(g.n)),
    fila('Superficie', `${fmt2.format(g.ha)} ha (acumulado)`),
  ])
}

cargar()
  .then((datos) => {
    iniciar(datos)
    $('cargando').hidden = true
    $('app').dataset.estado = 'listo'
  })
  .catch(mostrarError)
