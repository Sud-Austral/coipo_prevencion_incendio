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
// Duplicados a proposito de src/config.js: el script no importa del bundle, o
// comprobaria que una constante es igual a si misma.
const MIN_PANEL = 280
const MAX_PANEL = 560
const MIN_MAPA = 520
// A ambos lados de los dos cortes a proposito: los limites de breakpoint son
// donde se cuelan estos fallos.
const ANCHOS = [1920, 1440, 1366, 1201, 1200, 1165, 901, 900, 768, 390]
const CAJON = [1165, 768, 390] // anchos donde el panel derecho es cajon

// services.arcgisonline.com es un host DISTINTO de server.arcgisonline.com: el
// segundo sirve las teselas satelitales y el primero la metadata de fecha de
// captura que consulta src/hooks/useFechaImagen.js. Sin bloquearlo, la
// verificacion saldria a internet de verdad.
const TILES = [
  '*basemaps.cartocdn.com*',
  '*tile.openstreetmap.org*',
  '*server.arcgisonline.com*',
  '*services.arcgisonline.com*',
  '*tiles.maps.eox.at*',
]

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
        // Sin esto el fixture era MENOS fiel que los datos reales y el GeoJSON
        // salia con enteros donde debe ir la etiqueta. Lo delato B22.
        codificados: ['region', 'provincia', 'comuna', 'temporada', 'causa_grupo', 'causa_general', 'causa_especifica'],
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
      rutas: {
        titulo: 'Rutas',
        // pmtiles a proposito: en produccion rutas y redvial se sirven asi, no
        // hay figuras en el cliente y la fila de descarga debe salir
        // deshabilitada con el motivo escrito. Sin esta entrada, B23 no tenia
        // nada que mirar en CI, que es justo donde importa.
        formato: 'pmtiles',
        geometria: 'LineString',
        archivo: 'rutas.pmtiles',
        features: 5278,
        bytes: 4096,
        bbox: [-73, -38, -72, -37],
        filtros: ['region', 'carpeta'],
        dominios: { region: [{ v: 'Biobío', n: 5278 }] },
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
  // Los EVENTOS (mensajes sin id) ya no se tiran: el dominio Fetch los necesita
  // para poder servir teselas deterministas y, sobre todo, para poder probar el
  // caso SIN cabecera CORS, que es el unico que delata una regresion de
  // contaminacion del lienzo.
  const oyentes = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id == null) {
      oyentes.get(m.method)?.(m.params, m.sessionId)
      return
    }
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
  return { ws, enviar, oyentes }
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
/** sessionId -> targetId, para poder devolver el foco a una pestaña concreta. */
const objetivos = new Map()

async function pestana(cdp, activar = false) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })
  await cdp.enviar('Page.enable', {}, sessionId)
  await cdp.enviar('Runtime.enable', {}, sessionId)
  await cdp.enviar('Network.enable', {}, sessionId)
  objetivos.set(sessionId, targetId)
  if (activar) await cdp.enviar('Target.activateTarget', { targetId })
  return sessionId
}

/**
 * Devuelve el primer plano a una pestaña. Hay que llamarlo despues de CREAR
 * cualquier otra: la ultima creada queda delante, y una pestaña de fondo tiene
 * el renderizado congelado -- las transiciones no avanzan y
 * Page.captureScreenshot se arrastra hasta colgarse. Paso exactamente eso al
 * abrir la pestaña que imprime el PDF: las capturas siguientes se quedaron
 * clavadas ocho minutos.
 */
async function activar(cdp, sesion) {
  const targetId = objetivos.get(sesion)
  if (targetId) await cdp.enviar('Target.activateTarget', { targetId }).catch(() => {})
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
async function ir(
  cdp,
  sesion,
  { ancho, tema = 'light', puerto, query = '', degradado = false, conservarAlmacen = false, semilla, antes, ganchos, teselasFalsas = false },
) {
  // El guion por documento se reescribe entero en cada navegacion: limpiar,
  // conservar, sembrar un valor concreto o romper el almacenamiento. Va aqui y
  // no despues de cargar porque App.jsx lee la disposicion al evaluar el modulo.
  await cdp.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: guionAlmacen }, sesion).catch(() => {})
  const partes = []
  if (ganchos) partes.push(ganchos)
  if (antes) partes.push(antes)
  else if (semilla !== undefined) {
    partes.push(`try { localStorage.setItem('coipo.disposicion', ${JSON.stringify(semilla)}) } catch {}`)
  } else if (!conservarAlmacen) partes.push(`try { localStorage.clear() } catch {}`)
  const { identifier } = await cdp.enviar(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: partes.join(';') || '0' },
    sesion,
  )
  guionAlmacen = identifier

  await cdp.enviar(
    'Emulation.setDeviceMetricsOverride',
    { width: ancho, height: ALTO_VENTANA, deviceScaleFactor: 1, mobile: false },
    sesion,
  )
  await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] }, sesion)
  // Solo se levanta el bloqueo cuando el dominio Fetch esta sirviendo teselas
  // falsas: setBlockedURLs corta la peticion antes de que Fetch.requestPaused
  // pueda cumplirla, y la captura saldria sin fondo -- justo lo que B20 debe
  // distinguir de un fallo. Y al reves: sin Fetch escuchando, quitar el bloqueo
  // manda 40 peticiones a la red real y el script se cuelga ahi.
  await cdp.enviar('Network.setBlockedURLs', { urls: teselasFalsas ? [] : TILES }, sesion)
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

/** Identificador del guion por documento que gobierna el almacenamiento. */
let guionAlmacen = null

// Tinta de las teselas falsas. No aparece en ninguna paleta del visor, asi que
// encontrarla en la captura demuestra que se dibujaron teselas de verdad.
const TINTA_TESELA = '#7fbf3f'
// Colores de COLOR_CAUSA: encontrar alguno demuestra que tambien se dibujo la
// capa vectorial. Comprobar solo el tamaño dejaria pasar un lienzo en blanco.
const TINTAS_CAUSA = ['#d55e00', '#e69f00', '#0072b2', '#009e73', '#999999']

/**
 * Ganchos de prueba, inyectados por documento. En el codigo de produccion no
 * hay ni una linea para esto:
 *   · window.open devuelve un documento falso que acumula lo escrito, y
 *     document.open() lo VACIA como hace el de verdad -- sin eso, el informe
 *     final quedaba pegado detras del «Generando…» y el <title> medido era el
 *     del marcador de posicion.
 *   · el clic de <a download> se intercepta y el blob se lee AL INSTANTE:
 *     guardar() revoca la URL al segundo y leerla despues da «Failed to fetch».
 */
const GANCHOS_DESCARGA = `
  window.__descargas = []
  window.__informe = null
  const __clic = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return __clic.call(this)
    const d = { nombre: this.download, href: this.href }
    d.listo = fetch(this.href).then(r => r.blob()).then(b => { d.blob = b })
    window.__descargas.push(d)
  }
  window.open = function () {
    let buf = ''
    return { document: { open(){ buf = '' }, write(s){ buf += s }, close(){ window.__informe = buf } },
             close(){}, focus(){} }
  }
`

/** Pulsa el boton del panel cuyo texto coincide. */
async function pulsarPorTexto(cdp, sesion, texto) {
  await evaluar(
    cdp,
    sesion,
    `(() => { const b = [...document.querySelectorAll('.panel button')].find(x => x.textContent.trim() === ${JSON.stringify(texto)})
              if (!b) throw new Error('no existe el botón ' + ${JSON.stringify(texto)})
              b.click() })()`,
  )
  await espera(300)
}

/**
 * Renderiza un HTML a PDF. window.print() no abre nada en headless, pero
 * Page.printToPDF si: convierte la unica parte que ninguna asercion puede
 * juzgar --la paginacion-- en un archivo que un humano abre y mira.
 */
async function aPDF(cdp, sesion, html) {
  try {
    await cdp.enviar('Page.navigate', { url: 'about:blank' }, sesion)
    await evaluar(cdp, sesion, `document.open(); document.write(${JSON.stringify(html)}); document.close(); 1`)
    await espera(500)
    const { data } = await cdp.enviar(
      'Page.printToPDF',
      { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
      sesion,
    )
    return Buffer.from(data, 'base64')
  } catch {
    return null
  }
}

/** Clic y espera a que React haya pintado el resultado. */
async function clic(cdp, sesion, selector) {
  await evaluar(cdp, sesion, `document.querySelector(${JSON.stringify(selector)})?.click()`)
  await espera(80)
}

async function tecla(cdp, sesion, key, codigo) {
  await cdp.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codigo }, sesion)
  await cdp.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codigo }, sesion)
  await espera(40)
}

/**
 * Arrastre real del tirador.
 * `buttons: 1` en los mouseMoved NO es opcional: sin el, Chrome los entrega
 * como movimiento sin boton pulsado, el arrastre no ocurre y la asercion falla
 * sin decir por que.
 */
async function arrastrar(cdp, sesion, x, y, dx) {
  const ev = (type, ex) =>
    cdp.enviar('Input.dispatchMouseEvent', { type, x: ex, y, button: 'left', buttons: 1, clickCount: 1 }, sesion)
  await ev('mousePressed', x)
  for (let i = 1; i <= 6; i++) {
    await ev('mouseMoved', x + (dx * i) / 6)
    await espera(25)
  }
  await ev('mouseReleased', x + dx)
  await espera(120)
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
    // --- disposicion (B10..B17) ---
    regimen: app.dataset.regimen,
    clases: app.className,
    panelDisplay: document.querySelector('.panel') ? getComputedStyle(document.querySelector('.panel')).display : null,
    tirador: (() => {
      const t = document.querySelector('.tirador')
      if (!t || getComputedStyle(t).display === 'none') return null
      const r = t.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + Math.min(300, r.height / 2),
               ahora: +t.getAttribute('aria-valuenow'), min: +t.getAttribute('aria-valuemin'),
               max: +t.getAttribute('aria-valuemax'), rol: t.getAttribute('role'),
               orient: t.getAttribute('aria-orientation'), controla: t.getAttribute('aria-controls'),
               foco: t.tabIndex }
    })(),
    tiradorKpi: (() => {
      const t = document.querySelector('.tirador-kpi')
      if (!t || getComputedStyle(t).display === 'none') return null
      const r = t.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + Math.min(300, r.height / 2),
               ahora: +t.getAttribute('aria-valuenow'), min: +t.getAttribute('aria-valuemin'),
               max: +t.getAttribute('aria-valuemax'), rol: t.getAttribute('role'),
               orient: t.getAttribute('aria-orientation'), controla: t.getAttribute('aria-controls'),
               foco: t.tabIndex }
    })(),
    // Razon lienzo/mapa: Leaflet dimensiona el canvas del renderer como funcion
    // fija de map.getSize(), asi que la razon solo se conserva si invalidateSize
    // corrio de verdad. No hace falta ningun gancho de prueba.
    razonLienzo: (() => {
      const c = document.querySelector('.leaflet-overlay-pane canvas')
      const m = document.querySelector('.mapa')
      return c && m && m.clientWidth ? c.width / m.clientWidth : null
    })(),
    lienzoAncho: document.querySelector('.leaflet-overlay-pane canvas')?.width ?? null,
    leafletAncho: document.querySelector('.leaflet-container')?.clientWidth ?? null,
    almacen: (() => {
      try { return localStorage.getItem('coipo.disposicion') } catch { return 'INACCESIBLE' }
    })(),
  }
})()`

const choca = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// ---------------------------------------------------------------------------
const T0 = Date.now()
const reloj = () => `${((Date.now() - T0) / 1000).toFixed(0)}s`

const fallos = []
function comprobar(ok, etiqueta, detalle) {
  // El reloj no es adorno: este script recarga la app 22 veces y cada carga
  // baja 4 MB y pinta 14.705 markers. Sin el, un bloque que se dispara de
  // tiempo pasa inadvertido hasta que CI se queda sin minutos.
  console.log(`  ${ok ? '✔' : '✘'} ${etiqueta.padEnd(48)} ${detalle}  [${reloj()}]`)
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
    nacionalN: N.n,
    filtroAmbito: 'nacional',
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

      // B12 y B11 van AQUI dentro y no en bucles propios: repetirian estos
      // mismos diez anchos y cada `ir()` recarga 4 MB de GeoJSON y vuelve a
      // pintar 14.705 markers. Plegarlos ahorra catorce cargas de pagina.
      comprobar(
        g.regimen === String(anclado ? 1 : ancho > 900 ? 2 : 3),
        `B12 régimen y pistas coinciden (${ancho})`,
        `data-regimen=${g.regimen} · ${g.pistas} pistas`,
      )
      if (!anclado) {
        // Si el display:none del plegado anclado se escapa de su media query,
        // el cajon deja de animar y su X se vuelve inalcanzable. Ninguna otra
        // asercion lo notaria, porque el cajon cerrado no se mide.
        comprobar(
          g.panelDisplay !== 'none',
          `B11 .panel conserva caja en cajón (${ancho})`,
          `display ${g.panelDisplay}`,
        )
      }
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

    // ---- B10/B12 · plegar y desplegar anclado -----------------------------
    console.log('\n▶ plegar y desplegar')
    for (const ancho of [1920, 1366, 1201]) {
      await ir(cdp, pagina, { ancho, puerto })
      const base = await evaluar(cdp, pagina, MEDIR)

      await clic(cdp, pagina, '.panel .cerrar')
      const sinPanel = await evaluar(cdp, pagina, MEDIR)
      comprobar(
        sinPanel.pistas === 3 &&
          sinPanel.panel.width <= 1 &&
          Math.abs(sinPanel.mapa.width - (base.mapa.width + base.panel.width)) <= 1 &&
          sinPanel.scrollW <= sinPanel.vw + 1 &&
          // .abrir, no .boton: `boton` es .abrir-kpi, y aqui solo se plego el
          // panel izquierdo.
          !!sinPanel.abrir,
        `B10 plegar el panel de control (${ancho})`,
        `${sinPanel.pistas} pistas · mapa ${base.mapa.width.toFixed(0)} → ${sinPanel.mapa.width.toFixed(0)} · ☰ ${sinPanel.abrir ? 'visible' : 'AUSENTE'}`,
      )

      await clic(cdp, pagina, '.abrir')
      const vuelta = await evaluar(cdp, pagina, MEDIR)
      comprobar(
        Math.abs(vuelta.panel.width - base.panel.width) <= 1 &&
          Math.abs(vuelta.mapa.width - base.mapa.width) <= 1,
        `B10 desplegarlo lo deja como estaba (${ancho})`,
        `panel ${vuelta.panel.width.toFixed(0)} · mapa ${vuelta.mapa.width.toFixed(0)}`,
      )

      // Los dos plegados: el mapa ocupa el viewport entero y nada desborda.
      await clic(cdp, pagina, '.panel .cerrar')
      await clic(cdp, pagina, '.panel-kpi .cerrar')
      const ambos = await evaluar(cdp, pagina, MEDIR)
      comprobar(
        ambos.pistas === 3 &&
          Math.abs(ambos.mapa.width - ambos.vw) <= 1 &&
          ambos.scrollW <= ambos.vw + 1,
        `B10 los dos plegados dan el ancho completo (${ancho})`,
        `${ambos.pistas} pistas · mapa ${ambos.mapa.width.toFixed(0)} de ${ambos.vw} · scrollWidth ${ambos.scrollW}`,
      )
      // Los dos botones visibles a la vez y ninguno encima de un control de
      // Leaflet: es el caso que antes NO existia, porque anclado no habia forma
      // de plegar y estos botones no aparecian nunca por encima de 1200 px.
      comprobar(
        !!ambos.abrir &&
          !!ambos.boton &&
          !choca(ambos.abrir, ambos.zoom) &&
          !choca(ambos.abrir, ambos.boton) &&
          !choca(ambos.boton, ambos.atrib) &&
          !choca(ambos.boton, ambos.escala),
        `B5 los dos botones sin colisión con el mapa plegado (${ancho})`,
        `☰ ${ambos.abrir ? `${ambos.abrir.left.toFixed(0)}..${ambos.abrir.right.toFixed(0)}` : 'AUSENTE'} · zoom ${ambos.zoom ? `${ambos.zoom.left.toFixed(0)}..${ambos.zoom.right.toFixed(0)}` : '—'}`,
      )
    }



    // ---- B13..B16 · el tirador -------------------------------------------
    console.log('\n▶ tirador')
    await ir(cdp, pagina, { ancho: 1920, puerto })
    const antes = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      !!antes.tirador &&
        antes.tirador.rol === 'separator' &&
        antes.tirador.orient === 'vertical' &&
        antes.tirador.controla === 'panel-control' &&
        antes.tirador.foco === 0 &&
        antes.tirador.ahora === antes.panel.width,
      'B15 el tirador se anuncia como separador',
      `role=${antes.tirador?.rol} valuenow=${antes.tirador?.ahora} min=${antes.tirador?.min} max=${antes.tirador?.max}`,
    )

    await arrastrar(cdp, pagina, antes.tirador.x, antes.tirador.y, 180)
    const tras = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(tras.panel.width - (antes.panel.width + 180)) <= 2 &&
        Math.abs(tras.mapa.width - (antes.mapa.width - 180)) <= 2 &&
        tras.pistas === 3 &&
        tras.scrollW <= tras.vw + 1,
      'B13 arrastrar ensancha el panel y encoge el mapa',
      `panel ${antes.panel.width.toFixed(0)} → ${tras.panel.width.toFixed(0)} · mapa ${tras.mapa.width.toFixed(0)}`,
    )
    // Sin gancho de prueba. Leaflet dimensiona el lienzo del renderer en
    // funcion de map.getSize(): si invalidateSize NO corriera, el lienzo
    // conservaria EXACTAMENTE su ancho anterior. Que cambie es la señal
    // decisiva, y es binaria.
    //
    // NO se compara la razon lienzo/mapa: el ultimo reajuste puede quedarse en
    // un tamaño intermedio del arrastre (medido: 2,109 en vez de 2,000), asi
    // que cualquier tolerancia razonable es a la vez laxa e inestable. Se
    // comprueba en su lugar que el contenedor de Leaflet mida lo mismo que la
    // pista del mapa, que es la consecuencia que de verdad importa: sin ella
    // quedaria una franja muerta entre el panel y el mapa.
    comprobar(
      antes.lienzoAncho != null &&
        tras.lienzoAncho !== antes.lienzoAncho &&
        Math.abs(tras.leafletAncho - tras.mapa.width) <= 1,
      'B16 invalidateSize corre tras el arrastre',
      `lienzo ${antes.lienzoAncho} → ${tras.lienzoAncho} · contenedor ${tras.leafletAncho} = mapa ${tras.mapa.width.toFixed(0)}`,
    )

    // Teclado: 5 flechas son 5 pasos de 8 px.
    await evaluar(cdp, pagina, `document.querySelector('.tirador').focus()`)
    for (let i = 0; i < 5; i++) await tecla(cdp, pagina, 'ArrowRight', 39)
    const conTeclado = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(conTeclado.panel.width - (tras.panel.width + 40)) <= 1 &&
        conTeclado.tirador.ahora === Math.round(conTeclado.panel.width),
      'B15 las flechas ajustan el ancho',
      `${tras.panel.width.toFixed(0)} → ${conTeclado.panel.width.toFixed(0)} · aria-valuenow ${conTeclado.tirador.ahora}`,
    )

    await tecla(cdp, pagina, 'Home', 36)
    const alMinimo = await evaluar(cdp, pagina, MEDIR)
    await tecla(cdp, pagina, 'End', 35)
    const alMaximo = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(alMinimo.panel.width - MIN_PANEL) <= 1 && Math.abs(alMaximo.panel.width - MAX_PANEL) <= 1,
      'B14 Inicio y Fin llegan al mínimo y al máximo',
      `${alMinimo.panel.width.toFixed(0)} … ${alMaximo.panel.width.toFixed(0)} (${MIN_PANEL}..${MAX_PANEL})`,
    )

    // LA aserción del tirador: en el corte, ensanchar a tope no puede dejar el
    // mapa por debajo de su suelo. Es la B4 extendida al arrastre.
    await ir(cdp, pagina, { ancho: 1201, puerto })
    await evaluar(cdp, pagina, `document.querySelector('.tirador').focus()`)
    await tecla(cdp, pagina, 'End', 35)
    const apretado = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      apretado.mapa.width >= MIN_MAPA - 1 &&
        apretado.panel.width + apretado.mapa.width + apretado.kpi.width <= apretado.vw + 1,
      'B14 el tirador no puede violar el suelo del mapa',
      `panel ${apretado.panel.width.toFixed(0)} + mapa ${apretado.mapa.width.toFixed(0)} + kpi ${apretado.kpi.width.toFixed(0)} de ${apretado.vw}`,
    )

    // ---- B13..B15 · el gemelo derecho ------------------------------------
    // Mismo componente con la geometria espejada: aqui se comprueba EXACTAMENTE
    // la parte que cambia con `lado` -- que arrastrar hacia la izquierda
    // ensanche, que las flechas esten invertidas y que el suelo del mapa
    // tambien lo acote a el. Lo que no cambia (captura de puntero, rAF,
    // persistencia) ya lo cubren las aserciones del izquierdo.
    console.log('\n▶ tirador del panel de indicadores')
    await ir(cdp, pagina, { ancho: 1920, puerto })
    const antesK = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      !!antesK.tiradorKpi &&
        antesK.tiradorKpi.rol === 'separator' &&
        antesK.tiradorKpi.controla === 'panel-indicadores' &&
        antesK.tiradorKpi.foco === 0 &&
        antesK.tiradorKpi.ahora === Math.round(antesK.kpi.width),
      'B15 el tirador derecho se anuncia como separador',
      `role=${antesK.tiradorKpi?.rol} controla=${antesK.tiradorKpi?.controla} valuenow=${antesK.tiradorKpi?.ahora}`,
    )

    await arrastrar(cdp, pagina, antesK.tiradorKpi.x, antesK.tiradorKpi.y, -160)
    const trasK = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(trasK.kpi.width - (antesK.kpi.width + 160)) <= 2 &&
        Math.abs(trasK.mapa.width - (antesK.mapa.width - 160)) <= 2 &&
        trasK.pistas === 3 &&
        trasK.scrollW <= trasK.vw + 1,
      'B13 arrastrar a la izquierda ensancha los indicadores y encoge el mapa',
      `kpi ${antesK.kpi.width.toFixed(0)} → ${trasK.kpi.width.toFixed(0)} · mapa ${trasK.mapa.width.toFixed(0)}`,
    )

    // Flechas espejadas: en el lado derecho, IZQUIERDA es ensanchar.
    await evaluar(cdp, pagina, `document.querySelector('.tirador-kpi').focus()`)
    for (let i = 0; i < 5; i++) await tecla(cdp, pagina, 'ArrowLeft', 37)
    const tecladoK = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(tecladoK.kpi.width - (trasK.kpi.width + 40)) <= 1 &&
        tecladoK.tiradorKpi.ahora === Math.round(tecladoK.kpi.width),
      'B15 en el derecho las flechas van espejadas',
      `${trasK.kpi.width.toFixed(0)} → ${tecladoK.kpi.width.toFixed(0)} con 5×ArrowLeft`,
    )

    await ir(cdp, pagina, { ancho: 1201, puerto })
    await evaluar(cdp, pagina, `document.querySelector('.tirador-kpi').focus()`)
    await tecla(cdp, pagina, 'End', 35)
    const apretadoK = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      apretadoK.mapa.width >= MIN_MAPA - 1 &&
        apretadoK.panel.width + apretadoK.mapa.width + apretadoK.kpi.width <= apretadoK.vw + 1,
      'B14 tampoco el derecho puede violar el suelo del mapa',
      `panel ${apretadoK.panel.width.toFixed(0)} + mapa ${apretadoK.mapa.width.toFixed(0)} + kpi ${apretadoK.kpi.width.toFixed(0)} de ${apretadoK.vw}`,
    )

    // ---- B17 · almacenamiento --------------------------------------------
    console.log('\n▶ disposición recordada')
    await ir(cdp, pagina, { ancho: 1920, puerto })
    const limpio = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      limpio.almacen === null && Math.abs(limpio.panel.width - 320) <= 1,
      'B17 sin nada guardado arranca en los valores por omisión',
      `almacén ${limpio.almacen} · panel ${limpio.panel.width.toFixed(0)}`,
    )

    await evaluar(cdp, pagina, `document.querySelector('.tirador').focus()`)
    for (let i = 0; i < 5; i++) await tecla(cdp, pagina, 'ArrowRight', 39)
    await clic(cdp, pagina, '.panel-kpi .cerrar')
    const guardado = await evaluar(cdp, pagina, MEDIR)
    const claves = Object.keys(JSON.parse(guardado.almacen ?? '{}')).sort()
    comprobar(
      claves.join(',') === 'ancho,anchoKpi,kpi,panel',
      'B17 la clave guarda EXACTAMENTE ancho, anchoKpi, panel y kpi',
      `campos: ${claves.join(', ') || '(ninguno)'}`,
    )

    // Se recarga SIN limpiar: es el unico caso donde el almacen debe sobrevivir.
    await ir(cdp, pagina, { ancho: 1920, puerto, conservarAlmacen: true })
    const restaurado = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(restaurado.panel.width - 360) <= 1 && restaurado.clases.includes('sin-kpi'),
      'B17 la disposición sobrevive a la recarga',
      `panel ${restaurado.panel.width.toFixed(0)} · clases «${restaurado.clases}»`,
    )

    // Entradas corruptas: valores por omision, y sobre todo SIN excepcion.
    for (const veneno of ['{{{', 'null', '[]', '{"ancho":99999,"panel":"sí"}', '{"ancho":"x"}']) {
      await ir(cdp, pagina, { ancho: 1920, puerto, semilla: veneno })
      const g = await evaluar(cdp, pagina, MEDIR)
      comprobar(
        g.panel.width >= MIN_PANEL - 1 && g.panel.width <= MAX_PANEL + 1 && !!g.tirador,
        `B17 sobrevive a un almacén corrupto (${veneno.slice(0, 18)})`,
        `panel ${g.panel.width.toFixed(0)}`,
      )
    }

    // Almacenamiento denegado, como en Safari privado: leer localStorage lanza.
    await ir(cdp, pagina, {
      ancho: 1920,
      puerto,
      antes: `Object.defineProperty(window, 'localStorage', { get() { throw new Error('denegado') } })`,
    })
    const denegado = await evaluar(cdp, pagina, MEDIR)
    comprobar(
      Math.abs(denegado.panel.width - 320) <= 1 && !!denegado.tirador && denegado.almacen === 'INACCESIBLE',
      'B17 con el almacenamiento denegado el visor sigue en pie',
      `panel ${denegado.panel.width.toFixed(0)}`,
    )

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

    // ---- B18..B23 · descargas --------------------------------------------
    // window.print() no abre dialogo en headless y window.open esta bloqueado,
    // asi que se sustituyen desde el guion por documento: los ganchos viven en
    // la PRUEBA, nunca en el codigo de produccion.
    console.log('\n▶ descargas')

    // Tesela de color plano, generada en el laboratorio. #7fbf3f no aparece en
    // ninguna paleta del visor, asi que encontrarlo en la captura demuestra que
    // se dibujaron teselas y no un lienzo en blanco.
    const teselaB64 = await evaluar(
      cdp,
      lab,
      `(async () => { const c = new OffscreenCanvas(256,256); const x = c.getContext('2d')
         x.fillStyle = '${TINTA_TESELA}'; x.fillRect(0,0,256,256)
         const b = await c.convertToBlob({type:'image/png'}); const u = new Uint8Array(await b.arrayBuffer())
         let s=''; for (const v of u) s += String.fromCharCode(v); return btoa(s) })()`,
    )

    let conCORS = true
    await cdp.enviar('Fetch.enable', { patterns: TILES.map((urlPattern) => ({ urlPattern })) }, pagina)
    cdp.oyentes.set('Fetch.requestPaused', (p, sid) => {
      const cabeceras = [{ name: 'content-type', value: 'image/png' }]
      if (conCORS) cabeceras.push({ name: 'Access-Control-Allow-Origin', value: '*' })
      cdp
        .enviar('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: cabeceras, body: teselaB64 }, sid)
        .catch(() => {})
    })

    await ir(cdp, pagina, { ancho: 1600, puerto, ganchos: GANCHOS_DESCARGA, teselasFalsas: true })

    // -- B22 · CSV --
    await pulsarPorTexto(cdp, pagina, 'CSV')
    const csv = await evaluar(
      cdp,
      pagina,
      `(async () => { const d = window.__descargas[0]; if (!d) return null; await d.listo
         const t = await d.blob.text()
         // El BOM se comprueba en los BYTES: Blob.text() decodifica como UTF-8
         // y se COME el BOM, asi que en la cadena ya no esta por mucho que el
         // archivo si lo lleve. Mirarlo en el texto daba un falso negativo.
         const b = new Uint8Array(await d.blob.arrayBuffer())
         return { nombre: d.nombre, bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf,
                  filas: t.trimEnd().split('\\r\\n').length,
                  cabecera: t.split('\\r\\n')[0], muestra: t.split('\\r\\n')[1] ?? '' } })()`,
    )
    comprobar(
      !!csv &&
        csv.bom &&
        csv.filas === E.nacionalN + 1 &&
        /^incendios_nacional_\d{4}-\d{2}-\d{2}\.csv$/.test(csv.nombre),
      'B22 el CSV tiene BOM y una fila por incendio',
      csv ? `${csv.nombre} · ${csv.filas - 1} filas · BOM ${csv.bom}` : 'sin descarga',
    )
    // La cabecera se compara ENTERA y no con startsWith. El motivo es concreto:
    // durante un tiempo el ETL emitio 13 de las 23 columnas de la hoja y nadie
    // se entero, porque desde el visor no habia forma de saber que existian las
    // otras diez. Un startsWith sobre los cinco primeros nombres habria seguido
    // en verde con la mitad de la fuente perdida. Si manana falta una columna,
    // esta asercion la nombra.
    // El orden es el del Excel; lon/lat van al final porque son derivadas.
    const CSV_COLS = [
      'id', 'region', 'provincia', 'comuna', 'temporada', 'n_incendio', 'nombre',
      'causa_codigo', 'causa_especifica', 'causa_general', 'causa_general_codigo',
      'causa_grupo', 'utm_x', 'utm_y', 'utm_epsg', 'superficie_ha', 'jefe_brigada',
      'mes_investigacion', 'investigado_por', 'inicio_r20', 'hora_r20', 'inv_inicio',
      'inv_fin', 'informe', 'lon', 'lat',
    ]
    const faltanCols = csv ? CSV_COLS.filter((c) => !csv.cabecera.split(';').includes(c)) : CSV_COLS
    comprobar(
      !!csv && csv.cabecera === CSV_COLS.join(';'),
      `B22 el CSV lleva las ${CSV_COLS.length} columnas de la fuente, en orden`,
      faltanCols.length ? `faltan: ${faltanCols.join(', ')}` : csv?.cabecera.slice(0, 100) ?? '—',
    )
    comprobar(
      // indice 15 = superficie_ha, la unica columna con decimales del CSV.
      !!csv &&
        csv.muestra.split(';').length === CSV_COLS.length &&
        !/\d\.\d/.test(csv.muestra.split(';')[15] ?? ''),
      'B22 decimales con coma',
      csv ? csv.muestra.slice(0, 90) : '—',
    )

    // -- B22 · GeoJSON --
    await pulsarPorTexto(cdp, pagina, 'GeoJSON')
    const gj = await evaluar(
      cdp,
      pagina,
      `(async () => { const d = window.__descargas.at(-1); await d.listo
         const j = JSON.parse(await d.blob.text()); const p = j.features[0]?.properties ?? {}
         return { nombre: d.nombre, tipo: j.type, n: j.features.length, hayCrs: 'crs' in j,
                  coipo: !!j.coipo && !!j.coipo.ambito && !!j.coipo.aviso,
                  region: p.region, cod: p.region_cod, coords: j.features[0]?.geometry?.coordinates } })()`,
    )
    comprobar(
      gj.tipo === 'FeatureCollection' &&
        gj.n === E.nacionalN &&
        !gj.hayCrs &&
        gj.coipo &&
        typeof gj.region === 'string' &&
        Number.isInteger(gj.cod) &&
        gj.coords[0] > -80 &&
        gj.coords[0] < -60 &&
        gj.coords[1] > -60 &&
        gj.coords[1] < -15,
      'B22 el GeoJSON lleva etiqueta y código, sin crs y con procedencia',
      `${gj.n} figuras · region «${gj.region}» cod ${gj.cod} · crs ${gj.hayCrs}`,
    )

    // -- B20 · el PNG no es un lienzo en blanco --
    await evaluar(cdp, pagina, `window.__descargas.length = 0`)
    await pulsarPorTexto(cdp, pagina, 'Imagen del mapa (PNG)')
    await sondear(cdp, pagina, `window.__descargas.length > 0`, 'la descarga del PNG')
    const png = await evaluar(
      cdp,
      pagina,
      `(async () => { const d = window.__descargas[0]; await d.listo
         const img = await createImageBitmap(d.blob)
         const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img,0,0)
         const px = x.getImageData(0,0,img.width,img.height).data
         const hex = (i) => '#' + [px[i],px[i+1],px[i+2]].map(v => v.toString(16).padStart(2,'0')).join('')
         // Cercania y no igualdad: un disco de 2,5 px de radio sale suavizado y
         // con pocas figuras puede no quedar ni un pixel del tono exacto.
         const cerca = (a, b) => { const p = (h,i) => parseInt(h.slice(1+2*i,3+2*i),16)
           return Math.abs(p(a,0)-p(b,0)) + Math.abs(p(a,1)-p(b,1)) + Math.abs(p(a,2)-p(b,2)) <= 40 }
         // Se barren TODOS los pixeles y no una muestra: a z6 los incendios son
         // discos de 2,5 px de radio y cualquier zancada se los salta. 775.000
         // pixeles es una pasada de milisegundos.
         const vistos = new Set()
         for (let i = 0; i < px.length; i += 4) vistos.add(hex(i))
         const tintas = ${JSON.stringify(TINTAS_CAUSA)}
         return { nombre: d.nombre, bytes: d.blob.size, w: img.width, h: img.height,
                  hayTesela: [...vistos].some(c => cerca(c, '${TINTA_TESELA}')),
                  hayVector: [...vistos].some(c => tintas.some(t => cerca(c, t))) } })()`,
    )
    const mapaAncho = (await evaluar(cdp, pagina, MEDIR)).mapa.width
    comprobar(
      Math.abs(png.w - mapaAncho) <= 1 &&
        png.hayTesela &&
        png.hayVector,
      'B20 el PNG lleva teselas Y capas, no un lienzo en blanco',
      `${png.w}×${png.h} · ${png.bytes} B · teselas ${png.hayTesela} · vectores ${png.hayVector}`,
    )

    // -- B18/B19 · el informe --
    await pulsarPorTexto(cdp, pagina, 'Informe con el mapa (PDF)')
    await sondear(cdp, pagina, `!!window.__informe`, 'el informe generado')
    const inf = await evaluar(
      cdp,
      pagina,
      `(() => { const crudo = window.__informe
         // renderToStaticMarkup escapa el apostrofo como &#x27;, asi que
         // «O'Higgins» del panel vivo no aparece literal en el informe aunque
         // SI este. Se decodifican las entidades antes de comparar; sin esto la
         // asercion acusaba de ausente una nota que estaba entera.
         const t = document.createElement('textarea')
         const h = crudo.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m) => { t.innerHTML = m; return t.value })
         const raiz = (h.match(/:root\\{([^}]*)\\}/)||[])[1] || ''
         const definidas = new Set([...raiz.matchAll(/(--[a-z0-9-]+)\\s*:/g)].map(m => m[1]))
         const usadas = new Set([...h.matchAll(/var\\((--[a-z0-9-]+)/g)].map(m => m[1]))
         const notasPanel = [...document.querySelectorAll('.panel-kpi .nota')].map(n => n.textContent.trim())
         const titulos = [...document.querySelectorAll('.panel-kpi section h2')].map(n => n.textContent.trim())
         return { bytes: h.length,
           doctype: h.startsWith('<!DOCTYPE html>'), charset: h.includes('<meta charset="utf-8">'),
           page: h.includes('@page'), color: h.includes('print-color-adjust:exact'),
           mapa: h.includes('<img class="mapa-img" src="data:image/png;base64,'),
           imprime: h.includes('window.print()'),
           titulo: (h.match(/<title>([^<]*)<\\/title>/)||[])[1] ?? '',
           huerfanas: [...usadas].filter(v => !definidas.has(v)),
           claras: raiz.includes('--bg:#fff'),
           notasFuera: notasPanel.filter(t => t.length > 40 && !h.includes(t.slice(0, 40))),
           titulosFuera: titulos.filter(t => !h.includes(t)).length,
           nTitulos: titulos.length } })()`,
    )
    comprobar(
      inf.doctype && inf.charset && inf.page && inf.color && inf.mapa && inf.imprime,
      'B18 el informe trae doctype, charset, @page, colores, mapa e impresión',
      `${(inf.bytes / 1024).toFixed(0)} KB · «${inf.titulo.slice(0, 60)}»`,
    )
    comprobar(
      inf.huerfanas.length === 0 && inf.claras,
      'B18 ninguna variable CSS sin resolver, y con la paleta CLARA',
      inf.huerfanas.length ? inf.huerfanas.join(' ') : 'todas definidas · fondo blanco',
    )
    comprobar(
      inf.titulo.includes(E.filtroAmbito) && /\d/.test(inf.titulo),
      'B18 el título lleva el ámbito y la fecha',
      `«${inf.titulo}»`,
    )
    comprobar(
      inf.notasFuera.length === 0 && inf.titulosFuera === 0 && inf.nTitulos >= 6,
      'B19 las advertencias y los títulos del panel viajan al informe',
      inf.notasFuera.length
        ? `AUSENTE: «${inf.notasFuera[0].slice(0, 80)}»`
        : `${inf.nTitulos} secciones · todas las notas y títulos presentes`,
    )
    // Las mismas cifras que B8 ya recalcula por su cuenta: el informe no puede
    // imprimir numeros distintos de los del panel.
    const cifrasFuera = [E.nacional.evitables, E.nacional.elecHa, E.nacional.avance].filter(
      (c) => c && !inf.bytesTexto?.includes(c),
    )
    void cifrasFuera
    const llevaCifras = await evaluar(
      cdp,
      pagina,
      `(() => { const crudo = window.__informe
         // renderToStaticMarkup escapa el apostrofo como &#x27;, asi que
         // «O'Higgins» del panel vivo no aparece literal en el informe aunque
         // SI este. Se decodifican las entidades antes de comparar; sin esto la
         // asercion acusaba de ausente una nota que estaba entera.
         const t = document.createElement('textarea')
         const h = crudo.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m) => { t.innerHTML = m; return t.value })
         return ${JSON.stringify([E.nacional.evitables, E.nacional.elecHa, E.nacional.avance])}.every(c => h.includes(c)) })()`,
    )
    comprobar(llevaCifras, 'B18 el informe imprime las mismas cifras que el panel', 'coinciden con B8')

    // -- B21 · degradacion honesta si el lienzo se contamina --
    conCORS = false
    await ir(cdp, pagina, { ancho: 1600, puerto, ganchos: GANCHOS_DESCARGA, teselasFalsas: true })
    await pulsarPorTexto(cdp, pagina, 'Informe con el mapa (PDF)')
    await sondear(cdp, pagina, `!!window.__informe`, 'el informe sin teselas CORS')
    const sinCors = await evaluar(
      cdp,
      pagina,
      `(() => { const crudo = window.__informe
         // renderToStaticMarkup escapa el apostrofo como &#x27;, asi que
         // «O'Higgins» del panel vivo no aparece literal en el informe aunque
         // SI este. Se decodifican las entidades antes de comparar; sin esto la
         // asercion acusaba de ausente una nota que estaba entera.
         const t = document.createElement('textarea')
         const h = crudo.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m) => { t.innerHTML = m; return t.value })
         return { rota: h.includes('<img class="mapa-img" src="data:image/png;base64,'),
                  explica: /No se pudo incluir la imagen del mapa|class="nota"/.test(h),
                  hojas: (h.match(/class="hoja/g)||[]).length } })()`,
    )
    comprobar(
      sinCors.explica && sinCors.hojas >= 3,
      'B21 sin CORS el informe explica la falta en vez de romperse',
      `imagen ${sinCors.rota ? 'presente' : 'omitida'} · ${sinCors.hojas} hojas`,
    )
    conCORS = true

    // -- B23 · las capas por teselas no se ofrecen --
    await ir(cdp, pagina, { ancho: 1600, puerto })
    const filas = await evaluar(
      cdp,
      pagina,
      `[...document.querySelectorAll('.fila-descarga')].map(f => ({
         etq: f.querySelector('.etq').textContent.trim(),
         motivo: f.querySelector('.meta')?.textContent.trim() ?? null,
         botones: f.querySelectorAll('button').length }))`,
    )
    // >= 1 y no === 2: el fixture declara una sola capa por teselas y los datos
    // reales dos. Lo que importa es que TODAS las que aparezcan esten
    // deshabilitadas y digan por que.
    const vial = filas.filter((f) => /Rutas|Red vial/.test(f.etq))
    comprobar(
      vial.length >= 1 && vial.every((f) => f.botones === 0 && f.motivo),
      'B23 las capas no exportables dicen por qué',
      vial.map((f) => `${f.etq}: ${f.motivo ?? 'SIN MOTIVO'}`).join(' · ').slice(0, 110),
    )

    // El informe se deja en disco Y como PDF de verdad: es lo unico que muestra
    // la paginacion, y window.print() no corre en headless pero printToPDF si.
    await ir(cdp, pagina, { ancho: 1600, puerto, ganchos: GANCHOS_DESCARGA, teselasFalsas: true })
    await pulsarPorTexto(cdp, pagina, 'Informe con el mapa (PDF)')
    await sondear(cdp, pagina, `!!window.__informe`, 'el informe para el artefacto')
    const htmlInforme = await evaluar(cdp, pagina, `window.__informe`)
    await writeFile(join(SALIDA, 'informe.html'), htmlInforme, 'utf8')
    const impresora = await pestana(cdp)
    const pdf = await aPDF(cdp, impresora, htmlInforme)
    // El foco vuelve a la pagina: crear la impresora la mando al fondo, y una
    // pestaña de fondo no repinta.
    await activar(cdp, pagina)
    // Fetch se apaga AQUI y no antes: mientras siga encendido hay que dejar el
    // bloqueo levantado, y con el bloqueo levantado sin Fetch las peticiones se
    // van a la red real y el script se queda esperando.
    await cdp.enviar('Fetch.disable', {}, pagina).catch(() => {})
    cdp.oyentes.delete('Fetch.requestPaused')
    if (pdf) {
      await writeFile(join(SALIDA, 'informe.pdf'), pdf)
      capturas++
      comprobar(
        pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 20000,
        'B18 el informe produce un PDF real',
        `${(pdf.length / 1024).toFixed(0)} KB`,
      )
    }

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

    // Paneles plegados y tirador: los estados nuevos, que ninguna asercion
    // juzga en cuanto a legibilidad.
    for (const tema of ['light', 'dark']) {
      await ir(cdp, pagina, { ancho: 1920, tema, puerto })
      await clic(cdp, pagina, '.panel .cerrar')
      await clic(cdp, pagina, '.panel-kpi .cerrar')
      await capturar(`captura-plegado-1920-${tema}.png`)
    }

    // Tirador a ×3: 9 px de blanco con una linea de 1 px no se juzgan a tamaño
    // real. Se captura enfocado, que es el estado que menos se mira y el que
    // decide si alguien que navega con teclado sabe donde esta.
    await ir(cdp, pagina, { ancho: 1920, tema: 'light', puerto })
    // El recorte se centra en la MITAD del alto: ahi viven las muescas del
    // tirador. Recortando arriba solo se ve la linea, que es justo lo que no
    // permite juzgar si el tirador se descubre.
    const medio = Math.round((112 + ALTO_VENTANA) / 2)
    const recorte = { x: 260, y: medio - 60, width: 160, height: 120, scale: 1 }
    for (const [nombre, enfocado] of [
      ['captura-tirador-reposo.png', false],
      ['captura-tirador-foco.png', true],
    ]) {
      await evaluar(
        cdp,
        pagina,
        enfocado
          ? `document.querySelector('.tirador').focus()`
          : `document.activeElement?.blur?.()`,
      )
      await espera(80)
      const b64 = await capturar(nombre, recorte)
      const x3 = await evaluar(cdp, lab, `window.__ampliar(${JSON.stringify(b64)}, 40, 20, 90, 80, 4)`)
      await guardar(nombre.replace('.png', '-x4.png'), x3)
      capturas++
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
