// Capturas del manual del rol Usuario, SIN RED y con datos FICTICIOS.
//
//   node capturas.mjs <dist> <datos> <salida_png> <perfil_chrome>
//
// - Sirve <dist> (build hecho en una COPIA del frontend) bajo /coipo_prevencion_incendio/
//   y <datos> (salida de datos_ficticios.py) en .../data/, con HTTP Range (PMTiles lo exige).
// - Puertos FIJOS dentro del tramo autorizado 18200-18299: 18210 servidor, 18211 Chrome.
//   Si estan ocupados el script se detiene en vez de capturar otro sitio.
// - Chrome con --host-resolver-rules: no resuelve NINGUN host externo. Ademas, Fetch
//   intercepta las teselas y las responde con una tesela lisa, y Google con una pagina
//   local que dice que es un simulacro.
// - Imprime los PID que levanta para cerrarlos al final (solo esos).
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, normalize, extname, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import net from 'node:net'

const [DIST, DATOS, SALIDA, PERFIL] = process.argv.slice(2).map((p) => resolve(p))
const BASE = '/coipo_prevencion_incendio/'
const P_WEB = 18210
const P_CDP = 18211
mkdirSync(SALIDA, { recursive: true })

const libre = (p) =>
  new Promise((ok) => {
    const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)))
    s.listen(p, '127.0.0.1')
  })
for (const p of [P_WEB, P_CDP]) if (!(await libre(p))) throw new Error(`puerto ${p} ocupado`)

// ---------- tesela lisa (PNG 256x256 gris claro) ----------
function pngLiso(r, g, b) {
  const crc = (buf) => {
    let c = ~0
    for (const x of buf) {
      c ^= x
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
    return ~c >>> 0
  }
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo), datos])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(datos.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(t))
    return Buffer.concat([len, t, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(256, 0)
  ihdr.writeUInt32BE(256, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array(256).fill([r, g, b]).flat())])
  const crudo = Buffer.concat(Array(256).fill(fila))
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0)),
  ])
}
const TESELA = pngLiso(232, 234, 228).toString('base64')
const GOOGLE_HTML = Buffer.from(
  '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;' +
    'background:#dfe6dc;font:16px system-ui;color:#333">Simulacro sin red: aquí se ve la imagen de Google</body>',
).toString('base64')

// ---------- servidor con Range ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.pmtiles': 'application/octet-stream' }
let romperManifest = false
const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let ruta = decodeURIComponent(url.pathname)
  if (!ruta.startsWith(BASE)) return void res.writeHead(404).end()
  ruta = ruta.slice(BASE.length) || 'index.html'
  if (romperManifest && ruta === 'data/manifest.json') return void res.writeHead(503).end('caido a proposito')
  const raiz = ruta.startsWith('data/') ? DATOS : DIST
  const rel = normalize(ruta.startsWith('data/') ? ruta.slice(5) : ruta).replace(/^(\.\.[/\\])+/, '')
  const archivo = join(raiz, rel)
  if (!archivo.startsWith(raiz) || !existsSync(archivo) || statSync(archivo).isDirectory())
    return void res.writeHead(404).end('no encontrado')
  const tam = statSync(archivo).size
  const tipo = MIME[extname(archivo)] ?? 'application/octet-stream'
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  if (m) {
    const a = Number(m[1])
    const b = m[2] ? Math.min(Number(m[2]), tam - 1) : tam - 1
    res.writeHead(206, { 'content-type': tipo, 'content-range': `bytes ${a}-${b}/${tam}`,
      'content-length': b - a + 1, 'accept-ranges': 'bytes' })
    return void createReadStream(archivo, { start: a, end: b }).pipe(res)
  }
  res.writeHead(200, { 'content-type': tipo, 'content-length': tam, 'accept-ranges': 'bytes' })
  createReadStream(archivo).pipe(res)
})
await new Promise((ok) => servidor.listen(P_WEB, '127.0.0.1', ok))
console.log(`PID servidor (este node): ${process.pid}`)

// ---------- Chrome ----------
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  `--remote-debugging-port=${P_CDP}`, `--user-data-dir=${PERFIL}`, 'about:blank',
], { stdio: 'ignore' })
console.log(`PID chrome: ${chrome.pid}`)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))
let wsUrl
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${P_CDP}/json/list`)).json()
    wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* aun no */ }
  if (!wsUrl) await espera(200)
}
const ws = new WebSocket(wsUrl)
await new Promise((ok) => ws.addEventListener('open', ok))
let n = 0
const pend = new Map()
const externos = new Set()
const errores = []
ws.addEventListener('message', async (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  } else if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params
    const u = new URL(request.url)
    if (u.hostname === '127.0.0.1') return void cdp('Fetch.continueRequest', { requestId })
    externos.add(u.hostname)
    if (/google\.com$/.test(u.hostname))
      return void cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }], body: GOOGLE_HTML })
    if (/tile|arcgisonline|eox/.test(u.hostname) && !/services\.arcgisonline/.test(u.hostname))
      return void cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'image/png' }], body: TESELA })
    cdp('Fetch.failRequest', { requestId, errorReason: 'NameNotResolved' })
  } else if (m.method === 'Runtime.exceptionThrown') {
    errores.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0])
  }
})
function cdp(method, params = {}) {
  const id = ++n
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((ok) => pend.set(id, ok))
}
async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.result.exceptionDetails.text}`)
  return r.result?.result?.value
}
await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] })

async function ventana(ancho, alto, oscuro = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 500 })
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }] })
}
async function ir(ruta, ms = 2500) {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${P_WEB}${BASE}${ruta}` })
  await espera(ms)
}
async function foto(nombre) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SALIDA, nombre), Buffer.from(r.result.data, 'base64'))
  console.log('captura', nombre)
}
// Click en el primer elemento visible cuyo texto contenga `texto`.
async function clicTexto(sel, texto, ms = 900) {
  const ok = await ev(`(() => { const t = ${JSON.stringify(texto)};
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(t) && e.offsetParent !== null);
    if (!el) return false; el.click(); return true })()`)
  if (!ok) throw new Error(`no encontre ${sel} con «${texto}»`)
  await espera(ms)
}
// Click real (eventos de raton) en el centro del contenedor del mapa.
async function clicCentroMapa(dx = 0, dy = 0) {
  const r = await ev(`(() => { const b = document.querySelector('.leaflet-container').getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2] })()`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await cdp('Input.dispatchMouseEvent', { type, x: r[0] + dx, y: r[1] + dy, button: 'left', clickCount: 1 })
  await espera(1200)
}

// Desplaza SOLO el contenedor con scroll del panel de indicadores (scrollIntoView
// movia tambien el documento y dejaba una franja blanca que la app no muestra).
async function desplazarPanel(titulo) {
  await ev(`(() => { const p = document.querySelector('#panel-indicadores');
    const h = [...p.querySelectorAll('h2')].find(e => e.textContent.includes(${JSON.stringify(titulo)}));
    let c = h.parentElement; while (c && !(c.scrollHeight > c.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
    c.scrollTop += h.getBoundingClientRect().top - c.getBoundingClientRect().top - 8 })()`)
  await espera(700)
}

const datos = JSON.parse((await import('node:fs')).readFileSync(join(DATOS, 'incendios.geojson'), 'utf8'))
const p0 = datos.features.find((f) => f.properties.superficie_ha > 50) ?? datos.features[0]
const [lon0, lat0] = p0.geometry.coordinates

try {
  await ventana(1440, 900)
  await ir('', 3500)
  await foto('01_inicio.png')
  await clicTexto('.cartel button', 'Entendido')
  await foto('02_visor_paneles.png')
  await clicTexto('#panel-control button', 'Territorio')
  await foto('03_territorio.png')
  await clicTexto('label', 'Biobío', 1500)
  await foto('04_territorio_biobio.png')
  await clicTexto('button', 'Listo', 1500)
  await foto('05_filtro_region.png')
  await clicTexto('#panel-control button', 'Temporada')
  await foto('06_filtro_temporada.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await clicTexto('#panel-control button', 'Capas')
  await foto('07_capas.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await clicTexto('#panel-control button', 'Mapa base')
  await foto('08_mapa_base.png')
  await ir(`?lat=${lat0}&lon=${lon0}&z=13&capas=incendios`, 3500)
  await clicTexto('.cartel button', 'Entendido')
  await clicCentroMapa()
  await foto('09_ficha_incendio.png')
  await clicTexto('dialog[open] button, dialog[open] a', 'Vista satelital', 1500)
  await foto('10_vista_google.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await desplazarPanel('Causas generales')
  await foto('11_indicadores.png')
  await desplazarPanel('Avance OECV')
  await foto('12_indicadores_avance.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await clicTexto('#panel-control button', 'Descargar')
  await foto('13_descargas.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await clicTexto('#panel-control button', 'Compartir')
  await foto('14_compartir.png')
  await ir('', 3000)
  await clicTexto('.cartel button', 'Entendido')
  await clicTexto('#panel-control button', 'Información')
  await foto('15_informacion.png')
  await ir('?vista=riesgo', 4000)
  await foto('16_riesgo_nacional.png')
  await ir('?vista=riesgo&comuna=08305', 4500)
  await foto('17_riesgo_comuna.png')
  await clicTexto('button', 'Normalizar dentro de', 2000)
  await foto('18_riesgo_normalizado.png')
  await ir('?vista=riesgo&comuna=08305&lat=-37.85&lon=-71.95&z=11', 4500)
  let hallada = false
  for (const [dx, dy] of [[0, 0], [20, 0], [0, 20], [-20, 0], [0, -20], [35, 35], [-35, 35]]) {
    await clicCentroMapa(dx, dy)
    if (await ev(`!!document.querySelector('dialog[open]')`)) { hallada = true; break }
  }
  console.log('ficha de area abierta:', hallada)
  await foto('19_riesgo_ficha_area.png')
  await ir('lineas-electricas.html', 4000)
  await foto('20_lineas_electricas.png')
  await ventana(390, 844)
  await ir('', 3500)
  await foto('21_movil.png')
  await ventana(1440, 900, true)
  await ir('', 3500)
  await clicTexto('.cartel button', 'Entendido')
  await foto('22_tema_oscuro.png')
  await ventana(1440, 900)
  romperManifest = true
  await ir('', 3000)
  await foto('23_error_datos.png')
  romperManifest = false
} catch (e) {
  console.error('FALLO:', e.message)
  process.exitCode = 1
} finally {
  console.log('hosts externos interceptados:', [...externos].join(', ') || 'ninguno')
  console.log('excepciones de pagina:', errores.length ? errores.join(' | ') : 'ninguna')
  try { await cdp('Browser.close') } catch { /* ya cerrado */ }
  ws.close()
  servidor.close()
}
