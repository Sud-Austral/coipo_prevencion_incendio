// Escalas de color de las manchas de riesgo.
//
// DOS LECTURAS DISTINTAS, y la interfaz nunca puede dejar dudas de cual esta
// activa:
//
//   'absoluta'   · color por `clase`, con los cortes fijos del modelo sobre
//                  `nivel_medio` (0,5 / 1,5 / 2,5 / 3,5, del manifest). No
//                  depende de que comuna se mire, asi que es comparable entre
//                  comunas. Es la lectura por omision.
//   'normalizada'· color por la POSICION de cada mancha dentro de su comuna.
//                  Responde «cuales son las de mas riesgo DE ESTA COMUNA», que
//                  con la escala absoluta no siempre se ve.
//
// POR QUE NO ES UN MIN-MAX LINEAL. Medido sobre los datos reales del modelo
// nacional el 2026-09-15: normalizando Mulchén entre su minimo (0) y su maximo
// (3,998), el reparto en 10 escalones queda [3,0,17,59,11,19,85,11,3,5] -- 144 de
// sus 213 manchas (68 %) caen en solo dos escalones, porque los niveles se
// agrupan cerca del centro de cada clase. Y las cinco comunas medidas (Mulchén,
// Los Angeles, Coihaique, Natales, Santiago) tienen minimo 0, asi que el min-max
// ni siquiera cambia el ancla inferior. Repartir por RANGO si separa los
// colores. El precio esta declarado en la leyenda: el color pasa a indicar
// posicion relativa y no magnitud. Con K=1 esta misma funcion degenera en el
// min-max lineal, por si algun dia se quiere ofrecer tambien esa lectura.
// (Con el modelo anterior de 3 comunas se habia medido lo mismo por otro motivo:
// el 68 % de Mulchen amontonado en los dos escalones mas bajos.)
//
// EL DATO ORIGINAL NO SE TOCA. Aqui no se escribe nada en feature.properties:
// `t` es el valor de retorno de una funcion pura y solo lo consume el callback
// de estilo. La ficha, la leyenda y la descarga siguen leyendo nivel_medio.

import { RAMPA_NORMALIZADA } from './config'

// 8 escalones. Con menos, dos manchas vecinas en el ranking se ven iguales; con
// muchos mas, la rampa deja de leerse como escalones y vuelve a parecer
// continua, que es justo lo que hace ilegible el modo absoluto en una comuna.
const K = 8

/** Cuantil por interpolacion lineal sobre un array YA ordenado. */
function cuantil(ordenados, p) {
  const n = ordenados.length
  if (!n) return null
  if (n === 1) return ordenados[0]
  const i = (n - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo)
}

/**
 * Contexto de la escala para una comuna. Se recalcula al cambiar la seleccion.
 *
 * Devuelve siempre un objeto: `q` es null cuando no hay con que normalizar
 * (sin comuna, comuna vacia, o todos los valores iguales), y en ese caso
 * `colorDeMancha` cae a la lectura absoluta en vez de pintar transparente.
 */
export function contextoEscala(features, comuna, modo = 'absoluta') {
  const base = { modo: 'absoluta', comuna: comuna ?? null, q: null, m: 0, min: null, max: null }
  if (!features || !comuna || modo !== 'normalizada') return base

  const vals = []
  for (const f of features) {
    if (f.properties.comuna !== comuna) continue
    const v = f.properties.nivel_medio
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
  }
  const m = vals.length
  if (!m) return base

  vals.sort((a, b) => a - b)
  const min = vals[0]
  const max = vals[m - 1]

  // Comuna con un solo registro, o con todos los valores iguales: no hay
  // contraste interno que mostrar. Se declara y la leyenda lo dice; lo que NO
  // se puede hacer es dividir por cero, porque un NaN dejaria fillColor en
  // undefined y el poligono saldria TRANSPARENTE, indistinguible de «sin dato».
  // Medido: cinco comunas del modelo nacional tienen una sola mancha.
  if (m === 1 || max - min < 1e-9) {
    return { modo: 'normalizada', comuna, q: null, m, min, max, uniforme: true }
  }

  // Menos escalones que manchas cuando la comuna es pequena: con K=8 y 4
  // manchas, la mitad de la rampa quedaria vacia.
  const k = Math.min(K, m)
  const q = [min]
  for (let i = 1; i < k; i++) q.push(cuantil(vals, i / k))
  q.push(max)

  return { modo: 'normalizada', comuna, q, k, m, min, max, uniforme: false }
}

/**
 * Posicion normalizada de un valor dentro de su comuna, en [0,1].
 * Garantiza t(min)=0, t(max)=1 y monotonia. null si no hay con que calcularla.
 */
export function normalizar(x, ctx) {
  if (!ctx?.q || typeof x !== 'number' || !Number.isFinite(x)) return null
  const { q, k } = ctx
  if (x <= q[0]) return 0
  if (x >= q[k]) return 1
  for (let j = 0; j < k; j++) {
    if (x <= q[j + 1]) {
      const ancho = q[j + 1] - q[j]
      // Escalon degenerado (varias manchas con el mismo valor en el corte):
      // se devuelve el borde inferior en vez de dividir por cero.
      return ancho < 1e-12 ? j / k : (j + (x - q[j]) / ancho) / k
    }
  }
  return 1
}

/** Color de la rampa para t en [0,1]. Escalones discretos, no degradado. */
export function colorRampa(t) {
  const n = RAMPA_NORMALIZADA.length
  return RAMPA_NORMALIZADA[Math.max(0, Math.min(n - 1, Math.floor(t * n)))]
}

/**
 * Color de relleno de una mancha.
 *
 * `colorClase` traduce la etiqueta de la clase a su color. Llega de fuera
 * porque las etiquetas son del manifest y los colores de config.js (por nivel):
 * aqui no se escribe ninguna de las dos cosas.
 *
 * En modo normalizado solo cambian las manchas DE LA COMUNA seleccionada; el
 * resto conserva su color absoluto, para que no parezca que se han recalculado
 * cosas que no se han recalculado.
 */
export function colorDeMancha(props, ctx, colorClase) {
  if (ctx?.modo === 'normalizada' && props.comuna === ctx.comuna) {
    if (ctx.uniforme) return colorRampa(0.5)
    const t = normalizar(props.nivel_medio, ctx)
    if (t !== null) return colorRampa(t)
  }
  return colorClase(props.clase)
}

/**
 * Posicion de una mancha en su comuna, de mayor a menor nivel, para la ficha.
 * Es lo que permite decir «la 3.ª de 213» sin que el usuario tenga que
 * deducirlo del color.
 */
export function rangoComunal(features, props) {
  if (!features) return null
  const vals = features
    .filter((f) => f.properties.comuna === props.comuna)
    .map((f) => f.properties.nivel_medio)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  vals.sort((a, b) => b - a)
  const pos = vals.findIndex((v) => v <= props.nivel_medio) + 1
  return { pos: pos || vals.length, total: vals.length }
}
