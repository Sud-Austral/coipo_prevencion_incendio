/**
 * Verificacion visual del panel de indicadores.
 *
 *     npm run verify:panel [--construir] [--datos reales|ficticios] [--salida <dir>]
 *
 * Hermano de verify-banner.mjs y con su misma arquitectura (servidor propio,
 * Chrome por CDP, sondeo en vez de presupuesto de tiempo, laboratorio aparte
 * para decodificar PNG). Las aserciones se numeran B1..B9 para no chocar con
 * las A1..A10 de aquel.
 *
 * Comprueba tres familias de cosas:
 *
 *   GEOMETRIA  que la tercera columna no rompa la rejilla ni desborde. La mas
 *              importante es B3: el cajon derecho no puede deslizarse con
 *              translateX(100%) porque el desbordamiento hacia el final de
 *              linea SI es scrollable y hace caer A9 con el cajon cerrado.
 *
 *   ARITMETICA que lo PINTADO coincida con lo que dicen los datos. El script
 *              recalcula los valores con codigo propio, no importando
 *              src/indicadores.js: importarlo verificaria que una funcion es
 *              igual a si misma.
 *
 *   CAPTURAS   lo unico que juzga si esto se lee. Las aserciones no ven que dos
 *              rotulos se pisen ni que un naranjo vibre sobre fondo oscuro.
 *
 * DOS MODOS DE DATOS. frontend/public/data esta en .gitignore y el job de
 * verificacion hace sparse-checkout de `frontend` sin correr el ETL, asi que en
 * CI no hay capas. Con datos reales se afirman las cifras de produccion; con el
 * fixture, cifras calculadas a mano sobre 12 features. El modo se elige solo.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(RAIZ, 'dist')
const DATOS = join(RAIZ, 'public', 'data')
const BASE = '/coipo_prevencion_incendio/'

const args = process.argv.slice(2)
const SALIDA = args.includes('--salida') ? args[args.indexOf('--salida') + 1] : join(RAIZ, '.verificacion')
const MODO = args.includes('--datos')
  ? args[args.indexOf('--datos') + 1]
  : existsSync(join(DATOS, 'manifest.json'))
    ? 'reales'
    : 'ficticios'

const ALTO_VENTANA = 900
const ANCHO_KPI = 320
// A ambos lados de los dos cortes a proposito: los limites de breakpoint son
// donde se cuelan estos fallos.
const ANCHOS = [1920, 1440, 1366, 1201, 1200, 1165, 901, 900, 768, 390]
const CAJON = [1165, 768, 390] // anchos donde el panel derecho es cajon

const TILES = ['*basemaps.cartocdn.com*', '*tile.openstreetmap.org*', '*server.arcgisonline.com*']

// ---------------------------------------------------------------------------
// Fixture: 12 incendios con cifras que salen exactas a mano. Se usa en CI.
// ---------------------------------------------------------------------------
const TABLAS = {
  region: ['Biobío', 'Maule', "O'Higgins"],
  provincia: ['P1'],
  comuna: ['C1'],
  temporada: ['2023-2024', '2024-2025', '2025-2026'],
  causa_grupo: ['Negligentes', 'Intencionales', 'Accidentales', 'Naturales'],
  causa_general: ['Otras quemas', 'Incendios intencionales', 'Líneas eléctricas', 'Otras causas'],
  causa_especifica: ['Quema de basuras', 'Ataque incendiario', 'contacto o proximidad con el tendido eléctrico'],
}
// region, temporada, grupo, general, especifica, ha
const CRUDO = [
  [0, 0, 0, 0, 0, 10],
  [0, 1, 0, 0, 0, 20],
  [0, 2, 1, 1, 1, 30],
  [0, 2, 1, 1, 1, 40],
  [0, 2, 2, 2, 2, 500],
  [1, 0, 0, 0, 0, 5],
  [1, 1, 0, 3, 0, 15],
  [1, 2, 1, 1, 1, 25],
  [1, 2, 2, 2, 2, 300],
  [2, 0, 3, 3, 0, 1],
  [2, 1, 0, 0, 0, 4],
  [2, 2, 1, 1, 1, 50],
]
// Totales a mano: n=12, ha=1000. Evitables (negligentes 5 + intencionales 4)=9
// -> 75,0 %. Superficie evitable 10+20+30+40+5+15+25+4+50 = 199 -> 19,9 %.
// Electrico: n=2, 800 ha -> 16,7 % y 80,0 %, 400,0 ha por incendio.
const cuenta = (campo) => {
  const i = ['region', 'temporada', 'causa_grupo', 'causa_general', 'causa_especifica'].indexOf(campo)
  const m = new Map()
  for (const f of CRUDO) m.set(f[i], (m.get(f[i]) ?? 0) + 1)
  return [...m.entries()]
    .map(([k, n]) => ({ i: k, v: TABLAS[campo][k], n }))
    .sort((a, b) => b.n - a.n)
}

const FIXTURE = {
  'manifest.json': JSON.stringify({
    generado: '2026-01-01T00:00:00Z',
    kpis: 'kpis.json',
    capas: {
      incendios: {
        titulo: 'Incendios',
        formato: 'geojson',
        geometria: 'Point',
        archivo: 'incendios.geojson',
        features: CRUDO.length,
        bytes: 2048,
        bbox: [-73, -38, -72, -37],
        filtros: ['temporada', 'region', 'causa_grupo', 'causa_general'],
        tablas: TABLAS,
        dominios: {
          region: cuenta('region'),
          temporada: cuenta('temporada'),
          causa_grupo: cuenta('causa_grupo'),
          causa_general: cuenta('causa_general'),
          causa_especifica: cuenta('causa_especifica'),
        },
      },
      oecv: {
        titulo: 'OECV',
        formato: 'geojson',
        geometria: 'LineString',
        archivo: 'oecv.geojson',
        features: 3,
        bytes: 512,
        bbox: [-73, -38, -72, -37],
        longitud_km: 100,
        // 50/30/20 sobre 100 km: Biobio 50 %, Maule 30 %, O'Higgins 20 %.
        km_por_region: { Biobío: 50, Maule: 30, "O'Higgins": 20 },
        filtros: ['region', 'tipo', 'inst'],
        dominios: {
          region: [
            { v: 'Biobío', n: 1 },
            { v: 'Maule', n: 1 },
            { v: "O'Higgins", n: 1 },
          ],
          tipo: [{ v: 'Fiscal', n: 3 }],
          inst: [
            { v: 'CONAF', n: 2 },
            { v: 'Empresa eléctrica', n: 1 },
          ],
        },
      },
      puntos_standby: {
        titulo: 'Stand-by',
        formato: 'geojson',
        geometria: 'Point',
        archivo: 'puntos_standby.geojson',
        features: 2,
        bytes: 256,
        bbox: [-73, -38, -72, -37],
        filtros: ['region'],
        // Solo Biobio: Maule y O'Higgins quedan sin puntos, que es lo que el
        // indicador 8 debe delatar.
        dominios: { region: [{ v: 'Biobío', n: 2 }] },
      },
    },
  }),
  // Avance nacional 60/100 = 60,0 %. Biobio pendiente (falta 30), Maule al dia,
  // O'Higgins sin programa y sin clave `reportado`: los tres casos borde.
  'kpis.json': JSON.stringify({
    oecv: {
      km_planificados: 100,
      km_reportados: 60,
      avance_pct: 60,
      por_region: {
        Biobío: { Planificado: 50, CONAF: 20, reportado: 20 },
        Maule: { Planificado: 30, CONAF: 40, reportado: 40 },
        'O´Higgins': { Planificado: 0, FNDR: 0 },
      },
    },
  }),
  'incendios.geojson': JSON.stringify({
    type: 'FeatureCollection',
    features: CRUDO.map(([region, temporada, causa_grupo, causa_general, causa_especifica, superficie_ha], i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-72.5, -37.5] },
      properties: {
        id: i + 1,
        region,
        provincia: 0,
        comuna: 0,
        temporada,
        causa_grupo,
        causa_general,
        causa_especifica,
        superficie_ha,
        n_incendio: String(i + 1),
        nombre: `Incendio ${i + 1}`,
      },
    })),
  }),
  'oecv.geojson': JSON.stringify({
    type: 'FeatureCollection',
    features: [
      ['Biobío', 'CONAF', 50],
      ['Maule', 'CONAF', 30],
      ["O'Higgins", 'Empresa eléctrica', 20],
    ].map(([region, inst, longitud_km]) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-72.5, -37.5], [-72.4, -37.4]] },
      properties: { nombre: `OECV ${region}`, tipo: 'Fiscal', inst, region, longitud_km, grupo: 'G' },
    })),
  }),
  'puntos_standby.geojson': JSON.stringify({
    type: 'FeatureCollection',
    features: [1, 2].map((i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-72.5, -37.5] },
      properties: { nombre: `Punto ${i}`, region: 'Biobío', fuente: 'kmz' },
    })),
  }),
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.geojson': 'application/json',
}

function servidor() {
  const s = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let ruta = decodeURIComponent(url.pathname)
    if (!ruta.startsWith(BASE)) return void res.writeHead(404).end('fuera del base')
    ruta = ruta.slice(BASE.length) || 'index.html'
    if (ruta.endsWith('/')) ruta += 'index.html'

    // Las capas se sirven desde public/data y no desde dist/: asi el script no
    // depende de que el build las haya copiado, ni de que esten al dia.
    if (ruta.startsWith('data/')) {
      const nombre = ruta.slice(5)
      if (MODO === 'ficticios') {
        const cuerpo = FIXTURE[nombre]
        if (!cuerpo) return void res.writeHead(404).end('no está en el fixture')
        return void res.writeHead(200, { 'content-type': 'application/json' }).end(cuerpo)
      }
      const archivo = join(DATOS, normalize(nombre).replace(/^(\.\.[/\\])+/, ''))
      if (!archivo.startsWith(DATOS) || !existsSync(archivo)) return void res.writeHead(404).end('sin capa')
      res.writeHead(200, { 'content-type': 'application/json' })
      return void createReadStream(archivo).pipe(res)
    }

    const archivo = join(DIST, normalize(ruta).replace(/^(\.\.[/\\])+/, ''))
    if (!archivo.startsWith(DIST) || !existsSync(archivo)) return void res.writeHead(404).end('no encontrado')
    res.writeHead(200, { 'content-type': MIME[extname(archivo)] ?? 'application/octet-stream' })
    createReadStream(archivo).pipe(res)
  })
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, puerto: s.address().port })))
}

// ---------------------------------------------------------------------------
// Chrome + CDP (mismo procedimiento que verify-banner.mjs)
// ---------------------------------------------------------------------------
function chromePath() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const candidatos =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  const hallado = candidatos.find((c) => existsSync(c))
  if (hallado) return hallado
  console.error('✘ no se encontró Chrome. Define CHROME_BIN con la ruta al binario.')
  process.exit(1)
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

async function lanzarChrome() {
  const perfil = await mkdtemp(join(tmpdir(), 'verify-panel-'))
  const proc = spawn(
    chromePath(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--remote-debugging-port=0',
      `--user-data-dir=${perfil}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const archivo = join(perfil, 'DevToolsActivePort')
  for (let i = 0; i < 200; i++) {
    try {
      const puerto = readFileSync(archivo, 'utf8').split('\n')[0].trim()
      if (puerto) {
        const r = await fetch(`http://127.0.0.1:${puerto}/json/version`)
        return { proc, perfil, ws: (await r.json()).webSocketDebuggerUrl }
      }
    } catch {
      /* aún no existe, o Chrome lo tiene abierto en Windows: se reintenta */
    }
    await espera(50)
  }
  throw new Error('Chrome no publicó su puerto de depuración')
}

async function conectar(url) {
  const ws = new WebSocket(url)
  await new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true })
    ws.addEventListener('error', () => mal(new Error('no se pudo abrir el WebSocket de CDP')), { once: true })
  })
  let id = 0
  const pendientes = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    const p = pendientes.get(m.id)
    if (!p) return
    pendientes.delete(m.id)
    if (m.error) p.mal(new Error(`${m.error.message} (${JSON.stringify(m.error.data ?? '')})`))
    else p.ok(m.result)
  })
  const enviar = (method, params = {}, sessionId) =>
    new Promise((ok, mal) => {
      const msg = { id: ++id, method, params }
      if (sessionId) msg.sessionId = sessionId
      pendientes.set(msg.id, { ok, mal })
      ws.send(JSON.stringify(msg))
    })
  return { ws, enviar }
}

/**
 * `activar` no es decorativo. Chrome suspende el renderizado de las pestañas en
 * segundo plano, y una TRANSICION CSS de una pestaña suspendida no avanza
 * nunca: se queda en su valor inicial. Como el laboratorio se crea despues, la
 * pestaña de la pagina quedaba detras y el cajon reportaba translateX(100%)
 * indefinidamente aunque la clase .abierto ya estuviera puesta.
 *
 * A verify-banner.mjs no le pasa porque solo captura, y Page.captureScreenshot
 * fuerza un frame aunque la pestaña este oculta; aqui hace falta que el tiempo
 * de animacion corra de verdad.
 */
async function pestana(cdp, activar = false) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })
  await cdp.enviar('Page.enable', {}, sessionId)
  await cdp.enviar('Runtime.enable', {}, sessionId)
  await cdp.enviar('Network.enable', {}, sessionId)
  if (activar) await cdp.enviar('Target.activateTarget', { targetId })
  return sessionId
}

async function evaluar(cdp, sesion, fuente) {
  const r = await cdp.enviar('Runtime.evaluate', { expression: fuente, awaitPromise: true, returnByValue: true }, sesion)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'error evaluando')
  return r.result.value
}

async function sondear(cdp, sesion, fuente, queEspera) {
  for (let i = 0; i < 200; i++) {
    if (await evaluar(cdp, sesion, fuente)) return
    await espera(100)
  }
  throw new Error(`agotada la espera de: ${queEspera}`)
}

// Ampliacion por vecino mas cercano: 8 px de disco y 2 px de conector no se
// juzgan a tamaño real. Copiada de verify-banner.mjs a proposito.
const LAB = `
window.__ampliar = async (b64, x, y, w, h, f) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const c = new OffscreenCanvas(w * f, h * f)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, x, y, w, h, 0, 0, w * f, h * f)
  const blob = await c.convertToBlob({ type: 'image/png' })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s)
}
window.__laboratorioListo = true
`

// ---------------------------------------------------------------------------
async function ir(cdp, sesion, { ancho, tema = 'light', puerto, query = '', degradado = false }) {
  await cdp.enviar(
    'Emulation.setDeviceMetricsOverride',
    { width: ancho, height: ALTO_VENTANA, deviceScaleFactor: 1, mobile: false },
    sesion,
  )
  await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] }, sesion)
  await cdp.enviar('Network.setBlockedURLs', { urls: TILES }, sesion)
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}${BASE}${query}` }, sesion)
  // Esperar a `.cifra b` NO basta, y esto costo seis aserciones rojas: el panel
  // degrada con solo el manifest y ya pinta su cifra principal, asi que el
  // script seguia adelante y afirmaba cifras que dependen de un GeoJSON de
  // 4 MB que aun venia por la red. La condicion es semantica: que no quede
  // ningun aviso de capa apagada, o sea que todas las capas que el panel
  // necesita ya llegaron.
  await sondear(
    cdp,
    sesion,
    `(() => { const p = document.querySelector('.panel-kpi')
              if (!p || !p.querySelector('.cifra b')) return false
              return ${degradado} || !p.textContent.includes('Enciende la capa') })()`,
    degradado ? 'el panel degradado' : 'el panel con todas sus capas cargadas',
  )
}

/**
 * Abre el cajon y espera a que la transformacion SE ASIENTE, no un tiempo fijo.
 * Dormir 250 ms tras una transicion de 180 ms parecia de sobra y no lo era: la
 * primera version media el panel todavia en translateX(100%) y acusaba de
 * desbordamiento a un cajon que estaba perfectamente colocado. Misma leccion que
 * el sondeo de verify-banner.mjs: se espera una condicion, no un reloj.
 */
async function abrirCajon(cdp, sesion) {
  const estado = `(() => { const b = document.querySelector('.abrir-kpi')
                           const p = document.querySelector('.panel-kpi')
                           return { hayBoton: !!b, display: b && getComputedStyle(b).display,
                                    clases: p && p.className,
                                    transform: p && getComputedStyle(p).transform } })()`
  await evaluar(cdp, sesion, `document.querySelector('.abrir-kpi').click()`)
  for (let i = 0; i < 200; i++) {
    const e = await evaluar(cdp, sesion, estado)
    if (e.clases?.includes('abierto') && e.transform === 'none') return
    // Reintento del clic cada segundo: si el primero cayo antes de que React
    // enganchara el manejador, esperar mas no lo arregla nunca.
    if (i > 0 && i % 10 === 0) await evaluar(cdp, sesion, `document.querySelector('.abrir-kpi')?.click()`)
    await espera(100)
  }
  const e = await evaluar(cdp, sesion, estado)
  throw new Error(`el cajón no se abrió: ${JSON.stringify(e)}`)
}

const MEDIR = `(() => {
  const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null }
  const app = document.querySelector('.app')
  const panelKpi = document.querySelector('.panel-kpi')
  const b = document.querySelector('.abrir-kpi')
  const oculto = (e) => !e || getComputedStyle(e).display === 'none'
  const svgs = [...document.querySelectorAll('.panel-kpi svg.grafico')].map((s) => ({
    izq: s.getBoundingClientRect().left, der: s.getBoundingClientRect().right,
    rol: s.getAttribute('role'), etq: s.getAttribute('aria-label') || '',
    titulo: s.querySelector('title')?.textContent || '',
  }))
  return {
    vw: innerWidth,
    scrollW: document.documentElement.scrollWidth,
    pistas: getComputedStyle(app).gridTemplateColumns.trim().split(/\\s+/).length,
    banner: r('.banner'), mapa: r('.mapa'), panel: r('.panel'),
    kpi: panelKpi ? panelKpi.getBoundingClientRect().toJSON() : null,
    kpiAbierto: !!panelKpi && panelKpi.classList.contains('abierto'),
    kpiScrollW: panelKpi ? panelKpi.scrollWidth : 0,
    kpiClientW: panelKpi ? panelKpi.clientWidth : 0,
    boton: oculto(b) ? null : { ...b.getBoundingClientRect().toJSON(), etq: b.getAttribute('aria-label'), exp: b.getAttribute('aria-expanded') },
    abrir: oculto(document.querySelector('.abrir')) ? null : r('.abrir'),
    zoom: r('.leaflet-control-zoom'), atrib: r('.leaflet-control-attribution'), escala: r('.leaflet-control-scale'),
    svgs,
    tablas: document.querySelectorAll('.panel-kpi .tabla-kpi').length,
    h2: document.querySelectorAll('.panel-kpi h2').length,
    texto: panelKpi ? panelKpi.textContent : '',
  }
})()`

const choca = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// ---------------------------------------------------------------------------
const fallos = []
function comprobar(ok, etiqueta, detalle) {
  console.log(`  ${ok ? '✔' : '✘'} ${etiqueta.padEnd(48)} ${detalle}`)
  if (!ok) fallos.push(`${etiqueta} — ${detalle}`)
}

// Cifras esperadas, recalculadas AQUI con codigo propio. Importar
// src/indicadores.js comprobaria que una funcion es igual a si misma.
function esperado() {
  const n1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })
  const n0 = new Intl.NumberFormat('es-CL')

  let man, kpis, inc, oecv
  if (MODO === 'ficticios') {
    man = JSON.parse(FIXTURE['manifest.json'])
    kpis = JSON.parse(FIXTURE['kpis.json'])
    inc = JSON.parse(FIXTURE['incendios.geojson'])
    oecv = JSON.parse(FIXTURE['oecv.geojson'])
  } else {
    const leer = (f) => JSON.parse(readFileSync(join(DATOS, f), 'utf8'))
    man = leer('manifest.json')
    kpis = leer('kpis.json')
    inc = leer('incendios.geojson')
    oecv = leer('oecv.geojson')
  }
  const T = man.capas.incendios.tablas

  const barrer = (filtro) => {
    let n = 0, ha = 0, ev = 0, evHa = 0, elN = 0, elHa = 0
    const porRegion = new Map()
    for (const f of inc.features) {
      const p = f.properties
      if (filtro && T.region[p.region] !== filtro) continue
      n++
      const S = p.superficie_ha ?? 0
      ha += S
      const g = T.causa_grupo[p.causa_grupo]
      if (g === 'Negligentes' || g === 'Intencionales') { ev++; evHa += S }
      if (T.causa_general[p.causa_general] === 'Líneas eléctricas') { elN++; elHa += S }
      const R = T.region[p.region]
      porRegion.set(R, (porRegion.get(R) ?? 0) + S)
    }
    return { n, ha, ev, evHa, elN, elHa, porRegion }
  }

  const N = barrer(null)
  const kmR = man.capas.oecv.km_por_region
  const totalKm = Object.values(kmR).reduce((a, b) => a + b, 0)
  const regiones = [...N.porRegion.entries()].sort((a, b) => b[1] - a[1])
  const primera = regiones[0][0]
  const norm = (s) => s.normalize('NFC').replace(/[´’`]/g, "'").trim()
  const kmNorm = new Map(Object.entries(kmR).map(([k, v]) => [norm(k), v]))
  const brechaPrimera =
    (100 * (kmNorm.get(norm(primera)) ?? 0)) / totalKm - (100 * regiones[0][1]) / N.ha

  const filtro = MODO === 'ficticios' ? 'Biobío' : 'Biobío'
  const F = barrer(filtro)

  return {
    filtro,
    nacional: {
      evitables: n1.format((100 * N.ev) / N.n),
      evitablesHa: n1.format((100 * N.evHa) / N.ha),
      evN: n0.format(N.ev),
      total: n0.format(N.n),
      elecN: n1.format((100 * N.elN) / N.n),
      elecHa: n1.format((100 * N.elHa) / N.ha),
      elecMedia: n1.format(N.elHa / N.elN),
      avance: n1.format(kpis.oecv.avance_pct),
      planKm: n1.format(kpis.oecv.km_planificados),
      repKm: n1.format(kpis.oecv.km_reportados),
      primeraRegion: primera,
      brechaPrimera: n1.format(Math.abs(brechaPrimera)),
      oecvElecKm: n1.format(
        oecv.features
          .filter((f) => f.properties.inst === 'Empresa eléctrica')
          .reduce((a, f) => a + (f.properties.longitud_km ?? 0), 0),
      ),
    },
    filtrado: {
      evitables: n1.format((100 * F.ev) / F.n),
      elecHa: F.elHa ? n1.format((100 * F.elHa) / F.ha) : null,
      n: n0.format(F.n),
    },
  }
}

async function main() {
  if (args.includes('--construir') || !existsSync(join(DIST, 'index.html'))) {
    console.log('▶ construyendo (no hay dist/ o se pidió --construir)')
    const r = spawnSync('npm', ['run', 'build'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' })
    if (r.status !== 0) {
      console.error('✘ falló el build')
      process.exit(1)
    }
  }

  await mkdir(SALIDA, { recursive: true })
  const E = esperado()
  const { proc, perfil, ws: wsUrl } = await lanzarChrome()
  const cdp = await conectar(wsUrl)
  // El laboratorio PRIMERO y la pagina despues, activada: quien se crea al
  // final queda en primer plano, y la pagina necesita renderizar de verdad.
  const lab = await pestana(cdp)
  await evaluar(cdp, lab, LAB)
  const pagina = await pestana(cdp, true)
  const { s: srv, puerto } = await servidor()
  const guardar = (nombre, b64) => writeFile(join(SALIDA, nombre), Buffer.from(b64, 'base64'))
  let capturas = 0
  const capturar = async (nombre, clip) => {
    const { data } = await cdp.enviar('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' }, pagina)
    await guardar(nombre, data)
    capturas++
    return data
  }

  try {
    console.log(`▶ verificando el panel · datos ${MODO} · dist en :${puerto}${BASE}`)

    // ---- B1/B2/B4/B5/B6 · geometria en los diez anchos -------------------
    for (const ancho of ANCHOS) {
      await ir(cdp, pagina, { ancho, puerto })
      const g = await evaluar(cdp, pagina, MEDIR)
      const anclado = ancho > 1200
      console.log(`\n▶ ${ancho} px · ${anclado ? 'anclado' : 'cajón'}`)

      comprobar(
        anclado
          ? g.pistas === 3 && Math.abs(g.kpi.width - ANCHO_KPI) <= 1
          : g.pistas === (ancho > 900 ? 2 : 1),
        'B1 pistas de la rejilla y ancho del panel',
        `${g.pistas} pistas · panel ${g.kpi.width.toFixed(0)} px`,
      )

      comprobar(
        Math.abs(g.mapa.top - g.banner.height) <= 1,
        'B2 el mapa sigue empezando bajo la banda',
        `banda ${g.banner.height.toFixed(1)} · mapa.top ${g.mapa.top.toFixed(1)}`,
      )

      comprobar(
        g.scrollW <= g.vw + 1 && g.mapa.width <= g.vw + 1,
        'B3 sin desbordamiento (cajón cerrado)',
        `scrollWidth ${g.scrollW} · mapa ${g.mapa.width.toFixed(0)} · viewport ${g.vw}`,
      )

      if (ancho === 1201) {
        comprobar(
          g.panel.width + g.mapa.width + g.kpi.width <= g.vw + 1 && g.mapa.width >= 520,
          'B4 el mapa sigue siendo usable en el corte',
          `${g.panel.width.toFixed(0)} + ${g.mapa.width.toFixed(0)} + ${g.kpi.width.toFixed(0)} de ${g.vw}`,
        )
      }

      if (!anclado) {
        const b = g.boton
        comprobar(
          !!b &&
            b.top >= g.banner.height - 0.5 &&
            !choca(b, g.zoom) &&
            !choca(b, g.atrib) &&
            !choca(b, g.escala) &&
            !choca(b, g.abrir),
          'B5 el botón no pisa la banda ni los controles',
          b ? `top ${b.top.toFixed(0)} · banda ${g.banner.height.toFixed(1)}` : 'botón ausente',
        )
      }

      comprobar(
        g.svgs.every((s) => s.izq >= g.kpi.left - 0.5 && s.der <= g.kpi.right + 0.5) &&
          g.kpiScrollW <= g.kpiClientW + 1,
        'B6 ningún gráfico desborda el panel',
        `${g.svgs.length} svg · scroll ${g.kpiScrollW}/${g.kpiClientW}`,
      )
    }

    // ---- B3 con el cajon ABIERTO -----------------------------------------
    // Es LA aserción de este script: translateX(100%) desbordaría hacia el
    // final de línea, que sí es scrollable, y tumbaría A9 de verify-banner.
    console.log('\n▶ cajón abierto')
    for (const ancho of CAJON) {
      await ir(cdp, pagina, { ancho, puerto })
      await abrirCajon(cdp, pagina)
      const g = await evaluar(cdp, pagina, MEDIR)
      comprobar(
        g.kpiAbierto && g.scrollW <= g.vw + 1 && g.kpi.right <= g.vw + 1,
        `B3 sin desbordamiento con el cajón abierto (${ancho})`,
        `scrollWidth ${g.scrollW} · panel.right ${g.kpi.right.toFixed(0)} · viewport ${g.vw}`,
      )
    }

    // ---- B7 · accesibilidad ----------------------------------------------
    console.log('\n▶ accesibilidad')
    await ir(cdp, pagina, { ancho: 1920, puerto })
    const a11y = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      a11y.svgs.length > 0 && a11y.svgs.every((s) => s.rol === 'img' && (s.etq.length > 10 || s.titulo.length > 10)),
      'B7 cada gráfico tiene role e identificación',
      `${a11y.svgs.length} gráficos`,
    )
    comprobar(a11y.tablas >= 2, 'B7 gemelas accesibles de los gráficos', `${a11y.tablas} tablas`)
    comprobar(a11y.h2 >= 6, 'B7 cada bloque lleva su encabezado', `${a11y.h2} h2`)
    await ir(cdp, pagina, { ancho: 1165, puerto })
    const bot = (await evaluar(cdp, pagina, MEDIR)).boton
    comprobar(!!bot?.etq && bot.exp === 'false', 'B7 el botón se anuncia', `«${bot?.etq}» expanded=${bot?.exp}`)

    // ---- B8 · las cifras pintadas ----------------------------------------
    console.log(`\n▶ cifras pintadas (datos ${MODO})`)
    await ir(cdp, pagina, { ancho: 1920, puerto })
    const t = (await evaluar(cdp, pagina, MEDIR)).texto
    const dice = (etiqueta, cadena) =>
      comprobar(cadena != null && t.includes(cadena), `B8 ${etiqueta}`, `«${cadena}»`)

    dice('% de incendios evitables', E.nacional.evitables)
    dice('% de superficie evitable', E.nacional.evitablesHa)
    dice('incendios evitables', E.nacional.evN)
    dice('total de incendios', E.nacional.total)
    dice('% de incendios eléctricos', E.nacional.elecN)
    dice('% de superficie eléctrica', E.nacional.elecHa)
    dice('ha por incendio eléctrico', E.nacional.elecMedia)
    dice('avance OECV nacional', E.nacional.avance)
    dice('km planificados', E.nacional.planKm)
    dice('km reportados', E.nacional.repKm)
    dice('km de empresas eléctricas', E.nacional.oecvElecKm)
    dice('región de mayor presión', E.nacional.primeraRegion)
    dice('brecha de esa región', E.nacional.brechaPrimera)

    // ---- B9 · reactividad al filtro y degradado --------------------------
    console.log('\n▶ reactividad')
    await ir(cdp, pagina, { ancho: 1920, puerto, query: `?region=${encodeURIComponent(E.filtro)}` })
    const f = await evaluar(cdp, pagina, MEDIR)
    comprobar(f.texto.includes(`Ámbito: ${E.filtro}`), 'B9 el ámbito declara el filtro', `«${E.filtro}»`)
    comprobar(f.texto.includes(E.filtrado.evitables), 'B9 la cifra principal recalcula', `«${E.filtrado.evitables}»`)
    if (E.filtrado.elecHa) {
      comprobar(f.texto.includes(E.filtrado.elecHa), 'B9 el bloque eléctrico recalcula', `«${E.filtrado.elecHa}»`)
    }
    comprobar(
      f.svgs.length === a11y.svgs.length,
      'B9 la mancuerna no colapsa con el filtro',
      `${f.svgs.length} gráficos, iguales que sin filtro`,
    )
    await capturar('captura-kpi-filtro-region.png', { x: 1920 - ANCHO_KPI, y: 0, width: ANCHO_KPI, height: ALTO_VENTANA, scale: 1 })

    // Todas las capas apagadas: el panel degrada, no revienta.
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1920, height: ALTO_VENTANA, deviceScaleFactor: 1, mobile: false }, pagina)
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}${BASE}?capas=` }, pagina)
    await sondear(cdp, pagina, `!!document.querySelector('.panel-kpi .cifra b')`, 'el panel degradado')
    const d = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      d.texto.includes(E.nacional.evitables) && d.texto.includes('Enciende la capa'),
      'B9 degrada sin capas en vez de romperse',
      `«${E.nacional.evitables}» + aviso de capa apagada`,
    )
    await capturar('captura-kpi-sin-capas.png', { x: 1920 - ANCHO_KPI, y: 0, width: ANCHO_KPI, height: ALTO_VENTANA, scale: 1 })

    // ---- capturas para mirar ---------------------------------------------
    console.log('\n▶ capturas')
    for (const [ancho, tema] of [
      [1920, 'light'],
      [1920, 'dark'],
      [1366, 'light'],
      [1366, 'dark'],
      [1201, 'light'],
    ]) {
      await ir(cdp, pagina, { ancho, tema, puerto })
      // Panel entero, no solo lo visible. Los tramos salen del alto REAL del
      // contenido y el ultimo es siempre el fondo: con una lista fija de
      // desplazamientos, el ultimo tramo se quedaba corto y ni los puntos
      // stand-by ni el pie aparecian en ninguna captura.
      // El paso es 700 y no el alto util (~788) para que haya solape: con
      // pasos ajustados la costura cayo justo sobre el encabezado de la
      // sección eléctrica y esa sección no se veia entera en ningun sitio.
      // Estas imagenes son para mirarlas; el solape es el punto.
      const maxScroll = await evaluar(
        cdp,
        pagina,
        `(() => { const p = document.querySelector('.panel-kpi'); return p.scrollHeight - p.clientHeight })()`,
      )
      const tramos = []
      for (let y = 0; y < maxScroll; y += 700) tramos.push(y)
      tramos.push(maxScroll)
      for (const [i, y] of tramos.entries()) {
        await evaluar(cdp, pagina, `document.querySelector('.panel-kpi').scrollTop = ${y}`)
        await espera(60)
        await capturar(`captura-kpi-${ancho}-${tema}-${i}.png`, {
          x: ancho - ANCHO_KPI,
          y: 0,
          width: ANCHO_KPI,
          height: ALTO_VENTANA,
          scale: 1,
        })
      }
      if (tema === 'light' && ancho === 1920) {
        await evaluar(cdp, pagina, `document.querySelector('.panel-kpi').scrollTop = 0`)
        await capturar('captura-kpi-pagina-1920.png')
      }
    }

    // Cajon abierto en movil, los dos temas.
    for (const tema of ['light', 'dark']) {
      await ir(cdp, pagina, { ancho: 390, tema, puerto })
      await abrirCajon(cdp, pagina)
      await capturar(`captura-kpi-390-${tema}-cajon.png`, { x: 70, y: 0, width: ANCHO_KPI, height: 844, scale: 1 })
    }

    // Ampliacion x3 de la mancuerna: 9 px de disco y 2 px de conector no se
    // juzgan a tamaño real.
    await ir(cdp, pagina, { ancho: 1920, tema: 'light', puerto })
    const caja = await evaluar(
      cdp,
      pagina,
      `(() => { const s = document.querySelectorAll('.panel-kpi svg.grafico')[0]
                if (!s) return null
                const p = document.querySelector('.panel-kpi')
                p.scrollTop = Math.max(0, s.getBoundingClientRect().top + p.scrollTop - 200)
                return null })()`,
    )
    void caja
    await espera(80)
    const b64 = await capturar('captura-kpi-mancuerna.png', {
      x: 1920 - ANCHO_KPI,
      y: 0,
      width: ANCHO_KPI,
      height: ALTO_VENTANA,
      scale: 1,
    })
    const x3 = await evaluar(cdp, lab, `window.__ampliar(${JSON.stringify(b64)}, 0, 150, 300, 240, 3)`)
    await guardar('captura-kpi-mancuerna-x3.png', x3)
    capturas++
  } finally {
    try {
      srv.close()
    } catch {
      /* ya cerrado */
    }
    cdp.ws.close()
    proc.kill()
    await rm(perfil, { recursive: true, force: true }).catch(() => {})
  }

  console.log(`\n▶ ${capturas} capturas en ${SALIDA}`)
  console.log('  MIRA captura-kpi-1920-dark-*.png: que los rótulos de la mancuerna no choquen con')
  console.log('  los puntos y que #E69F00 no vibre sobre el panel oscuro.')
  console.log('  MIRA captura-kpi-mancuerna-x3.png: que se distinga el punto relleno del hueco.')
  console.log('  No lo decide ninguna aserción.')

  if (fallos.length) {
    console.error(`\n✘ ${fallos.length} comprobación(es) fallaron:`)
    for (const f of fallos) console.error(`    ${f}`)
    process.exit(1)
  }
  console.log('\n✔ el panel de indicadores pasa todas las comprobaciones')
}

main().catch((e) => {
  console.error(`✘ ${e.message}`)
  process.exit(1)
})
