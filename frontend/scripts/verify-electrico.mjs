// Arnes de la vista de incendios por lineas electricas · aserciones E1..E12
//
//     npm run build && npm run verify:electrico
//     npm run verify:electrico -- --negativas            # los 6 mutantes
//     npm run verify:electrico -- --negativas --solo E8  # uno o varios
//
// A es verify-banner, B verify-panel y C verify-priorizacion; esta serie es E
// (la D es de ETL/verify.py).
//
// EXIGE `npm run build` ANTES: sirve `dist/` tal como este y no lo construye.
// Medido el 2026-09-10 con el arnes del banner: sin ese build se mide el
// artefacto anterior y sale un verde --o un rojo-- que no corresponde al codigo
// que se acaba de tocar (CLAUDE.md §3).
//
// NO IMPORTA NADA DE src/ (CLAUDE.md §4). Lo esperado se recalcula aqui con
// codigo propio a partir de dist/data: la normalizacion de comunas, la ventana
// 13-17, los desempates del ranking y de la grafia, el orden de los codigos y
// el literal de NO_ACTIVOS estan DUPLICADOS A PROPOSITO. Importar
// src/electrico/calculos.js verificaria que una funcion es igual a si misma, y
// el arnes dejaria de ser un oraculo para convertirse en un espejo. Si el
// contrato cambia, se cambia en los dos sitios y esta suite lo exige.
//
// La fuente de lo esperado es el CONTRATO 2 (DOM de lineas-electricas.html) y
// el contrato 1 (manifest.derivados), no la implementacion de la pagina.
//
// Lo que cada asercion recorre, porque el alcance importa tanto como el rojo:
// E3..E7, E9 y E11 se comprueban en TODOS los ambitos (el pais y cada region
// del selector, cambiando el <select> como lo haria una persona) y ademas en
// la region elegida entrando por ?region= en la URL. Las regiones que usan
// E4/E5 y E8 salen de los datos, no de un nombre escrito aqui.
//
// Trampas ya pagadas y respetadas:
//   · cada Runtime.evaluate va en un IIFE **async** e imprime exceptionDetails
//   · el tamano se fija con Emulation.setDeviceMetricsOverride
//   · servidor en el puerto 0 y --user-data-dir propio en mkdtemp
//   · E8 hace un clic REAL con Input.dispatchMouseEvent, que pasa por el
//     hit-testing del navegador. Un dispatchEvent sobre el canvas de los puntos
//     entrega el evento a ESE elemento aunque el canvas del calor este encima,
//     asi que no puede ver el defecto que E8 vigila.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import net from 'node:net'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(AQUI, '..')
const DIST = join(FRONT, 'dist')
const DATA = join(DIST, 'data')
const SALIDA = join(FRONT, '.verificacion', 'electrico')
const PAGINA = 'lineas-electricas.html'
const BASE = '/coipo_prevencion_incendio/'
const NEGATIVAS = process.argv.includes('--negativas')
const SOLO = (() => {
  const i = process.argv.indexOf('--solo')
  return i > 0 && process.argv[i + 1] ? new Set(process.argv[i + 1].split(',')) : null
})()
const valorDe = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null)
// Las cuatro senales de corte de --negativas y su codigo de salida, 128 + n como
// hace un shell. Hasta el 2026-09-15 este arnes solo atendia SIGINT y SIGTERM:
// cerrar la ventana de la consola (SIGHUP) o Ctrl+Break (SIGBREAK) dejaba el
// mutante dentro sin que corriera ningun manejador. SIGBREAK es la 21 en Windows.
const SENALES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGBREAK: 149 }
const SIMULAR_CTRL_C = valorDe('--simular-ctrl-c') ? Number(valorDe('--simular-ctrl-c')) : null
const SENAL_SIMULADA = valorDe('--senal') ?? 'SIGINT'
if (!(SENAL_SIMULADA in SENALES)) {
  console.error(`✘ --senal ${SENAL_SIMULADA}: se esperaba una de ${Object.keys(SENALES).join(', ')}`)
  process.exit(1)
}
// Procesos vivos, para que un corte durante --negativas pueda matarlos.
let chromeVivo = null
let buildVivo = null

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/geo+json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.pmtiles': 'application/octet-stream',
}

// ---------------------------------------------------------------------------
// ORACULO PROPIO. Duplica el contrato a proposito (ver cabecera).
// ---------------------------------------------------------------------------

// Literal del filtro del ETL (CAUSA_ELECTRICA en ETL/build_incendios.py). Se
// escribe aqui y NO se lee de manifest.derivados.lineas_electricas.filtro: E2
// es un cruce entre archivos, y tomar el valor del mismo manifest que se esta
// verificando lo volveria circular.
const CAUSA = 'Líneas eléctricas'
// Copia de NO_ACTIVOS de src/config.js. Duplicada a proposito (CLAUDE.md §4).
const NO_ACTIVOS = 'Este visor no muestra incendios activos'
// Ventana horaria del contrato 2: 13 <= HH <= 17.
const VENTANA = { desde: 13, hasta: 17 }
const TOP = 12
// Cabeceras reales del Excel (contrato 1).
const K = {
  id: 'ID', region: 'Región', comuna: 'Comuna', codigo: 'Causa investigada 2023',
  superficie: 'Superficie', hora: 'Hora R20',
}

const fmtCL = new Intl.NumberFormat('es-CL')

// NFKD, sin marcas diacriticas, minusculas y espacios colapsados. \p{Mn} y no
// el rango U+0300-036F de la pagina: para el castellano dan lo mismo, y dos
// implementaciones distintas que coinciden valen mas que una copiada.
const normalizar = (t) =>
  String(t ?? '').normalize('NFKD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

const compararEs = (a, b) => String(a).localeCompare(String(b), 'es')

// Orden por segmentos numericos: 4.9.2 < 4.9.10 < 4.10.1. Un codigo que no sea
// numerico cae al orden de texto, en vez de fingir un NaN.
function compararCodigos(a, b) {
  const x = String(a).split('.').map(Number)
  const y = String(b).split('.').map(Number)
  if (x.some(Number.isNaN) || y.some(Number.isNaN)) return compararEs(a, b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1)
    if (d) return d
  }
  return 0
}

function leerDatos() {
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'))
  const meta = manifest?.derivados?.lineas_electricas
  if (!meta?.archivo) return { manifest, meta: null, features: [] }
  const gj = JSON.parse(readFileSync(join(DATA, meta.archivo), 'utf8'))
  return { manifest, meta, features: gj.features ?? [] }
}

/** Lo que la pagina tiene que mostrar para un ambito ('' = todo el pais). */
function esperado(features, meta, region) {
  const amb = region ? features.filter((f) => f.properties[K.region] === region) : features
  const grupos = new Map()
  const barras = Array(24).fill(0)
  const porCodigo = new Map()
  let ha = 0
  let conHora = 0
  let enVentana = 0
  const horasFueraDeContrato = []
  const bbox = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity }

  for (const f of amb) {
    const p = f.properties
    // Coordenadas de la GEOMETRIA, no de props.lat/lon que usa la pagina: el
    // contrato dice que son el mismo numero, y asi tambien se comprueba.
    const [lon, lat] = f.geometry.coordinates
    bbox.minLat = Math.min(bbox.minLat, lat)
    bbox.maxLat = Math.max(bbox.maxLat, lat)
    bbox.minLon = Math.min(bbox.minLon, lon)
    bbox.maxLon = Math.max(bbox.maxLon, lon)

    // null = 0; el orden de suma es el de los features, igual que en la pagina,
    // para que el redondeo a 2 decimales no dependa del orden.
    ha += p[K.superficie] === null || p[K.superficie] === undefined ? 0 : Number(p[K.superficie])

    // Contrato 2: 'Sin registro' queda fuera de comunas, ranking y circulos.
    const nc = normalizar(p[K.comuna])
    if (nc !== 'sin registro') {
      const clave = `${p[K.region]}|${nc}`
      let g = grupos.get(clave)
      if (!g) grupos.set(clave, (g = { clave, n: 0, grafias: new Map(), features: [] }))
      g.n++
      g.grafias.set(p[K.comuna], (g.grafias.get(p[K.comuna]) ?? 0) + 1)
      g.features.push(f)
    }

    // Contrato 1: Hora R20 es 'HH:MM' o null. Cualquier otra cosa no se
    // descarta en silencio: se cuenta y hace fallar E6.
    const h = p[K.hora]
    if (h !== null && h !== undefined) {
      const m = /^(\d{2}):(\d{2})$/.exec(h)
      if (!m || Number(m[1]) > 23) horasFueraDeContrato.push(h)
      else {
        const hh = Number(m[1])
        barras[hh]++
        conHora++
        if (hh >= VENTANA.desde && hh <= VENTANA.hasta) enVentana++
      }
    }

    const cod = String(p[K.codigo] ?? '')
    porCodigo.set(cod, (porCodigo.get(cod) ?? 0) + 1)
  }

  for (const g of grupos.values()) {
    // Grafia mas frecuente; en empate, la primera por localeCompare('es').
    g.etiqueta = [...g.grafias].sort((a, b) => b[1] - a[1] || compararEs(a[0], b[0]))[0][0]
  }
  const ranking = [...grupos.values()]
    .sort((a, b) => b.n - a.n || compararEs(a.etiqueta, b.etiqueta))
    .slice(0, TOP)

  const sc = meta.sin_coordenadas ?? {}
  return {
    region,
    total: amb.length,
    comunas: grupos.size,
    ha: Math.round(ha * 100) / 100,
    grupos,
    ranking,
    barras,
    conHora,
    enVentana,
    // Sin ninguna hora el contrato no fija el porcentaje; la pagina da '0.0'.
    pct: conHora ? ((100 * enVentana) / conHora).toFixed(1) : '0.0',
    horasFueraDeContrato,
    leyenda: [...porCodigo].sort((a, b) => compararCodigos(a[0], b[0])).map(([codigo, n]) => ({ codigo, n })),
    sinCoord: region ? (sc.por_region?.[region] ?? 0) : sc.n,
    bbox: amb.length ? bbox : null,
  }
}

/** Regiones del selector: union de features y por_region, sin 'Sin región'. */
function regionesEsperadas(features, meta) {
  const s = new Set(features.map((f) => f.properties[K.region]).filter(Boolean))
  for (const [r, n] of Object.entries(meta.sin_coordenadas?.por_region ?? {})) {
    if (r !== 'Sin región' && n > 0) s.add(r)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/**
 * Region para E4/E5, sacada de los datos: aquella donde agrupar por etiqueta
 * CRUDA cambiaria el top-12 (en etiqueta o en n). Entre varias, la de mas
 * grupos con grafias distintas y despues la de mas puntos. Si ninguna region
 * lo cumple, E5 no ejercitaria la agrupacion y se dice, en vez de pasar.
 */
function regionConVariantes(features, meta, regiones) {
  const candidatas = []
  for (const r of regiones) {
    const e = esperado(features, meta, r)
    const variantes = [...e.grupos.values()].filter((g) => g.grafias.size > 1).length
    if (!variantes) continue
    const crudo = new Map()
    for (const f of features) {
      const p = f.properties
      if (p[K.region] !== r || normalizar(p[K.comuna]) === 'sin registro') continue
      crudo.set(p[K.comuna], (crudo.get(p[K.comuna]) ?? 0) + 1)
    }
    const topCrudo = [...crudo].sort((a, b) => b[1] - a[1] || compararEs(a[0], b[0])).slice(0, TOP)
    const firma = (xs) => JSON.stringify(xs)
    const difiere =
      firma(topCrudo.map(([et, n]) => [et, n])) !== firma(e.ranking.map((g) => [g.etiqueta, g.n]))
    if (difiere) candidatas.push({ region: r, variantes, puntos: e.total })
  }
  candidatas.sort((a, b) => b.variantes - a.variantes || b.puntos - a.puntos)
  return candidatas[0] ?? null
}

/**
 * Punto para E8: una comuna con n=1 que aparece en el ranking de su region
 * (asi tiene fila a la que hacer clic) y cuyo centroide ES el punto. Entre
 * ellas, la mas aislada: la de mayor distancia en pixeles a z12 a cualquier
 * otro incendio, para que no quede dentro de un cumulo.
 */
function puntoAislado(features, meta, regiones) {
  const mundo = 256 * 2 ** 12
  const px = (lon, lat) => [
    ((lon + 180) / 360) * mundo,
    ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * mundo,
  ]
  let mejor = null
  for (const r of regiones) {
    const e = esperado(features, meta, r)
    for (const g of e.ranking) {
      if (g.n !== 1) continue
      const f = g.features[0]
      const [x, y] = px(...f.geometry.coordinates)
      let dmin = Infinity
      for (const o of features) {
        if (o === f) continue
        const [ox, oy] = px(...o.geometry.coordinates)
        dmin = Math.min(dmin, Math.hypot(ox - x, oy - y))
      }
      if (!mejor || dmin > mejor.distancia) mejor = { region: r, grupo: g, feature: f, distancia: dmin }
    }
  }
  return mejor
}

// ---------------------------------------------------------------------------
// Infraestructura (el mismo patron que verify-priorizacion.mjs)
// ---------------------------------------------------------------------------

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
let fallos = 0
const resultados = []

function comprobar(cond, titulo, detalle = '') {
  console.log(`  ${cond ? '✔' : '✘'} ${titulo.padEnd(58)} ${detalle}`)
  if (!cond) fallos++
  resultados.push({ id: titulo.split(' ')[0], ok: !!cond })
  return !!cond
}

function servidor() {
  const s = createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, 'http://l').pathname)
    if (!ruta.startsWith(BASE)) return res.writeHead(404).end()
    ruta = ruta.slice(BASE.length) || 'index.html'
    const archivo = join(DIST, normalize(ruta).replace(/^(\.\.[/\\])+/, ''))
    if (!archivo.startsWith(DIST) || !existsSync(archivo) || statSync(archivo).isDirectory()) {
      return res.writeHead(404).end()
    }
    res.writeHead(200, { 'content-type': MIME[extname(archivo)] ?? 'application/octet-stream' })
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
  // --user-data-dir propio: sin el Chrome se adjunta a la sesion ya abierta,
  // termina de inmediato y no genera ninguna captura.
  const perfil = await mkdtemp(join(tmpdir(), 'verify-electrico-'))
  const puerto = await puertoLibre()
  const proc = spawn(chromePath(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
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
  const oyentes = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method) {
      for (const fn of oyentes) fn(m)
      return
    }
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
  return { ws, enviar, alEvento: (fn) => oyentes.push(fn) }
}

const slug = (t) => normalizar(t || 'nacional').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Estado observable de la pagina segun el contrato 2. Sin comillas invertidas
// dentro: se inserta en plantillas de Node.
const LEER_ESTADO = `
  const q = (id) => document.getElementById(id)
  const cw = q('window-callout')
  const aviso = q('aviso-activos')
  return {
    estado: q('app')?.dataset.estado ?? null,
    region: q('region')?.value ?? null,
    url: new URL(location.href).searchParams.get('region'),
    total: q('stat-total')?.dataset.valor ?? null,
    totalTexto: q('stat-total')?.textContent ?? null,
    comunas: q('stat-comunas')?.dataset.valor ?? null,
    comunasTexto: q('stat-comunas')?.textContent ?? null,
    ha: q('stat-ha')?.dataset.valor ?? null,
    haTexto: q('stat-ha')?.textContent ?? null,
    rank: [...document.querySelectorAll('#rank-list .rank-item')].map((e) => ({
      clave: e.dataset.clave ?? null, n: e.dataset.n ?? null,
      etiqueta: e.querySelector('.rank-name')?.textContent ?? null,
    })),
    barras: [...document.querySelectorAll('#hourly-chart .hbar')].map((e) => ({ hora: e.dataset.hora, n: e.dataset.n })),
    ventana: cw ? { en: cw.dataset.enVentana ?? null, con: cw.dataset.conHora ?? null, pct: cw.dataset.pct ?? null, texto: cw.textContent } : null,
    leyenda: [...document.querySelectorAll('#leyenda .legend-item')].map((e) => ({
      codigo: e.dataset.codigo ?? null, n: e.dataset.n ?? null,
      color: e.dataset.color ?? null, respaldo: e.dataset.respaldo ?? null,
    })),
    sinCoord: q('aviso-sin-coord')?.dataset.n ?? null,
    encuadre: q('map')?.dataset.encuadre ?? null,
    activos: aviso ? { texto: aviso.textContent, visible: aviso.getClientRects().length > 0 } : null,
  }`

const leerEncuadre = (t) => {
  const v = String(t ?? '').split(',').map(Number)
  return v.length === 4 && v.every(Number.isFinite) ? { s: v[0], w: v[1], n: v[2], e: v[3] } : null
}
// data-encuadre lleva 4 decimales: se tolera ese redondeo.
const TOL = 1.5e-4
const contiene = (enc, b) =>
  enc.s <= b.minLat + TOL && enc.n >= b.maxLat - TOL && enc.w <= b.minLon + TOL && enc.e >= b.maxLon - TOL
const area = (enc) => (enc.n - enc.s) * (enc.e - enc.w)

/**
 * Compara un ambito observado con el esperado. Devuelve, por asercion, la
 * lista de discrepancias (vacia = coincide).
 */
function compararAmbito(obs, esp, { pedida, encNacional }) {
  const mal = { E3: [], E4: [], E5: [], E6: [], E7: [], E9: [], E11: [] }
  const donde = esp.region || 'Todo el país'
  const di = (k, m) => mal[k].push(`${donde}: ${m}`)

  if (obs.estado !== 'listo') {
    for (const k of Object.keys(mal)) di(k, `data-estado=${obs.estado}`)
    return mal
  }

  // E3 · el selector refleja la region y ?region= se escribe al cambiar
  if (obs.region !== pedida) di('E3', `select=${JSON.stringify(obs.region)} y se pidió ${JSON.stringify(pedida)}`)
  if ((obs.url ?? '') !== pedida) di('E3', `?region=${JSON.stringify(obs.url)} y se pidió ${JSON.stringify(pedida)}`)

  // E4 · totales
  if (Number(obs.total) !== esp.total || obs.total === null) di('E4', `total ${obs.total} ≠ ${esp.total}`)
  if (Number(obs.comunas) !== esp.comunas || obs.comunas === null) di('E4', `comunas ${obs.comunas} ≠ ${esp.comunas}`)
  if (obs.ha === null || Math.abs(Number(obs.ha) - esp.ha) > 1e-9) di('E4', `ha ${obs.ha} ≠ ${esp.ha}`)
  if (obs.totalTexto?.trim() !== fmtCL.format(esp.total)) di('E4', `texto del total «${obs.totalTexto}» ≠ «${fmtCL.format(esp.total)}»`)
  if (obs.comunasTexto?.trim() !== fmtCL.format(esp.comunas)) di('E4', `texto de comunas «${obs.comunasTexto}» ≠ «${fmtCL.format(esp.comunas)}»`)
  // El texto de ha lo formatea es-CL con los decimales que la pagina elija: se
  // lee de vuelta y se exige a menos de medio decimo del valor.
  const haLeida = Number(String(obs.haTexto ?? '').trim().replace(/\./g, '').replace(',', '.'))
  if (!(Math.abs(haLeida - esp.ha) <= 0.05 + 1e-9)) di('E4', `texto de ha «${obs.haTexto}» no es ${esp.ha} en es-CL`)

  // E5 · top-12, en orden. Etiqueta y n van por un lado y data-clave por otro,
  // A PROPOSITO: cualquier cambio en la normalizacion altera el texto de TODAS
  // las claves, y un rojo solo por el formato de la clave no diria si la
  // agrupacion de grafias (CABRERO + Cabrero) se rompio. La comparacion de
  // etiqueta y n es la que caza eso, y se informa primero.
  const rEsp = esp.ranking.map((g) => ({ clave: g.clave, etiqueta: g.etiqueta, n: String(g.n) }))
  if (obs.rank.length !== rEsp.length) di('E5', `${obs.rank.length} filas y se esperaban ${rEsp.length}`)
  const largo = Math.max(obs.rank.length, rEsp.length)
  for (let i = 0; i < largo; i++) {
    const o = obs.rank[i]
    const e = rEsp[i]
    if (!o || !e || o.etiqueta !== e.etiqueta || o.n !== e.n) {
      di('E5', `puesto ${i + 1}: ${o ? `${o.etiqueta} n=${o.n}` : '—'} ≠ ${e ? `${e.etiqueta} n=${e.n}` : '—'}`)
      break
    }
  }
  for (let i = 0; i < largo; i++) {
    if (obs.rank[i]?.clave !== rEsp[i]?.clave) {
      di('E5', `data-clave del puesto ${i + 1}: ${obs.rank[i]?.clave ?? '—'} ≠ ${rEsp[i]?.clave ?? '—'}`)
      break
    }
  }

  // E6 · 24 barras, ventana y denominador
  if (obs.barras.length !== 24) di('E6', `${obs.barras.length} barras`)
  for (let h = 0; h < 24; h++) {
    const b = obs.barras.find((x) => x.hora === String(h))
    if (!b || b.n !== String(esp.barras[h])) {
      di('E6', `hora ${h}: ${b?.n ?? '—'} ≠ ${esp.barras[h]}`)
      break
    }
  }
  const v = obs.ventana
  if (!v) di('E6', 'no hay #window-callout')
  else {
    if (v.en !== String(esp.enVentana)) di('E6', `en ventana ${v.en} ≠ ${esp.enVentana}`)
    if (v.con !== String(esp.conHora)) di('E6', `con hora ${v.con} ≠ ${esp.conHora}`)
    if (v.pct !== esp.pct) di('E6', `pct ${v.pct} ≠ ${esp.pct}`)
    const frase = `de ${fmtCL.format(esp.conHora)} con hora registrada`
    if (!v.texto.includes(frase)) di('E6', `el texto no dice «${frase}»`)
  }
  if (esp.horasFueraDeContrato.length) {
    di('E6', `${esp.horasFueraDeContrato.length} valores de Hora R20 fuera de 'HH:MM' (${esp.horasFueraDeContrato.slice(0, 3).join(', ')})`)
  }

  // E7 · encuadre
  const enc = leerEncuadre(obs.encuadre)
  if (esp.bbox) {
    if (!enc) di('E7', `data-encuadre ilegible: ${obs.encuadre}`)
    else {
      if (!contiene(enc, esp.bbox)) di('E7', `encuadre ${obs.encuadre} no contiene el bbox de los puntos`)
      if (esp.region && encNacional && !(area(enc) < area(encNacional))) {
        di('E7', `encuadre ${obs.encuadre} no es más chico que el nacional ${encNacional.s},${encNacional.w},${encNacional.n},${encNacional.e}`)
      }
    }
  }

  // E9 · aviso de puntos sin coordenadas
  if (obs.sinCoord !== String(esp.sinCoord)) di('E9', `aviso ${obs.sinCoord} ≠ ${esp.sinCoord}`)

  // E11 · leyenda: codigos de los datos, en orden, con su n, sin gris de respaldo
  const lo = obs.leyenda.map((x) => `${x.codigo}:${x.n}`).join(' ')
  const le = esp.leyenda.map((x) => `${x.codigo}:${x.n}`).join(' ')
  if (lo !== le) di('E11', `leyenda [${lo}] ≠ [${le}]`)
  const respaldo = obs.leyenda.filter((x) => x.respaldo === '1').map((x) => x.codigo)
  if (respaldo.length) di('E11', `en gris de respaldo: ${respaldo.join(', ')}`)
  const colores = new Set(obs.leyenda.map((x) => String(x.color).toLowerCase()))
  if (colores.size !== obs.leyenda.length) di('E11', `${obs.leyenda.length} códigos y ${colores.size} colores distintos`)

  return mal
}

// ---------------------------------------------------------------------------

async function correr({ capturas = true } = {}) {
  const { manifest, meta, features } = leerDatos()
  if (!meta) {
    comprobar(false, 'E1 manifest.derivados.lineas_electricas existe', `no está en ${join(DATA, 'manifest.json')}`)
    return
  }
  const regiones = regionesEsperadas(features, meta)
  const nacional = esperado(features, meta, '')
  const elegida = regionConVariantes(features, meta, regiones)
  const aislado = puntoAislado(features, meta, regiones)
  const masPuntos = regiones
    .map((r) => ({ r, n: features.filter((f) => f.properties[K.region] === r).length }))
    .sort((a, b) => b.n - a.n)[0]?.r

  if (capturas) mkdirSync(SALIDA, { recursive: true })

  const { s, puerto } = await servidor()
  const { proc, ws: wsUrl, perfil } = await lanzarChrome()
  const cdp = await conectar(wsUrl)
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })

  // Errores de la pagina durante TODA la corrida. Los de red de hosts ajenos
  // (teselas del mapa base) se informan pero no cuentan: dependen de internet,
  // no de este codigo. Los de nuestro servidor si cuentan.
  const origen = `http://127.0.0.1:${puerto}`
  const errores = []
  const ajenos = []
  let fase = 'arranque'
  cdp.alEvento((m) => {
    if (m.sessionId !== sessionId) return
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      errores.push(`[${fase}] excepción: ${d.exception?.description ?? d.text}`)
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) {
      errores.push(`[${fase}] console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const e = m.params.entry
      if (e.url && !e.url.startsWith(origen)) ajenos.push(`[${fase}] ${e.text} ${e.url}`)
      else errores.push(`[${fase}] log: ${e.text} ${e.url ?? ''}`)
    }
  })
  await cdp.enviar('Page.enable', {}, sessionId)
  await cdp.enviar('Runtime.enable', {}, sessionId)
  await cdp.enviar('Log.enable', {}, sessionId)
  // Chrome SUSPENDE el renderizado de las pestanas en segundo plano.
  await cdp.enviar('Target.activateTarget', { targetId })

  const tamano = (width, height, mobile = false) =>
    cdp.enviar('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId)

  const evaluar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', {
      // IIFE **async**: sin el async cualquier await es SyntaxError.
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

  const ir = async (region) => {
    const q = region ? `?region=${encodeURIComponent(region)}` : ''
    await cdp.enviar('Page.navigate', { url: `${origen}${BASE}${PAGINA}${q}` }, sessionId)
    await espera(300)
    await esperar(
      `['listo', 'error'].includes(document.getElementById('app')?.dataset.estado)`,
      `data-estado listo o error (${region || 'nacional'})`,
    )
    const estado = await evaluar(`return {
      estado: document.getElementById('app')?.dataset.estado ?? null,
      motivo: document.querySelector('#error .motivo')?.textContent ?? '' }`)
    if (estado?.estado !== 'listo') console.error(`    la página quedó en ${estado?.estado}: ${estado?.motivo}`)
    return estado?.estado === 'listo'
  }

  const capturar = async (nombre, completa = false) => {
    if (!capturas) return
    let params = { format: 'png' }
    if (completa) {
      const m = await cdp.enviar('Page.getLayoutMetrics', {}, sessionId)
      const c = m.cssContentSize ?? m.contentSize
      params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: c.width, height: c.height, scale: 1 } }
    }
    const { data } = await cdp.enviar('Page.captureScreenshot', params, sessionId)
    writeFileSync(join(SALIDA, `${nombre}.png`), Buffer.from(data, 'base64'))
    console.log(`    · .verificacion/electrico/${nombre}.png`)
  }

  const discrepancias = { E3: [], E4: [], E5: [], E6: [], E7: [], E9: [], E11: [] }
  const acumular = (mal) => { for (const k of Object.keys(mal)) discrepancias[k].push(...mal[k]) }
  const informe = { regiones, elegida, aislado: null, ambitos: [] }

  try {
    // ---- carga nacional a 1440x900 ------------------------------------------
    console.log('\n▶ carga nacional · 1440×900')
    fase = 'nacional-1440'
    await tamano(1440, 900)
    const listo = await ir('')

    // El calor lo pinta leaflet.heat en un requestAnimationFrame: se espera a
    // que haya tinta en SU canvas, no un tiempo fijo.
    const tintaCalor = `
      const c = document.querySelector('canvas.leaflet-heatmap-layer')
      if (!c || !c.width || !c.height) return { canvas: !!c, pintados: 0 }
      const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data
      let pintados = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) pintados++
      return { canvas: true, pintados, w: c.width, h: c.height }`
    let calor = null
    for (let i = 0; i < 60 && listo; i++) {
      calor = await evaluar(tintaCalor)
      if (calor?.pintados > 0) break
      await espera(200)
    }
    const cumulos = await evaluar(`return document.querySelectorAll('.marker-cluster').length`)
    await espera(1200) // teselas del mapa base, solo para la captura
    await capturar('nacional-1440x900')

    const estNac = listo ? await evaluar(LEER_ESTADO) : null
    const encNacional = leerEncuadre(estNac?.encuadre)

    // ---- E2 · oraculo cruzado entre archivos --------------------------------
    // Incendios de la capa del visor cuya causa general decodificada es la
    // literal. Sale de OTRO archivo (incendios.geojson) y de las tablas de SU
    // capa: si el derivado se filtrara mal, o se decodificara con la tabla
    // equivocada, los dos numeros dejan de coincidir.
    let e2 = { n: null, motivo: '' }
    const capaInc = manifest.capas?.incendios
    if (!capaInc?.archivo || !existsSync(join(DATA, capaInc.archivo))) e2.motivo = 'no hay capa incendios en dist/data'
    else if ((capaInc.formato ?? 'geojson') !== 'geojson') e2.motivo = `incendios en formato ${capaInc.formato}`
    else {
      const inc = JSON.parse(readFileSync(join(DATA, capaInc.archivo), 'utf8'))
      const codificado = (capaInc.codificados ?? []).includes('causa_general')
      const tabla = capaInc.tablas?.causa_general ?? []
      if (codificado && !tabla.includes(CAUSA)) e2.motivo = `la tabla causa_general no tiene «${CAUSA}»`
      else {
        e2.n = inc.features.filter((f) => {
          const v = f.properties.causa_general
          return (codificado ? tabla[v] : v) === CAUSA
        }).length
      }
    }
    comprobar(
      listo && e2.n !== null && Number(estNac?.total) === e2.n && e2.n > 0,
      'E2 total nacional = incendios.geojson con esa causa',
      e2.n === null ? e2.motivo : `página ${estNac?.total} · incendios.geojson ${e2.n} · derivado ${features.length}`,
    )

    // ---- E10 · aviso de incendios activos -----------------------------------
    comprobar(
      listo && estNac?.activos?.texto.includes(NO_ACTIVOS) && estNac.activos.visible,
      'E10 dice que no muestra incendios activos',
      `presente=${estNac?.activos?.texto.includes(NO_ACTIVOS)} · visible=${estNac?.activos?.visible}`,
    )

    // ---- E12 · el modulo se sirve bajo el base path -------------------------
    const recursos = await evaluar(`return {
      modulos: [...document.querySelectorAll('script[type="module"][src]')].map((e) => new URL(e.src).pathname),
      scripts: [...document.querySelectorAll('script[src]')].map((e) => new URL(e.src).pathname),
      estilos: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map((e) => new URL(e.href).pathname),
    }`)
    const bajoBase = (p) => p.startsWith(`${BASE}assets/`)
    comprobar(
      recursos && recursos.modulos.length > 0 &&
        [...recursos.scripts, ...recursos.estilos].every(bajoBase),
      'E12 módulo y estilos bajo /coipo_prevencion_incendio/assets/',
      recursos ? [...recursos.scripts, ...recursos.estilos].join(' · ') : 'sin recursos',
    )

    // ---- E3..E11 en todos los ambitos, con el <select> ----------------------
    console.log(`\n▶ barrido del selector · ${regiones.length} regiones y el país`)
    fase = 'barrido'
    const opciones = await evaluar(`return [...document.querySelectorAll('#region option')].map((o) => ({ value: o.value, texto: o.textContent }))`)
    const esperadas = ['', ...regiones]
    const opcionesOk =
      opciones && JSON.stringify(opciones.map((o) => o.value)) === JSON.stringify(esperadas) &&
      opciones[0]?.texto.trim() === 'Todo el país'
    if (!opcionesOk) {
      discrepancias.E3.push(`opciones [${opciones?.map((o) => o.value).join(' | ')}] ≠ [${esperadas.join(' | ')}]`)
    }

    const orden = [...regiones, '']
    const barrido = listo
      ? await evaluar(`
        const sel = document.getElementById('region')
        const out = []
        for (const r of ${JSON.stringify(orden)}) {
          sel.value = r
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          await new Promise((z) => requestAnimationFrame(() => requestAnimationFrame(z)))
          out.push({ pedida: r, obs: await (async () => { ${LEER_ESTADO} })() })
        }
        return out`)
      : null
    if (!barrido) discrepancias.E3.push('el barrido no corrió')
    for (const { pedida, obs } of barrido ?? []) {
      const esp = esperado(features, meta, pedida)
      acumular(compararAmbito(obs, esp, { pedida, encNacional }))
      informe.ambitos.push({ via: 'select', pedida, obs })
    }

    // ---- la region elegida, entrando por la URL -----------------------------
    // ?region= se lee AL CARGAR: es el camino de un enlace compartido, que el
    // barrido con el <select> no ejercita.
    if (!elegida) {
      discrepancias.E5.push('ninguna región tiene grafías de comuna que cambien su top-12: la agrupación no se ejercita')
    } else {
      console.log(`\n▶ ?region=${elegida.region} · ${elegida.variantes} comunas con varias grafías que cambian el top-12`)
      fase = `url-${elegida.region}`
      const ok = await ir(elegida.region)
      await espera(1200)
      const obs = ok ? await evaluar(LEER_ESTADO) : { estado: 'no-listo', rank: [], barras: [], leyenda: [] }
      acumular(compararAmbito(obs, esperado(features, meta, elegida.region), { pedida: elegida.region, encNacional }))
      informe.ambitos.push({ via: 'url', pedida: elegida.region, obs })
      await capturar(`${slug(elegida.region)}-1440x900`)
    }

    const ambitos = orden.length
    // Las discrepancias de la region elegida primero: es la que ejercita las
    // grafias, y la que conviene leer cuando algo se pone rojo.
    const primero = elegida ? `${elegida.region}:` : ' '
    const resumir = (k) => {
      const xs = [...discrepancias[k]].sort((a, b) => b.startsWith(primero) - a.startsWith(primero))
      return xs.length ? `${xs.length} discrepancia(s) · ${xs.slice(0, 3).join(' | ')}` : ''
    }
    comprobar(!discrepancias.E3.length, 'E3 las regiones del selector son las de los datos',
      resumir('E3') || `${regiones.length} regiones · ?region= leída y escrita`)
    comprobar(!discrepancias.E4.length, 'E4 total, comunas y hectáreas por ámbito',
      resumir('E4') || `${ambitos} ámbitos + ?region=${elegida?.region} · país ${nacional.total} / ${nacional.comunas} / ${nacional.ha} ha`)
    comprobar(!discrepancias.E5.length, 'E5 el top-12 de comunas coincide',
      resumir('E5') || `${ambitos} ámbitos · en ${elegida?.region} agrupar por etiqueta cruda cambiaría el top-12`)
    comprobar(!discrepancias.E6.length, 'E6 24 barras, ventana 13–17 y denominador',
      resumir('E6') || `país ${nacional.enVentana} de ${nacional.conHora} = ${nacional.pct} %`)
    comprobar(!discrepancias.E7.length, 'E7 el encuadre contiene la región y es más chico',
      resumir('E7') || `${regiones.length} regiones · nacional ${estNac?.encuadre}`)
    comprobar(!discrepancias.E9.length, 'E9 aviso de sin coordenadas = manifest',
      resumir('E9') || `país ${meta.sin_coordenadas?.n} · ${JSON.stringify(meta.sin_coordenadas?.por_region)}`)
    comprobar(!discrepancias.E11.length, 'E11 leyenda = códigos de los datos, sin respaldo',
      resumir('E11') || `país ${nacional.leyenda.length} códigos`)

    // ---- E8 · clic real bajo el calor apagado y vuelto a encender -----------
    console.log('\n▶ E8 · clic real sobre un punto aislado')
    fase = 'e8'
    let e8 = { motivo: 'no hay comuna con n=1 en ningún ranking' }
    if (aislado) {
      const idEsp = String(aislado.feature.properties[K.id])
      const codEsp = String(aislado.feature.properties[K.codigo])
      const [lonP, latP] = aislado.feature.geometry.coordinates
      informe.aislado = { region: aislado.region, clave: aislado.grupo.clave, id: idEsp, codigo: codEsp, distanciaPx: Math.round(aislado.distancia) }
      console.log(`    ${aislado.grupo.etiqueta} (${aislado.region}) · ID ${idEsp} · ${codEsp} · vecino más cercano a ${Math.round(aislado.distancia)} px a z12`)
      const ok = await ir(aislado.region)
      // Clic en su fila del ranking: setView(centroide, 12), y el centroide de
      // una comuna con n=1 es el propio punto.
      const fila = ok
        ? await evaluar(`
          const b = [...document.querySelectorAll('#rank-list .rank-item')].find((e) => e.dataset.clave === ${JSON.stringify(aislado.grupo.clave)})
          if (!b) return false
          b.click()
          return true`)
        : false
      // Espera a que el encuadre deje de moverse (el setView puede animar).
      let previo = null
      for (let i = 0; i < 40 && fila; i++) {
        await espera(250)
        const actual = await evaluar(`return document.getElementById('map').dataset.encuadre`)
        if (actual && actual === previo) break
        previo = actual
      }
      // Apagar y volver a encender el calor: leaflet.heat vuelve a anadir su
      // canvas al FINAL del overlayPane, encima del canvas de los puntos.
      const toggle = fila
        ? await evaluar(`
          const t = document.getElementById('toggle-heat')
          const antes = !!document.querySelector('canvas.leaflet-heatmap-layer')
          t.click()
          await new Promise((z) => setTimeout(z, 300))
          const apagado = !document.querySelector('canvas.leaflet-heatmap-layer')
          t.click()
          await new Promise((z) => setTimeout(z, 600))
          const lienzos = [...document.querySelectorAll('.leaflet-overlay-pane canvas')].map((c) => c.className.includes('heatmap') ? 'calor' : 'puntos')
          return { antes, apagado, encendido: t.checked, lienzos }`)
        : null
      await espera(400)
      const objetivo = toggle
        ? await evaluar(`
          const r = document.getElementById('map').getBoundingClientRect()
          const [s, w, n, e] = document.getElementById('map').dataset.encuadre.split(',').map(Number)
          const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
          const x = r.left + ((${lonP} - w) / (e - w)) * r.width
          const y = r.top + ((merc(n) - merc(${latP})) / (merc(n) - merc(s))) * r.height
          const bajo = document.elementFromPoint(x, y)
          return { x, y, bajo: bajo ? bajo.tagName + '.' + String(bajo.className).split(' ').join('.') : null }`)
        : null
      let popup = null
      if (objetivo) {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
          await cdp.enviar('Input.dispatchMouseEvent', {
            type, x: objetivo.x, y: objetivo.y, button: type === 'mouseMoved' ? 'none' : 'left',
            clickCount: type === 'mouseMoved' ? 0 : 1,
          }, sessionId)
        }
        for (let i = 0; i < 25 && !popup; i++) {
          await espera(200)
          popup = await evaluar(`
            const p = document.querySelector('.leaflet-popup .popup-incendio')
            return p ? { id: p.dataset.id ?? null, codigo: p.dataset.codigo ?? null } : null`)
        }
      }
      const motivo = !ok
        ? `la página no quedó lista con ?region=${aislado.region}`
        : !fila
          ? `no hay fila del ranking con data-clave=${aislado.grupo.clave}`
          : !toggle ? 'no se pudo apagar y encender #toggle-heat' : ''
      e8 = { motivo, fila, toggle, objetivo, popup, idEsp, codEsp }
      await capturar('e8-popup-1440x900')
    }
    const t = e8.toggle
    comprobar(
      !!(e8.popup && e8.popup.id === e8.idEsp && e8.popup.codigo === e8.codEsp && t?.apagado && t?.encendido && t?.lienzos.includes('calor')),
      'E8 clic real bajo el calor reencendido abre el popup',
      e8.motivo
        ? e8.motivo
        : `popup ${JSON.stringify(e8.popup)} · esperado ID ${e8.idEsp} ${e8.codEsp} · bajo el cursor ${e8.objetivo?.bajo} · canvas [${t?.lienzos?.join(', ')}]`,
    )

    // ---- capturas en otros anchos -------------------------------------------
    if (capturas) {
      console.log('\n▶ capturas a 1024 y 400 px')
      fase = 'capturas'
      await tamano(1024, 768)
      await ir(masPuntos)
      await espera(1500)
      await capturar(`${slug(masPuntos)}-1024x768`)
      await tamano(400, 860, true)
      await ir('')
      await espera(1500)
      await capturar('nacional-400x860')
      await capturar('nacional-400-completa', true)
      if (elegida) {
        await ir(elegida.region)
        await espera(1500)
        await capturar(`${slug(elegida.region)}-400x860`)
      }
    }

    // ---- E1 · al final, con los errores de TODA la corrida -------------------
    comprobar(
      listo && errores.length === 0 && cumulos > 0 && calor?.pintados > 0,
      'E1 sin errores, con cúmulos y calor pintado',
      `${errores.length} error(es) de la página · ${cumulos} cúmulos · ${calor?.pintados ?? 0} px de calor` +
        (errores.length ? ` · ${errores.slice(0, 3).join(' | ')}` : '') +
        (ajenos.length ? ` · ${ajenos.length} error(es) de red de hosts ajenos, no cuentan` : ''),
    )

    if (capturas) {
      informe.errores = errores
      informe.ajenos = ajenos
      informe.discrepancias = discrepancias
      informe.e8 = e8
      writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 1))
    }
  } finally {
    cdp.ws.close()
    s.close()
    await cerrarChrome(proc, perfil)
    chromeVivo = null
  }
}

// ---------------------------------------------------------------------------
// Controles negativos. Cada mutacion reintroduce UN defecto concreto y nombra
// la asercion que tiene que ponerse roja.
//
// Los archivos de src/electrico/ no estaban versionados cuando se escribio
// esto, asi que `git checkout` NO los recuperaria tras una corrida
// interrumpida. Por eso, ademas de la copia en memoria, se deja una copia en
// disco en .verificacion/electrico/respaldo-mutantes/ mientras dura la
// corrida, y al final se compara el sha256 de cada archivo con el de antes.
// ---------------------------------------------------------------------------
const MAIN_JS = join(FRONT, 'src', 'electrico', 'main.js')
const CALCULOS_JS = join(FRONT, 'src', 'electrico', 'calculos.js')
const ELECTRICO_CSS = join(FRONT, 'src', 'electrico', 'electrico.css')
const PALETA_JS = join(FRONT, 'src', 'electrico', 'paleta.js')
const RESPALDO = join(SALIDA, 'respaldo-mutantes')

const MUTACIONES = [
  {
    id: 'E4',
    archivo: MAIN_JS,
    titulo: 'los totales ignoran la región',
    ancla: '    const s = resumen(ambito)',
    mutar: (t, a) => t.replace(a, '    const s = resumen(features)'),
  },
  {
    id: 'E5',
    archivo: CALCULOS_JS,
    titulo: 'comunas agrupadas por etiqueta cruda',
    ancla: "  return `${region ?? ''}|${normalizar(comuna)}`",
    mutar: (t, a) => t.replace(a, "  return `${region ?? ''}|${comuna}`"),
  },
  {
    id: 'E6',
    archivo: CALCULOS_JS,
    titulo: 'ventana 13–18',
    ancla: 'export const VENTANA = { desde: 13, hasta: 17 }',
    mutar: (t, a) => t.replace(a, 'export const VENTANA = { desde: 13, hasta: 18 }'),
  },
  {
    id: 'E7',
    archivo: MAIN_JS,
    titulo: 'cambiar de región sin fitBounds',
    // Se quita la llamada que encuadra al aplicar una region: la regresion
    // realista es que el mapa no se mueva al cambiar el <select>, y solo E7 la
    // ve. Quitar el fitBounds ENTERO tambien pone E7 roja, pero mezcla dos
    // defectos. Medido el 2026-09-14 con una sonda: sin ningun fitBounds la
    // pagina no lanza ninguna excepcion, el mapa se queda sin vista hasta el
    // primer setView, data-encuadre nunca se escribe (E7 roja) y no se pinta
    // ni un cumulo ni un pixel de calor (E1 roja).
    ancla: '    encuadrar()\n    actualizarCalor()',
    mutar: (t, a) => t.replace(a, '    actualizarCalor()'),
  },
  {
    id: 'E8',
    archivo: ELECTRICO_CSS,
    titulo: 'el canvas del calor recibe clics y va encima',
    // Se quitan LAS DOS reglas. Medido el 2026-09-14 con este mismo E8: con el
    // z-index 99 puesto, quitar solo pointer-events deja E8 en VERDE (popup de
    // ID 5365, bajo el cursor el canvas de los puntos), porque ese canvas ya
    // queda arriba y recibe el evento. Un mutante de una sola regla no probaria
    // nada; con las dos quitadas, bajo el cursor queda el canvas del calor.
    ancla: '.leaflet-heatmap-layer {\n  pointer-events: none;\n}\n.leaflet-map-pane canvas.leaflet-heatmap-layer {\n  z-index: 99;\n}\n',
    mutar: (t, a) => t.replace(a, ''),
  },
  {
    id: 'E11',
    archivo: PALETA_JS,
    titulo: 'falta un color de la paleta',
    // Se borra la PRIMERA entrada de COLOR_SUBCAUSA, sea cual sea: asi el
    // mutante no depende de un codigo ni de un color escritos aqui.
    ancla: 'export const COLOR_SUBCAUSA = {\n',
    mutar: (t) => t.replace(/(export const COLOR_SUBCAUSA = \{\n)[^\n]*\n/, '$1'),
  },
]

const sha = (b) => createHash('sha256').update(b).digest('hex')

// Con shell:true el pid es el del cmd.exe: kill() mataria el shell y dejaria
// vivos a vite o a Chrome. taskkill /T se lleva el arbol entero.
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
    const p = spawn('npm', ['run', 'build'], { cwd: FRONT, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    buildVivo = p
    let salida = ''
    p.stdout.on('data', (d) => { salida += d })
    p.stderr.on('data', (d) => { salida += d })
    p.on('exit', (c) => {
      buildVivo = null
      return c === 0 ? ok() : mal(new Error(`build falló (${c})\n${salida.slice(-2000)}`))
    })
  })

async function negativas() {
  const mutaciones = MUTACIONES.filter((m) => !SOLO || SOLO.has(m.id))
  const archivos = [...new Set(mutaciones.map((m) => m.archivo))]
  const nombreRespaldo = (a) => `${basename(dirname(a))}__${basename(a)}`

  // Una corrida anterior interrumpida deja el respaldo en disco. Si los
  // archivos ya son iguales a el, se restauraron y solo falto limpiar; si no,
  // NO se arranca: mutar encima de un mutante perderia el original.
  const pendiente = join(RESPALDO, 'pendiente.json')
  if (existsSync(pendiente)) {
    const previo = JSON.parse(readFileSync(pendiente, 'utf8'))
    const distintos = Object.entries(previo).filter(([a, h]) => !existsSync(a) || sha(readFileSync(a)) !== h)
    if (distintos.length) {
      console.error('✘ Una corrida anterior de --negativas quedó a medias y estos archivos NO son los originales:')
      for (const [a] of distintos) console.error(`    ${a}\n      original en ${join(RESPALDO, nombreRespaldo(a))}`)
      console.error('  Copia cada original encima de su archivo y vuelve a correr.')
      process.exit(1)
    }
    rmSync(RESPALDO, { recursive: true, force: true })
  }

  const originales = new Map(archivos.map((a) => [a, readFileSync(a)]))
  const huellas = Object.fromEntries(archivos.map((a) => [a, sha(originales.get(a))]))
  mkdirSync(RESPALDO, { recursive: true })
  for (const a of archivos) writeFileSync(join(RESPALDO, nombreRespaldo(a)), originales.get(a))
  writeFileSync(pendiente, JSON.stringify(huellas, null, 1))

  const restaurarTodo = () => { for (const [a, b] of originales) writeFileSync(a, b) }
  const alInterrumpir = (senal) => {
    // Restaurar PRIMERO: son unos pocos writeFileSync, y con SIGHUP Windows mata
    // el proceso ~10 s despues (documentacion de Node, no medido). Matar a los
    // hijos es lo lento. Y si las huellas coinciden se BORRA el respaldo: dejarlo
    // obligaba a la corrida siguiente a adivinar si venia de un corte limpio.
    restaurarTodo()
    matarArbol(buildVivo)
    matarArbol(chromeVivo)
    const quedan = archivos.filter((a) => sha(readFileSync(a)) !== huellas[a])
    if (quedan.length) {
      console.error(`\n✘ interrumpido (${senal}) y ${quedan.length} archivo(s) no coinciden con su huella:`)
      for (const a of quedan) console.error(`    ${a}\n      original en ${join(RESPALDO, nombreRespaldo(a))}`)
    } else {
      rmSync(RESPALDO, { recursive: true, force: true })
      console.error(`\n  interrumpido (${senal}): ${archivos.length} archivo(s) restaurados byte a byte y respaldo borrado`)
      console.error('  dist/ puede haber quedado con un mutante: `npm run build` antes del siguiente verify:*')
    }
    process.exit(SENALES[senal] ?? 130)
  }
  for (const senal of Object.keys(SENALES)) process.on(senal, alInterrumpir)
  // SOLO para probar esta guarda: un Ctrl+C de consola no se puede teclear desde
  // un agente, asi que la senal se emite desde dentro. Prueba que hay manejador y
  // que restaura, NO que Windows la entregue.
  if (SIMULAR_CTRL_C != null) setTimeout(() => process.emit(SENAL_SIMULADA, SENAL_SIMULADA), SIMULAR_CTRL_C)

  console.log('\n── controles negativos ──────────────────────────────────────')
  console.log(`  ${mutaciones.length} mutaciones; cada una debe poner roja SU aserción\n`)

  let mal = 0
  try {
    for (const m of mutaciones) {
      const original = originales.get(m.archivo).toString('utf8')
      if (!original.includes(m.ancla)) {
        console.error(`  ✘ ${m.id}: no se encontró el ancla en ${m.archivo}`)
        mal++
        continue
      }
      const mutado = m.mutar(original, m.ancla)
      if (mutado === original) {
        console.error(`  ✘ ${m.id}: el parche no cambió nada en ${m.archivo}`)
        mal++
        continue
      }
      console.log(`\n── ${m.id} · ${m.titulo}`)
      try {
        writeFileSync(m.archivo, mutado, 'utf8')
        await construir()
        fallos = 0
        resultados.length = 0
        await correr({ capturas: false })
        const r = resultados.find((x) => x.id === m.id)
        const bien = r && !r.ok
        if (!bien) mal++
        console.log(`\n  ${bien ? '✔' : '✘'} ${m.id} ${m.titulo} — ${bien ? 'se puso roja' : 'NO se inmutó: no está probando nada'}\n`)
      } catch (e) {
        mal++
        console.error(`  ✘ ${m.id}: la corrida reventó: ${e.message}`)
      } finally {
        writeFileSync(m.archivo, originales.get(m.archivo))
      }
    }
  } finally {
    restaurarTodo()
    for (const senal of Object.keys(SENALES)) process.off(senal, alInterrumpir)
  }

  await construir()
  // Byte a byte, no "parece igual": el hash de cada archivo contra el de antes.
  const cambiados = archivos.filter((a) => sha(readFileSync(a)) !== huellas[a])
  for (const a of archivos) {
    console.log(`  · ${sha(readFileSync(a)) === huellas[a] ? 'igual' : 'DISTINTO'} ${huellas[a].slice(0, 16)}… ${a}`)
  }
  if (cambiados.length) {
    mal++
    console.error(`  ✘ ${cambiados.length} archivo(s) no quedaron como estaban; originales en ${RESPALDO}`)
  } else {
    rmSync(RESPALDO, { recursive: true, force: true })
    console.log('  · fuentes restaurados byte a byte y reconstruidos')
  }
  console.log('─────────────────────────────────────────────────────────────')
  console.log(mal === 0 ? `✔ las ${mutaciones.length} mutaciones se pusieron rojas\n` : `✘ ${mal} mutación(es) o restauración(es) fallaron\n`)
  process.exitCode = mal ? 1 : 0
}

if (!existsSync(join(DIST, PAGINA))) {
  console.error(`No hay dist/${PAGINA}. Corre \`npm run build\` antes: este arnés NO construye.`)
  process.exit(1)
}

if (NEGATIVAS) {
  await negativas()
} else {
  console.log('\n── vista de líneas eléctricas ───────────────────────────────')
  await correr()
  console.log('─────────────────────────────────────────────────────────────')
  console.log(fallos === 0 ? '✔ la vista pasa todas las comprobaciones\n' : `✘ ${fallos} comprobación(es) fallaron\n`)
  process.exit(fallos ? 1 : 0)
}
