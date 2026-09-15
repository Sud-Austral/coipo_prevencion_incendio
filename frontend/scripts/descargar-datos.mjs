/**
 * Descarga las capas ya generadas desde el sitio publicado.
 *
 *     npm run datos
 *
 * Evita tener que correr el ETL en local: procesar los 87 MB de la red vial
 * tarda y necesita Python con pyproj y shapely. Para trabajar solo en el
 * frontend basta con traerse lo que GitHub Actions ya publico.
 *
 * Lee la lista de archivos del propio manifest.json, asi que baja lo que haya
 * (GeoJSON o PMTiles) sin que este script tenga que saber cual toca.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE =
  process.env.DATOS_URL ?? 'https://sud-austral.github.io/coipo_prevencion_incendio/data'
const DESTINO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`

async function bajar(archivo) {
  const url = `${BASE}/${archivo}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${archivo}: HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const destino = join(DESTINO, archivo)
  await mkdir(dirname(destino), { recursive: true })
  await writeFile(destino, buf)
  console.log(`  ✔ ${archivo.padEnd(26)} ${mb(buf.length).padStart(9)}`)
  return buf.length
}

console.log(`▶ descargando desde ${BASE}`)

let manifest
try {
  const r = await fetch(`${BASE}/manifest.json`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  manifest = await r.json()
} catch (e) {
  console.error(`✘ no se pudo leer manifest.json: ${e.message}`)
  console.error('  ¿Ya corrió el workflow de despliegue? Si no, genera los datos')
  console.error('  en local con:  python ETL/run.py')
  process.exit(1)
}

// `derivados` (bbdd_uad_completa, lineas_electricas) viven en una clave aparte
// de `capas` para que el visor no duplique filtros. Sin esta linea el
// manifest bajado declara archivos que no llegan a public/data.
//
// Las capas partidas por comuna (riesgo) no declaran `archivo` sino `partes`:
// 343 archivos y ~163 MB. Sin la tercera linea el visor local mostraba la lista
// de comunas y ninguna cargaba.
const archivos = [
  'manifest.json',
  'kpis.json',
  ...Object.values(manifest.capas).map((c) => c.archivo).filter(Boolean),
  ...Object.values(manifest.capas).flatMap((c) => Object.values(c.partes ?? {}).map((p) => p.archivo)),
  ...Object.values(manifest.derivados ?? {}).map((c) => c.archivo),
]

let total = 0
let fallidos = 0
// De a 8 en paralelo: de uno en uno, las 343 comunas tardaban minutos.
const pendientes = [...new Set(archivos)]
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let a = pendientes.shift(); a; a = pendientes.shift()) {
      try {
        total += await bajar(a)
      } catch (e) {
        fallidos++
        console.error(`  ✘ ${a}: ${e.message}`)
      }
    }
  }),
)

console.log(`Listo · ${mb(total)} en ${DESTINO}${fallidos ? ` · ${fallidos} FALLARON` : ''}`)
// Un archivo que no bajo deja el visor local a medias sin decir nada.
if (fallidos) process.exitCode = 1
console.log(`Generado el ${(manifest.generado ?? '').slice(0, 10)}`)
