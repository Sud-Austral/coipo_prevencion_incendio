// Arnés de la vista de priorización · aserciones C1..C8
//
// A está tomado por verify-banner y B por verify-panel, así que esta serie
// empieza en C.
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

import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import net from 'node:net'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(AQUI, '..')
const DIST = join(FRONT, 'dist')
const CAPA_PUNTOS = join(FRONT, 'src', 'components', 'CapaPuntos.jsx')
const BASE = '/coipo_prevencion_incendio/'
const NEGATIVAS = process.argv.includes('--negativas')

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
    const archivo = join(DIST, normalize(ruta).replace(/^(\.\.[/\\])+/, ''))
    if (!archivo.startsWith(DIST) || !existsSync(archivo)) return res.writeHead(404).end()
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

async function lanzarChrome() {
  // --user-data-dir propio: sin él Chrome se adjunta a la sesión ya abierta,
  // termina de inmediato y no genera ninguna captura.
  const perfil = await mkdtemp(join(tmpdir(), 'verify-prioriz-'))
  const puerto = await puertoLibre()
  const proc = spawn(chromePath(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    `--remote-debugging-port=${puerto}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${perfil}`, 'about:blank',
  ], { stdio: 'ignore' })
  for (let i = 0; i < 400; i++) {
    if (proc.exitCode !== null) throw new Error(`Chrome terminó con código ${proc.exitCode}`)
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/json/version`)
      if (r.ok) {
        const j = await r.json()
        if (j.webSocketDebuggerUrl) return { proc, ws: j.webSocketDebuggerUrl }
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

async function correr({ soloC1 = false } = {}) {
  const { s, puerto } = await servidor()
  const { proc, ws: wsUrl } = await lanzarChrome()
  const cdp = await conectar(wsUrl)
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })
  await cdp.enviar('Page.enable', {}, sessionId)
  await cdp.enviar('Runtime.enable', {}, sessionId)
  // Chrome SUSPENDE el renderizado de las pestañas en segundo plano.
  await cdp.enviar('Target.activateTarget', { targetId })
  await cdp.enviar('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)

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

  // Colores del mapa, leídos de los PÍXELES del canvas y no del estado de
  // React ni de las opciones de Leaflet. Dos razones: mirar el resultado es lo
  // único que prueba que se pintó, y así el arnés no depende de ningún interno
  // (`window.__mapa` y compañía) que habría que exponer sólo para medirlo.
  //
  // Devuelve el número de colores DISTINTOS con presencia real y el recuento
  // del más extendido. Contar píxeles pintados a secas pasaría en verde con
  // todo el mapa del mismo color, que es el fallo que esto viene a cazar.
  const coloresDeAreas = `
    const c = document.querySelector('.leaflet-overlay-pane canvas')
    if (!c) return null
    const g = c.getContext('2d', { willReadFrequently: true })
    const d = g.getImageData(0, 0, c.width, c.height).data
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

  try {
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
    // OJO CON EL MUTANTE: mejoras.md propone «quitar `renderer` de las opciones
    // del mapa», y eso NO reproduce el defecto -- comprobado ejecutándolo.
    // Sin esa opción, Map.getRenderer cae en _getPaneRenderer('overlayPane'),
    // que CACHEA un renderer por pane, así que las capas lo siguen
    // compartiendo. El defecto sólo vuelve si una capa declara `renderer`
    // propio (o un `pane` propio, que fuerza lo mismo por otra puerta).
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

    if (soloC1) return

    // ---- C2 · las áreas se pintan con varias clases ----------------------
    console.log('\n▶ C2..C8 · escalas, iconos y exportación')
    await ir('?vista=priorizacion')
    await esperar(`document.querySelector('.panel h1')?.textContent.includes('priorización')`, 'panel')
    await espera(1800)
    const cAbs = await evaluar(coloresDeAreas)
    comprobar(
      cAbs && cAbs.distintos >= 3,
      'C2 el mapa muestra al menos 3 clases distintas',
      `${cAbs?.distintos ?? 0} colores con superficie`,
    )

    // ---- C3 · entrar por enlace con comuna pinta bien A LA PRIMERA -------
    // El bug del efecto que nace neutro: la capa se crea antes de que llegue la
    // comuna y no se corrige nunca. Sólo aparece entrando por URL, jamás
    // clicando, así que el desarrollo manual no lo ejercita.
    await ir('?vista=priorizacion&comuna=Mulchen')
    await esperar(`document.querySelectorAll('.leaflet-marker-icon').length > 10`, 'iconos de Mulchén')
    await espera(1500)
    const sel = await evaluar(`return document.querySelector('.panel select')?.value ?? ''`)
    // El conteo sale del panel, que es lo que lee el usuario. Mulchén tiene 110
    // de las 572 áreas: si se pintaran las 572, el filtro no habría llegado.
    const nAreas = await evaluar(`
      const t = [...document.querySelectorAll('.kpi')].map(e => e.textContent).join(' ')
      const m = t.match(/([\\d.]+) áreas priorizadas/)
      return m ? m[1] : null`)
    const pintado = await evaluar(coloresDeAreas)
    comprobar(
      sel === 'Mulchen' && nAreas === '110' && pintado?.distintos >= 2,
      'C3 ?comuna= filtra y encuadra sin pasar por un clic',
      `select=${sel} · ${nAreas} áreas · ${pintado?.distintos} colores`,
    )

    // ---- C4 · normalizar reparte de verdad -------------------------------
    const antes = await evaluar(coloresDeAreas)
    await evaluar(`
      const b = [...document.querySelectorAll('button')].find(x => x.className.includes('normalizar'))
      if (!b) return false
      b.click()
      return true`)
    await espera(900)
    const despues = await evaluar(coloresDeAreas)
    comprobar(
      antes && despues && despues.distintos > antes.distintos,
      'C4 normalizar usa más colores que la escala del modelo',
      `${antes?.distintos} → ${despues?.distintos} colores`,
    )

    // Que el color se REPARTA, no sólo que cambie: en la escala del modelo
    // Mulchén es casi toda de un color, y ese dominio tiene que bajar.
    comprobar(
      antes && despues && despues.mayor < antes.mayor,
      'C4b ningún color acapara el mapa tras normalizar',
      `color dominante ${antes?.mayor} → ${despues?.mayor} px`,
    )

    // ---- C5 · la leyenda declara el modo y los valores absolutos ---------
    const ley = await evaluar(`
      const t = document.querySelector('.panel')?.textContent ?? ''
      return {
        relativo: t.includes('RELATIVO'),
        min: t.includes('0.1361'),
        max: t.includes('0.5555'),
        aviso: t.includes('posición relativa'),
        cien: /\\b100\\s*%/.test(t),
      }`)
    comprobar(
      ley?.relativo && ley.min && ley.max && ley.aviso && !ley.cien,
      'C5 la leyenda relativa rotula min/max absolutos',
      `RELATIVO=${ley?.relativo} min=${ley?.min} max=${ley?.max} aviso=${ley?.aviso} sin-0a100=${!ley?.cien}`,
    )

    // ---- C6 · cambiar de comuna no hereda la escala anterior -------------
    await evaluar(`
      const s = document.querySelector('.panel select')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(s, 'Coyhaique')
      s.dispatchEvent(new Event('change', { bubbles: true }))
      return true`)
    await espera(1800)
    const tras = await evaluar(`
      const t = document.querySelector('.panel')?.textContent ?? ''
      return { mulchen: t.includes('0.1361'), coyhaique: t.includes('0.6798') }`)
    comprobar(
      tras && !tras.mulchen && tras.coyhaique,
      'C6 al cambiar de comuna se recalculan los anclajes',
      `resto de Mulchén=${tras?.mulchen} · máx. de Coyhaique=${tras?.coyhaique}`,
    )

    // ---- C7 · el umbral de zoom oculta y devuelve los iconos -------------
    // Se usan los botones de zoom de Leaflet, que es por donde pasa el usuario;
    // así el arnés no necesita que la app exponga la instancia del mapa.
    const zoom = await evaluar(`
      const menos = document.querySelector('.leaflet-control-zoom-out')
      const mas = document.querySelector('.leaflet-control-zoom-in')
      if (!menos || !mas) return null
      const pulsar = async (b, n) => {
        for (let i = 0; i < n; i++) { b.click(); await new Promise(r => setTimeout(r, 420)) }
        await new Promise(r => setTimeout(r, 700))
      }
      await pulsar(menos, 5)
      const lejos = document.querySelectorAll('.leaflet-marker-icon').length
      await pulsar(mas, 5)
      const cerca = document.querySelectorAll('.leaflet-marker-icon').length
      return { lejos, cerca }`)
    comprobar(
      zoom && zoom.lejos === 0 && zoom.cerca > 0,
      'C7 los iconos se ocultan al alejar y vuelven al acercar',
      `z6: ${zoom?.lejos} · z11: ${zoom?.cerca}`,
    )

    // ---- C8 · el PNG exportado lleva los iconos --------------------------
    // Medir el DOM no es mirar el PNG: los marcadores son nodos del DOM y el
    // exportador sólo recorría <canvas>, así que salían invisibles mientras
    // B20 seguía en verde. Se cuentan píxeles del color de una familia.
    // Se vuelve a encuadrar una comuna antes de exportar: C7 deja el mapa donde
    // lo dejaron los botones de zoom, que no es donde están los datos. Los
    // marcadores siguen en el DOM aunque queden fuera de la vista, así que
    // contar nodos NO basta -- hay que contar los que caen dentro del mapa.
    await ir('?vista=priorizacion&comuna=Mulchen')
    await esperar(`document.querySelectorAll('.leaflet-marker-icon').length > 10`, 'iconos para exportar')
    await espera(2000)

    const png = await evaluar(`
      window.__blob = null
      const orig = URL.createObjectURL
      URL.createObjectURL = (b) => { window.__blob = b; return orig(b) }
      const caja = document.querySelector('.leaflet-container').getBoundingClientRect()
      const enPantalla = [...document.querySelectorAll('.leaflet-marker-icon')].filter((e) => {
        const r = e.getBoundingClientRect()
        return r.right > caja.left && r.left < caja.right && r.bottom > caja.top && r.top < caja.bottom
      }).length
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
      // #DC2626 (salud) y #1F6FEB (educación): dos familias que siempre están.
      let salud = 0, educacion = 0
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 220) < 12 && Math.abs(d[i+1] - 38) < 12 && Math.abs(d[i+2] - 38) < 12) salud++
        if (Math.abs(d[i] - 31) < 12 && Math.abs(d[i+1] - 111) < 12 && Math.abs(d[i+2] - 235) < 12) educacion++
      }
      return { w: bm.width, h: bm.height, salud, educacion, enPantalla }`)
    comprobar(
      png && !png.error && png.salud > 50 && png.educacion > 50,
      'C8 el PNG exportado contiene los iconos',
      png?.error
        ? png.error
        : `${png?.w}×${png?.h} · ${png?.enPantalla} iconos en pantalla · salud ${png?.salud} px · educación ${png?.educacion} px`,
    )
    // El PNG se guarda SIEMPRE, falle o no: la aserción cuenta píxeles, pero
    // quien decide si un icono se ve es alguien mirando el archivo.
    const b64 = await evaluar('return window.__b64 ?? null')
    if (b64) {
      const dir = join(FRONT, '.verificacion')
      writeFileSync(join(dir, 'priorizacion-png-exportado.png'), Buffer.from(b64.split(',')[1], 'base64'))
      console.log('    · .verificacion/priorizacion-png-exportado.png')
    }
  } finally {
    proc.kill()
    s.close()
    cdp.ws.close()
  }
}

// ---------------------------------------------------------------------------
// Control negativo de C1: se quita el renderer compartido de App.jsx, se
// reconstruye y C1 TIENE que ponerse roja. Es el mutante que pide mejoras.md.
// ---------------------------------------------------------------------------
async function negativas() {
  console.log('\n── control negativo ─────────────────────────────────────────')
  console.log('  el mutante da un canvas PROPIO a la capa de puntos; C1 debe ponerse ROJA\n')

  // NO se muta App.jsx quitando `renderer`, que es lo que propone mejoras.md:
  // medido, eso no reproduce nada, porque Leaflet cae en _getPaneRenderer y las
  // capas siguen compartiendo el renderer del pane. El defecto de §H sólo
  // vuelve cuando una capa declara el suyo, que es justo lo que hacía el código
  // que lo causó.
  const original = readFileSync(CAPA_PUNTOS, 'utf8')
  const ANCLA = 'const m = L.circleMarker([lat, lon], {'
  if (!original.includes(ANCLA)) {
    console.error(`  ✘ no se encontró el ancla del mutante en ${CAPA_PUNTOS}`)
    process.exit(1)
  }

  const construir = () =>
    new Promise((ok, mal) => {
      const p = spawn('npm', ['run', 'build'], { cwd: FRONT, stdio: 'ignore', shell: true })
      p.on('exit', (c) => (c === 0 ? ok() : mal(new Error(`build falló (${c})`))))
    })

  try {
    // La capa de puntos pasa a tener SU propio canvas: es exactamente el
    // defecto que DECISIONES.md §H describe.
    writeFileSync(
      CAPA_PUNTOS,
      original.replace(ANCLA, `${ANCLA}\n        renderer: L.canvas(),`),
      'utf8',
    )
    await construir()
    fallos = 0
    resultados.length = 0
    await correr({ soloC1: true })
    const c1 = resultados.find((r) => r.id === 'C1')
    const bien = c1 && !c1.ok
    console.log(`\n  ${bien ? '✔' : '✘'} C1 ${bien ? 'se puso roja con el mutante' : 'NO se inmutó: no está probando nada'}`)
    process.exitCode = bien ? 0 : 1
  } finally {
    writeFileSync(CAPA_PUNTOS, original, 'utf8')
    await construir()
    console.log('  · CapaPuntos.jsx restaurado y reconstruido')
  }
}

if (!existsSync(DIST)) {
  console.error('No hay dist/. Corre `npm run build` antes: este arnés NO construye.')
  process.exit(1)
}

if (NEGATIVAS) {
  await negativas()
} else {
  console.log('\n── vista de priorización ────────────────────────────────────')
  await correr()
  console.log('─────────────────────────────────────────────────────────────')
  console.log(fallos === 0 ? '✔ la vista pasa todas las comprobaciones\n' : `✘ ${fallos} comprobación(es) fallaron\n`)
  process.exit(fallos ? 1 : 0)
}
