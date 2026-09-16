/**
 * Controles negativos de los dos arneses de navegador.
 *
 *     npm run verify:mutantes [--solo A1,B12]
 *
 * Una asercion que nunca se ha visto roja no es una prueba. Este script
 * reintroduce a proposito un defecto que alguna asercion vigila, reconstruye,
 * corre el arnes que corresponde y EXIGE que se ponga roja esa asercion en
 * concreto -- no cualquiera. Si sobrevive, la asercion no esta probando nada.
 *
 * Es el hermano de `python ETL/verify.py --negativas`, que hace lo mismo con las
 * aserciones D sobre los datos. Aquel es barato (~19 s) y corre en CI; este es
 * caro, porque cada mutante paga un `npm run build` y una tanda de Chrome.
 *
 * PARCHEA EL REPO. El modo de fallo es dejar el arbol con un mutante dentro, y
 * las guardas son estas:
 *
 *   1. Antes de tocar nada se leen en MEMORIA los bytes de cada archivo que se
 *      va a parchear, con su sha256, y se deja una copia en DISCO en
 *      .verificacion/respaldo-mutantes/ (ignorado por git) junto a
 *      pendiente.json con las huellas.
 *   2. Cada mutante se restaura desde memoria en un `finally`, y al terminar se
 *      compara el sha256 de cada archivo con el de antes: byte a byte, no
 *      "parece igual". Solo si todos coinciden se borra el respaldo.
 *   3. Una señal de corte: se restaura desde memoria, se mata el build o la
 *      suite en curso (con su arbol de procesos), se comparan las huellas y, si
 *      coinciden, se BORRA el respaldo. Si no se borrara, la corrida siguiente
 *      lo encontraria y tendria que adivinar si viene de un corte limpio o de
 *      uno sucio -- es el defecto que la revision le encontro a la guarda
 *      gemela de verify-electrico.mjs, que restauraba y salia dejandolo.
 *      Las señales son CUATRO, no dos: SIGINT (Ctrl+C) y SIGTERM, y ademas las
 *      que Windows usa para lo mismo segun la documentacion de Node, que no
 *      medi: SIGHUP al cerrar la ventana de la consola y SIGBREAK con
 *      Ctrl+Break. Con solo las dos primeras, cerrar la terminal a mitad de los
 *      ~15 min dejaba el mutante dentro sin que corriera ni el manejador ni el
 *      `finally` (revision adversarial de F0, 2026-09-14). Con SIGHUP, segun
 *      esa misma documentacion, Windows mata el proceso unos 10 s despues pase
 *      lo que pase: por eso se restaura ANTES de matar a los hijos, que es lo
 *      lento (taskkill), y no despues.
 *   4. LA RED DE SEGURIDAD es el respaldo en disco con pendiente.json. Si el
 *      proceso muere sin que corra ningun manejador (taskkill /F, corte de luz,
 *      o Windows cerrandolo antes de que termine el de SIGHUP), el respaldo
 *      queda en disco y la corrida SIGUIENTE lo detecta: se niega a arrancar
 *      mientras algun archivo no coincida con su huella, diciendo donde esta
 *      el original. Si ya coinciden, lo limpia y sigue.
 *
 * Por que no la guarda anterior («se niega si git ve cambios sin commitear en
 * los archivos a parchear»): medido el 2026-09-14, la fase F0 deja App.css,
 * PanelLateral.jsx, PanelIndicadores.jsx y config.js modificados SIN commitear
 * a proposito --el commit lo decide Luis-- y esa guarda impedia correr los
 * mutantes justo sobre el trabajo que habia que probar. Git no sabe distinguir
 * «cambio legitimo en curso» de «mutante olvidado»; la huella tomada al
 * arrancar si.
 *
 * `--simular-ctrl-c <ms> [--senal SIGHUP|SIGBREAK|SIGTERM]` existe SOLO para
 * probar la guarda 3. Segun la documentacion de Node, en Windows
 * process.kill(pid, 'SIGINT') termina el proceso sin pasar por su manejador
 * (no lo medi), y un Ctrl+C de consola no se puede teclear desde un agente: la
 * señal se emite desde dentro (process.emit). Eso prueba que hay manejador
 * para esa señal y que restaura, NO que Windows la entregue al cerrar la
 * ventana.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RESPALDO = join(RAIZ, '.verificacion', 'respaldo-mutantes')
const PENDIENTE = join(RESPALDO, 'pendiente.json')

const args = process.argv.slice(2)
const valorDe = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null)
const SOLO = valorDe('--solo') ? new Set(valorDe('--solo').split(',')) : null
const SIMULAR_CTRL_C = valorDe('--simular-ctrl-c') ? Number(valorDe('--simular-ctrl-c')) : null
// Las cuatro señales de corte (ver la guarda 3) y su codigo de salida, 128 + n
// como hace un shell. SIGBREAK es la 21 en Windows.
const SENALES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGBREAK: 149 }
const SENAL_SIMULADA = valorDe('--senal') ?? 'SIGINT'
if (!(SENAL_SIMULADA in SENALES)) {
  console.error(`✘ --senal ${SENAL_SIMULADA}: se esperaba una de ${Object.keys(SENALES).join(', ')}`)
  process.exit(1)
}

/**
 * `de` tiene que aparecer EXACTAMENTE una vez: si aparece cero, el fuente cambio
 * y el mutante esta mintiendo; si aparece dos, no se sabe cual se rompio.
 */
const MUTANTES = [
  {
    id: 'A1',
    suite: 'verify-banner.mjs',
    archivo: 'src/index.css',
    de: '--alto-minimo-banner: 68px;',
    a: '--alto-minimo-banner: 88px;',
    porque: 'subir el piso del banner: la banda pintada deja de medir lo que dicta la razon',
  },
  {
    id: 'A1',
    suite: 'verify-banner.mjs',
    archivo: 'src/index.css',
    de: '--razon-banner: 17.1299;',
    a: '--razon-banner: 14.0;',
    porque: 'falsear la proporcion del asset: la banda se ensancha en los anchos grandes',
  },
  {
    id: 'B12',
    suite: 'verify-panel.mjs',
    archivo: 'src/config.js',
    de: 'export const CORTE_KPI = 1200',
    a: 'export const CORTE_KPI = 1100',
    porque: 'desincronizar el corte de JS del de las media queries, que siguen en 1200',
  },
  {
    id: 'B12',
    suite: 'verify-panel.mjs',
    archivo: 'src/config.js',
    de: 'export const CORTE_PANEL = 900',
    a: 'export const CORTE_PANEL = 800',
    porque: 'lo mismo con el corte del panel izquierdo',
  },
  {
    id: 'B24',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    // Con los CUATRO espacios de sangria de la media query: desde F2 el mismo
    // `inset` lo usa .modal-filtro, con dos, y el ancla sin sangria aparecia
    // dos veces.
    de: '    inset: var(--alto-banner) auto 0 0;',
    a: '    inset: var(--alto-minimo-banner) auto 0 0;',
    porque: 'la cadena antigua: el cajon izquierdo arranca en 68 px y tapa las pestañas',
  },
  {
    id: 'B25',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelIndicadores.jsx',
    de: '    if (!montado.current) {\n      montado.current = true\n      return\n    }\n    if (abierto) cabecera.current?.focus()',
    a: '    if (abierto) cabecera.current?.focus()',
    porque: 'quitar la guarda de primer montaje: el h2 de indicadores roba el foco al cargar',
  },
  {
    id: 'B25',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelIndicadores.jsx',
    de: '    if (abierto) cabecera.current?.focus()',
    a: '    if (abierto) void cabecera.current',
    porque: 'el otro lado de la guarda: abrir el cajon ya no lleva el foco a su encabezado',
  },
  {
    id: 'B26',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelIndicadores.jsx',
    de: '{!conFeatures ? (',
    a: '{!conFeatures || resumen.porTemporada.length < 2 ? (',
    porque: 'la condicion antigua: con una sola temporada vuelve «Enciende la capa»',
  },
  {
    id: 'B27',
    suite: 'verify-panel.mjs',
    archivo: 'src/filtros.js',
    de: '        const bruto = codificada ? tablas?.[f.campo]?.[p[f.campo]] : p[f.campo]',
    a: `        const bruto = codificada ? tablas?.[f.campo]?.[p[f.campo]] : p[f.campo]
        for (const c of f.capas) {
          for (const d of capasMan?.[c]?.dominios?.[f.campo] ?? []) cuenta.set(d.v, (cuenta.get(d.v) ?? 0) + d.n)
        }`,
    porque: 'volver a sumar las cuentas de todas las capas del manifest',
  },
  {
    // La capa duena fija de antes: la primera de la lista con el campo, este o
    // no encendida. Con ?capas=redvial «Tipo de carpeta» vuelve a contar rutas
    // de despliegue, y con ?capas=oecv la region vuelve a contar incendios.
    id: 'B27',
    suite: 'verify-panel.mjs',
    archivo: 'src/filtros.js',
    de: 'const capa = f.capas.find((c) => capasActivas.includes(c) && capasMan?.[c]?.dominios?.[f.campo])',
    a: 'const capa = f.capas.find((c) => capasMan?.[c]?.dominios?.[f.campo])',
    porque: 'contar en la capa duena fija aunque este apagada',
    nombra: 'capas=redvial)',
  },
  {
    // Lo que encontro la revision: si un filtro entero deja de pintarse, B27
    // hacia `continue` y seguia verde. Se quita uno solo para que los demas
    // sigan en pantalla y la roja tenga que nombrar a este.
    id: 'B27',
    suite: 'verify-panel.mjs',
    archivo: 'src/filtros.js',
    de: '    if (!capa) continue',
    a: "    if (!capa || f.campo === 'inst') continue",
    porque: 'dejar de pintar el filtro «Institución (OECV)» con OECV encendida',
    nombra: '«inst»',
  },
  {
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelLateral.jsx',
    de: '{NO_ACTIVOS}: cada punto',
    a: 'Cada punto',
    porque: 'borrar «no muestra incendios activos» del encabezado del panel',
  },
  {
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/CartelContexto.jsx',
    de: '<p className="cartel-clave">{NO_ACTIVOS}.</p>',
    a: '<p className="cartel-clave"></p>',
    porque: 'borrar la frase del cartel',
  },
  {
    // El texto sigue en el DOM y con rectangulos: solo lo caza la parte de
    // B28 que mira la visibilidad, no la que busca el literal.
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    de: '.cartel-clave {\n  margin-bottom: 0;',
    a: '.cartel-clave {\n  visibility: hidden;\n  margin-bottom: 0;',
    porque: 'dejar la frase del cartel en el DOM pero invisible',
  },
  {
    // Visible para checkVisibility pero DEBAJO del mapa: solo lo caza el
    // elementFromPoint de B28. Sin este mutante esa mitad no se habia visto roja.
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    de: '  z-index: 998;\n  /* Los controles del borde inferior',
    a: '  z-index: -1;\n  /* Los controles del borde inferior',
    porque: 'mandar el cartel debajo del mapa: la frase existe y es visible, pero tapada',
  },
  {
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/SeccionDescargas.jsx',
    de: '    aviso: NO_ACTIVOS,\n  })',
    a: "    aviso: '',\n  })",
    porque: 'quitar el aviso de la procedencia que viaja en el GeoJSON',
  },
  {
    id: 'B28',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/SeccionDescargas.jsx',
    de: 'aviso: NO_ACTIVOS,\n        temporadas:',
    a: 'aviso: null,\n        temporadas:',
    porque: 'quitar el aviso del informe',
  },
  {
    // La frase fija de antes: cierta para el pais, falsa con filtro. Por eso B29
    // mide tambien una temporada donde el puesto cambia.
    id: 'B29',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelIndicadores.jsx',
    de: '` ${CAUSA_ELECTRICA} es ${ordinal(puestoElectrico.n)} por recuento y ${ordinal(puestoElectrico.ha)} por superficie.`',
    a: '` ${CAUSA_ELECTRICA} es cuarta por recuento y segunda por superficie.`',
    porque: 'volver a la frase fija del puesto de Líneas eléctricas',
  },
  {
    id: 'B30',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/PanelIndicadores.jsx',
    de: '{resumen.n > 0 ? (',
    a: '{resumen.n >= 0 ? (',
    porque: 'volver a pintar «0 %» con 0 incendios en el ámbito',
  },
  {
    id: 'B31',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/SeccionDescargas.jsx',
    de: 'fechaInforme: fechaLarga(hoy()),',
    a: 'fechaInforme: fechaLarga(new Date().toISOString().slice(0, 10)),',
    porque: 'volver a fechar el informe con el día UTC',
  },
  {
    id: 'B35',
    suite: 'verify-panel.mjs',
    archivo: 'src/filtros.js',
    de: '      const otros = filtrosDe(capa, f.campo)',
    a: '      const otros = [].concat(filtrosDe(capa, f.campo)).slice(0, 0)',
    porque: 'contar cada filtro sobre la capa entera: vuelven las cifras nacionales con la región puesta',
  },
  {
    id: 'B32',
    suite: 'verify-panel.mjs',
    archivo: 'src/components/Pestanas.jsx',
    de: '    document.getElementById(`pestana-${VISTAS[j].id}`)?.focus()',
    a: '',
    porque: 'volver a cambiar la pestaña sin llevar el foco: queda en la vieja, con tabIndex -1',
  },
  {
    id: 'B33',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    de: '.pestana:focus-visible {\n  outline: var(--anillo-foco);',
    a: '.pestana:focus-visible {\n  outline: 2px solid var(--accent);',
    porque: 'volver al anillo de 2 px de las pestañas',
  },
  {
    id: 'B34',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    de: '.limpiar {\n  width: 100%;\n  min-height: var(--alto-control);',
    a: '.limpiar {\n  width: 100%;',
    porque: 'que «Limpiar filtros» vuelva a su alto propio, por debajo del token',
  },
  {
    id: 'B34',
    suite: 'verify-panel.mjs',
    archivo: 'src/App.css',
    de: '  border-radius: var(--radio-control);\n  cursor: pointer;\n}\n\n.compartir:hover {',
    a: '  border-radius: 5px;\n  cursor: pointer;\n}\n\n.compartir:hover {',
    porque: 'que «Compartir» vuelva a su radio de 5 px',
  },
]

if (SOLO) {
  // Un --solo con un id que no existe corria CERO mutantes y terminaba con
  // «los 0 mutantes se pusieron rojos»: un verde que no probo nada.
  const desconocidos = [...SOLO].filter((id) => !MUTANTES.some((m) => m.id === id))
  if (desconocidos.length) {
    console.error(`✘ --solo con ids que no existen: ${desconocidos.join(', ')}`)
    console.error(`  Los que hay: ${[...new Set(MUTANTES.map((m) => m.id))].join(', ')}`)
    process.exit(1)
  }
}
const elegidos = MUTANTES.filter((m) => !SOLO || SOLO.has(m.id))

const sha = (b) => createHash('sha256').update(b).digest('hex')
const nombreRespaldo = (rel) => rel.replaceAll('/', '__')

// ---- 4 · una corrida anterior que murio sin limpiar ------------------------
if (existsSync(PENDIENTE)) {
  const previo = JSON.parse(readFileSync(PENDIENTE, 'utf8'))
  const distintos = Object.entries(previo).filter(([rel, h]) => {
    const ruta = join(RAIZ, rel)
    return !existsSync(ruta) || sha(readFileSync(ruta)) !== h
  })
  if (distintos.length) {
    console.error('✘ una corrida anterior quedó a medias y estos archivos NO son los que había antes de ella:')
    for (const [rel] of distintos) {
      console.error(`    ${rel}\n      original en ${join(RESPALDO, nombreRespaldo(rel))}`)
    }
    console.error('  Copia cada original encima de su archivo y vuelve a correr.')
    process.exit(1)
  }
  console.log('· había un respaldo de una corrida interrumpida y los archivos ya coinciden: se limpia')
  rmSync(RESPALDO, { recursive: true, force: true })
}

// Todas las anclas se validan ANTES de tocar ningun archivo.
for (const m of elegidos) {
  const texto = readFileSync(join(RAIZ, m.archivo), 'utf8')
  const veces = texto.split(m.de).length - 1
  if (veces !== 1) {
    console.error(`✘ ${m.id}: «${m.de}» aparece ${veces} veces en ${m.archivo}, se esperaba 1.`)
    console.error('   El fuente cambió: arregla el mutante antes de seguir fiándote de él.')
    process.exit(1)
  }
}

// ---- 1 · instantanea en memoria y respaldo en disco ------------------------
const tocados = [...new Set(elegidos.map((m) => m.archivo))]
const originales = new Map(tocados.map((rel) => [rel, readFileSync(join(RAIZ, rel))]))
const huellas = Object.fromEntries(tocados.map((rel) => [rel, sha(originales.get(rel))]))
mkdirSync(RESPALDO, { recursive: true })
for (const rel of tocados) writeFileSync(join(RESPALDO, nombreRespaldo(rel)), originales.get(rel))
writeFileSync(PENDIENTE, JSON.stringify(huellas, null, 1))

const restaurarTodo = () => {
  for (const [rel, b] of originales) writeFileSync(join(RAIZ, rel), b)
}
const cambiados = () => tocados.filter((rel) => sha(readFileSync(join(RAIZ, rel))) !== huellas[rel])

// ---- procesos hijos, asincronos para que Ctrl+C pueda atenderse ------------
// Con spawnSync el manejador de SIGINT no corre hasta que el bucle entero
// termina: el Ctrl+C mataba el build en curso y el script seguia con el
// mutante siguiente.
let hijo = null
function correr(cmd, argv) {
  return new Promise((ok) => {
    let salida = ''
    hijo = spawn(cmd, argv, { cwd: RAIZ, shell: process.platform === 'win32' })
    hijo.stdout.on('data', (d) => (salida += d))
    hijo.stderr.on('data', (d) => (salida += d))
    hijo.on('close', (status) => {
      hijo = null
      ok({ status, salida })
    })
  })
}

function matarHijo() {
  if (!hijo?.pid) return
  // Con shell:true el pid es el del cmd.exe: kill() mataria el shell y dejaria
  // vivos a vite o a Chrome. taskkill /T se lleva el arbol entero.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 })
  } else {
    hijo.kill('SIGKILL')
  }
}

// ---- 3 · interrupcion --------------------------------------------------------
function alInterrumpir(senal) {
  // Restaurar primero: son unos pocos writeFileSync, y con SIGHUP Windows mata
  // el proceso ~10 s despues (documentacion de Node, no medido). matarHijo
  // espera a taskkill, que puede tardar.
  // Los hijos no escriben en src/ (el build escribe en dist/), asi que
  // restaurar con ellos vivos no deja nada a medias.
  restaurarTodo()
  matarHijo()
  const quedan = cambiados()
  if (quedan.length) {
    console.error(`\n✘ interrumpido (${senal}) y ${quedan.length} archivo(s) no coinciden con su huella:`)
    for (const rel of quedan) console.error(`    ${rel}\n      original en ${join(RESPALDO, nombreRespaldo(rel))}`)
  } else {
    rmSync(RESPALDO, { recursive: true, force: true })
    console.error(`\n  interrumpido (${senal}): ${tocados.length} archivo(s) restaurados byte a byte y respaldo borrado`)
    console.error('  dist/ puede haber quedado con un mutante: `npm run build` antes del siguiente verify:*')
  }
  process.exit(SENALES[senal] ?? 130)
}
for (const s of Object.keys(SENALES)) process.on(s, alInterrumpir)
if (SIMULAR_CTRL_C != null) setTimeout(() => process.emit(SENAL_SIMULADA, SENAL_SIMULADA), SIMULAR_CTRL_C)

// ---- 2 · los mutantes --------------------------------------------------------
console.log(`▶ ${elegidos.length} mutantes · cada uno debe poner roja SU aserción\n`)
console.log(`  respaldo de ${tocados.length} archivo(s) en ${RESPALDO}`)

const sobreviven = []
const T0 = Date.now()
const reloj = () => `${((Date.now() - T0) / 1000).toFixed(0)}s`

for (const m of elegidos) {
  const ruta = join(RAIZ, m.archivo)
  const original = originales.get(m.archivo)
  let roja = false
  let detalle = ''
  let primeraRoja = ''
  try {
    writeFileSync(ruta, original.toString('utf8').replace(m.de, () => m.a), 'utf8')

    const build = await correr('npm', ['run', 'build'])
    if (build.status !== 0) {
      // Un mutante que no compila no prueba nada: la asercion no llego a correr.
      detalle = 'el build falló; el mutante no llegó a ejecutarse'
    } else {
      const suite = await correr('node', [join('scripts', m.suite)])
      // `nombra`: la linea roja tiene que decir ADEMAS eso. B27 tiene muchas
      // lineas, y un mutante que quita «inst» del panel no queda probado por
      // una roja de «region»: tiene que ser la suya.
      const rojas = suite.salida.split('\n').filter((l) => new RegExp(`✘\\s+${m.id}\\b`).test(l))
      roja = rojas.length > 0 && (!m.nombra || rojas.some((l) => l.includes(m.nombra)))
      primeraRoja = rojas.find((l) => !m.nombra || l.includes(m.nombra)) ?? rojas[0] ?? ''
      if (rojas.length && !roja) detalle = `se puso roja, pero ninguna línea nombra «${m.nombra}»`
      else if (!roja && suite.status !== 0) detalle = 'la suite falló, pero no por esta aserción'
      // Un superviviente sin el POR QUE obliga a reproducirlo a mano. El
      // 2026-09-15 B26 salio «la suite falló, pero no por esta aserción» y el log
      // no decia que habia fallado: se imprimen las rojas ajenas y el final.
      if (!roja) {
        const lineas = suite.salida.split('\n').map((l) => l.trimEnd()).filter(Boolean)
        const ajenas = lineas.filter((l) => /✘/.test(l)).slice(0, 6)
        for (const l of [...ajenas, '…', ...lineas.slice(-6)]) console.log(`         │ ${l.trim().slice(0, 220)}`)
      }
    }
  } finally {
    writeFileSync(ruta, original)
  }

  if (!roja) sobreviven.push(m)
  const marca = roja ? '✔' : '✘'
  console.log(`  ${marca} ${m.id.padEnd(4)} ${m.porque}${detalle ? ` — ${detalle}` : ''}  [${reloj()}]`)
  // La primera linea roja que cuenta, tal cual: sin ella el informe solo dice
  // «se puso roja» y no hay forma de ver POR QUE sin volver a correr 15 min.
  if (primeraRoja) console.log(`         ${primeraRoja.trim().slice(0, 220)}`)
}

restaurarTodo()
for (const s of Object.keys(SENALES)) process.off(s, alInterrumpir)

// El repo tiene que quedar como estaba. Restaurar en `finally` no basta como
// promesa: se comprueba contra la huella tomada al arrancar.
console.log('')
for (const rel of tocados) {
  const igual = sha(readFileSync(join(RAIZ, rel))) === huellas[rel]
  console.log(`  · ${igual ? 'igual' : 'DISTINTO'} ${huellas[rel].slice(0, 16)}… ${rel}`)
}
const quedan = cambiados()
if (quedan.length) {
  console.error(`\n✘ ${quedan.length} archivo(s) no quedaron como estaban; originales en ${RESPALDO}`)
  process.exit(1)
}
rmSync(RESPALDO, { recursive: true, force: true })

// Dejar dist/ coherente con el fuente restaurado: el ultimo build fue de un mutante.
const final = await correr('npm', ['run', 'build'])
if (final.status !== 0) {
  console.error('✘ el build final, con los fuentes restaurados, falló')
  process.exit(1)
}

console.log('')
if (sobreviven.length) {
  console.error(`✘ ${sobreviven.length} mutantes SOBREVIVIERON:`)
  for (const m of sobreviven) {
    console.error(`    ${m.id}: ${m.porque}`)
    console.error(`       esa aserción no está probando lo que dice`)
  }
  process.exit(1)
}
console.log(`✔ los ${elegidos.length} mutantes se pusieron rojos, y los ${tocados.length} archivos quedaron byte a byte como estaban`)
