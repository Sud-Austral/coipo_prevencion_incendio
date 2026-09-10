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
 * PARCHEA EL REPO. Dos guardas, porque el modo de fallo es dejar el arbol sucio:
 *
 *   1. Se niega a arrancar si alguno de los archivos que va a tocar ya tiene
 *      cambios sin commitear. Asi una corrida interrumpida se detecta en la
 *      SIGUIENTE, en vez de mezclarse con trabajo en curso.
 *   2. Restaura desde los bytes leidos en memoria dentro de un `finally`, y al
 *      terminar comprueba con git que no quedo nada modificado.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const SOLO = args.includes('--solo') ? new Set(args[args.indexOf('--solo') + 1].split(',')) : null

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
]

const elegidos = MUTANTES.filter((m) => !SOLO || SOLO.has(m.id))

function correr(cmd, argv) {
  return spawnSync(cmd, argv, {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function sucios(rutas) {
  const r = correr('git', ['status', '--porcelain', '--', ...rutas])
  if (r.status !== 0) return []
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
}

const tocados = [...new Set(elegidos.map((m) => m.archivo))]
const yaSucios = sucios(tocados)
if (yaSucios.length) {
  console.error('✘ hay cambios sin commitear en los archivos que hay que parchear:')
  for (const l of yaSucios) console.error(`    ${l}`)
  console.error('  Commitea, guarda con stash o descarta antes de correr los mutantes.')
  console.error('  Si vienes de una corrida interrumpida, `git checkout --` sobre esos archivos.')
  process.exit(1)
}

console.log(`▶ ${elegidos.length} mutantes · cada uno debe poner roja SU aserción\n`)

const sobreviven = []
const T0 = Date.now()
const reloj = () => `${((Date.now() - T0) / 1000).toFixed(0)}s`

for (const m of elegidos) {
  const ruta = join(RAIZ, m.archivo)
  const original = readFileSync(ruta, 'utf8')
  const veces = original.split(m.de).length - 1
  if (veces !== 1) {
    console.error(`✘ ${m.id}: «${m.de}» aparece ${veces} veces en ${m.archivo}, se esperaba 1.`)
    console.error('   El fuente cambió: arregla el mutante antes de seguir fiándote de él.')
    process.exit(1)
  }

  let roja = false
  let detalle = ''
  try {
    writeFileSync(ruta, original.replace(m.de, m.a), 'utf8')

    const build = correr('npm', ['run', 'build'])
    if (build.status !== 0) {
      // Un mutante que no compila no prueba nada: la asercion no llego a correr.
      detalle = 'el build falló; el mutante no llegó a ejecutarse'
    } else {
      const suite = correr('node', [join('scripts', m.suite)])
      const salida = `${suite.stdout}\n${suite.stderr}`
      roja = new RegExp(`✘\\s+${m.id}\\b`).test(salida)
      if (!roja && suite.status !== 0) detalle = 'la suite falló, pero no por esta aserción'
    }
  } finally {
    writeFileSync(ruta, original, 'utf8')
  }

  if (!roja) sobreviven.push(m)
  const marca = roja ? '✔' : '✘'
  console.log(`  ${marca} ${m.id.padEnd(4)} ${m.porque}${detalle ? ` — ${detalle}` : ''}  [${reloj()}]`)
}

// El repo tiene que quedar como estaba. Restaurar en `finally` no basta como
// promesa: se comprueba.
const quedanSucios = sucios(tocados)
if (quedanSucios.length) {
  console.error('\n✘ el árbol quedó modificado después de restaurar:')
  for (const l of quedanSucios) console.error(`    ${l}`)
  process.exit(1)
}

// Dejar dist/ coherente con el fuente restaurado: el ultimo build fue de un mutante.
correr('npm', ['run', 'build'])

console.log('')
if (sobreviven.length) {
  console.error(`✘ ${sobreviven.length} mutantes SOBREVIVIERON:`)
  for (const m of sobreviven) {
    console.error(`    ${m.id}: ${m.porque}`)
    console.error(`       esa aserción no está probando lo que dice`)
  }
  process.exit(1)
}
console.log(`✔ los ${elegidos.length} mutantes se pusieron rojos, y el árbol quedó limpio`)
