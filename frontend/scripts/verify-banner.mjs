/**
 * Verificacion visual del banner institucional CONAF/UIA.
 *
 *     npm run verify:banner [--construir] [--salida <dir>]
 *
 * Que el codigo compile no verifica nada de una maqueta. Esto captura la app ya
 * construida a cinco anchos y en los dos temas, y MIDE LOS PIXELES PINTADOS: el
 * alto de la banda, que el filete superior sobreviva, que el borde derecho no
 * tenga costura y que el asset llegue al artefacto. Las capturas quedan para
 * mirarlas, que es lo unico que juzga la legibilidad.
 *
 * Sin dependencias. Tres decisiones que conviene conocer antes de tocarlo:
 *
 * 1. Servidor propio (node:http) en vez de `vite preview`. Dos razones. Una:
 *    en CI no corre el ETL, asi que no existe dist/data/manifest.json, y sin el
 *    la app entra por su rama de error y no hay banner que capturar; este
 *    servidor inyecta un manifest de prueba. Dos: `vite preview` tiene puerto
 *    fijo, y si algo ya lo ocupa se mueve solo -- capturarias otro sitio sin
 *    enterarte (paso de verdad durante el desarrollo de esto). Aqui el puerto
 *    lo asigna el sistema y se lee del socket.
 *
 * 2. El tema se fuerza con CDP (Emulation.setEmulatedMedia). Es lo unico que
 *    cambia de verdad lo que la pagina lee por prefers-color-scheme.
 *    --force-dark-mode es el auto-dark del navegador, que es otra cosa, y
 *    --blink-settings=preferredColorScheme es una setting interna de Blink
 *    pensada para sus tests.
 *
 * 3. Los PNG los decodifica Chrome en un <canvas> de una pestana aparte, no un
 *    decodificador propio en Node: son ~25 lineas en vez de ~80 de desfiltrado
 *    PNG, y la ampliacion x4 ademas exige ESCRIBIR un PNG (filtros + deflate +
 *    CRC32, otras ~50). Se sigue midiendo lo pintado: Chrome decodifica su
 *    propia captura, y PNG no tiene perdida.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Constantes medidas pixel a pixel sobre INSUMO_GRAFICO/3_banner_INCENDIOS.jpg.
// Si el asset cambia hay que volver a medirlas Y actualizar los tokens de
// src/index.css: estos numeros y aquellos describen el mismo archivo.
// ---------------------------------------------------------------------------
const ASSET = { ancho: 3032, alto: 177 }
const RAZON = 17.1299
const ALTO_MINIMO = 68
const CRUCE = ALTO_MINIMO * RAZON // 1164,83 px de viewport
const ZONA_SEGURA = [880, 2743] // columnas uniformemente #064928 en las 177 filas
//                      880 y no 864: el asset de INCENDIOS lleva a la derecha del
//                      logotipo UIA las tres lineas de «Gerencia de proteccion contra
//                      incendios forestales», que llegan hasta la columna 804 y empujan
//                      el arranque del campo uniforme.
//                      MEDIDO con la MISMA tolerancia que usa A4 (<=24 de distancia
//                      Manhattan a CAMPO, las 177 filas): el campo corre de la 874 a la
//                      2744, contra 858..2744 del asset anterior. Se conserva el margen
//                      del par viejo --seis columnas por la izquierda, una por la
//                      derecha-- en vez de pegarse al borde medido.
//                      NO es #084728: ese valor sale de mirar UNA fila 0 de UNA columna
//                      del borde, donde el ringing del JPEG lava el color. La media de
//                      las 177 filas por las 1800 columnas del campo da exactamente
//                      6,73,40 en los DOS assets.
const CAMPO = [6, 73, 40] // #064928
const FILETE_FILA = 2 // NUNCA la 0: el ringing del JPEG la deja lavada
const FILETE_EXT = [56, 249] // extension del filete en el asset, transiciones incluidas
//                              Re-MEDIDO sobre 3_banner_INCENDIOS.jpg: el filete
//                              corre de la columna 58 a la 245 (era 66..283 en
//                              banner3.jpg). Se deja la misma holgura que tenia el
//                              par anterior: -2 a la izquierda, +4 a la derecha.
//                              No es cosmetico: con el valor viejo, A3 fallaba a
//                              1920 por medio pixel.
const COL_SONDA = 900 // columna del asset para barrer el alto de la banda:
//                       dentro de la zona uniforme, y debajo siempre hay mapa
//                       (nunca el panel, nunca la marca)
const ANCHOS = [1920, 1366, 1165, 768, 390]
const ALTO_VENTANA = 900
const CLIP = 160 // alto capturado: cubre la banda (max 112) y deja ver .abrir

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(RAIZ, 'dist')
const BASE = '/coipo_prevencion_incendio/'

// Los tiles se bloquean en TODOS los casos: son la mayor fuente de flake en CI
// y no aportan nada a la verificacion de una cabecera.
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
const JPEG = '*banner-conaf-incendios*'

const args = process.argv.slice(2)
const SALIDA = args.includes('--salida') ? args[args.indexOf('--salida') + 1] : join(RAIZ, '.verificacion')

// ---------------------------------------------------------------------------
// Servidor de dist/ con manifest de prueba
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pmtiles': 'application/octet-stream',
  '.geojson': 'application/json',
}

// capas:{} basta para que la app se pinte entera: fitBounds sale por
// `if (!bboxes.length) return`, ningun useGeoJSON dispara fetch y PanelLateral
// renderiza sus secciones vacias sin romperse.
const MANIFEST = JSON.stringify({ generado: '2026-01-01T00:00:00Z', capas: {} })

function servidor({ sinManifest = false } = {}) {
  const s = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let ruta = decodeURIComponent(url.pathname)

    if (ruta === `${BASE}data/manifest.json`) {
      if (sinManifest) {
        res.writeHead(404).end('sin manifest (caso de la pantalla de error)')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(MANIFEST)
      return
    }

    if (!ruta.startsWith(BASE)) {
      res.writeHead(404).end('fuera del base')
      return
    }
    ruta = ruta.slice(BASE.length) || 'index.html'
    if (ruta.endsWith('/')) ruta += 'index.html'

    const archivo = join(DIST, normalize(ruta).replace(/^(\.\.[/\\])+/, ''))
    if (!archivo.startsWith(DIST) || !existsSync(archivo)) {
      res.writeHead(404).end('no encontrado')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(archivo)] ?? 'application/octet-stream' })
    createReadStream(archivo).pipe(res)
  })
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, puerto: s.address().port })))
}

// ---------------------------------------------------------------------------
// Chrome + CDP
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
  const perfil = await mkdtemp(join(tmpdir(), 'verify-banner-'))
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

  // El puerto asignado se publica en este archivo del perfil. El try/catch no
  // es decorativo: en Windows, leerlo en el instante en que Chrome lo esta
  // escribiendo devuelve EBUSY, y sin capturarlo el script muere una de cada
  // varias corridas.
  const archivo = join(perfil, 'DevToolsActivePort')
  for (let i = 0; i < 200; i++) {
    try {
      const puerto = readFileSync(archivo, 'utf8').split('\n')[0].trim()
      if (puerto) {
        const r = await fetch(`http://127.0.0.1:${puerto}/json/version`)
        return { proc, perfil, ws: (await r.json()).webSocketDebuggerUrl }
      }
    } catch {
      /* aún no existe, o Chrome lo tiene abierto: se reintenta */
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
    if (!p) return // evento de CDP: no se usan, el estado se consulta sondeando
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
 * `activar` no es decorativo, y el mismo comentario esta en verify-panel.mjs:
 * Chrome SUSPENDE el renderizado de las pestañas en segundo plano. Durante
 * mucho tiempo aqui daba igual, porque este script solo captura y
 * Page.captureScreenshot fuerza un fotograma aunque la pestaña este oculta.
 *
 * Deja de dar igual en cuanto la espera depende de img.decode(): decodificar es
 * parte del rasterizado, asi que en una pestaña oculta esa promesa no resuelve
 * NUNCA y el sondeo se cuelga en la primera captura sin imprimir una sola
 * asercion. La pestaña de la pagina se activa; la del laboratorio no lo
 * necesita, porque solo usa OffscreenCanvas y no pinta nada.
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
  const r = await cdp.enviar(
    'Runtime.evaluate',
    { expression: fuente, awaitPromise: true, returnByValue: true },
    sesion,
  )
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

// ---------------------------------------------------------------------------
// El laboratorio: una pestana aparte donde Chrome decodifica sus capturas.
// Devuelve SOLO numeros; los megabytes de RGBA se quedan dentro del navegador.
// ---------------------------------------------------------------------------
const ANALISIS = `
window.__analizar = async (b64, p) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const c = new OffscreenCanvas(img.width, img.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, img.width, img.height).data
  const px = (x, y) => { const i = (y * img.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
  const dif = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

  // Alto de la banda: se barre hacia abajo desde el color de la sonda hasta que
  // cambia. Bajo esa columna siempre hay mapa, nunca panel ni marca.
  const base = px(p.sonda, 3)
  let alto = 0
  for (let y = 3; y < img.height; y++) { if (dif(px(p.sonda, y), base) > 40) { alto = y; break } }

  // Filete: rachas por tono en la fila 2 (la 0 esta lavada por el JPEG).
  const rachas = []
  let act = null
  for (let x = 0; x < Math.min(img.width, 300); x++) {
    const [r, g, b] = px(x, ${FILETE_FILA})
    const t = b > r + 40 && b > g + 20 ? 'azul' : r > g + 60 && r > b + 60 ? 'rojo' : null
    if (t !== act?.t) { if (act) rachas.push(act); act = t ? { t, desde: x, hasta: x } : null }
    else if (act) act.hasta = x
  }
  if (act) rachas.push(act)
  const mayor = (t) => rachas.filter((r) => r.t === t).sort((a, b) => b.hasta - b.desde - (a.hasta - a.desde))[0] ?? null

  // Borde derecho: dispersion y color medio, para detectar costura.
  const col = [], fin = Math.max(6, alto - 3)
  for (let y = 3; y < fin; y++) col.push(px(img.width - 1, y))
  const canal = (i) => col.map((c) => c[i])
  const disp = Math.max(...[0, 1, 2].map((i) => Math.max(...canal(i)) - Math.min(...canal(i))))
  const medio = [0, 1, 2].map((i) => Math.round(canal(i).reduce((a, b) => a + b, 0) / col.length))

  // Alto de la BANDA por su color de campo, no por «la primera fila distinta de
  // la 3». A2 bloquea la imagen, y entonces el <img> pinta su texto alternativo
  // en blanco sobre el verde: basta UN pixel de una letra en la columna de la
  // sonda para que el barrido de arriba corte en y=5 y A2 declare que la banda
  // se desplomo cuando en realidad mide 80 px. Paso de verdad al alargar el alt
  // con «Gerencia de proteccion contra incendios forestales», que es texto que
  // cruza la sonda; el alt corto de antes se quedaba corto y no la cruzaba.
  // Se tolera cualquier hueco de menos de 8 filas seguidas --las letras-- y se
  // corta al octavo, que es lo que hay debajo de la banda (mapa o panel, nunca
  // verde). Si la banda se desploma de verdad, aqui no hay filas de campo y la
  // asercion sigue poniendose roja: comprobado quitando width/height del <img>.
  let ultimoCampo = -1, seguidasFuera = 0
  for (let y = 0; y < img.height; y++) {
    if (dif(px(p.sonda, y), p.campo) <= 24) { ultimoCampo = y; seguidasFuera = 0 }
    else if (++seguidasFuera >= 8) break
  }

  return {
    ancho: img.width, altoPng: img.height, alto, altoCampo: ultimoCampo + 1,
    azul: mayor('azul'), rojo: mayor('rojo'),
    bordeDisp: disp, bordeMedio: medio,
    centro: px(Math.round(img.width / 2), Math.min(20, Math.max(4, alto - 4))),
    filaCero: px(p.sonda, 0), filaDos: px(p.sonda, 2),
  }
}

// Ampliacion x4 por vecino mas cercano: a tamano real es imposible juzgar si la
// marca se lee.
window.__ampliar = async (b64, w, h, f) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const c = new OffscreenCanvas(w * f, h * f)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, w, h, 0, 0, w * f, h * f)
  const blob = await c.convertToBlob({ type: 'image/png' })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s)
}
window.__laboratorioListo = true
`

// ---------------------------------------------------------------------------
// Un caso = un ancho, un tema, y opcionalmente sin imagen o sin manifest
// ---------------------------------------------------------------------------
async function capturar(cdp, sesion, { ancho, tema, puerto, sinImagen = false, esperar = '.banner img' }) {
  await cdp.enviar(
    'Emulation.setDeviceMetricsOverride',
    { width: ancho, height: ALTO_VENTANA, deviceScaleFactor: 1, mobile: false },
    sesion,
  )
  await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] }, sesion)
  await cdp.enviar('Network.setBlockedURLs', { urls: sinImagen ? [...TILES, JPEG] : TILES }, sesion)
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}${BASE}` }, sesion)

  // Sondeo en vez de --virtual-time-budget a ojo: se espera una condicion real.
  // `complete` tambien es true cuando la imagen falla, asi que el caso sin
  // imagen no se cuelga.
  //
  // Y NO basta con `complete`: eso solo dice que el recurso llego. El <img> del
  // banner declara decoding="async" a proposito (ver Banner.jsx), lo que
  // autoriza al navegador a pintar un fotograma ANTES de tener la imagen
  // decodificada; en esa ventana la banda se ve verde plana --.banner lleva
  // background: var(--verde-institucional)-- y A3 no encuentra el filete azul y
  // rojo. Se manifestaba solo en la PRIMERA medicion de la corrida, porque a
  // partir de la segunda navegacion la imagen ya esta decodificada en memoria:
  // en CI fallo el 1920 light y paso el 1920 dark con los mismos valores.
  //
  // decode() resuelve cuando la imagen ya se puede pintar sin retraso, y no
  // depende de que se produzcan fotogramas -- importante, porque esta pestaña
  // no se activa y en una pestaña oculta requestAnimationFrame no correria.
  // Si la imagen fallo (caso sinImagen, con el JPEG bloqueado) decode() rechaza
  // y se sigue adelante igual, que es justo lo que A2 y A6 necesitan.
  const cond =
    esperar === '.error'
      ? `!!document.querySelector('.error')`
      : `(async () => { const b = document.querySelector('.banner'); const i = b && b.querySelector('img')
                  if (!b || b.getBoundingClientRect().height <= 0 || !i || !i.complete) return false
                  try { await i.decode() } catch { /* imagen bloqueada o rota: A2/A6 */ }
                  return true })()`
  await sondear(cdp, sesion, cond, esperar)

  const { data } = await cdp.enviar(
    'Page.captureScreenshot',
    { format: 'png', clip: { x: 0, y: 0, width: ancho, height: CLIP, scale: 1 } },
    sesion,
  )
  return data
}

const sondaX = (ancho) => Math.round((COL_SONDA * Math.max(ancho, CRUCE)) / ASSET.ancho)
const altoEsperado = (ancho) => Math.max(ALTO_MINIMO, ancho / RAZON)
const escala = (ancho) => Math.max(ancho, CRUCE) / ASSET.ancho

// ---------------------------------------------------------------------------
const fallos = []
const avisos = []
function comprobar(ok, etiqueta, detalle) {
  if (ok) console.log(`  ✔ ${etiqueta.padEnd(46)} ${detalle}`)
  else {
    console.log(`  ✘ ${etiqueta.padEnd(46)} ${detalle}`)
    fallos.push(`${etiqueta} — ${detalle}`)
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
  const { proc, perfil, ws: wsUrl } = await lanzarChrome()
  const cdp = await conectar(wsUrl)
  // El laboratorio PRIMERO y la pagina despues, activandola: activar pone en
  // primer plano, asi que la ultima en activarse es la que conserva el
  // renderizador vivo, y tiene que ser la pagina.
  const lab = await pestana(cdp)
  const pagina = await pestana(cdp, true)
  await evaluar(cdp, lab, ANALISIS)

  const { s: srv, puerto } = await servidor()
  const guardar = (nombre, b64) => writeFile(join(SALIDA, nombre), Buffer.from(b64, 'base64'))
  const analizar = (b64, sonda) =>
    evaluar(cdp, lab, `window.__analizar(${JSON.stringify(b64)}, ${JSON.stringify({ sonda, campo: CAMPO })})`)

  try {
    console.log(`▶ verificando el banner · dist servido en :${puerto}${BASE}`)

    // ---- los diez casos: cinco anchos x dos temas ------------------------
    const bandas = {}
    for (const ancho of ANCHOS) {
      for (const tema of ['light', 'dark']) {
        const b64 = await capturar(cdp, pagina, { ancho, tema, puerto })
        await guardar(`captura-banner-${ancho}-${tema}.png`, b64)
        const m = await analizar(b64, sondaX(ancho))
        bandas[`${ancho}-${tema}`] = m
        const esp = altoEsperado(ancho)
        console.log(`\n▶ ${ancho} px · ${tema}`)

        // A1 · el alto pintado es el que dicta la razon, con el piso
        comprobar(
          Math.abs(m.alto - esp) <= 1,
          `A1 alto pintado (${ancho}/${RAZON} con piso ${ALTO_MINIMO})`,
          `${m.alto} px · esperado ${esp.toFixed(2)}`,
        )

        // A3 · el filete superior sigue entero, en orden y adyacente
        const e = escala(ancho)
        const lim = [FILETE_EXT[0] * e - 3, FILETE_EXT[1] * e + 3]
        const ok3 =
          m.azul &&
          m.rojo &&
          m.azul.hasta < m.rojo.desde &&
          m.rojo.desde - m.azul.hasta <= 12 &&
          m.azul.desde >= lim[0] &&
          m.rojo.hasta <= lim[1]
        comprobar(
          ok3,
          'A3 filete azul+rojo íntegro y adyacente',
          m.azul && m.rojo
            ? `azul ${m.azul.desde}–${m.azul.hasta} · rojo ${m.rojo.desde}–${m.rojo.hasta} · límite ${lim[0].toFixed(0)}–${lim[1].toFixed(0)}`
            : 'no se encontró alguna de las dos franjas',
        )

        // A4 · por debajo del cruce el borde derecho cae en la zona uniforme
        if (ancho < CRUCE) {
          const col = Math.round((ancho / (ALTO_MINIMO * RAZON)) * ASSET.ancho)
          const dentro = col >= ZONA_SEGURA[0] && col <= ZONA_SEGURA[1]
          comprobar(
            m.bordeDisp <= 12 && dif(m.bordeMedio, CAMPO) <= 24 && dentro,
            'A4 borde derecho sin costura',
            `columna ${col} del asset · dispersión ${m.bordeDisp} · medio rgb(${m.bordeMedio})`,
          )
        } else {
          comprobar(true, 'A4 sin recorte (por encima del cruce)', `columna ${ASSET.ancho} del asset`)
        }
      }

      // A5 · la banda es la misma en los dos temas: es un raster
      const l = bandas[`${ancho}-light`]
      const d = bandas[`${ancho}-dark`]
      comprobar(
        l.alto === d.alto && dif(l.filaDos, d.filaDos) <= 2,
        'A5 banda idéntica en claro y oscuro',
        `alto ${l.alto}/${d.alto} · δ ${dif(l.filaDos, d.filaDos)}`,
      )
    }

    // ---- A7/A8/A9 · geometria y procedencia, sobre el DOM ----------------
    for (const ancho of [1920, 768, 390]) {
      await capturar(cdp, pagina, { ancho, tema: 'light', puerto })
      const g = await evaluar(
        cdp,
        pagina,
        `(() => {
           const b = document.querySelector('.banner').getBoundingClientRect()
           const m = document.querySelector('.mapa').getBoundingClientRect()
           const a = document.querySelector('.abrir')
           const ar = a ? a.getBoundingClientRect() : null
           const oculto = a ? getComputedStyle(a).display === 'none' : true
           const i = document.querySelector('.banner img')
           return { banner: {alto: b.height, ancho: b.width}, mapa: {top: m.top, ancho: m.width},
                    abrir: ar && !oculto ? {top: ar.top, alto: ar.height} : null,
                    src: i.currentSrc, nw: i.naturalWidth, nh: i.naturalHeight,
                    scrollW: document.documentElement.scrollWidth, vw: innerWidth }
         })()`,
      )
      console.log(`\n▶ ${ancho} px · geometría`)

      comprobar(
        Math.abs(g.mapa.top - g.banner.alto) <= 1 && (!g.abrir || g.abrir.top >= g.banner.alto),
        'A7 el mapa empieza bajo la banda y ☰ no la pisa',
        `banda ${g.banner.alto.toFixed(1)} px · mapa.top ${g.mapa.top.toFixed(1)} · ☰ ${g.abrir ? g.abrir.top.toFixed(0) : 'oculto'}`,
      )

      comprobar(
        g.src.includes(`${BASE}assets/`) && g.nw === ASSET.ancho && g.nh === ASSET.alto,
        'A8 el asset llega al artefacto, con su tamaño',
        `${g.src.split('/').pop()} · ${g.nw}×${g.nh}`,
      )

      // A9 · que la imagen de 1164,83 px no ensanche el layout por debajo del
      // cruce. Medido: hoy no lo hace ni quitando el overflow:hidden de .banner
      // (Chrome 150), pero si alguien cambia el recorte o el overflow de body
      // esto lo delata, y sin barra de scroll no habria otro sintoma.
      comprobar(
        g.scrollW <= g.vw + 1 && g.mapa.ancho <= g.vw + 1,
        'A9 sin desbordamiento horizontal',
        `scrollWidth ${g.scrollW} · mapa ${g.mapa.ancho.toFixed(0)} · viewport ${g.vw}`,
      )
    }

    // ---- A2 + A6 · sin imagen -------------------------------------------
    // Un mismo caso prueba las dos cosas: si los atributos width/height del
    // <img> desaparecen, con la imagen bloqueada la banda se desploma a 0 y A2
    // cae. Es la guarda real del bug de Leaflet, y no depende de atrapar un
    // frame concreto.
    console.log('\n▶ sin imagen (1366 y 390)')
    for (const ancho of [1366, 390]) {
      const b64 = await capturar(cdp, pagina, { ancho, tema: 'light', puerto, sinImagen: true })
      if (ancho === 1366) await guardar('captura-banner-sin-imagen.png', b64)
      const m = await analizar(b64, sondaX(ancho))
      const esp = altoEsperado(ancho)
      // m.altoCampo y no m.alto: ver el comentario de altoCampo en el laboratorio.
      comprobar(
        Math.abs(m.altoCampo - esp) <= 1,
        `A2 alto reservado sin la imagen (${ancho})`,
        `${m.altoCampo} px · esperado ${esp.toFixed(2)}`,
      )
      comprobar(
        dif(m.centro, CAMPO) <= 24,
        `A6 fondo verde y no blanco (${ancho})`,
        `rgb(${m.centro}) · esperado rgb(${CAMPO})`,
      )
    }

    // ---- A10 · la pantalla de error no lleva banner ----------------------
    console.log('\n▶ pantalla de error')
    await new Promise((ok) => srv.close(ok))
    const { s: srv2, puerto: puerto2 } = await servidor({ sinManifest: true })
    try {
      const b64 = await capturar(cdp, pagina, { ancho: 1366, tema: 'light', puerto: puerto2, esperar: '.error' })
      await guardar('captura-banner-error-sin-banner.png', b64)
      const sinBanner = await evaluar(
        cdp,
        pagina,
        `!document.querySelector('.banner') && !!document.querySelector('.error')`,
      )
      comprobar(sinBanner, 'A10 la pantalla de error no lleva banner', 'árbol de error sin .banner')
    } finally {
      await new Promise((ok) => srv2.close(ok))
    }

    // ---- la ampliacion para ojos humanos --------------------------------
    const b390 = readFileSync(join(SALIDA, 'captura-banner-390-light.png')).toString('base64')
    const x4 = await evaluar(cdp, lab, `window.__ampliar(${JSON.stringify(b390)}, 220, ${ALTO_MINIMO}, 4)`)
    await guardar('captura-banner-390-marca-x4.png', x4)

    console.log(`\n▶ 13 capturas en ${SALIDA}`)
    console.log('  MIRA captura-banner-390-marca-x4.png: que se lean las tres líneas del logotipo')
    console.log('  no lo decide ninguna aserción.')
  } finally {
    try {
      srv.close()
    } catch {
      /* ya cerrado en el caso A10 */
    }
    cdp.ws.close()
    proc.kill()
    await rm(perfil, { recursive: true, force: true }).catch(() => {})
  }

  for (const a of avisos) console.log(`  ! ${a}`)
  if (fallos.length) {
    console.error(`\n✘ ${fallos.length} comprobación(es) fallaron:`)
    for (const f of fallos) console.error(`    ${f}`)
    process.exit(1)
  }
  console.log('\n✔ el banner pasa todas las comprobaciones')
}

const dif = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

main().catch((e) => {
  console.error(`✘ ${e.stack ?? e.message}`)
  process.exit(1)
})
