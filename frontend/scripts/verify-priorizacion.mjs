// Arnés de la vista de riesgo · aserciones C1..C16
//
// Conserva el nombre de cuando la segunda pestaña se llamaba «Priorización»
// (scripts, CI y documentos lo citan así); desde el 2026-09-15 mide la vista
// «Riesgo»: el modelo nacional DIBUJADO con teselas PMTiles, una por región, y
// los atributos de la comuna elegida en un JSON aparte (DECISIONES.md §S y §T).
//
// LAS MANCHAS YA NO ESTÁN EN EL CANVAS DEL RENDERER. Son <canvas> de teselas
// dentro de .leaflet-tile-pane, uno por tesela y por nivel de zoom. Toda lectura
// de píxeles pasa por LIENZO_RIESGO, que compone las del nivel vigente en un
// lienzo del tamaño del mapa, y espera a que dejen de cambiar (esperarTeselas):
// protomaps dibuja cada tesela en una promesa propia, y leer antes mide medio mapa.
//
// A está tomado por verify-banner y B por verify-panel, así que esta serie
// empieza en C. C12..C14 y C16 vigilan la ficha (<dialog class="ficha">) y el
// punto visto en Google (<dialog class="vista-google">), que son los mismos en
// las dos vistas: están aquí porque este es el arnés que corre con las capas
// REALES, y lo que afirman sale de una figura concreta de los datos.
//
// LAS COMUNAS NO SE ESCRIBEN AQUÍ: se eligen por definición desde dist/data
// (ver comunasDeRiesgo). «A» es la comuna con infraestructura cuyo nombre en el
// paquete de infraestructura NO casa con el del modelo ni quitando tildes (hoy
// Coyhaique/Coihaique); «B», otra con infraestructura y máximo distinto.
//
//     npm run verify:priorizacion
//     npm run verify:priorizacion -- --negativas [--solo C12,C13]
//
// EXIGE `npm run build` ANTES: sirve `dist/`, no lo construye. Medido el
// 2026-09-10: sin ese build el arnés mide el artefacto anterior y da un verde
// --o un rojo-- que no corresponde al código que se acaba de tocar.
//
// C1 ES LA DEUDA MÁS VIEJA DEL REPO. DECISIONES.md §H documenta que con un
// canvas por capa sólo la de encima recibe los clics, y dice que no lo vigila
// nada; mejoras.md lo pone como prioridad alta n.º 1 y describe la prueba:
// «encender dos capas superpuestas, pinchar sobre una figura de la de abajo y
// exigir que se abra su ficha; el mutante es quitar `renderer` de las opciones
// del mapa en src/App.jsx». Hasta ahora no se podía escribir porque ninguna
// capa se superponía de verdad a otra; las áreas de priorización sí.
//
// Trampas del arnés ya pagadas y respetadas aquí:
//   · cada Runtime.evaluate va en un IIFE **async** — sin el async cualquier
//     await lanza SyntaxError y la captura se toma igual, pareciendo correcta
//   · se imprime exceptionDetails SIEMPRE
//   · el tamaño se fija con Emulation.setDeviceMetricsOverride, no con
//     --window-size, que en Windows no baja de ~500 px y RECORTA
//   · en React `select.value = x` no cambia el estado: hay que llamar al setter
//     nativo del prototipo y despachar 'change'
//   · se cuentan COLORES DISTINTOS, no píxeles pintados: un contador de píxeles
//     pasa en verde con todo el mapa del mismo color
//   · servidor en puerto 0 y --user-data-dir propio

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import net from 'node:net'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(AQUI, '..')
const DIST = join(FRONT, 'dist')
// Los datos que se sirven y de los que se eligen las comunas. Por omision, los
// que el build copio a dist/. Con VERIFY_DATOS=<carpeta>, esa carpeta: para medir
// datos que no son los de HEAD SIN componerlos dentro de public/data, que esta
// versionado y un commit se los lleva (DECISIONES.md, fallos 8 y 10). Vale tambien
// en --negativas, que reconstruye dist/ en cada mutante.
const DATOS = process.env.VERIFY_DATOS ? resolve(process.env.VERIFY_DATOS) : join(DIST, 'data')

// Cuantos elementos de infraestructura hay DIBUJADOS, contando lo que se ve: la
// cuenta escrita en cada cumulo mas los iconos sueltos. Desde que la capa es
// nacional y se agrupa (DECISIONES.md §X), contar nodos `.leaflet-marker-icon`
// mide cuantos discos hay, que no es cuantos elementos hay. Expresion, no
// bloque: se interpola dentro de las plantillas que evalua el navegador.
const DIBUJADOS =
  "([...document.querySelectorAll('.marker-cluster')].reduce((a, e) => a + Number(e.textContent.trim() || 0), 0)" +
  " + document.querySelectorAll('.icono-infra').length)"
const CAPA_PUNTOS = join(FRONT, 'src', 'components', 'CapaPuntos.jsx')
const PANEL_RIESGO = join(FRONT, 'src', 'components', 'PanelRiesgo.jsx')
const CONFIG_JS = join(FRONT, 'src', 'config.js')
const CAPA_TESELAS = join(FRONT, 'src', 'components', 'CapaRiesgoTeselas.jsx')
const MAPA_PNG = join(FRONT, 'src', 'mapaPNG.js')
const ESCALAS = join(FRONT, 'src', 'escalas.js')
const APP_JSX = join(FRONT, 'src', 'App.jsx')
const MODAL_FICHA = join(FRONT, 'src', 'components', 'ModalFicha.jsx')
const MODAL_VISTA = join(FRONT, 'src', 'components', 'ModalVistaGoogle.jsx')
const CAPA_ICONOS = join(FRONT, 'src', 'components', 'CapaIconos.jsx')
const ENLACES_GOOGLE = join(FRONT, 'src', 'enlacesGoogle.js')
const FICHAS = join(FRONT, 'src', 'fichas.js')
const BASE = '/coipo_prevencion_incendio/'
const ARGS = process.argv.slice(2)
const valorDe = (flag) => (ARGS.includes(flag) ? ARGS[ARGS.indexOf(flag) + 1] : null)
const NEGATIVAS = ARGS.includes('--negativas')
const SOLO = valorDe('--solo') ? new Set(valorDe('--solo').split(',')) : null
const SIMULAR_CTRL_C = valorDe('--simular-ctrl-c') ? Number(valorDe('--simular-ctrl-c')) : null
// Las cuatro señales de corte de --negativas (ver la guarda 3) y su codigo de
// salida, 128 + n como hace un shell. SIGBREAK es la 21 en Windows.
const SENALES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGBREAK: 149 }
const SENAL_SIMULADA = valorDe('--senal') ?? 'SIGINT'
if (!(SENAL_SIMULADA in SENALES)) {
  console.error(`✘ --senal ${SENAL_SIMULADA}: se esperaba una de ${Object.keys(SENALES).join(', ')}`)
  process.exit(1)
}

/**
 * Formato es-CL escrito con aritmetica decimal PROPIA, sin Intl ni toFixed:
 * parte del texto del numero tal como viaja en el GeoJSON, redondea la mitad
 * hacia arriba con enteros, agrupa miles con punto y separa decimales con coma.
 * `escala` corre la coma (2 = porcentaje) sin multiplicar en binario.
 *
 * No se usa Intl a proposito: la app lo usa, y compararla contra el mismo
 * formateador verificaria que Intl es igual a si mismo. Y tampoco v * 100:
 * medido el 2026-09-14, 0.5295 * 100 da 52,949999999999996, y sobre los 2.288
 * porcentajes de las areas toFixed(1) de v * 100 se aparta del redondeo
 * decimal en 46 y Intl de v * 100 en 13. Probado contra 20 casos escritos por
 * definicion (0,5295 -> «53,0»; 2532 -> «2.532»; 373,5 -> «374») y, como
 * contraste, igual a los formateadores Intl que ahora usa la app en los 19.215
 * valores de areas e incendios (medido en Node 22, no en Chrome).
 */
function esCL(v, { min = 0, max = min, escala = 0 } = {}) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v))
  if (!m) return `¿${v}?`
  const [, signo, ent, frac = ''] = m
  let n = BigInt(ent + frac)
  let k = frac.length - escala
  if (k < 0) {
    n *= 10n ** BigInt(-k)
    k = 0
  }
  if (k > max) {
    const div = 10n ** BigInt(k - max)
    const resto = n % div
    n = n / div + (resto * 2n >= div ? 1n : 0n)
    k = max
  }
  while (k < max) {
    n *= 10n
    k++
  }
  while (k > min && n % 10n === 0n) {
    n /= 10n
    k--
  }
  const txt = n.toString().padStart(k + 1, '0')
  const entero = (k ? txt.slice(0, -k) : txt).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}${entero}${k ? `,${txt.slice(-k)}` : ''}`
}

/** Punto dentro de un anillo [[lon, lat], ...], por paridad de cruces. */
function dentro([x, y], anillo) {
  let si = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si
  }
  return si
}

const sinTildes = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Las dos comunas que usa el arnés, elegidas POR DEFINICIÓN desde dist/data.
 *
 * A · con infraestructura y con un nombre en el paquete de infraestructura que
 *     NO casa con el del modelo ni quitando tildes y mayúsculas (Coyhaique /
 *     Coihaique), la de menos manchas. Es la comuna donde un cruce por nombre
 *     deja 0 iconos y donde un enlace viejo ?comuna= sólo casa por el alias.
 *     Medido el 2026-09-15: con la definición anterior -«nombre distinto» a
 *     secas- salía Mulchen/Mulchén, que casa quitando la tilde, y el mutante que
 *     desactiva los alias SOBREVIVIÓ. C3 cubría la mitad de lo que decía.
 * T · una comuna SIN infraestructura con tilde en el nombre, la de menos manchas.
 *     Sin infraestructura no tiene alias, así que un ?comuna= sin tildes sólo
 *     puede casar normalizando. Medido el 2026-09-15: probarlo con Mulchén no
 *     prueba nada, porque su alias «Mulchen» ya casa con «MULCHEN» y el mutante
 *     que quita la normalización SOBREVIVIÓ.
 * B · otra con infraestructura, con CONTRASTE INTERNO (mínimo distinto del
 *     máximo) y con un máximo de nivel_medio DISTINTO del de A a 3 decimales:
 *     el mínimo es 0 en las comunas medidas, así que sólo el máximo puede
 *     delatar una escala heredada. Sin el contraste interno cae en una comuna de
 *     una sola mancha, que no rotula extremos (medido el 2026-09-16).
 *
 * Lee el manifest y los GeoJSON, que son datos; nada de src/.
 */
function comunasDeRiesgo() {
  const data = DATOS
  const manifest = JSON.parse(readFileSync(join(data, 'manifest.json'), 'utf8'))
  const riesgo = manifest.capas?.riesgo
  if (!riesgo?.partes) throw new Error('el manifest no declara capas.riesgo.partes')
  const infra = JSON.parse(readFileSync(join(data, manifest.capas.infra_puntos.archivo), 'utf8'))
  // Los puntos se cuentan DENTRO de la caja de su comuna, que es el encuadre que
  // usa el visor: desde el insumo nacional (2026-09-16) hay 11 cuyo CUT no cuadra
  // con su coordenada --DECISIONES.md §X--, y esos no se dibujan al encuadrar su
  // comuna. Contarlos daria una expectativa que ninguna version correcta cumple.
  // El nombre alternativo ya no viaja en el punto: sale de `partes[cut].alias`.
  const nombreInfra = new Map()
  const puntos = new Map()
  const coords = new Map()
  for (const f of infra.features) {
    const cut = f.properties.cut
    if (!cut) continue
    const caja = riesgo.partes[cut]?.bbox
    const [lon, lat] = f.geometry.coordinates
    if (!caja || lon < caja[0] - 0.01 || lon > caja[2] + 0.01 || lat < caja[1] - 0.01 || lat > caja[3] + 0.01) continue
    puntos.set(cut, (puntos.get(cut) ?? 0) + 1)
    if (!coords.has(cut)) coords.set(cut, [])
    coords.get(cut).push([lon, lat])
  }
  for (const [cut, p] of Object.entries(riesgo.partes)) {
    const alias = (p.alias ?? []).find((x) => sinTildes(x).toLowerCase() !== sinTildes(p.comuna).toLowerCase())
    if (alias && puntos.get(cut)) nombreInfra.set(cut, alias)
  }
  const d3 = { min: 3, max: 3 }
  const conInfra = [...puntos.keys()]
    .filter((cut) => riesgo.partes[cut])
    .map((cut) => {
      const gj = JSON.parse(readFileSync(join(data, riesgo.partes[cut].archivo), 'utf8'))
      let min = Infinity
      let max = -Infinity
      for (const f of gj.features) {
        min = Math.min(min, f.properties.nivel_medio)
        max = Math.max(max, f.properties.nivel_medio)
      }
      return { cut, gj, parte: riesgo.partes[cut], min, max, nombreInfra: nombreInfra.get(cut), puntos: puntos.get(cut), coords: coords.get(cut) ?? [] }
    })
    .sort((x, y) => x.parte.features - y.parte.features || x.cut.localeCompare(y.cut))
  const clave = (x) => sinTildes(x).toLowerCase().trim()
  const a = conInfra.find((x) => x.nombreInfra && clave(x.nombreInfra) !== clave(x.parte.comuna))
  // B necesita CONTRASTE INTERNO, no solo un maximo distinto: con la capa
  // nacional el universo pasa de 3 comunas a 343 y la primera que cumplia la
  // definicion anterior era Alto Hospicio, con UNA mancha. Ahi la leyenda
  // relativa dice «no hay contraste interno que mostrar» y no rotula extremos,
  // asi que C6 esperaba un «máx.» que ninguna version correcta escribe.
  const b =
    a &&
    conInfra.find(
      (x) =>
        x !== a &&
        x.parte.features >= 2 &&
        esCL(x.min, d3) !== esCL(x.max, d3) &&
        esCL(x.max, d3) !== esCL(a.max, d3),
    )
  const t = Object.entries(riesgo.partes)
    .filter(([, p]) => !(p.alias ?? []).length && sinTildes(p.comuna) !== p.comuna)
    .sort(([c1, p1], [c2, p2]) => p1.features - p2.features || c1.localeCompare(c2))
    .map(([cut, parte]) => ({ cut, parte }))[0]
  if (!a || !b || !t) throw new Error(`no hay comunas que cumplan la definición (A=${a?.cut} B=${b?.cut} T=${t?.cut})`)
  return { manifest, riesgo, a, b, t }
}

// Procesos vivos, para que Ctrl+C durante --negativas pueda matarlos.
let chromeVivo = null
let buildVivo = null

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.pmtiles': 'application/octet-stream',
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
let fallos = 0
const resultados = []

function comprobar(cond, titulo, detalle = '') {
  console.log(`  ${cond ? '✔' : '✘'} ${titulo.padEnd(52)} ${detalle}`)
  if (!cond) fallos++
  resultados.push({ id: titulo.split(' ')[0], ok: !!cond })
  return !!cond
}

function servidor() {
  const s = createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, 'http://l').pathname)
    if (!ruta.startsWith(BASE)) return res.writeHead(404).end()
    ruta = ruta.slice(BASE.length) || 'index.html'
    const limpia = normalize(ruta).replace(/^(\.\.[/\\])+/, '')
    const enDatos = limpia.startsWith('data/') || limpia.startsWith('data' + String.fromCharCode(92))
    const raiz = enDatos ? DATOS : DIST
    const archivo = join(raiz, enDatos ? limpia.slice(5) : limpia)
    if (!archivo.startsWith(raiz) || !existsSync(archivo)) return res.writeHead(404).end()
    const tipo = MIME[extname(archivo)] ?? 'application/octet-stream'
    const tam = statSync(archivo).size
    // PMTiles lee por trozos y SE NIEGA a seguir con un 200 completo («Check that
    // your storage backend supports HTTP Byte Serving»): sin Range la vista de
    // riesgo no dibuja ni una mancha. GitHub Pages lo soporta; este servidor
    // tiene que hacer lo mismo.
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (rango && (rango[1] !== '' || rango[2] !== '')) {
      const ini = rango[1] === '' ? Math.max(0, tam - Number(rango[2])) : Number(rango[1])
      const fin = Math.min(rango[1] !== '' && rango[2] !== '' ? Number(rango[2]) : tam - 1, tam - 1)
      if (ini > fin) return res.writeHead(416, { 'content-range': `bytes */${tam}` }).end()
      res.writeHead(206, {
        'content-type': tipo, 'content-length': fin - ini + 1,
        'content-range': `bytes ${ini}-${fin}/${tam}`, 'accept-ranges': 'bytes',
      })
      return createReadStream(archivo, { start: ini, end: fin }).pipe(res)
    }
    res.writeHead(200, { 'content-type': tipo, 'content-length': tam, 'accept-ranges': 'bytes' })
    createReadStream(archivo).pipe(res)
  })
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, puerto: s.address().port })))
}

function chromePath() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].find(existsSync)
}

function puertoLibre() {
  return new Promise((ok) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) })
  })
}

// Borra el perfil DESPUES de que Chrome salga. Borrarlo justo tras kill() falla
// en Windows porque Chrome y sus procesos hijos siguen reteniendo archivos unos
// instantes; con el error silenciado, el 2026-09-15 habia en %TEMP% 155 perfiles
// de verify-priorizacion, 137 de verify-panel, 44 de verify-banner y 36 de
// verify-electrico. Si aun asi no se puede, se dice.
async function cerrarChrome(proc, perfil) {
  if (proc.exitCode === null && proc.signalCode === null) {
    await new Promise((ok) => {
      const t = setTimeout(ok, 5000)
      proc.once('exit', () => {
        clearTimeout(t)
        ok()
      })
      proc.kill()
    })
  }
  try {
    await rm(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch (e) {
    console.error(`    · no se pudo borrar el perfil de Chrome ${perfil} (${e.code})`)
  }
}

async function lanzarChrome() {
  // --user-data-dir propio: sin él Chrome se adjunta a la sesión ya abierta,
  // termina de inmediato y no genera ninguna captura.
  const perfil = await mkdtemp(join(tmpdir(), 'verify-prioriz-'))
  const puerto = await puertoLibre()
  const proc = spawn(chromePath(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    // Google NO RESUELVE: C12 y C16 abren el punto en satélite y Street View,
    // y afirman el `src` del iframe, no sus píxeles. Así ni CI ni una corrida
    // local dependen de que Google responda, y ninguna figura de los datos sale
    // hacia Google. Por DNS y no con Network.setBlockedURLs: el iframe es de
    // otro sitio y corre en otro proceso, y las reglas del resolvedor valen para
    // todo el navegador. El visor no usa ningún otro host de Google.
    '--host-resolver-rules=MAP google.com ~NOTFOUND, MAP *.google.com ~NOTFOUND, MAP *.gstatic.com ~NOTFOUND, MAP *.googleapis.com ~NOTFOUND',
    `--remote-debugging-port=${puerto}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${perfil}`, 'about:blank',
  ], { stdio: 'ignore' })
  chromeVivo = proc
  for (let i = 0; i < 400; i++) {
    if (proc.exitCode !== null) throw new Error(`Chrome terminó con código ${proc.exitCode}`)
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/json/version`)
      if (r.ok) {
        const j = await r.json()
        if (j.webSocketDebuggerUrl) return { proc, ws: j.webSocketDebuggerUrl, perfil }
      }
    } catch { /* arrancando */ }
    await espera(50)
  }
  throw new Error('Chrome no inició CDP')
}

async function conectar(url) {
  const ws = new WebSocket(url)
  await new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true })
    ws.addEventListener('error', () => mal(new Error('CDP no abrió')), { once: true })
  })
  let id = 0
  const pend = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    const p = pend.get(m.id)
    if (!p) return
    pend.delete(m.id)
    if (m.error) p.mal(new Error(m.error.message))
    else p.ok(m.result)
  })
  const enviar = (method, params = {}, sessionId) =>
    new Promise((ok, mal) => {
      const msg = { id: ++id, method, params }
      if (sessionId) msg.sessionId = sessionId
      pend.set(msg.id, { ok, mal })
      ws.send(JSON.stringify(msg))
    })
  return { ws, enviar }
}

// ---------------------------------------------------------------------------

// `bloque`: sin él corre todo; 'C1' sólo C1; 'ficha' sólo C12..C14 y C16. Los dos
// últimos existen para que cada mutante de --negativas no pague la suite
// entera (~45 s) cuando su aserción está en un solo bloque.
async function correr({ bloque } = {}) {
  const { s, puerto } = await servidor()
  const { proc, ws: wsUrl, perfil } = await lanzarChrome()
  const cdp = await conectar(wsUrl)
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })
  await cdp.enviar('Page.enable', {}, sessionId)
  await cdp.enviar('Runtime.enable', {}, sessionId)
  // Chrome SUSPENDE el renderizado de las pestañas en segundo plano.
  await cdp.enviar('Target.activateTarget', { targetId })
  await cdp.enviar('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
  // Tema CLARO fijo: sin esto cada equipo capturaba con el suyo (este, en
  // oscuro) y el claro quedaba sin mirar. C18 recorre los dos a proposito.
  await cdp.enviar('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)

  const evaluar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', {
      // IIFE **async**: ver la cabecera.
      expression: `(async () => { ${expr} })()`,
      returnByValue: true, awaitPromise: true,
    }, sessionId)
    if (r.exceptionDetails) {
      console.error('    EXCEPCIÓN:', JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails))
      return null
    }
    return r.result?.value
  }

  const esperar = async (expr, etiqueta, ms = 30000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await evaluar(`return !!(${expr})`)) return true
      await espera(150)
    }
    console.error(`    AGOTADO esperando: ${etiqueta}`)
    return false
  }

  const ir = async (query) => {
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}${BASE}${query}` }, sessionId)
    await espera(500)
  }

  // Las manchas tal como se ven: los <canvas> de las teselas de riesgo del
  // nivel de zoom VIGENTE, compuestos en un lienzo del tamaño del mapa. El mapa
  // base son <img>, así que los <canvas> del pane de teselas son sólo riesgo.
  // Leaflet deja un rato los niveles anteriores debajo durante un zoom: se toma
  // el contenedor de mayor z-index, que es el del zoom actual. Deja en `d` los
  // píxeles RGBA (sin premultiplicar) y en `nTeselas` cuántas se compusieron.
  const LIENZO_RIESGO = `
    const cont = document.querySelector('.leaflet-container')
    if (!cont) return null
    const caja = cont.getBoundingClientRect()
    const capa = [...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].find((l) => l.querySelector('canvas'))
    const nivel = capa && [...capa.querySelectorAll('.leaflet-tile-container')]
      .sort((x, y) => (Number(y.style.zIndex) || 0) - (Number(x.style.zIndex) || 0))[0]
    const lienzoComp = new OffscreenCanvas(Math.max(1, Math.round(caja.width)), Math.max(1, Math.round(caja.height)))
    const gComp = lienzoComp.getContext('2d', { willReadFrequently: true })
    gComp.imageSmoothingEnabled = false
    let nTeselas = 0
    for (const t of nivel ? nivel.querySelectorAll('canvas') : []) {
      const r = t.getBoundingClientRect()
      if (!r.width || !t.width) continue
      gComp.drawImage(t, r.left - caja.left, r.top - caja.top, r.width, r.height)
      nTeselas++
    }
    const d = gComp.getImageData(0, 0, lienzoComp.width, lienzoComp.height).data`

  const tintaRiesgo = `${LIENZO_RIESGO}
    let a = 0
    for (let i = 3; i < d.length; i += 4) a += d[i]
    return { tinta: Math.round(a / 1000), nTeselas }`

  // protomaps dibuja cada tesela en su propia promesa, con un retardo que crece
  // con la distancia al centro: leer tras un tiempo fijo mide medio mapa. Se
  // espera a que la tinta deje de cambiar en tres lecturas seguidas.
  const esperarTeselas = async (ms = 20000) => {
    const t0 = Date.now()
    let prev = null
    let iguales = 0
    let ultimo = null
    while (Date.now() - t0 < ms) {
      ultimo = await evaluar(tintaRiesgo)
      if (ultimo && prev && ultimo.tinta === prev.tinta && ultimo.nTeselas === prev.nTeselas) iguales++
      else iguales = 0
      if (iguales >= 2) return ultimo
      prev = ultimo
      await espera(350)
    }
    console.error(`    AGOTADO esperando que las teselas dejen de cambiar (última: ${JSON.stringify(ultimo)})`)
    return ultimo
  }

  // Colores del mapa, leídos de los PÍXELES y no del estado de React ni de las
  // opciones de Leaflet. Dos razones: mirar el resultado es lo único que prueba
  // que se pintó, y así el arnés no depende de ningún interno (`window.__mapa`
  // y compañía) que habría que exponer sólo para medirlo.
  //
  // Devuelve el número de colores DISTINTOS con presencia real y el recuento
  // del más extendido. Contar píxeles pintados a secas pasaría en verde con
  // todo el mapa del mismo color, que es el fallo que esto viene a cazar.
  const coloresDeAreas = `${LIENZO_RIESGO}
    const cuenta = {}
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue
      // Se cuantiza a pasos de 8 para que el antialias de los bordes no
      // invente colores que nadie eligió.
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)
      cuenta[k] = (cuenta[k] ?? 0) + 1
    }
    // Sólo los colores con superficie de verdad: por debajo de 200 px es borde.
    const reales = Object.values(cuenta).filter((n) => n > 200)
    return { distintos: reales.length, mayor: reales.length ? Math.max(...reales) : 0 }`

  // La pantalla tal cual, con la ficha abierta. No es una aserción: quien
  // decide si la ficha se lee es alguien mirando el PNG.
  const capturar = async (nombre) => {
    const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'png' }, sessionId)
    const dir = join(FRONT, '.verificacion')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, nombre), Buffer.from(data, 'base64'))
    console.log(`    · .verificacion/${nombre}`)
  }

  // Abre la ficha de UNA figura concreta de los datos: pincha alrededor de
  // `punto` (por omisión, el centro del mapa) hasta que la ficha abierta diga,
  // en la fila `rotulo`, el `valor` buscado; una ficha de otra figura se cierra
  // y se sigue. Deja la ficha ABIERTA, para capturarla.
  const abrirFichaDe = async (rotulo, valor, { punto = null, radioMax = 24, paso = 6 } = {}) => {
    let r = null
    // Hasta tres pasadas: la capa puede no haber terminado de pintarse.
    for (let intento = 0; intento < 3; intento++) {
      r = await evaluar(`
        const ROTULO = ${JSON.stringify(rotulo)}, VALOR = ${JSON.stringify(valor)}
        const cont = document.querySelector('.leaflet-container')
        const d = document.querySelector('dialog.ficha')
        if (!cont || !d) return { error: 'sin mapa o sin dialog.ficha' }
        const caja = cont.getBoundingClientRect()
        const [cx, cy] = ${JSON.stringify(punto)} ?? [caja.left + caja.width / 2, caja.top + caja.height / 2]
        const vistas = []
        for (let radio = 0; radio <= ${radioMax}; radio += ${paso}) {
          const pasos = radio
            ? [[radio, 0], [-radio, 0], [0, radio], [0, -radio], [radio, radio], [-radio, -radio], [radio, -radio], [-radio, radio]]
            : [[0, 0]]
          for (const [dx, dy] of pasos) {
            // Al elemento que HAY en ese punto, como un clic de verdad: en la vista
            // de incendios es el canvas del renderer; en la de riesgo, una tesela.
            const lienzo = document.elementFromPoint(cx + dx, cy + dy)
            if (!lienzo || !cont.contains(lienzo)) continue
            for (const tipo of ['mousedown', 'mouseup', 'click']) {
              lienzo.dispatchEvent(new MouseEvent(tipo, {
                clientX: cx + dx, clientY: cy + dy, bubbles: true, cancelable: true, view: window,
              }))
            }
            for (let i = 0; i < 10 && !d.open; i++) await new Promise(z => setTimeout(z, 30))
            if (!d.open) continue
            const filas = Object.fromEntries([...d.querySelectorAll('tr')].map((tr) => [
              tr.querySelector('th')?.textContent.trim(), tr.querySelector('td')?.textContent.trim(),
            ]))
            if (filas[ROTULO] === VALOR) {
              return {
                dx, dy, filas,
                capa: d.querySelector('.ficha-capa')?.textContent.trim() ?? '',
                botones: [...d.querySelectorAll('.ficha-acciones button')].map((b) => b.dataset.vista ?? ''),
                html: d.innerHTML,
              }
            }
            vistas.push(filas[ROTULO] ?? '?')
            d.close()
            await new Promise(z => setTimeout(z, 30))
          }
        }
        return { error: 'no se abrió su ficha', vistas }`)
      if (r && !r.error) return r
      await espera(1500)
    }
    return r
  }

  const cerrarFicha = () => evaluar(`document.querySelector('dialog.ficha')?.close(); return true`)

  // ---- C12..C14 · la ficha ----------------------------------------------
  const comprobarFicha = async () => {
    console.log('\n▶ C12..C14, C16 · la ficha: satélite, Street View y Earth, cifras es-CL')
    let manifest, incendios, R
    try {
      manifest = JSON.parse(readFileSync(join(DATOS, 'manifest.json'), 'utf8'))
      incendios = JSON.parse(readFileSync(join(DATOS, manifest.capas.incendios.archivo), 'utf8'))
      R = comunasDeRiesgo()
    } catch (e) {
      for (const id of ['C12', 'C13', 'C14', 'C16']) comprobar(false, `${id} la ficha`, `no se pudieron leer las capas de dist/data: ${e.message}`)
      return
    }

    // ---- C12 · satélite, Street View y Earth marcan la coordenada ---------
    // Desde el 2026-09-15 la ficha no enlaza a Google: abre el punto en un
    // segundo <dialog> con satélite y Street View incrustados, y Earth queda
    // como enlace dentro de él (Earth no se deja incrustar; DECISIONES.md §V).
    // Se afirma la FORMA de cada dirección y que su coordenada sea la de la
    // figura, leída por el arnés de su propia geometría. Las direcciones se
    // desarman con URL y no con una expresión sobre la cadena entera: el orden
    // de los parámetros de un embed no documentado no significa nada.
    //
    // Earth estuvo con la URL de cámara /web/@lat,lon,0a,1200d,... que sólo
    // mueve la cámara: capturada a los 40 s el 2026-09-14 con el incendio
    // 1262, bosque y un camino SIN ninguna marca. La de búsqueda
    // /web/search/lat,lon planta la chincheta. El HTTP 200 no discrimina (Earth
    // es una SPA).
    //
    // La figura se elige por definición y no a mano: un incendio con ID, sin
    // otro en la misma coordenada (el clic sería ambiguo) y con décimas de
    // metro en X e Y, que es lo que C14 necesita; entre ellos el de mayor
    // superficie, para que la superficie pase de 999 y lleve punto de miles.
    // Con los datos del 2026-09-14 es el 1262, Cuesta Llampaiquillo.
    const fraccion = (v) => typeof v === 'number' && !Number.isInteger(v)
    const enMismoSitio = new Map()
    for (const f of incendios.features) {
      const k = f.geometry?.coordinates?.join(',')
      enMismoSitio.set(k, (enMismoSitio.get(k) ?? 0) + 1)
    }
    const inc = incendios.features
      .filter((f) => f.geometry?.type === 'Point' && f.properties.id != null
        && fraccion(f.properties.utm_x) && fraccion(f.properties.utm_y)
        && enMismoSitio.get(f.geometry.coordinates.join(',')) === 1)
      .sort((a, b) => (b.properties.superficie_ha ?? 0) - (a.properties.superficie_ha ?? 0))[0]

    if (!inc) {
      // Sin figura no hay nada que medir, y un verde aquí sería mentira.
      comprobar(false, 'C12 satélite, Street View y Earth marcan la coordenada del registro', 'ningún incendio cumple el criterio de selección')
      comprobar(false, 'C14 la ficha del incendio escribe metros y superficie en es-CL', 'ningún incendio con décimas de metro en X e Y')
      comprobar(false, 'C16 Google sólo carga al pulsar, sobre la ficha, y se suelta al cerrar', 'ningún incendio cumple el criterio de selección')
    } else {
      const [lon, lat] = inc.geometry.coordinates
      const p = inc.properties
      // La vista de incendios SÍ respeta el encuadre de la URL: con el punto en
      // el centro basta pinchar el centro del mapa (a z16 el vecino más cercano
      // del 1262 queda a 3,3 km, cientos de píxeles).
      await ir(`?capas=incendios&lat=${lat}&lon=${lon}&z=16`)
      await esperar(`document.querySelector('.leaflet-overlay-pane canvas')`, 'canvas del mapa')
      await esperar(
        `[...document.querySelectorAll('.kpi, .meta')].some(e => /\\d/.test(e.textContent))`,
        'capas contadas',
      )
      await espera(2000)
      const fi = await abrirFichaDe('ID', String(p.id))
      if (fi && !fi.error) await capturar('priorizacion-ficha-incendio.png')

      // ---- el recorrido de C12 y C16: pulsar, cambiar de pestaña, cerrar ----
      // Todo por el DOM, con los mismos elementos que usaría una persona: el
      // botón de la ficha, la pestaña del modal y su ×. Nada de src/.
      const leerVista = `
        const v = document.querySelector('dialog.vista-google')
        const f = document.querySelector('dialog.ficha')
        return {
          abierta: !!v?.open,
          fichaAbierta: !!f?.open,
          iframes: document.querySelectorAll('iframe').length,
          src: v?.querySelector('iframe')?.getAttribute('src') ?? '',
          enlaces: [...(v?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href') ?? ''),
          html: (v?.innerHTML ?? '') + (f?.innerHTML ?? ''),
        }`
      const pulsar = (selector) => evaluar(`
        const b = document.querySelector(${JSON.stringify(selector)})
        if (!b) return false
        b.focus()
        b.click()
        return true`)
      let antes = null
      let sat = null
      let sv = null
      let despues = null
      if (fi && !fi.error) {
        antes = await evaluar(leerVista)
        if (await pulsar('dialog.ficha .ficha-acciones button[data-vista="satelite"]')
          && await esperar(`document.querySelector('dialog.vista-google[open] iframe')`, 'la vista satelital', 5000)) {
          sat = await evaluar(leerVista)
          await capturar('priorizacion-vista-google.png')
          if (await pulsar('dialog.vista-google [role="tab"][data-vista="streetview"]')
            && await esperar(
              `document.querySelector('dialog.vista-google [role="tab"][data-vista="streetview"][aria-selected="true"]')`
                + ` && document.querySelector('dialog.vista-google iframe')`,
              'la pestaña Street View', 5000,
            )) {
            sv = await evaluar(leerVista)
          }
          if (await pulsar('dialog.vista-google .vista-google-cerrar')) {
            await esperar(`!document.querySelector('dialog.vista-google')?.open`, 'el cierre de la vista', 5000)
            await espera(150)
            despues = await evaluar(leerVista)
          }
        }
      }

      const reEarth = new RegExp('^https://earth\\.google\\.com/web/search/(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)$')
      // La ficha publica 5 decimales (~1 m, App.jsx): ninguna cifra de más, y
      // la tolerancia es media unidad de la quinta.
      const cerca = (txt, ref) => (txt.split('.')[1] ?? '').length <= 5 && Math.abs(Number(txt) - ref) <= 0.5e-5 + 1e-9
      // «lat,lon» con la latitud PRIMERO: invertidas, las dos caen fuera.
      const enElPunto = (txt) => {
        const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(txt ?? '')
        return !!m && cerca(m[1], lat) && cerca(m[2], lon)
      }
      const desarmar = (src) => {
        try {
          const u = new URL(src)
          return u.origin === 'https://www.google.com' && u.pathname === '/maps' ? u.searchParams : null
        } catch {
          return null
        }
      }
      const qSat = desarmar(sat?.src)
      // t=k es satélite: sin él el embed abre el mapa de calles.
      const okSat = !!qSat && qSat.get('output') === 'embed' && qSat.get('t') === 'k'
        && enElPunto(qSat.get('q')) && enElPunto(qSat.get('ll'))
      const qSv = desarmar(sv?.src)
      const okSv = !!qSv && qSv.get('output') === 'svembed' && qSv.get('layer') === 'c' && enElPunto(qSv.get('cbll'))
      // La salida de la pestaña de Street View cuando no hay imágenes, que es
      // lo normal: el deep link oficial de Maps, con el punto en viewpoint.
      const qPano = (sv?.enlaces ?? []).map((h) => {
        try {
          const u = new URL(h)
          return u.pathname === '/maps/@' && u.searchParams.get('map_action') === 'pano' ? u.searchParams : null
        } catch {
          return null
        }
      }).find(Boolean)
      const okPano = !!qPano && enElPunto(qPano.get('viewpoint'))
      const mEarth = (sat?.enlaces ?? []).map((h) => reEarth.exec(h)).find(Boolean)
      const okEarth = !!mEarth && cerca(mEarth[1], lat) && cerca(mEarth[2], lon)
      // En TODA la ficha y en todo el modal, no sólo en el enlace de Earth: la
      // URL de cámara no puede volver por ningún sitio.
      const conCamara = !fi?.html || [fi.html, sat?.html, sv?.html].some((h) => h?.includes('/web/@'))
      comprobar(
        fi && !fi.error && okSat && okSv && okPano && okEarth && !conCamara,
        'C12 satélite, Street View y Earth marcan la coordenada del registro',
        fi?.error
          ? `incendio ${p.id}: ${fi.error} · vistas ${JSON.stringify(fi.vistas)}`
          : `incendio ${p.id} en ${lat},${lon} · satélite ${okSat ? 'ok' : `MAL ${sat?.src || 'sin iframe'}`}`
            + ` · Street View ${okSv ? 'ok' : `MAL ${sv?.src || 'sin iframe'}`}`
            + ` · buscar alrededor ${okPano ? 'ok' : `MAL ${qPano?.get('viewpoint') ?? 'sin enlace'}`}`
            + ` · Earth ${okEarth ? 'ok' : `MAL ${sat?.enlaces?.find((h) => h.includes('earth')) ?? 'sin enlace'}`}`
            + ` · /web/@ ${conCamara ? 'PRESENTE' : 'ausente'}`,
      )

      // ---- C16 · Google sólo carga al pulsar, sobre la ficha, y se suelta ----
      // Tres defectos que no se ven en una captura:
      //   · un iframe montado con la ficha pediría Google con cada clic en el
      //     mapa (C1 abre y cierra ~150 fichas en segundos);
      //   · un modal que REEMPLAZA a la ficha obliga a volver a pinchar el mapa;
      //   · un modal que se cierra sin desmontar su iframe deja Street View
      //     cargando detrás de la ficha.
      const okBotones = ['satelite', 'streetview'].every((v) => fi?.botones?.includes(v))
      comprobar(
        !!(fi && !fi.error && okBotones && antes?.iframes === 0
          && sat?.abierta && sat.fichaAbierta && sat.iframes === 1 && sv?.iframes === 1
          && despues && !despues.abierta && despues.fichaAbierta && despues.iframes === 0),
        'C16 Google sólo carga al pulsar, sobre la ficha, y se suelta al cerrar',
        `botones ${JSON.stringify(fi?.botones)} · iframes con la ficha sola ${antes?.iframes}`
          + ` · con satélite ${sat?.iframes} (ficha ${sat?.fichaAbierta ? 'abierta' : 'CERRADA'})`
          + ` · con Street View ${sv?.iframes}`
          + ` · tras la × ${despues?.iframes} (modal ${despues?.abierta ? 'ABIERTO' : 'cerrado'},`
          + ` ficha ${despues?.fichaAbierta ? 'abierta' : 'CERRADA'})`,
      )

      // ---- C14 · metros UTM y superficie en es-CL ---------------------------
      // Los metros van SIN agrupar a propósito (un «360.886» se lee como
      // decimal, fichas.js lo explica) pero con coma decimal: el 1262 decía
      // «257878.8 E». Lo que se exige sale de la definición, no de copiar la
      // app: sólo dígitos y a lo sumo una coma, y leída esa coma como punto,
      // el MISMO número del GeoJSON. El huso sale del EPSG (327zz = zona zz S).
      const utm = fi?.filas?.['Coordenadas UTM'] ?? ''
      const mU = /^(\d+(?:,\d+)?) E · (\d+(?:,\d+)?) N · huso (\d{2})S$/.exec(utm)
      const okUtm = !!mU
        && Number(mU[1].replace(',', '.')) === p.utm_x
        && Number(mU[2].replace(',', '.')) === p.utm_y
        && mU[3] === String(p.utm_epsg - 32700)
      const supEsperada = `${esCL(p.superficie_ha, { min: 0, max: 1 })} ha`
      const okSup = fi?.filas?.Superficie === supEsperada
      comprobar(
        fi && !fi.error && okUtm && okSup,
        'C14 la ficha del incendio escribe metros y superficie en es-CL',
        `UTM «${utm}» (${p.utm_x} · ${p.utm_y} · EPSG ${p.utm_epsg}) · superficie «${fi?.filas?.Superficie}», esperada «${supEsperada}»`,
      )
      await cerrarFicha()

      // ---- C17 · la ficha larga: cabecera fija, pista y foco a la vista -------
      // La misma ficha del 1262 con la ventana a 700 px de alto, para que
      // desborde por definicion y no por la casualidad de sus 19 filas: a
      // 1440x900 medía 658 px de contenido en 628 de caja. Se exige que al bajar
      // hasta la ultima fila la cabecera siga arriba, que la pista del pie se vea
      // mientras queda contenido y desaparezca al final, y que un Tab hacia un
      // enlace tapado lo deje DEBAJO de la cabecera.
      await cdp.enviar('Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId)
      await ir(`?capas=incendios&lat=${lat}&lon=${lon}&z=16`)
      await esperar(`document.querySelector('.leaflet-overlay-pane canvas')`, 'canvas del mapa')
      await esperar(`[...document.querySelectorAll('.kpi, .meta')].some(e => /\\d/.test(e.textContent))`, 'capas contadas')
      await espera(2000)
      const fl = await abrirFichaDe('ID', String(p.id))
      let c17 = null
      let foco17 = null
      if (fl && !fl.error) {
        c17 = await evaluar(`
          const d = document.querySelector('dialog.ficha')
          const dormir = (ms) => new Promise((z) => setTimeout(z, ms))
          const pista = () => { const x = d.querySelector('.ficha-pista'); return !!x && !x.hidden && x.getClientRects().length > 0 }
          const desborda = d.scrollHeight > d.clientHeight + 2
          const pistaArriba = pista()
          d.scrollTop = d.scrollHeight
          await dormir(250)
          const caja = d.getBoundingClientRect()
          const cab = d.querySelector('header').getBoundingClientRect()
          const ultima = [...d.querySelectorAll('tr')].at(-1).getBoundingClientRect()
          const res = {
            desborda, pistaArriba, pistaAbajo: pista(),
            cabeceraArriba: cab.top >= caja.top - 1 && cab.top <= caja.top + 2,
            ultimaVisible: ultima.bottom <= caja.bottom + 1,
            alto: [d.clientHeight, d.scrollHeight], cabTop: Math.round(cab.top), cajaTop: Math.round(caja.top),
          }
          d.scrollTop = Math.round((d.scrollHeight - d.clientHeight) / 2)
          await dormir(150)
          d.querySelector('.ficha-cerrar').focus()
          return res`)
        await capturar('priorizacion-ficha-larga.png')
        for (const tipo of ['keyDown', 'keyUp']) {
          await cdp.enviar('Input.dispatchKeyEvent', { type: tipo, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
        }
        await espera(300)
        foco17 = await evaluar(`
          const d = document.querySelector('dialog.ficha')
          const a = document.activeElement
          return { que: (a?.textContent ?? '').trim(), top: Math.round(a.getBoundingClientRect().top),
                   cabBottom: Math.round(d.querySelector('header').getBoundingClientRect().bottom) }`)
      }
      comprobar(
        !!c17 && c17.desborda && c17.pistaArriba && !c17.pistaAbajo && c17.cabeceraArriba && c17.ultimaVisible
          && !!foco17 && foco17.top >= foco17.cabBottom - 1,
        'C17 la ficha larga conserva la cabecera, avisa que hay más y no tapa el foco',
        !c17
          ? `no se abrió la ficha del incendio ${p.id}: ${fl?.error}`
          : `caja ${c17.alto[0]} de ${c17.alto[1]} px · pista arriba ${c17.pistaArriba} / al final ${c17.pistaAbajo} · cabecera en y=${c17.cabTop} con la caja en y=${c17.cajaTop} · última fila visible ${c17.ultimaVisible} · Tab a «${foco17?.que}» en y=${foco17?.top}, cabecera hasta y=${foco17?.cabBottom}`,
      )
      await cerrarFicha()
      await cdp.enviar('Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    }

    // ---- C13 · las cifras de la ficha de una mancha, en es-CL --------------
    // Cada cifra se recalcula con esCL() desde la figura del GeoJSON y se
    // compara texto con texto; además ninguna celda puede traer un punto
    // decimal (un punto seguido de 1, 2 o 4+ dígitos; el de 3 es de miles).
    //
    // La mancha se elige para que cada formato pueda fallar a la vista: nivel
    // con 3 decimales, rango con mínimo distinto del máximo (invertirlos se
    // nota), pct_alto con décima (un formateador de porcentaje que multiplica
    // por 100 escribiría «5.000,0 %») y superficie de 1.000 ha o más con
    // centésimas (punto de miles y coma decimal a la vez). Entre esas, la
    // mayor: es la más fácil de pinchar. Siempre de la comuna A.
    //
    // Cómo se pincha: esta vista NO respeta ?lat=&lon=&z= --al entrar encuadra
    // la comuna, medido el 2026-09-14--, así que se entra con ?comuna=, se lee
    // el encuadre que la app escribe en la URL y el arnés proyecta el polígono
    // a píxeles con su propio Web Mercator. Se pincha en el punto interior más
    // alejado del borde, y sólo si esa holgura es de 3 px o más.
    const decimales = (v) => (String(v).split('.')[1] ?? '').length
    const candidatas = R.a.gj.features
      .filter((f) => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
      .filter((f) => {
        const p = f.properties
        return decimales(p.nivel_medio) === 3 && p.nivel_medio_min !== p.nivel_medio_max
          && decimales(p.pct_alto) === 1 && p.area_ha >= 1000 && decimales(p.area_ha) === 2
      })
      .map((f) => ({ f }))
      .sort((x, y) => y.f.properties.area_ha - x.f.properties.area_ha
        || x.f.properties.mancha_id.localeCompare(y.f.properties.mancha_id))
      .slice(0, 6)

    const mercator = (lon, lat, z) => {
      const e = 256 * 2 ** z
      const s = Math.sin((lat * Math.PI) / 180)
      return [((lon + 180) / 360) * e, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * e]
    }
    const aSegmento = (q, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy)
    }

    // El punto interior más alejado del borde de una geometría, en píxeles de
    // pantalla, con el encuadre `v` que la app escribió en la URL.
    const puntoInterior = (geometria, v) => {
      const c0 = mercator(v.lon, v.lat, v.z)
      const [left, top, ancho, alto] = v.r
      const aPx = ([lo, la]) => {
        const m = mercator(lo, la, v.z)
        return [left + ancho / 2 + m[0] - c0[0], top + alto / 2 + m[1] - c0[1]]
      }
      const poligonos = (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates)
        .map((pol) => pol.map((anillo) => anillo.map(aPx)))
      let mejor = null
      for (const [exterior, ...huecos] of poligonos) {
        const xs = exterior.map((q) => q[0]), ys = exterior.map((q) => q[1])
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        if (x1 < left || x0 > left + ancho || y1 < top || y0 > top + alto) continue
        for (let i = 0; i <= 32; i++) {
          for (let j = 0; j <= 32; j++) {
            const q = [x0 + ((x1 - x0) * i) / 32, y0 + ((y1 - y0) * j) / 32]
            if (q[0] < left + 8 || q[0] > left + ancho - 8 || q[1] < top + 8 || q[1] > top + alto - 8) continue
            if (!dentro(q, exterior) || huecos.some((h) => dentro(q, h))) continue
            let holgura = Infinity
            for (const anillo of [exterior, ...huecos]) {
              for (let k = 0; k < anillo.length - 1; k++) holgura = Math.min(holgura, aSegmento(q, anillo[k], anillo[k + 1]))
            }
            if (!mejor || holgura > mejor.holgura) mejor = { q, holgura }
          }
        }
      }
      return mejor
    }
    const leerEncuadre = () => evaluar(`
      const q = new URLSearchParams(location.search)
      const r = document.querySelector('.leaflet-container').getBoundingClientRect()
      return { lat: +q.get('lat'), lon: +q.get('lon'), z: +q.get('z'), r: [r.left, r.top, r.width, r.height] }`)

    let fa = null
    let elegida = null
    let comunaCargada = null
    const intentos = []
    for (const cand of candidatas) {
      const pc = cand.f.properties
      if (comunaCargada !== pc.comuna) {
        await ir(`?vista=riesgo&comuna=${R.a.cut}`)
        await esperar(`document.querySelector('.panel h1')?.textContent.includes('Riesgo')`, 'panel')
        await esperar(`document.querySelector('.leaflet-tile-pane canvas')`, 'teselas de riesgo')
        // El encuadre se anima y la URL se escribe 250 ms después del moveend.
        await esperar(`new URLSearchParams(location.search).get('z')`, 'encuadre escrito en la URL')
        await espera(1800)
        await esperarTeselas()
        comunaCargada = pc.comuna
      }
      const v = await leerEncuadre()
      if (!v || !Number.isFinite(v.z)) {
        intentos.push(`${pc.mancha_id}: sin encuadre en la URL`)
        continue
      }
      const mejor = puntoInterior(cand.f.geometry, v)
      if (!mejor || mejor.holgura < 3) {
        intentos.push(`${pc.mancha_id}: holgura ${mejor ? mejor.holgura.toFixed(1) : 0} px a z${v.z}`)
        continue
      }
      fa = await abrirFichaDe('Identificador', pc.mancha_id, { punto: mejor.q, radioMax: 2, paso: 1 })
      if (fa && !fa.error) {
        elegida = { ...cand, holgura: mejor.holgura, z: v.z }
        break
      }
      intentos.push(`${pc.mancha_id}: ${fa?.error} · vistas ${JSON.stringify(fa?.vistas)}`)
    }

    if (!elegida) {
      comprobar(false, 'C13 la ficha de una mancha escribe sus cifras en es-CL', `no se abrió ninguna: ${intentos.join(' | ') || 'sin candidatas en la comuna ' + R.a.cut}`)
      return
    }
    const pa = elegida.f.properties
    await capturar('priorizacion-ficha-mancha.png')

    const d3 = { min: 3, max: 3 }
    const esperado = {
      Comuna: pa.comuna,
      Región: R.a.parte.region,
      'Clase (escala del modelo)': pa.clase,
      'Nivel medio (0 a 4)': esCL(pa.nivel_medio, d3),
      'Rango interno': `${esCL(pa.nivel_medio_min, d3)} – ${esCL(pa.nivel_medio_max, d3)}`,
      'Superficie en nivel Alto o Muy Alto': `${esCL(pa.pct_alto, { min: 1, max: 1 })} %`,
      Superficie: `${esCL(pa.area_ha, { min: 2, max: 2 })} ha`,
      'Celdas H3': esCL(pa.n_hexagonos),
      Identificador: pa.mancha_id,
    }
    const filas = fa?.filas ?? {}
    const malas = Object.entries(esperado)
      .filter(([k, v]) => filas[k] !== v)
      .map(([k, v]) => `${k} «${filas[k]}» ≠ «${v}»`)
    const conPunto = Object.entries(filas).filter(([, v]) => /\d\.(?:\d{1,2}|\d{4,})(?!\d)/.test(v ?? ''))
    comprobar(
      fa && !fa.error && malas.length === 0 && conPunto.length === 0,
      'C13 la ficha de una mancha escribe sus cifras en es-CL',
      fa?.error
        ? `${pa.mancha_id}: ${fa.error} · vistas ${JSON.stringify(fa.vistas)}`
        : malas.length || conPunto.length
          ? [...malas, ...conPunto.map(([k, v]) => `${k} «${v}» con punto decimal`)].join(' · ')
          : `${pa.mancha_id}: ${Object.keys(esperado).length} filas iguales · ${esCL(pa.area_ha, { min: 2, max: 2 })} ha · holgura ${elegida.holgura.toFixed(1)} px a z${elegida.z}`,
    )
    await cerrarFicha()

    // ---- C16 · tocar una mancha de OTRA comuna la elige y abre SU ficha -------
    // Con teselas se ve todo el país, así que se puede pinchar una mancha que no
    // es de la comuna elegida; sus atributos todavía no están descargados. Lo que
    // se exige: el selector pasa a esa comuna, la URL la lleva, y se abre la ficha
    // de ESA mancha --no la de otra de la comuna anterior, que es el fallo
    // plausible--, con su nombre de comuna.
    //
    // La mancha se elige por definición: de las comunas vecinas cuya caja cruza el
    // encuadre de A, la más chica en manchas primero, y dentro de ella la de mayor
    // superficie con un punto interior a 4 px o más del borde. El arnés proyecta el
    // polígono con su propio Web Mercator, como en C13.
    await ir(`?vista=riesgo&comuna=${R.a.cut}`)
    await esperar(`document.querySelector('.leaflet-tile-pane canvas')`, 'teselas de riesgo')
    await esperar(`new URLSearchParams(location.search).get('z')`, 'encuadre escrito en la URL')
    await espera(1800)
    await esperarTeselas()
    const v16 = await leerEncuadre()
    const inversa = (px, py, z) => {
      const e = 256 * 2 ** z
      return [(px / e) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * py) / e))]
    }
    let vecina = null
    if (v16 && Number.isFinite(v16.z)) {
      const c0 = mercator(v16.lon, v16.lat, v16.z)
      const [, , ancho, alto] = v16.r
      const [oeste, norte] = inversa(c0[0] - ancho / 2, c0[1] - alto / 2, v16.z)
      const [este, sur] = inversa(c0[0] + ancho / 2, c0[1] + alto / 2, v16.z)
      const vecinas = Object.entries(R.riesgo.partes)
        .filter(([cut, p]) => cut !== R.a.cut && p.bbox[0] < este && p.bbox[2] > oeste && p.bbox[1] < norte && p.bbox[3] > sur)
        .sort(([c1, p1], [c2, p2]) => p1.features - p2.features || c1.localeCompare(c2))
      for (const [cut, parte] of vecinas.slice(0, 6)) {
        const gj = JSON.parse(readFileSync(join(DATOS, parte.archivo), 'utf8'))
        const grandes = gj.features
          .filter((f) => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
          .sort((x, y) => y.properties.area_ha - x.properties.area_ha || x.properties.mancha_id.localeCompare(y.properties.mancha_id))
          .slice(0, 40)
        for (const f of grandes) {
          const pt = puntoInterior(f.geometry, v16)
          if (!pt || pt.holgura < 4) continue
          // El punto no puede caer sobre un icono de A ni sobre un control. No se
          // exige que el elemento sea una tesela: Leaflet pone pointer-events:none
          // en .leaflet-tile-container y ahi elementFromPoint devuelve el mapa
          // (medido: la primera version de C16 no encontraba ningun punto).
          const blanco = await evaluar(`
            const el = document.elementFromPoint(${pt.q[0]}, ${pt.q[1]})
            return !!el && !!el.closest('.leaflet-container') && !el.closest('.leaflet-marker-pane, .leaflet-control-container')`)
          if (!blanco) continue
          vecina = { cut, parte, f, pt }
          break
        }
        if (vecina) break
      }
    }
    if (!vecina) {
      comprobar(false, 'C16 tocar una mancha de otra comuna la elige y abre su ficha', `ninguna mancha vecina con holgura en el encuadre de ${R.a.parte.comuna}`)
      return
    }
    const c16 = await evaluar(`
      const d = document.querySelector('dialog.ficha')
      const [x, y] = ${JSON.stringify(vecina.pt.q)}
      const blanco = document.elementFromPoint(x, y)
      for (const tipo of ['mousedown', 'mouseup', 'click']) {
        blanco.dispatchEvent(new MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window }))
      }
      // Hay que esperar la descarga de los atributos de la vecina: hasta 15 s.
      for (let i = 0; i < 150 && !d.open; i++) await new Promise((z) => setTimeout(z, 100))
      const filas = Object.fromEntries([...d.querySelectorAll('tr')].map((tr) => [
        tr.querySelector('th')?.textContent.trim(), tr.querySelector('td')?.textContent.trim(),
      ]))
      // La URL se escribe 250 ms despues del moveend, y el mapa esta volando a la
      // comuna nueva: se le dan 8 s antes de darla por no escrita.
      const cutEsperado = ${JSON.stringify(vecina.cut)}
      for (let i = 0; i < 80 && new URLSearchParams(location.search).get('comuna') !== cutEsperado; i++) {
        await new Promise((z) => setTimeout(z, 100))
      }
      return {
        abierta: d.open,
        filas,
        select: document.querySelector('.panel select')?.value ?? '',
        url: new URLSearchParams(location.search).get('comuna'),
      }`)
    const p16 = vecina.f.properties
    comprobar(
      c16 && c16.abierta && c16.select === vecina.cut && c16.url === vecina.cut
        && c16.filas.Identificador === p16.mancha_id && c16.filas.Comuna === vecina.parte.comuna,
      'C16 tocar una mancha de otra comuna la elige y abre su ficha',
      `desde ${R.a.parte.comuna} sobre ${p16.mancha_id} (${vecina.parte.comuna}, holgura ${vecina.pt.holgura.toFixed(1)} px) · ficha ${c16?.abierta ? `«${c16.filas.Identificador}» de «${c16.filas.Comuna}»` : 'NO se abrió'} · select ${c16?.select} · ?comuna=${c16?.url}`,
    )
    if (c16?.abierta) await capturar('priorizacion-ficha-vecina.png')
    await cerrarFicha()
  }

  try {
    if (bloque === 'ficha') {
      await comprobarFicha()
      return
    }

    // `bloque === 'vista'` salta C1 y la ficha: lo usan los mutantes de C2..C11
    // y C15 para no pagar la suite entera.
    if (bloque !== 'vista') {
      // ---- C1 · el renderer compartido ------------------------------------
      // LA DEUDA DE DECISIONES.md §H, que mejoras.md pone como prioridad alta
      // n.º 1: «con un canvas por capa sólo la de encima recibe los clics, y cuál
      // queda encima lo decide el orden en que terminan de descargarse los
      // archivos». El síntoma medido entonces fue que OECV y stand-by dejaban de
      // responder al clic con varias capas encendidas.
      //
      // NO se puede probar en la vista de priorización: allí sólo hay UNA capa
      // vectorial (las áreas), y los iconos van por el pane de marcadores, que es
      // otro camino de eventos. Hacen falta capas de CANVAS superpuestas, y eso
      // es la vista de incendios con OECV + stand-by + incendios encendidas.
      //
      // La prueba es el síntoma directo: se barre una rejilla de clics sobre el
      // mapa y se exige que respondan DOS capas distintas por lo menos. Con un
      // canvas por capa sólo contesta la de encima, y el conteo cae a 1.
      //
      // ALCANCE, MEDIDO el 2026-09-14 con tres mutantes contra esta misma C1:
      //
      //   renderer quitado de las opciones del mapa  -> ROJA · 1 capa (incendios 7)
      //   renderer compartido pero SIN tolerance: 8  -> ROJA · 1 capa (incendios 7)
      //   canvas propio por capa CON tolerance 8     -> ROJA · 1 capa (stand-by 9)
      //
      // O sea: C1 detecta el defecto de §H (el tercero: sólo contesta la capa de
      // encima), pero TAMBIÉN se pone roja si se pierde la tolerancia, que es
      // otro defecto. Un mutante que quite el renderer --o que declare uno sin
      // opciones-- mezcla los dos y no dice cuál de ellos cazó. Por eso el
      // control negativo de abajo conserva la tolerancia.
      console.log('\n▶ C1 · renderer compartido (DECISIONES.md §H)')
      await ir('?capas=oecv,puntos_standby,incendios&region=Valpara%C3%ADso')
      await esperar(`document.querySelector('.leaflet-overlay-pane canvas')`, 'canvas del mapa')
      await esperar(
        `[...document.querySelectorAll('.kpi, .meta')].some(e => /\\d/.test(e.textContent))`,
        'capas contadas',
      )
      await espera(3500)

      const barrido = await evaluar(`
        const cont = document.querySelector('.leaflet-container')
        const lienzo = cont.querySelector('.leaflet-overlay-pane canvas')
        if (!lienzo) return { error: 'sin canvas' }
        const r = cont.getBoundingClientRect()
        const d = document.querySelector('dialog.ficha')
        const capas = {}
        let aciertos = 0
        // Rejilla sobre el mapa. Cada acierto anota QUE capa contesto.
        for (let ix = 1; ix < 16; ix++) {
          for (let iy = 1; iy < 11; iy++) {
            const x = r.left + (r.width * ix) / 16
            const y = r.top + (r.height * iy) / 11
            for (const tipo of ['mousedown', 'mouseup', 'click']) {
              lienzo.dispatchEvent(new MouseEvent(tipo, {
                clientX: x, clientY: y, bubbles: true, cancelable: true, view: window,
              }))
            }
            await new Promise(z => setTimeout(z, 12))
            if (d && d.open) {
              const capa = d.querySelector('.ficha-capa')?.textContent?.trim() ?? '?'
              capas[capa] = (capas[capa] ?? 0) + 1
              aciertos++
              d.close()
              await new Promise(z => setTimeout(z, 8))
            }
          }
        }
        return { capas, aciertos, distintas: Object.keys(capas).length }`)

      comprobar(
        barrido && !barrido.error && barrido.distintas >= 2,
        'C1 varias capas superpuestas reciben clics',
        barrido?.error
          ? barrido.error
          : `${barrido?.distintas} capas respondieron · ${JSON.stringify(barrido?.capas)}`,
      )

      if (bloque === 'C1') return
    }

    // ---- C2 · un enlace viejo abre la vista nueva, con el país pintado ---------
    // ?vista=priorizacion circula desde que existía la pestaña de 3 comunas. Tiene
    // que abrir Riesgo (no caer a Incendios), con el selector vacío, con TODAS
    // las comunas del manifest agrupadas por región, y con el PAÍS dibujado: las
    // teselas cubren las 16 regiones y no hace falta elegir comuna para ver el
    // modelo. «Pintado» se define como en C15: la mayor parte de la tinta con los
    // colores de la leyenda. Y el KPI dice el total nacional del manifest.
    console.log('\n▶ C2..C11, C15 · vista de riesgo: comuna, escalas, iconos y exportación')
    let R
    try {
      R = comunasDeRiesgo()
    } catch (e) {
      for (const id of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C15']) comprobar(false, `${id} vista de riesgo`, `no se pudieron elegir las comunas: ${e.message}`)
      return
    }
    console.log(`    · A = ${R.a.parte.comuna} (${R.a.cut}, «${R.a.nombreInfra}» en infraestructura, ${R.a.parte.features} manchas, ${R.a.puntos} puntos) · B = ${R.b.parte.comuna} (${R.b.cut}) · T = ${R.t.parte.comuna} (${R.t.cut})`)

    await ir('?vista=priorizacion')
    await esperar(`document.querySelector('.panel h1')?.textContent.includes('Riesgo')`, 'panel de riesgo')
    await esperar(`document.querySelector('.leaflet-tile-pane canvas')`, 'teselas de riesgo', 15000)
    await espera(1500)
    await esperarTeselas()
    const nPartes = Object.keys(R.riesgo.partes).length
    const nRegiones = new Set(Object.values(R.riesgo.partes).map((p) => p.region)).size
    const colorLeyenda = `
      const rgbL = (x) => x.replace(/[^0-9,]/g, '').split(',').slice(0, 3).map(Number)
      const leyendaC = [...document.querySelectorAll('.panel .leyenda .chip')].map((c) => rgbL(getComputedStyle(c).backgroundColor))`
    const c2 = await evaluar(`${LIENZO_RIESGO}
      ${colorLeyenda}
      let pintados = 0, deLeyenda = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue
        pintados++
        if (leyendaC.some(([r, g, b]) => Math.abs(d[i] - r) <= 12 && Math.abs(d[i + 1] - g) <= 12 && Math.abs(d[i + 2] - b) <= 12)) deLeyenda++
      }
      const s = document.querySelector('.panel select')
      return {
        h1: document.querySelector('.panel h1')?.textContent ?? '',
        valor: s?.value ?? null,
        opciones: s ? [...s.options].filter((o) => o.value).length : 0,
        grupos: s ? s.querySelectorAll('optgroup').length : 0,
        kpi: document.querySelector('.kpi')?.textContent ?? '',
        pintados, deLeyenda, nTeselas,
      }`)
    // «areas» y no «manchas» desde el 2026-09-16: lo pidio Luis tras revisarlo
    // un colega de CONAF. El campo del dato sigue siendo `mancha_id`.
    const kpiPais = `${esCL(R.riesgo.features)} áreas de riesgo en el país`
    const fr2 = c2?.pintados ? c2.deLeyenda / c2.pintados : 0
    comprobar(
      c2 && c2.h1.includes('Riesgo') && c2.valor === '' && c2.opciones === nPartes && c2.grupos === nRegiones
        && c2.kpi.startsWith(kpiPais) && c2.pintados > 0 && fr2 > 0.5,
      'C2 ?vista=priorizacion abre Riesgo sin comuna y con el país pintado',
      `h1 «${c2?.h1}» · select «${c2?.valor}» · ${c2?.opciones}/${nPartes} comunas en ${c2?.grupos}/${nRegiones} regiones · KPI «${c2?.kpi}» · ${c2?.pintados} px pintados en ${c2?.nTeselas} teselas, ${(100 * fr2).toFixed(1)} % con color de leyenda`,
    )

    // ---- C3 · la grafía antigua elige la comuna y cruza iconos por CUT -------
    // Se entra con el nombre que usaba el modelo anterior y que sigue usando la
    // infraestructura («Coyhaique»): la app tiene que resolverlo al CUT por su
    // alias, pintar A A LA PRIMERA -- el bug del efecto que nace neutro sólo
    // aparece entrando por URL -- y mostrar TODOS los puntos de su CUT. Por nombre
    // saldrían 0. Después, T escrita sin tildes y en mayúsculas: el otro camino
    // por el que un enlace tiene que casar (ver T en comunasDeRiesgo).
    await ir(`?vista=riesgo&comuna=${encodeURIComponent(R.a.nombreInfra)}`)
    await esperar(`${DIBUJADOS} === ${R.a.puntos}`, `elementos de ${R.a.parte.comuna}`)
    await esperar(`/[1-9]/.test(document.querySelector('.kpi')?.textContent ?? '')`, 'manchas contadas')
    await espera(1500)
    await esperarTeselas()
    const c3 = await evaluar(`
      const t = [...document.querySelectorAll('.kpi')].map(e => e.textContent).join(' ')
      const m = t.match(/([\\d.]+) áreas de riesgo/)
      return {
        sel: document.querySelector('.panel select')?.value ?? '',
        manchas: m ? m[1] : null,
        iconos: ${DIBUJADOS},
      }`)
    const pintado = await evaluar(coloresDeAreas)
    comprobar(
      c3 && c3.sel === R.a.cut && c3.manchas === esCL(R.a.parte.features) && c3.iconos === R.a.puntos && pintado?.distintos >= 2,
      'C3 ?comuna= con la grafía antigua elige la comuna y cruza iconos por CUT',
      `?comuna=${R.a.nombreInfra} · select=${c3?.sel} · ${c3?.manchas} áreas (esperadas ${esCL(R.a.parte.features)}) · ${c3?.iconos}/${R.a.puntos} iconos · ${pintado?.distintos} colores`,
    )
    const gritado = sinTildes(R.t.parte.comuna).toUpperCase()
    await ir(`?vista=riesgo&comuna=${encodeURIComponent(gritado)}`)
    await esperar(`document.querySelector('.panel select')?.value === ${JSON.stringify(R.t.cut)}`, `select en ${R.t.cut}`, 8000)
    const selT = await evaluar(`return document.querySelector('.panel select')?.value ?? ''`)
    comprobar(
      selT === R.t.cut,
      'C3 ?comuna= sin tildes ni mayúsculas elige la comuna',
      `?comuna=${gritado} · select=${selT} (esperado ${R.t.cut}, ${R.t.parte.comuna})`,
    )
    // ---- C20 · la vista explica lo que muestra --------------------------
    // UN COLEGA DE CONAF LA REVISO EL 2026-09-16 y no encontro explicado nada,
    // empezando por el numero que va al lado de cada comuna en el selector. Se
    // comprueban las tres cosas que esa revision pedia: que el boton exista,
    // que lo que abre explique el numero Y las dos escalas de color, y que la
    // explicacion del numero este ademas pegada al selector, donde surge la
    // duda. Se mide el TEXTO que lee una persona, no que el componente exista.
    const ayuda = await evaluar(`
      const pegada = document.querySelector('.panel')?.textContent ?? ''
      const b = [...document.querySelectorAll('.panel button')].find((x) =>
        x.textContent.trim() === 'Qué muestra esta vista')
      if (!b) return { boton: false, pegada }
      b.click()
      for (let i = 0; i < 40 && !document.querySelector('dialog[open]'); i++)
        await new Promise((r) => setTimeout(r, 50))
      const d = document.querySelector('dialog[open]')
      const t = d?.textContent ?? ''
      const cerrar = [...(d?.querySelectorAll('button') ?? [])].find((x) => x.textContent.trim() === 'Listo')
      cerrar?.click()
      await new Promise((r) => setTimeout(r, 300))
      return {
        boton: true,
        pegada,
        texto: t,
        numero: /áreas de riesgo/.test(t) && /selector/.test(t),
        clase: /clase del modelo/.test(t),
        relativo: /contraste interno/.test(t),
        cumulos: /cúmulos/.test(t),
        cerrado: !document.querySelector('dialog[open]'),
      }`)
    comprobar(
      ayuda?.boton && ayuda.numero && ayuda.clase && ayuda.relativo && ayuda.cumulos && ayuda.cerrado,
      'C20 «Qué muestra esta vista» explica el número, las dos escalas y los cúmulos',
      ayuda?.boton
        ? `número=${ayuda.numero} clase=${ayuda.clase} relativo=${ayuda.relativo} cúmulos=${ayuda.cumulos} cierra=${ayuda.cerrado} · ${ayuda.texto?.length} caracteres`
        : 'no existe el botón en el panel',
    )
    comprobar(
      /El número entre paréntesis es cuántas áreas de riesgo tiene la comuna/.test(ayuda?.pegada ?? ''),
      'C20 el número del selector se explica junto al selector',
      `pista ${/El número entre paréntesis/.test(ayuda?.pegada ?? '') ? 'presente' : 'AUSENTE'}`,
    )

    // ---- C19 · cada familia del DATO tiene su color y su icono ----------
    // EL VOCABULARIO SALE DEL MANIFEST, no de la lista escrita a mano: al pasar
    // a cobertura nacional el insumo cambió de familias --se fue `escuelas_prep`
    // y llegó `comunidades_prep`-- y `COLOR_FAMILIA` se quedó como estaba. La
    // familia nueva caía en el gris por omisión, o sea EXACTAMENTE el color de
    // «Red aeroportuaria»: dos símbolos distintos con la misma tinta y ni un
    // error en consola. Se miden los chips pintados, no la constante.
    const familiasManifest = Object.keys(R.manifest.capas.infra_puntos.familias ?? {})
    const chips = await evaluar(`
      const filas = [...document.querySelectorAll('.panel .fila-capa')].filter((l) => l.querySelector('.chip'))
      const infra = filas.slice(-${familiasManifest.length})
      return infra.map((l) => ({
        etq: l.querySelector('.etq')?.textContent ?? '',
        color: getComputedStyle(l.querySelector('.chip')).backgroundColor,
      }))`)
    const tintasFamilia = new Set((chips ?? []).map((c) => c.color))
    comprobar(
      chips?.length === familiasManifest.length && tintasFamilia.size === familiasManifest.length,
      'C19 cada familia de infraestructura se dibuja con un color propio',
      `${chips?.length}/${familiasManifest.length} familias · ${tintasFamilia.size} colores distintos` +
        (tintasFamilia.size === chips?.length ? '' : ` · repetidos: ${JSON.stringify(chips)}`),
    )
    // El glifo es la otra mitad del símbolo, y NO se puede medir en pantalla:
    // sólo salen los iconos de las familias que haya en el encuadre --en la
    // comuna medida, 4 de 8--. Se cruzan las claves declaradas en `GLIFOS`
    // contra las familias del manifest, que son dos fuentes distintas: el
    // insumo y el código. Se lee el fuente como texto, no se importa; importarlo
    // comprobaría que una lista es igual a sí misma.
    const fuenteIconos = readFileSync(join(FRONT, 'src', 'iconos.js'), 'utf8')
    const bloqueGlifos = fuenteIconos.slice(fuenteIconos.indexOf('export const GLIFOS'))
    const claves = [...bloqueGlifos.slice(0, bloqueGlifos.indexOf('\n}')).matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])
    const faltan = familiasManifest.filter((f) => !claves.includes(f))
    const sobran = claves.filter((f) => !familiasManifest.includes(f))
    comprobar(
      claves.length > 0 && !faltan.length && !sobran.length,
      'C19 GLIFOS declara exactamente las familias que trae el insumo',
      `${claves.length} glifos para ${familiasManifest.length} familias` +
        (faltan.length ? ` · sin glifo: ${faltan}` : '') +
        (sobran.length ? ` · sobra: ${sobran}` : ''),
    )

    // C15 y C4 miden sobre A: se vuelve a ella.
    await ir(`?vista=riesgo&comuna=${R.a.cut}`)
    await esperar(`${DIBUJADOS} === ${R.a.puntos}`, `elementos de ${R.a.parte.comuna}`)
    await espera(1500)
    await esperarTeselas()

    // ---- C15 · el mapa pinta con los colores de la leyenda --------------------
    // El fallo que vigila es mudo: si la etiqueta de clase del dato no casa con
    // la del color (las claves en femenino del modelo anterior contra las clases
    // en masculino de este), cada mancha cae al gris por omisión y el mapa se ve
    // «bien», sólo que sin clases. Se exige: la leyenda rotula exactamente las
    // clases del manifest, de mayor a menor y con sus cortes en es-CL; sus fichas
    // tienen tantos colores distintos como clases; y la MAYOR parte de la tinta
    // del canvas es de esos colores. Medido el 2026-09-15 en escala absoluta:
    // 97,1 % en Mulchén, 96,2 % en Los Angeles, 93,8 % en Coihaique, 99,5 % en
    // Santiago y 88,0 % en Natales (el resto son bordes y mezclas). El umbral es
    // la mitad, por definición de «mayor parte», no una cifra ajustada.
    const clasesEsperadas = R.riesgo.clases.slice().reverse().map((c) => ({
      clase: c.clase,
      rango: c.desde == null
        ? `< ${esCL(c.hasta, { min: 0, max: 3 })}`
        : c.hasta == null
          ? `≥ ${esCL(c.desde, { min: 0, max: 3 })}`
          : `${esCL(c.desde, { min: 0, max: 3 })} – ${esCL(c.hasta, { min: 0, max: 3 })}`,
    }))
    const c15 = await evaluar(`${LIENZO_RIESGO}
      const filas = [...document.querySelectorAll('.panel .leyenda')]
      const rgb = (x) => x.replace(/[^0-9,]/g, '').split(',').slice(0, 3).map(Number)
      const leyenda = filas.map((f) => ({
        clase: [...f.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
        rango: f.querySelector('.leyenda-rango')?.textContent.trim() ?? '',
        color: rgb(getComputedStyle(f.querySelector('.chip')).backgroundColor),
      }))
      if (!nTeselas) return { leyenda, error: 'sin teselas de riesgo dibujadas' }
      let pintados = 0, deLeyenda = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue
        pintados++
        if (leyenda.some(({ color: [r, g, b] }) => Math.abs(d[i] - r) <= 12 && Math.abs(d[i + 1] - g) <= 12 && Math.abs(d[i + 2] - b) <= 12)) deLeyenda++
      }
      return { leyenda, pintados, deLeyenda }`)
    const rotulos = (c15?.leyenda ?? []).map(({ clase, rango }) => ({ clase, rango }))
    const colores = new Set((c15?.leyenda ?? []).map((x) => x.color.join(','))).size
    const fraccion = c15?.pintados ? c15.deLeyenda / c15.pintados : 0
    comprobar(
      c15 && !c15.error && JSON.stringify(rotulos) === JSON.stringify(clasesEsperadas)
        && colores === clasesEsperadas.length && fraccion > 0.5,
      'C15 el mapa pinta con los colores de la leyenda del modelo',
      c15?.error
        ?? `leyenda ${JSON.stringify(rotulos) === JSON.stringify(clasesEsperadas) ? 'igual al manifest' : `DISTINTA ${JSON.stringify(rotulos)}`} · ${colores} colores · ${(100 * fraccion).toFixed(1)} % de la tinta con color de leyenda`,
    )

    // ---- C4 · normalizar reparte de verdad -------------------------------
    // Medido el 2026-09-15, con GeoJSON: en Coihaique 31 -> 45 colores y el
    // dominante de 59.644 a 52.857 px; en Mulchén 17 -> 33 y de 82.728 a 78.674.
    // El margen de C4b es estrecho por los datos: el rango reparte MANCHAS, no
    // superficie, y unas pocas manchas grandes comparten escalón. Con teselas se
    // ven además las comunas vecinas, que NO se normalizan: siguen con el color
    // de su clase, así que el dominante sólo puede bajar dentro de la comuna.
    const antes = await evaluar(coloresDeAreas)
    await evaluar(`
      const b = [...document.querySelectorAll('button')].find(x => x.className.includes('normalizar'))
      if (!b) return false
      b.click()
      return true`)
    await espera(900)
    await esperarTeselas()
    const despues = await evaluar(coloresDeAreas)
    comprobar(
      antes && despues && despues.distintos > antes.distintos,
      'C4 normalizar usa más colores que la escala del modelo',
      `${antes?.distintos} → ${despues?.distintos} colores`,
    )
    comprobar(
      antes && despues && despues.mayor < antes.mayor,
      'C4b ningún color acapara más que en la escala del modelo',
      `color dominante ${antes?.mayor} → ${despues?.mayor} px`,
    )

    // ---- C18 · el botón activo se lee en los dos temas ----------------------
    // «Normalizar» activo es el unico texto sobre el acento lleno de esta vista.
    // Blanco sobre el acento oscuro #58a6ff daba 2,53:1 (medido el 2026-09-15).
    // El umbral es el de WCAG AA para texto normal, 4,5:1, y la razon se calcula
    // aqui con la formula de luminancia relativa, sin leer ningun token.
    const leerContraste = `
      const b = document.querySelector('.normalizar')
      if (!b) return null
      const rgb = (x) => x.slice(x.indexOf('(') + 1, x.indexOf(')')).split(',').slice(0, 3).map(Number)
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      const lum = ([r, g, bb]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bb)
      const c = getComputedStyle(b)
      const L1 = lum(rgb(c.color))
      const L2 = lum(rgb(c.backgroundColor))
      return { activo: b.getAttribute('aria-pressed') === 'true', razon: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), color: c.color, fondo: c.backgroundColor }`
    const temas18 = {}
    for (const tema of ['light', 'dark']) {
      await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] }, sessionId)
      await espera(400)
      temas18[tema] = await evaluar(leerContraste)
      // La pasada en los dos temas que pedia mejoras.md: se captura y se MIRA.
      await capturar(`priorizacion-riesgo-${tema === 'light' ? 'claro' : 'oscuro'}.png`)
    }
    await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)
    await espera(300)
    const t18 = (t) => (t ? `${t.razon.toFixed(2)}:1 (${t.color} sobre ${t.fondo})` : 'sin botón')
    comprobar(
      !!temas18.light?.activo && !!temas18.dark?.activo && temas18.light.razon >= 4.5 && temas18.dark.razon >= 4.5,
      'C18 el botón activo se lee en los dos temas',
      `claro ${t18(temas18.light)} · oscuro ${t18(temas18.dark)}`,
    )

    // ---- C5 · la leyenda declara el modo y los valores absolutos ---------
    // Los extremos se calculan del GeoJSON de A, a 3 decimales y en es-CL.
    const d3 = { min: 3, max: 3 }
    const minA = `mín. ${esCL(R.a.min, d3)}`
    const maxA = `máx. ${esCL(R.a.max, d3)}`
    const ley = await evaluar(`
      const t = document.querySelector('.panel')?.textContent ?? ''
      return {
        relativo: t.includes('RELATIVO'),
        min: t.includes(${JSON.stringify(minA)}),
        max: t.includes(${JSON.stringify(maxA)}),
        aviso: t.includes('posición relativa'),
        cien: /\\b100\\s*%/.test(t),
      }`)
    comprobar(
      ley?.relativo && ley.min && ley.max && ley.aviso && !ley.cien,
      'C5 la leyenda relativa rotula min/max absolutos',
      `RELATIVO=${ley?.relativo} «${minA}»=${ley?.min} «${maxA}»=${ley?.max} aviso=${ley?.aviso} sin-0a100=${!ley?.cien}`,
    )

    // ---- C6 · cambiar de comuna no hereda la escala anterior -------------
    const maxB = `máx. ${esCL(R.b.max, d3)}`
    await evaluar(`
      const s = document.querySelector('.panel select')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(s, ${JSON.stringify(R.b.cut)})
      s.dispatchEvent(new Event('change', { bubbles: true }))
      return true`)
    await esperar(`(document.querySelector('.kpi')?.textContent ?? '').startsWith(${JSON.stringify(esCL(R.b.parte.features) + ' ')})`, `manchas de ${R.b.parte.comuna}`)
    // Los anclajes se leen de la leyenda cuando llegan los atributos de B.
    await esperar(`(document.querySelector('.panel')?.textContent ?? '').includes(${JSON.stringify(maxB)})`, `leyenda de ${R.b.parte.comuna}`, 15000)
    await espera(500)
    const tras = await evaluar(`
      const t = document.querySelector('.panel')?.textContent ?? ''
      return { a: t.includes(${JSON.stringify(maxA)}), b: t.includes(${JSON.stringify(maxB)}) }`)
    comprobar(
      tras && !tras.a && tras.b,
      'C6 al cambiar de comuna se recalculan los anclajes',
      `«${maxA}» de ${R.a.parte.comuna}=${tras?.a} · «${maxB}» de ${R.b.parte.comuna}=${tras?.b}`,
    )

    // ---- C7 · los cúmulos agrupan al alejar y se separan al acercar ------
    // LO QUE VIGILABA ANTES YA NO EXISTE: hasta el 2026-09-16 los iconos se
    // ocultaban bajo un zoom umbral (ZOOM_ICONOS) y C7 medía justo eso. Con la
    // capa nacional no hay umbral, hay cúmulos (DECISIONES.md §X), y la
    // propiedad que sí importa es que **nada se pierda por el camino**: la suma
    // de las cuentas de los cúmulos es el total de la comuna, y al acercar esa
    // misma suma se conserva mientras aparecen iconos sueltos.
    //
    // Sin esta aserción, un `iconCreateFunction` que contara mal --o un filtro
    // que se comiera puntos al reagrupar-- no rompería nada visible: el mapa
    // seguiría lleno de discos con números plausibles.
    await ir(`?vista=riesgo&comuna=${R.a.cut}`)
    await esperar(`${DIBUJADOS} === ${R.a.puntos}`, 'elementos para el zoom')
    await espera(1500)
    const zoom = await evaluar(`
      const mas = document.querySelector('.leaflet-control-zoom-in')
      if (!mas) return null
      const suma = () => ${DIBUJADOS}
      const cumulos = () => document.querySelectorAll('.marker-cluster').length
      const sueltos = () => document.querySelectorAll('.icono-infra').length
      const mayor = () =>
        [...document.querySelectorAll('.marker-cluster')].reduce((m, e) => Math.max(m, Number(e.textContent.trim() || 0)), 0)
      const lejos = { suma: suma(), cumulos: cumulos(), sueltos: sueltos(), mayor: mayor() }
      for (let i = 0; i < 4; i++) { mas.click(); await new Promise(r => setTimeout(r, 420)) }
      // Espera ACOTADA y no un reloj: con las teselas de riesgo cada zoom tarda
      // mas en asentarse, y los 700 ms fijos medían el mapa a medio camino.
      for (let i = 0; i < 80 && sueltos() === 0; i++) await new Promise(r => setTimeout(r, 100))
      return { lejos, cerca: { suma: suma(), cumulos: cumulos(), sueltos: sueltos(), mayor: mayor() } }`)
    comprobar(
      zoom && zoom.lejos.suma === R.a.puntos && zoom.lejos.cumulos > 0 && zoom.lejos.sueltos < R.a.puntos,
      'C7 al encuadrar la comuna los cúmulos suman todos sus elementos',
      `${zoom?.lejos.suma}/${R.a.puntos} en ${zoom?.lejos.cumulos} cúmulos y ${zoom?.lejos.sueltos} sueltos`,
    )
    // Al acercar, un cúmulo grande se parte en VARIOS pequeños: el número de
    // discos sube, no baja --medido: 8 → 19--. Lo que decrece es el mayor de
    // ellos, y eso es lo que significa «se separan».
    comprobar(
      zoom && zoom.cerca.sueltos > zoom.lejos.sueltos && zoom.cerca.mayor < zoom.lejos.mayor,
      'C7 al acercar, los cúmulos se separan en iconos',
      `mayor cúmulo ${zoom?.lejos.mayor} → ${zoom?.cerca.mayor} · sueltos ${zoom?.lejos.sueltos} → ${zoom?.cerca.sueltos}`,
    )

    // ---- C8 · el PNG exportado lleva los iconos --------------------------
    // Medir el DOM no es mirar el PNG: los marcadores son nodos del DOM y el
    // exportador sólo recorría <canvas>, así que salían invisibles mientras
    // B20 seguía en verde. Se cuentan píxeles del color de una familia.
    // Se vuelve a encuadrar una comuna antes de exportar: C7 deja el mapa donde
    // lo dejaron los botones de zoom, que no es donde están los datos. Los
    // marcadores siguen en el DOM aunque queden fuera de la vista, así que
    // contar nodos NO basta -- hay que contar los que caen dentro del mapa.
    await ir(`?vista=riesgo&comuna=${R.a.cut}`)
    await esperar(`${DIBUJADOS} === ${R.a.puntos}`, 'elementos para exportar')
    await espera(2000)
    await esperarTeselas()

    const png = await evaluar(`
      window.__blob = null
      const orig = URL.createObjectURL
      URL.createObjectURL = (b) => { window.__blob = b; return orig(b) }
      const caja = document.querySelector('.leaflet-container').getBoundingClientRect()
      const dentro = (e) => {
        const r = e.getBoundingClientRect()
        return r.right > caja.left && r.left < caja.right && r.bottom > caja.top && r.top < caja.bottom
      }
      const enPantalla = [...document.querySelectorAll('.leaflet-marker-icon')].filter(dentro).length
      // Los cúmulos FUERA del encuadre siguen en el DOM y no pintan un píxel:
      // el umbral se mide contra los que de verdad caen dentro.
      const cumulosDentro = [...document.querySelectorAll('.marker-cluster')].filter(dentro).length
      if (!enPantalla) return { error: 'ningún icono dentro del encuadre' }
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Imagen del mapa'))
      if (!b) return { error: 'sin botón' }
      b.click()
      for (let i = 0; i < 80 && !window.__blob; i++) await new Promise(r => setTimeout(r, 150))
      if (!window.__blob) return { error: 'sin blob', enPantalla }
      window.__b64 = await new Promise((ok) => {
        const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(window.__blob)
      })
      const bm = await createImageBitmap(window.__blob)
      const c = new OffscreenCanvas(bm.width, bm.height)
      const g = c.getContext('2d')
      g.drawImage(bm, 0, 0)
      const d = g.getImageData(0, 0, bm.width, bm.height).data
      // Los cúmulos son discos grafito (rgba(17,17,17,0.88) en App.css): sobre
      // cualquier fondo del visor quedan casi negros, y ni la rampa de riesgo
      // --su extremo, #650101, tiene r = 101-- ni el mapa base claro llegan ahí.
      // Es lo que hay que contar desde que la capa es nacional: en una comuna
      // encuadrada casi todo son cúmulos, y los pocos iconos sueltos de una
      // familia concreta pueden no aparecer.
      // Y las manchas: con el mapa base «Claro» (grises, r = g = b) un píxel
      // CÁLIDO --rojo sobre verde y verde sobre azul por 12 o más-- sólo puede
      // venir de la rampa de riesgo mezclada con el fondo. La rampa entera cumple
      // eso por definición (#F9A129 a #650101); los iconos de salud no (g = b).
      let grafito = 0, calidos = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 70 && d[i+1] < 70 && d[i+2] < 70) grafito++
        if (d[i] - d[i+1] >= 12 && d[i+1] - d[i+2] >= 12) calidos++
      }
      return { w: bm.width, h: bm.height, grafito, calidos, enPantalla, cumulos: cumulosDentro }`)
    // 200 px por cúmulo es la mitad de lo que ocupa el más pequeño (disco de 30
    // px de lado, ~530 px dentro del aro), así que el umbral no se cumple con
    // uno o dos discos sueltos ni exige que salgan todos.
    comprobar(
      png && !png.error && png.cumulos > 0 && png.grafito > 200 * png.cumulos,
      'C8 el PNG exportado contiene los cúmulos de infraestructura',
      png?.error
        ? png.error
        : `${png?.w}×${png?.h} · ${png?.enPantalla} marcadores en pantalla · ${png?.cumulos} cúmulos · ${png?.grafito} px grafito`,
    )
    // La mitad del PNG, por definición de «el mapa muestra las manchas»: la
    // comuna encuadrada y sus vecinas cubren casi todo el territorio (Mulchén:
    // 192.005 ha de manchas en una comuna de ~192.500).
    comprobar(
      png && !png.error && png.calidos > (png.w * png.h) / 2,
      'C8b el PNG exportado contiene las áreas de riesgo',
      png?.error ? png.error : `${png?.calidos} px cálidos de ${png?.w * png?.h} (${((100 * png?.calidos) / (png?.w * png?.h)).toFixed(1)} %)`,
    )
    // ---- C9 · el mapa base se puede cambiar en esta vista ----------------
    // La vista de riesgo no monta PanelLateral, que es donde vivía el
    // único selector de mapa base: al ocultarlo se fue con él, y la pestaña se
    // quedó atada al fondo «Claro». Las claves de BASEMAPS son contrato
    // público (?base= en la URL), así que las dos vistas ofrecen las mismas.
    const mb = await evaluar(`
      const sels = [...document.querySelectorAll('.panel select')]
      // El de mapa base es el que ofrece «Satelital»; el otro es el de comuna.
      const s = sels.find(x => [...x.options].some(o => o.value === 'Satelital'))
      if (!s) return { error: 'no hay selector de mapa base' }
      const antes = document.querySelector('.leaflet-tile-pane img')?.src ?? ''
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(s, 'Satelital')
      s.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 2500))
      const despues = document.querySelector('.leaflet-tile-pane img')?.src ?? ''
      return { n: s.options.length, valor: s.value, cambio: antes !== despues, despues }`)
    comprobar(
      mb && !mb.error && mb.n >= 7 && mb.valor === 'Satelital' && mb.cambio,
      'C9 el mapa base se puede cambiar en la vista de riesgo',
      mb?.error ? mb.error : `${mb?.n} opciones · ${mb?.valor} · teselas cambiaron: ${mb?.cambio}`,
    )

    // ---- C11 · el CSV trae la comuna del mapa, con su CUT ------------------
    // El archivo circula suelto: cada fila tiene que decir de qué comuna es por
    // CÓDIGO, porque el nombre no basta (el modelo escribe «Mulchén» y la
    // infraestructura «Mulchen»). Se exige una fila por mancha de A, todas con
    // el CUT y el nombre de A, y el BOM. Se lee el mismo blob que recibe el
    // usuario, interceptando createObjectURL, y el BOM se comprueba sobre los
    // BYTES: Blob.text() decodifica en UTF-8 y el decodificador se come el BOM.
    const csv = await evaluar(`
      window.__d = null
      if (!window.__origCOU) window.__origCOU = URL.createObjectURL
      URL.createObjectURL = (b) => { window.__d = b; return window.__origCOU(b) }
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Áreas (CSV)')
      if (!b) return { error: 'sin botón de descarga' }
      b.click()
      for (let i = 0; i < 40 && !window.__d; i++) await new Promise(z => setTimeout(z, 100))
      if (!window.__d) return { error: 'sin blob' }
      const txt = await window.__d.text()
      const b0 = new Uint8Array(await window.__d.slice(0, 3).arrayBuffer())
      const lineas = txt.trim().split('\\r\\n')
      const cab = lineas[0].split(';')
      const filas = lineas.slice(1).map((l) => l.split(';'))
      return {
        filas: filas.length,
        cuts: [...new Set(filas.map((f) => f[cab.indexOf('cod_comuna')]))],
        nombres: [...new Set(filas.map((f) => f[cab.indexOf('comuna')]))],
        bom: b0[0] === 0xef && b0[1] === 0xbb && b0[2] === 0xbf,
      }`)
    comprobar(
      csv && !csv.error && csv.filas === R.a.parte.features && csv.cuts.length === 1 && csv.cuts[0] === R.a.cut
        && csv.nombres.length === 1 && csv.nombres[0] === R.a.parte.comuna && csv.bom,
      'C11 el CSV trae sólo la comuna del mapa, con su CUT y BOM',
      csv?.error ? csv.error : `${csv?.filas}/${R.a.parte.features} filas · cod_comuna ${JSON.stringify(csv?.cuts)} · comuna ${JSON.stringify(csv?.nombres)} · BOM: ${csv?.bom}`,
    )

    // ---- C10 · el deslizador de opacidad ---------------------------------
    // Se mide la TINTA del canvas (alfa acumulado), no el estado de React: lo
    // que se quiere probar es que el mapa se repinta, y para eso hay que mirar
    // lo pintado. A 0 % la tinta tiene que ser 0 exacto — bordes incluidos, o
    // «completamente transparente» sería mentira.

    const mover = async (pct) => {
      const r = await evaluar(`
        const s = document.querySelector('#opacidad-manchas')
        if (!s) return null
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(s, '${pct}')
        s.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise(z => requestAnimationFrame(() => requestAnimationFrame(z)))
        return { etiqueta: document.querySelector('.fila-opacidad output')?.textContent ?? '' }`)
      if (!r) return null
      // El repintado de las teselas es asincrono: se espera a que se asiente.
      await espera(400)
      return { ...r, tinta: (await esperarTeselas())?.tinta ?? null }
    }

    const op100 = await mover(100)
    const op30 = await mover(30)
    const op0 = await mover(0)
    comprobar(
      op100 && op30 && op0 && op100.tinta > op30.tinta && op30.tinta > 0 && op0.tinta === 0,
      'C10 la opacidad de las manchas se regula en el mapa',
      op100
        ? `tinta 100 %: ${op100.tinta} · 30 %: ${op30.tinta} · 0 %: ${op0.tinta}`
        : 'no hay deslizador',
    )
    comprobar(
      op30?.etiqueta.includes('30'),
      'C10b el control dice en qué opacidad está',
      `etiqueta "${op30?.etiqueta}"`,
    )
    await mover(65)

    // El PNG se guarda SIEMPRE, falle o no: la aserción cuenta píxeles, pero
    // quien decide si un icono se ve es alguien mirando el archivo.
    const b64 = await evaluar('return window.__b64 ?? null')
    if (b64) {
      // mkdir recursivo y no se da por hecho: en local .verificacion/ ya existe
      // porque lo crean verify:banner y verify:panel, pero en CI este arnés
      // corre dentro del job `build`, donde esos dos no pasan. Sin esto el
      // paso reventaría en el runner y en ningún sitio más.
      const dir = join(FRONT, '.verificacion')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'priorizacion-png-exportado.png'), Buffer.from(b64.split(',')[1], 'base64'))
      console.log('    · .verificacion/priorizacion-png-exportado.png')
    }

    if (bloque === 'vista') return
    await comprobarFicha()
  } finally {
    cdp.ws.close()
    s.close()
    await cerrarChrome(proc, perfil)
    chromeVivo = null
  }
}

// ---------------------------------------------------------------------------
// Controles negativos (--negativas)
// ---------------------------------------------------------------------------
// Cada mutación reintroduce UN defecto concreto y nombra la aserción que tiene
// que ponerse roja. Sin esto, una aserción verde no prueba nada: es la regla
// que da sentido a --negativas en todo el repo.
//
// PARCHEA EL REPO, y ahora sobre archivos con cambios SIN COMMITEAR: la fase
// F0 del 2026-09-14 deja ModalFicha.jsx y fichas.js modificados a propósito
// (el commit lo decide Luis). Antes cada mutante se restauraba desde una copia
// en memoria y nada más: un Ctrl+C durante el build o la suite dejaba el
// mutante dentro, y el original sólo vivía en la memoria del proceso muerto.
// Las guardas, con el patrón de scripts/mutaciones.mjs:
//
//   1. Antes de tocar nada: cada ancla tiene que aparecer EXACTAMENTE una vez;
//      se leen en memoria los bytes de cada archivo con su sha256 y se deja
//      copia en DISCO en .verificacion/respaldo-priorizacion/ (ignorado por
//      git) con pendiente.json.
//   2. Cada mutante se restaura desde memoria en un `finally`; al terminar se
//      compara el sha256 de cada archivo con el de antes, y sólo si todos
//      coinciden se borra el respaldo.
//   3. Una señal de corte: se restaura, se mata el build o Chrome en curso
//      con su arbol, se comparan las huellas y, si coinciden, se BORRA el
//      respaldo (segun la revision que cita scripts/mutaciones.mjs, la guarda
//      gemela de verify-electrico.mjs lo dejaba, y la corrida siguiente no
//      sabia si venia de un corte limpio).
//      Son CUATRO señales y no dos: SIGINT (Ctrl+C), SIGTERM y las que
//      Windows usa para lo mismo segun la documentacion de Node, que no medi:
//      SIGHUP al cerrar la ventana de la consola y SIGBREAK con Ctrl+Break.
//      Con solo las dos primeras, cerrar la terminal durante los ~160 s dejaba
//      el mutante en fichas.js o ModalFicha.jsx sin que corriera ni el
//      manejador ni el `finally` (revision adversarial de F0, 2026-09-14).
//      Con SIGHUP, segun esa documentacion, Windows mata el proceso unos 10 s
//      despues pase lo que pase: por eso se restaura ANTES de matar a los
//      hijos, que es lo lento (taskkill), y no despues.
//   4. LA RED DE SEGURIDAD es el respaldo en disco con pendiente.json. Si el
//      proceso muere sin que corra ningun manejador (taskkill /F, corte de
//      luz, o Windows cerrandolo antes de que termine el de SIGHUP), el
//      respaldo queda en disco y la corrida SIGUIENTE lo detecta: se niega a
//      arrancar mientras algun archivo no coincida con su huella, y dice
//      donde esta el original. Si ya coinciden, limpia y sigue.
//
// `--simular-ctrl-c <ms> [--senal SIGHUP|SIGBREAK|SIGTERM]` existe SOLO para
// probar la guarda 3: un Ctrl+C de consola no se puede teclear desde un
// agente, asi que la señal se emite desde dentro (process.emit). Eso prueba
// que hay manejador para esa señal y que restaura, NO que Windows la entregue.
// Un Ctrl+C real no lo he medido.
const MUTACIONES = [
  {
    id: 'C1',
    archivo: CAPA_PUNTOS,
    titulo: 'dar un canvas propio a cada capa de puntos, con la tolerancia intacta',
    // Un canvas POR CAPA (useMemo, no uno por marcador) y con `tolerance: 8`:
    // así lo único que cambia respecto de producción es que el renderer deja
    // de ser compartido, que es exactamente el defecto de §H. Una versión
    // anterior de este mutante usaba `L.canvas()` sin opciones, y perder la
    // tolerancia ya basta para poner C1 roja: medido, no probaba §H.
    ancla: '  const grupo = useMemo(() => L.layerGroup(), [])',
    mutar: (t, a) =>
      t
        .replace(a, `${a}\n  const rendererPropio = useMemo(() => L.canvas({ padding: 0.5, tolerance: 8 }), [])`)
        .replace('        radius: radio ?? 4,', '        renderer: rendererPropio,\n        radius: radio ?? 4,'),
    bloque: 'C1',
  },
  {
    id: 'C2',
    archivo: CONFIG_JS,
    titulo: 'olvidar el alias ?vista=priorizacion -> riesgo',
    // Los enlaces que ya circulan caerían a la pestaña de incendios.
    ancla: "export const ALIAS_VISTA = { priorizacion: 'riesgo' }",
    mutar: (t, a) => t.replace(a, 'export const ALIAS_VISTA = {}'),
    bloque: 'vista',
  },
  {
    id: 'C2',
    archivo: APP_JSX,
    titulo: 'volver a dibujar las manchas sólo con una comuna elegida',
    // El comportamiento de cuando las manchas eran GeoJSON por comuna: sin comuna,
    // mapa vacío y un país que parece sin riesgo.
    ancla: '            teselas={metaRiesgo?.teselas}\n            visible\n',
    mutar: (t, a) => t.replace(a, '            teselas={metaRiesgo?.teselas}\n            visible={!!cutRiesgo}\n'),
    bloque: 'vista',
  },
  {
    id: 'C3',
    archivo: APP_JSX,
    titulo: 'no filtrar la infraestructura por la comuna elegida',
    // Con la capa nacional (DECISIONES.md §X) el defecto ya no es cruzar por
    // nombre --el punto no lleva nombre de comuna-- sino olvidar el filtro: el
    // panel habla de una comuna y el mapa dibuja también las vecinas.
    ancla: '(p) => !cutRiesgo || p.cut === cutRiesgo,',
    mutar: (t, a) => t.replace(a, '() => true,'),
    bloque: 'vista',
  },
  {
    id: 'C3',
    archivo: APP_JSX,
    titulo: 'no resolver los alias de comuna de los enlaces viejos',
    ancla: '(p.alias ?? []).some((a) => clave(a) === buscado)',
    mutar: (t, a) => t.replace(a, 'false'),
    bloque: 'vista',
  },
  {
    id: 'C3',
    archivo: APP_JSX,
    titulo: 'comparar el nombre de la URL tal cual, sin quitar tildes ni mayúsculas',
    ancla: 'if (clave(p.comuna) === buscado ||',
    mutar: (t, a) => t.replace(a, 'if (p.comuna === valor ||'),
    bloque: 'vista',
  },
  {
    id: 'C4',
    archivo: ESCALAS,
    titulo: 'que el modo normalizado siga pintando la clase del modelo',
    ancla: 'const t = normalizar(props.nivel_medio, ctx)',
    mutar: (t, a) => t.replace(a, 'const t = null'),
    bloque: 'vista',
  },
  {
    id: 'C5',
    archivo: PANEL_RIESGO,
    titulo: 'volver a toFixed en el máximo de la leyenda relativa',
    ancla: 'máx. {fmt3.format(ctx.max)}',
    mutar: (t, a) => t.replace(a, 'máx. {ctx.max.toFixed(3)}'),
    bloque: 'vista',
  },
  {
    id: 'C6',
    archivo: APP_JSX,
    titulo: 'memorizar la escala sin depender de la comuna ni de sus datos',
    ancla: '[filasRiesgo, comunaRiesgo, modoEscala],',
    mutar: (t, a) => t.replace(a, '[modoEscala],'),
    bloque: 'vista',
  },
  {
    id: 'C15',
    archivo: APP_JSX,
    titulo: 'pintar todas las manchas con el color por omisión',
    // Lo que pasaba con las claves en femenino: ninguna clase casa y todo gris.
    ancla: "return (clase) => porClase.get(clase) ?? '#CCCCCC'",
    mutar: (t, a) => t.replace(a, "return () => '#CCCCCC'"),
    bloque: 'vista',
  },
  {
    id: 'C10',
    archivo: CAPA_TESELAS,
    titulo: 'clavar la opacidad e ignorar el deslizador',
    // El defecto realista: el control existe y mueve el estado, pero el dibujo
    // no lo lee, así que el mapa nunca cambia. Un vistazo al panel no lo
    // delata -- el número sube y baja igual.
    ancla: 'opacity: () => opacidadRef.current,',
    mutar: (t, a) => t.replace(a, 'opacity: () => 0.65,'),
    bloque: 'vista',
  },
  {
    id: 'C20',
    archivo: PANEL_RIESGO,
    titulo: 'quitar el botón que explica la vista',
    ancla: "          Qué muestra esta vista",
    mutar: (t, a) => t.replace(a, '          Ver'),
    bloque: 'vista',
  },
  {
    id: 'C20',
    archivo: join(FRONT, 'src', 'components', 'ModalesPanel.jsx'),
    titulo: 'dejar de explicar qué es el número de la comuna',
    // El estado real hasta el 2026-09-16: la cifra del selector sin una sola
    // linea que dijera de que es. El ancla es el PARRAFO y no su titulo: con el
    // titulo solo, la explicacion seguia ahi y el mutante SOBREVIVIO --medido el
    // 2026-09-16-- porque C20 buscaba las palabras, que seguian en la pagina.
    ancla: '        En el selector, «Coihaique (669)» significa que esa comuna tiene',
    mutar: (t, a) => t.replace(a, '        Las comunas del modelo son'),
    bloque: 'vista',
  },
  {
    id: 'C20',
    archivo: PANEL_RIESGO,
    titulo: 'quitar la pista del número que va junto al selector',
    ancla: '          El número entre paréntesis es cuántas áreas de riesgo tiene la comuna.',
    mutar: (t, a) => t.replace(a, '          Elige una comuna.'),
    bloque: 'vista',
  },
  {
    id: 'C19',
    archivo: CONFIG_JS,
    titulo: 'dejar la familia nueva sin color propio (el estado real del 2026-09-16)',
    // Literalmente lo que había: la familia del insumo viejo en la tabla y la
    // nueva sin entrada, cayendo en el gris por omisión de «Red aeroportuaria».
    ancla: "  comunidades_prep: '#15803D',",
    mutar: (t, a) => t.replace(a, "  escuelas_prep: '#0E7490',"),
    bloque: 'vista',
  },
  {
    id: 'C19',
    archivo: join(FRONT, 'src', 'iconos.js'),
    titulo: 'dejar la familia nueva sin glifo',
    ancla: '  comunidades_prep:',
    mutar: (t, a) => t.replace(a, '  escuelas_prep:'),
    bloque: 'vista',
  },
  {
    id: 'C7',
    archivo: CAPA_ICONOS,
    titulo: 'que los cúmulos cuenten uno de menos',
    // Un disco con una cifra plausible y falsa: en pantalla no se nota, y es
    // justo lo que C7 existe para cazar.
    ancla: 'const n = cumulo.getChildCount()',
    mutar: (t, a) => t.replace(a, 'const n = Math.max(1, cumulo.getChildCount() - 1)'),
    bloque: 'vista',
  },
  {
    id: 'C8',
    archivo: MAPA_PNG,
    titulo: 'exportar el PNG sin los cúmulos',
    // El estado en el que estaba el exportador antes del insumo nacional: sólo
    // dibujaba marcadores con `.pin`, así que el PNG salía con las manchas y sin
    // un solo elemento de infraestructura.
    ancla: "if (el.classList.contains('marker-cluster')) {",
    mutar: (t, a) => t.replace(a, 'if (false) {'),
    bloque: 'vista',
  },
  {
    id: 'C8b',
    archivo: MAPA_PNG,
    titulo: 'exportar sólo el canvas del renderer y no las teselas',
    // El «arreglo» plausible de quien ve dos tipos de canvas en el contenedor: el
    // PNG sale con iconos y sin una sola mancha.
    ancla: "for (const c of cont.querySelectorAll('canvas')) {",
    mutar: (t, a) => t.replace(a, "for (const c of cont.querySelectorAll('.leaflet-overlay-pane canvas')) {"),
    bloque: 'vista',
  },
  {
    id: 'C18',
    archivo: join(FRONT, 'src', 'App.css'),
    titulo: 'volver al texto blanco fijo sobre el acento',
    // El ancla lleva el selector porque `color: var(--sobre-acento)` ya aparece
    // tres veces en App.css: con la botonera de F2 el token se usa también en la
    // insignia de filtros y en el botón primario del modal. Un ancla repetida no
    // muta nada y el arnés se niega a arrancar, que es lo correcto.
    ancla:
      '.normalizar.activo {\n  background: var(--accent);\n  border-color: var(--accent);\n  color: var(--sobre-acento);',
    mutar: (t, a) => t.replace(a, a.replace('color: var(--sobre-acento);', 'color: #fff;')),
    bloque: 'vista',
  },
  {
    id: 'C11',
    archivo: PANEL_RIESGO,
    titulo: 'escribir el nombre de la comuna donde va su código CUT',
    ancla: 'csvRiesgo(datosAreas?.features, { region: parte?.region, cut })',
    mutar: (t, a) => t.replace(a, 'csvRiesgo(datosAreas?.features, { region: parte?.region, cut: comuna })'),
    bloque: 'vista',
  },
  {
    id: 'C9',
    archivo: PANEL_RIESGO,
    titulo: 'dejar el selector de mapa base sin opciones',
    // Se vacía la lista en vez de borrar el bloque: así el JSX sigue siendo
    // válido y lo que falla es lo que C9 mide, no el build.
    ancla: 'Object.keys(basemaps ?? {}).map((k) => (',
    mutar: (t, a) => t.replace(a, '[].map((k) => ('),
    bloque: 'vista',
  },
  {
    id: 'C12',
    archivo: ENLACES_GOOGLE,
    titulo: 'volver a la URL de cámara de Earth (/web/@…,1200d), la que no marca el punto',
    ancla: '`https://earth.google.com/web/search/${lat},${lon}`',
    mutar: (t, a) => t.replace(a, () => '`https://earth.google.com/web/@${lat},${lon},0a,1200d,35y,0h,0t,0r`'),
    bloque: 'ficha',
  },
  {
    // Sin un mutante así la mitad de C12 que compara con la geometría no se
    // había visto roja: el anterior sólo cambia la FORMA del enlace.
    id: 'C12',
    archivo: ENLACES_GOOGLE,
    titulo: 'invertir latitud y longitud en la vista satelital',
    ancla: 'q=${lat},${lon}&ll=${lat},${lon}',
    mutar: (t, a) => t.replace(a, () => 'q=${lon},${lat}&ll=${lon},${lat}'),
    bloque: 'ficha',
  },
  {
    id: 'C12',
    archivo: ENLACES_GOOGLE,
    titulo: 'invertir latitud y longitud en Street View',
    ancla: 'cbll=${lat},${lon}',
    mutar: (t, a) => t.replace(a, () => 'cbll=${lon},${lat}'),
    bloque: 'ficha',
  },
  {
    // Sin t=k el embed abre el mapa de calles: la pestaña dice «Satélite» y
    // muestra otra cosa, con la coordenada correcta.
    id: 'C12',
    archivo: ENLACES_GOOGLE,
    titulo: 'perder t=k: la pestaña Satélite abre el mapa de calles',
    ancla: '${lon}&t=k&',
    mutar: (t, a) => t.replace(a, () => '${lon}&'),
    bloque: 'ficha',
  },
  {
    id: 'C12',
    archivo: ENLACES_GOOGLE,
    titulo: 'invertir latitud y longitud en «buscar alrededor en Maps»',
    ancla: 'viewpoint=${lat},${lon}',
    mutar: (t, a) => t.replace(a, () => 'viewpoint=${lon},${lat}'),
    bloque: 'ficha',
  },
  {
    id: 'C12',
    archivo: MODAL_VISTA,
    titulo: 'que la pestaña Street View siga mostrando el satélite',
    ancla: "vista === 'streetview' ? urlStreetView(coord) : urlSatelite(coord)",
    mutar: (t, a) => t.replace(a, 'urlSatelite(coord)'),
    bloque: 'ficha',
  },
  {
    // La tolerancia de C12 es media unidad de la quinta cifra: con 3 decimales
    // (~110 m) el enlace apunta a otro sitio y tiene que ponerse roja.
    id: 'C12',
    archivo: APP_JSX,
    titulo: 'redondear la coordenada de la ficha a 3 decimales',
    ancla: 'coord: [+ll.lat.toFixed(5), +ll.lng.toFixed(5)]',
    mutar: (t, a) => t.replace(a, 'coord: [+ll.lat.toFixed(3), +ll.lng.toFixed(3)]'),
    bloque: 'ficha',
  },
  {
    // El iframe se monta con la ficha, sin que nadie pulse: cada clic en el
    // mapa pediría Google.
    id: 'C16',
    archivo: MODAL_FICHA,
    titulo: 'cargar la vista satelital en cuanto se abre la ficha',
    ancla: 'vista?.de === ficha ? vista.pestana : null',
    mutar: (t, a) => t.replace(a, "ficha?.coord ? vista?.pestana ?? 'satelite' : null"),
    bloque: 'ficha',
  },
  {
    // El modal se cierra, pero nadie limpia la pestaña: el iframe sigue vivo
    // dentro de un <dialog> cerrado.
    id: 'C16',
    archivo: MODAL_VISTA,
    titulo: 'cerrar el modal sin desmontar su iframe',
    ancla: 'onClose={onCerrar}',
    mutar: (t, a) => t.replace(a, ''),
    bloque: 'ficha',
  },
  {
    // Cerrar la vista cierra también la ficha: hay que volver a pinchar el mapa.
    id: 'C16',
    archivo: MODAL_FICHA,
    titulo: 'que cerrar la vista de Google cierre también la ficha',
    ancla: 'onCerrar={() => setVista(null)}',
    mutar: (t, a) => t.replace(a, 'onCerrar={onCerrar}'),
    bloque: 'ficha',
  },
  {
    id: 'C13',
    archivo: FICHAS,
    titulo: 'volver a toFixed en el nivel medio de la mancha',
    ancla: 'num(fmt3, p.nivel_medio)',
    mutar: (t, a) => t.replace(a, 'p.nivel_medio.toFixed(3)'),
    bloque: 'ficha',
  },
  {
    // pct_alto ya viene en 0..100: un formateador de porcentaje lo multiplica.
    id: 'C13',
    archivo: FICHAS,
    titulo: "formatear pct_alto con style:'percent' (multiplica por 100)",
    ancla: '`${fmtPct1.format(p.pct_alto)} %`',
    mutar: (t, a) => t.replace(a, () => "new Intl.NumberFormat('es-CL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(p.pct_alto)"),
    bloque: 'ficha',
  },
  {
    id: 'C13',
    archivo: FICHAS,
    titulo: 'redondear la superficie de la mancha a hectáreas enteras',
    ancla: '`${fmt2.format(p.area_ha)} ha`',
    mutar: (t, a) => t.replace(a, () => '`${fmt.format(Math.round(p.area_ha))} ha`'),
    bloque: 'ficha',
  },
  {
    id: 'C13',
    archivo: FICHAS,
    titulo: 'invertir mínimo y máximo del rango interno',
    ancla: '`${fmt3.format(p.nivel_medio_min)} – ${fmt3.format(p.nivel_medio_max)}`',
    mutar: (t, a) => t.replace(a, () => '`${fmt3.format(p.nivel_medio_max)} – ${fmt3.format(p.nivel_medio_min)}`'),
    bloque: 'ficha',
  },
  {
    id: 'C16',
    archivo: APP_JSX,
    titulo: 'tratar el clic en otra comuna como si fuera de la elegida',
    // Sin cambiar de comuna, el id no está en los atributos cargados y la ficha
    // queda pendiente para siempre: tocar el mapa fuera de la comuna no hace nada.
    ancla: 'if (tp.cut !== cutRiesgo) {',
    mutar: (t, a) => t.replace(a, 'if (false) {'),
    bloque: 'ficha',
  },
  {
    id: 'C17',
    archivo: join(FRONT, 'src', 'App.css'),
    titulo: 'que la cabecera de la ficha vuelva a desplazarse con el contenido',
    ancla: '.ficha header {\n  position: sticky;',
    mutar: (t, a) => t.replace(a, '.ficha header {\n  position: relative;'),
    bloque: 'ficha',
  },
  {
    id: 'C17',
    archivo: MODAL_FICHA,
    titulo: 'no mostrar nunca la pista de que hay más',
    ancla: 'hidden={!hayMas}',
    mutar: (t, a) => t.replace(a, 'hidden'),
    bloque: 'ficha',
  },
  {
    id: 'C17',
    archivo: join(FRONT, 'src', 'App.css'),
    titulo: 'quitar el scroll-padding: el foco cae debajo de la cabecera fija',
    ancla: '  scroll-padding-top: 76px;\n',
    mutar: (t, a) => t.replace(a, ''),
    bloque: 'ficha',
  },
  {
    id: 'C14',
    archivo: FICHAS,
    titulo: 'volver a escribir los metros UTM tal cual, con punto decimal',
    ancla: '`${metros(p.utm_x)} E · ${metros(p.utm_y)} N',
    mutar: (t, a) => t.replace(a, () => '`${p.utm_x} E · ${p.utm_y} N'),
    bloque: 'ficha',
  },
  {
    id: 'C14',
    archivo: FICHAS,
    titulo: 'volver a toFixed en la superficie del incendio',
    ancla: 'fmt1.format(p.superficie_ha)',
    mutar: (t, a) => t.replace(a, 'p.superficie_ha.toFixed(1)'),
    bloque: 'ficha',
  },
]

const RESPALDO = join(FRONT, '.verificacion', 'respaldo-priorizacion')
const PENDIENTE = join(RESPALDO, 'pendiente.json')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const relativa = (ruta) => relative(FRONT, ruta).replaceAll('\\', '/')
const nombreRespaldo = (ruta) => relativa(ruta).replaceAll('/', '__')

// Con shell:true el pid es el del cmd.exe: kill() mataría el shell y dejaría
// vivos a vite o a Chrome. taskkill /T se lleva el árbol entero.
function matarArbol(proc) {
  if (!proc?.pid || proc.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 })
  } else {
    proc.kill('SIGKILL')
  }
}

const construir = () =>
  new Promise((ok, mal) => {
    const p = spawn('npm', ['run', 'build'], { cwd: FRONT, stdio: 'ignore', shell: true })
    buildVivo = p
    p.on('exit', (c) => {
      buildVivo = null
      if (c === 0) ok()
      else mal(new Error(`build falló (${c})`))
    })
  })

async function negativas() {
  if (SOLO) {
    // Un --solo con un id que no existe correría CERO mutaciones y terminaría
    // con «las 0 mutaciones se pusieron rojas»: un verde que no probó nada.
    const desconocidos = [...SOLO].filter((id) => !MUTACIONES.some((m) => m.id === id))
    if (desconocidos.length) {
      console.error(`✘ --solo con ids que no existen: ${desconocidos.join(', ')}`)
      console.error(`  Los que hay: ${[...new Set(MUTACIONES.map((m) => m.id))].join(', ')}`)
      process.exit(1)
    }
  }
  const elegidas = MUTACIONES.filter((m) => !SOLO || SOLO.has(m.id))

  // ---- 4 · una corrida anterior que murió sin limpiar ---------------------
  if (existsSync(PENDIENTE)) {
    const previo = JSON.parse(readFileSync(PENDIENTE, 'utf8'))
    const distintos = Object.entries(previo).filter(([rel, h]) => {
      const ruta = join(FRONT, rel)
      return !existsSync(ruta) || sha(readFileSync(ruta)) !== h
    })
    if (distintos.length) {
      console.error('✘ una corrida anterior de --negativas quedó a medias y estos archivos NO son los que había antes de ella:')
      for (const [rel] of distintos) console.error(`    ${rel}\n      original en ${join(RESPALDO, rel.replaceAll('/', '__'))}`)
      console.error('  Copia cada original encima de su archivo y vuelve a correr.')
      process.exit(1)
    }
    console.log('· había un respaldo de una corrida interrumpida y los archivos ya coinciden: se limpia')
    rmSync(RESPALDO, { recursive: true, force: true })
  }

  // ---- 1 · anclas, instantánea en memoria y respaldo en disco ---------------
  for (const m of elegidas) {
    const veces = readFileSync(m.archivo, 'utf8').split(m.ancla).length - 1
    if (veces !== 1) {
      console.error(`✘ ${m.id}: «${m.ancla}» aparece ${veces} veces en ${relativa(m.archivo)}, se esperaba 1.`)
      console.error('   El fuente cambió: arregla la mutación antes de seguir fiándote de ella.')
      process.exit(1)
    }
  }
  const tocados = [...new Set(elegidas.map((m) => m.archivo))]
  const originales = new Map(tocados.map((a) => [a, readFileSync(a)]))
  const huellas = new Map(tocados.map((a) => [a, sha(originales.get(a))]))
  mkdirSync(RESPALDO, { recursive: true })
  for (const a of tocados) writeFileSync(join(RESPALDO, nombreRespaldo(a)), originales.get(a))
  writeFileSync(PENDIENTE, JSON.stringify(Object.fromEntries(tocados.map((a) => [relativa(a), huellas.get(a)])), null, 1))
  const restaurar = () => {
    for (const [a, b] of originales) writeFileSync(a, b)
  }
  const cambiados = () => tocados.filter((a) => sha(readFileSync(a)) !== huellas.get(a))

  // ---- 3 · interrupción -----------------------------------------------------
  const alInterrumpir = (senal) => {
    // Restaurar primero: son unos pocos writeFileSync, y con SIGHUP Windows
    // mata el proceso ~10 s despues (documentacion de Node, no medido).
    // matarArbol espera a taskkill, que puede tardar. Ni el build ni Chrome
    // escriben en src/, asi que restaurar con ellos vivos no deja nada a medias.
    restaurar()
    matarArbol(buildVivo)
    matarArbol(chromeVivo)
    const quedan = cambiados()
    if (quedan.length) {
      console.error(`\n✘ interrumpido (${senal}) y ${quedan.length} archivo(s) no coinciden con su huella:`)
      for (const a of quedan) console.error(`    ${relativa(a)}\n      original en ${join(RESPALDO, nombreRespaldo(a))}`)
    } else {
      rmSync(RESPALDO, { recursive: true, force: true })
      console.error(`\n  interrumpido (${senal}): ${tocados.length} archivo(s) restaurados byte a byte y respaldo borrado`)
      console.error('  dist/ puede haber quedado con un mutante: `npm run build` antes del siguiente verify:*')
    }
    process.exit(SENALES[senal] ?? 130)
  }
  for (const s of Object.keys(SENALES)) process.on(s, alInterrumpir)
  if (SIMULAR_CTRL_C != null) setTimeout(() => process.emit(SENAL_SIMULADA, SENAL_SIMULADA), SIMULAR_CTRL_C)

  console.log('\n── controles negativos ──────────────────────────────────────')
  console.log(`  ${elegidas.length} mutaciones; cada una debe poner roja SU aserción`)
  console.log(`  respaldo de ${tocados.length} archivo(s) en ${RESPALDO}\n`)

  // ---- 2 · las mutaciones ---------------------------------------------------
  let mal = 0
  for (const m of elegidas) {
    const original = originales.get(m.archivo)
    let bien = false
    let detalle = ''
    try {
      const mutado = m.mutar(original.toString('utf8'), m.ancla)
      if (mutado === original.toString('utf8')) throw new Error('la mutación no cambió nada')
      writeFileSync(m.archivo, mutado, 'utf8')
      await construir()
      fallos = 0
      resultados.length = 0
      await correr({ bloque: m.bloque })
      // TODAS las comprobaciones con ese id, no la primera: C12..C16 tienen
      // una sola cada una, pero find() se quedaba con la primera y un id
      // repetido podía ocultar la roja.
      const rs = resultados.filter((x) => x.id === m.id)
      bien = rs.length > 0 && rs.some((x) => !x.ok)
      if (!rs.length) detalle = ' (la aserción ni siquiera corrió)'
    } catch (e) {
      // Un mutante que no compila o una suite que revienta no prueban nada.
      detalle = ` (${e.message}: el mutante no llegó a medirse)`
    } finally {
      writeFileSync(m.archivo, original)
    }
    if (!bien) mal++
    console.log(
      `\n  ${bien ? '✔' : '✘'} ${m.id} ${m.titulo} — ${
        bien ? 'se puso roja' : `NO se inmutó: no está probando nada${detalle}`
      }\n`,
    )
  }

  restaurar()
  for (const s of Object.keys(SENALES)) process.off(s, alInterrumpir)

  // El repo tiene que quedar como estaba: se comprueba contra la huella.
  for (const a of tocados) {
    console.log(`  · ${sha(readFileSync(a)) === huellas.get(a) ? 'igual' : 'DISTINTO'} ${huellas.get(a).slice(0, 16)}… ${relativa(a)}`)
  }
  const quedan = cambiados()
  if (quedan.length) {
    console.error(`✘ ${quedan.length} archivo(s) no quedaron como estaban; originales en ${RESPALDO}`)
    process.exitCode = 1
    return
  }
  rmSync(RESPALDO, { recursive: true, force: true })

  // dist/ coherente con el fuente restaurado: el último build fue de un mutante.
  await construir()
  console.log('  · fuentes restaurados byte a byte y reconstruidos')
  console.log('─────────────────────────────────────────────────────────────')
  console.log(mal === 0 ? `✔ las ${elegidas.length} mutaciones se pusieron rojas\n` : `✘ ${mal} mutación(es) no se inmutaron\n`)
  process.exitCode = mal ? 1 : 0
}

if (!existsSync(DIST)) {
  console.error('No hay dist/. Corre `npm run build` antes: este arnés NO construye.')
  process.exit(1)
}

if (NEGATIVAS) {
  await negativas()
} else {
  console.log('\n── vista de riesgo ──────────────────────────────────────────')
  if (process.env.VERIFY_DATOS) console.log(`  datos: ${DATOS} (VERIFY_DATOS)`)
  await correr()
  console.log('─────────────────────────────────────────────────────────────')
  console.log(fallos === 0 ? '✔ la vista pasa todas las comprobaciones\n' : `✘ ${fallos} comprobación(es) fallaron\n`)
  process.exit(fallos ? 1 : 0)
}
