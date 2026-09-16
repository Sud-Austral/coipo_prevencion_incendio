/**
 * Opciones de cada filtro, EN CASCADA.
 *
 * Decidido por Luis el 2026-09-15: «cada filtro ofrece sólo lo que existe con
 * los demás filtros puestos». Antes las opciones y sus cifras salían de
 * `manifest.capas[capa].dominios`, que son los totales de la capa ENTERA: con
 * la región de Aysén elegida, «Temporada» seguía ofreciendo las nueve con sus
 * cifras nacionales, y varias dejaban el mapa vacío sin avisar de nada.
 *
 * DE DÓNDE SALEN LAS CIFRAS. De las features que el visor ya tiene cargadas, no
 * del manifest: son las mismas que dibuja el mapa, así que la cuenta de la
 * opción es exactamente lo que se verá al elegirla. Las capas servidas por
 * teselas (rutas y red vial) NO tienen features en el navegador: ahí se cae al
 * `dominios` del manifest y la opción se marca `cascada: false`, para que el
 * panel pueda decir que esa lista no se estrecha.
 *
 * QUÉ CAPA CUENTA. La misma regla de siempre (`DECISIONES.md` §Q y B27): la
 * PRIMERA capa encendida de `f.capas` que publique ese campo en sus dominios.
 * Sumar las cuentas de varias capas daba «Biobío (5.049)», mezcla de incendios,
 * obras, puntos, tramos y rutas.
 *
 * EL VALOR ELEGIDO NO DESAPARECE NUNCA de su propia lista, aunque con los demás
 * filtros puestos no quede ni una feature: si desapareciera, el panel mostraría
 * «Todas» mientras el mapa sigue recortado, que es la peor combinación posible.
 * Se ofrece con su cuenta real, que puede ser 0.
 */
import { DIACRITICOS, FILTROS } from './config'

/** Sin diacríticos, sin mayúsculas y sin espacios dobles. */
export const claveNombre = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

/**
 * Clave de ordenación de regiones: sin diacríticos, sin el prefijo "Region de/
 * del" y sin el artículo inicial. Sólo ORDENA -- la opción siempre muestra la
 * etiqueta original que viene del manifest.
 * Sin quitar el artículo, "La Araucanía", "Los Lagos" y "Los Ríos" se agrupan
 * bajo L; sin quitar los diacríticos, "Ñuble" y "O'Higgins" caen fuera de sitio
 * en un localeCompare ingenuo.
 */
export const claveRegion = (s) =>
  claveNombre(s)
    .replace(/^regi[oó]n\s+(de[l]?\s+)?/i, '')
    .replace(/^(la|las|los|el)\s+/i, '')

/**
 * La comuna elegida, traducida al vocabulario de la capa de incendios.
 *
 * Las dos vistas comparten `?comuna=` (decisión de Luis, 2026-09-16): la vista
 * de riesgo escribe el CÓDIGO CUT y la de incendios el NOMBRE de la comuna tal
 * como lo trae el Excel de la UAD. Aquí se acepta cualquiera de los dos, sin
 * tabla de equivalencias escrita a mano: nombre exacto, nombre sin tildes ni
 * mayúsculas, o CUT resuelto contra los nombres y alias que publica el modelo
 * de riesgo.
 *
 * DEVUELVE null CUANDO NO HAY EQUIVALENCIA, y eso NO es un caso raro: medido el
 * 2026-09-16, 10 de las 308 comunas de incendios se escriben distinto en el
 * modelo («Aysén»/«Aisén», «Puerto Saavedra»/«Saavedra», «Llay-Llay»/
 * «Llaillay»…, más «Sin registro», que no es una comuna). Con null el filtro NO
 * se aplica y el panel lo dice: aplicarlo dejaría el mapa vacío y se leería
 * como «en esa comuna no hubo incendios».
 */
export function comunaEnIncendios(valor, tablas, metaRiesgo) {
  const tabla = tablas?.comuna
  if (!valor || !tabla?.length) return null
  if (tabla.includes(valor)) return valor
  const porClave = new Map(tabla.map((v) => [claveNombre(v), v]))
  const directo = porClave.get(claveNombre(valor))
  if (directo) return directo
  const parte = metaRiesgo?.partes?.[valor]
  if (!parte) return null
  for (const nombre of [parte.comuna, ...(parte.alias ?? [])]) {
    const eq = porClave.get(claveNombre(nombre))
    if (eq) return eq
  }
  return null
}

/** Los filtros que recortan `capa`, sin contar `excepto`. */
const filtrosDe = (capa, excepto) =>
  FILTROS.filter((f) => f.campo !== excepto && f.capas.includes(capa))

/**
 * Opciones de cada filtro visible, ya en cascada.
 *
 * @param {object} e
 * @param {object} e.capasMan      manifest.capas
 * @param {string[]} e.capasActivas
 * @param {object} e.filtros       los valores elegidos, tal como viajan en la URL
 * @param {object} e.datos         {capa: features[] | null} de lo YA cargado
 * @param {object} e.tablas        manifest.capas.incendios.tablas (categóricos)
 * @param {string|null} e.comunaIncendios  `comunaEnIncendios` ya resuelta
 * @returns {Map<string, {capa, opciones: {v, n}[], cascada: boolean}>}
 */
export function opcionesFiltros({ capasMan, capasActivas, filtros, datos, tablas, comunaIncendios }) {
  const salida = new Map()
  const valorDe = (campo) => (campo === 'comuna' ? comunaIncendios : filtros[campo]) || ''

  for (const f of FILTROS) {
    const capa = f.capas.find((c) => capasActivas.includes(c) && capasMan?.[c]?.dominios?.[f.campo])
    if (!capa) continue
    const feats = datos?.[capa] ?? null
    const elegido = valorDe(f.campo)
    let opciones
    let cascada = true

    if (feats) {
      // Las features de incendios traen índices contra `tablas`; las demás capas,
      // el texto tal cual. Se decodifica al contar para que la opción lleve la
      // etiqueta que se ve en el mapa y en la ficha.
      const codificada = capa === 'incendios'
      const otros = filtrosDe(capa, f.campo)
        .map((o) => [o.campo, valorDe(o.campo)])
        .filter(([, v]) => v)
      const cuenta = new Map()
      for (const g of feats) {
        const p = g.properties
        let pasa = true
        for (const [campo, v] of otros) {
          const actual = codificada ? tablas?.[campo]?.[p[campo]] : p[campo]
          if (actual !== v) {
            pasa = false
            break
          }
        }
        if (!pasa) continue
        const bruto = codificada ? tablas?.[f.campo]?.[p[f.campo]] : p[f.campo]
        if (bruto == null) continue
        cuenta.set(bruto, (cuenta.get(bruto) ?? 0) + 1)
      }
      if (elegido && !cuenta.has(elegido)) cuenta.set(elegido, 0)
      opciones = [...cuenta].map(([v, n]) => ({ v, n }))
    } else {
      // Capa por teselas (o que aún no ha llegado): el manifest es lo único que
      // hay, y sus cifras son de la capa entera.
      cascada = false
      opciones = (capasMan[capa].dominios[f.campo] ?? []).map((d) => ({ v: d.v, n: d.n }))
      if (elegido && !opciones.some((o) => o.v === elegido)) opciones.push({ v: elegido, n: 0 })
    }

    // Las regiones, y el territorio entero, alfabéticamente: nadie busca su
    // región por cuántos incendios tuvo. El resto por frecuencia.
    const porNombre = ['region', 'provincia', 'comuna'].includes(f.campo)
    opciones.sort(
      porNombre
        ? (a, b) => claveRegion(a.v).localeCompare(claveRegion(b.v), 'es')
        : (a, b) => b.n - a.n || String(a.v).localeCompare(String(b.v), 'es'),
    )
    salida.set(f.campo, { capa, opciones, cascada })
  }
  return salida
}
