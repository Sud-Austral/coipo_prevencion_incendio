// Agregados del panel de indicadores.
//
// Sin React y sin JSX a proposito: esto es la aritmetica, y separarla permite
// contrastarla con `node` sin montar nada -- que es como se verificaron todas
// las cifras de scripts/verify-panel.mjs.
//
// UNIVERSO: son los incendios INVESTIGADOS por la UAD, no todos los incendios
// de Chile. La investigacion no es muestra aleatoria (los grandes y los
// sospechosos de intencionalidad estan sobre-representados). Cualquier rotulo
// que salga de aqui dice "de los incendios investigados".

// El Excel de OECV escribe O´Higgins con acento agudo (U+00B4); las capas
// geograficas usan apostrofo (U+0027). canon_region() de ETL/geo.py devuelve la
// etiqueta cruda cuando no reconoce la clave, asi que la discrepancia llega al
// JSON publicado. Se normaliza AQUI y no solo en el ETL porque kpis.json ya esta
// publicado en Pages con la clave mala y los artefactos viejos la conservan.
// Comprobado: mapea las 16 claves de kpis.json sobre las 16 de tablas.region.
export const normRegion = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[´’`]/g, "'")
    .trim()

// Grupos de causa atribuibles a accion humana y, por tanto, prevenibles.
// Indeterminadas NO entra: dejarla en el denominador es conservador, solo puede
// bajar la cifra.
export const GRUPOS_EVITABLES = ['Negligentes', 'Intencionales']
export const CAUSA_ELECTRICA = 'Líneas eléctricas'
export const INST_ELECTRICA = 'Empresa eléctrica'

// La causa especifica mas destructiva del set. Se busca por patron y no por
// igualdad literal porque el texto del catalogo de causas es largo y el ETL lo
// copia tal cual del Excel: una coma de mas romperia la comparacion exacta.
const RE_CONTACTO_TENDIDO = /contacto o proximidad con el tendido/i

/**
 * Familia de quemas dentro de las causas especificas negligentes. Por patron y
 * no por igualdad literal, por la misma razon que RE_CONTACTO_TENDIDO: el ETL
 * copia el texto del catalogo tal cual del Excel.
 *
 * Agrupa 7 categorias del catalogo oficial que son la MISMA conducta contada
 * con distinto detalle administrativo (basura residencial, limpieza de canales,
 * desechos agricolas, desechos forestales, desechos industriales y las dos
 * variantes "avisada … mal ejecutada"). Sueltas, cada una parece un problema
 * menor; juntas son 3.778 de 8.730 incendios por negligencia.
 *
 * La agrupacion vive SOLO en la capa de presentacion: la TablaKpi gemela lista
 * las categorias originales sin tocar, para que el dato oficial siga accesible.
 */
export const RE_QUEMA = /^quema /i

/**
 * Funde la familia de quemas en una sola fila. Devuelve la lista intacta si hay
 * menos de dos, que es cuando agrupar no aportaria nada y solo escondería el
 * nombre real de la unica categoria.
 *
 * La etiqueta DECLARA cuantas categorias agrupa, y `detalle` lleva la lista
 * completa para el title: agrupar sin decirlo es reescribir el catalogo.
 */
export function agruparQuemas(filas) {
  if (!filas?.length) return filas ?? []
  const quemas = filas.filter((d) => RE_QUEMA.test(d.v))
  if (quemas.length < 2) return filas
  const suma = (campo) => quemas.reduce((a, d) => a + (d[campo] ?? 0), 0)
  return [
    ...filas.filter((d) => !RE_QUEMA.test(d.v)),
    {
      // "de basura, desechos y limpieza" y NO "sin aviso": dos de las siete son
      // quemas AVISADAS mal ejecutadas, y decir lo contrario seria falso.
      v: `Quemas de basura, desechos y limpieza (${quemas.length} categorías)`,
      n: suma('n'),
      ha: suma('ha'),
      pct: suma('pct'),
      pctHa: suma('pctHa'),
      detalle: quemas.map((d) => d.v).join(' · '),
    },
  ].sort((a, b) => b.n - a.n)
}

const pct = (parte, total) => (total ? (100 * parte) / total : 0)

/**
 * Una sola pasada por las features acumulando TODOS los agregados a la vez.
 *
 * Medido sobre incendios.geojson real (14.705 features): 1,57 ms por pasada en
 * Node (20 pasadas / 31,3 ms). En Chrome, presupuestar 5-8 ms. Es menos de un
 * frame y solo corre cuando cambia el filtro -- una accion que YA obliga a
 * Leaflet a refiltrar 14.705 markers de canvas, que es bastante mas caro.
 *
 * Los categoricos se comparan como ENTEROS contra las tablas del manifest, no
 * como strings: por eso `tablas` entra crudo en vez del decode() de App.jsx.
 *
 * @param {Array} features  incendios.geojson.features
 * @param {Object} tablas   manifest.capas.incendios.tablas
 * @param {Function|null} pasa  predicado sobre properties, o null si no hay filtro
 */
export function resumenIncendios(features, tablas, pasa) {
  if (!features || !tablas) return null
  const TG = tablas.causa_grupo ?? []
  const TCG = tablas.causa_general ?? []
  const TCE = tablas.causa_especifica ?? []
  const TR = tablas.region ?? []
  const TT = tablas.temporada ?? []

  const iNeg = TG.indexOf('Negligentes')
  const iInt = TG.indexOf('Intencionales')
  const iElec = TCG.indexOf(CAUSA_ELECTRICA)
  const iContacto = TCE.findIndex((s) => RE_CONTACTO_TENDIDO.test(s))

  // Acumuladores indexados por codigo. Escribir fuera de rango en un TypedArray
  // es un no-op silencioso, asi que un codigo corrupto no puede reventar aqui.
  const bolsa = (k) => ({ n: new Int32Array(k), ha: new Float64Array(k) })
  const grupo = bolsa(TG.length)
  const general = bolsa(TCG.length)
  // Causa especifica SOLO de los negligentes: es lo que traduce «tres cuartas
  // partes son evitables» a conductas concretas. 58 categorias vistas sobre una
  // pasada que ya toma 1,57 ms: el coste es irrelevante.
  const especifica = bolsa(TCE.length)
  const region = bolsa(TR.length)
  const temporada = bolsa(TT.length)
  const tempInt = new Int32Array(TT.length)
  const tempNeg = new Int32Array(TT.length)

  let n = 0
  let ha = 0
  let sinSuperficie = 0
  let evN = 0
  let evHa = 0
  let elecN = 0
  let elecHa = 0
  let contN = 0
  let contHa = 0
  // Total del GRUPO negligentes: es el denominador correcto del desglose por
  // conducta. Tomarlo de `n` (el total del ambito) daria porcentajes sobre un
  // universo que incluye intencionales, accidentales y naturales.
  let negN = 0
  let negHa = 0

  for (const f of features) {
    const p = f.properties
    if (pasa && !pasa(p)) continue
    n++

    const s = p.superficie_ha
    if (s == null) sinSuperficie++
    const S = s ?? 0
    ha += S

    const g = p.causa_grupo
    grupo.n[g]++
    grupo.ha[g] += S
    if (g === iNeg || g === iInt) {
      evN++
      evHa += S
    }
    if (g === iNeg) {
      negN++
      negHa += S
      const ce = p.causa_especifica
      especifica.n[ce]++
      especifica.ha[ce] += S
    }

    const cg = p.causa_general
    general.n[cg]++
    general.ha[cg] += S
    if (cg === iElec) {
      elecN++
      elecHa += S
    }
    if (p.causa_especifica === iContacto) {
      contN++
      contHa += S
    }

    const r = p.region
    region.n[r]++
    region.ha[r] += S

    const t = p.temporada
    temporada.n[t]++
    temporada.ha[t] += S
    if (g === iInt) tempInt[t]++
    else if (g === iNeg) tempNeg[t]++
  }

  // El denominador entra como parametro: el desglose de conductas negligentes
  // se reparte sobre el total de NEGLIGENTES, no sobre el del ambito.
  const listarSobre = (tabla, b, total, totalHa) =>
    tabla
      .map((v, i) => ({
        v,
        n: b.n[i],
        ha: b.ha[i],
        pct: pct(b.n[i], total),
        pctHa: pct(b.ha[i], totalHa),
      }))
      .filter((d) => d.n > 0)
  const listar = (tabla, b) => listarSobre(tabla, b, n, ha)

  return {
    fuente: 'geojson',
    n,
    ha,
    sinSuperficie,
    media: n ? ha / n : 0,
    evitables: { n: evN, ha: evHa, pct: pct(evN, n), pctHa: pct(evHa, ha) },
    porGrupo: listar(TG, grupo).sort((a, b) => b.n - a.n),
    porGeneral: listar(TCG, general).sort((a, b) => b.n - a.n),
    porRegion: listar(TR, region).sort((a, b) => b.ha - a.ha),
    // Cronologico ascendente: "2017-2018" ordena bien lexicograficamente.
    porTemporada: TT.map((v, i) => ({
      v,
      n: temporada.n[i],
      ha: temporada.ha[i],
      pctInt: pct(tempInt[i], temporada.n[i]),
      pctNeg: pct(tempNeg[i], temporada.n[i]),
    }))
      .filter((d) => d.n > 0)
      .sort((a, b) => a.v.localeCompare(b.v)),
    negligentes: {
      n: negN,
      ha: negHa,
      porEspecifica: listarSobre(TCE, especifica, negN, negHa).sort((a, b) => b.n - a.n),
    },
    electrico: {
      n: elecN,
      ha: elecHa,
      pctN: pct(elecN, n),
      pctHa: pct(elecHa, ha),
      media: elecN ? elecHa / elecN : 0,
      contacto: { n: contN, ha: contHa, media: contN ? contHa / contN : 0 },
    },
  }
}

/**
 * Degradado cuando la capa de incendios no esta cargada: los `dominios` del
 * manifest ya traen el histograma valor->cuenta de cada campo filtrable, asi
 * que el panel sigue diciendo algo sin descargar 4 MB. Sin superficie: eso solo
 * vive en las features.
 *
 * Misma FORMA que resumenIncendios, con `ha` en null donde no se sabe, para que
 * los componentes tengan un solo camino y no dos.
 */
export function resumenDesdeManifest(manifest) {
  const dom = manifest?.capas?.incendios?.dominios
  if (!dom) return null
  const suma = (l) => (l ?? []).reduce((a, d) => a + d.n, 0)
  const n = suma(dom.causa_grupo)
  const mapear = (l) => (l ?? []).map((d) => ({ v: d.v, n: d.n, ha: null, pct: pct(d.n, n), pctHa: null }))

  const evN = (dom.causa_grupo ?? [])
    .filter((d) => GRUPOS_EVITABLES.includes(d.v))
    .reduce((a, d) => a + d.n, 0)
  const elec = (dom.causa_general ?? []).find((d) => d.v === CAUSA_ELECTRICA)

  return {
    fuente: 'manifest',
    n,
    ha: null,
    sinSuperficie: null,
    media: null,
    evitables: { n: evN, ha: null, pct: pct(evN, n), pctHa: null },
    porGrupo: mapear(dom.causa_grupo),
    porGeneral: mapear(dom.causa_general),
    porRegion: mapear(dom.region),
    porTemporada: (dom.temporada ?? [])
      .map((d) => ({ v: d.v, n: d.n, ha: null, pctInt: null, pctNeg: null }))
      .sort((a, b) => a.v.localeCompare(b.v)),
    electrico: elec
      ? {
          n: elec.n,
          ha: null,
          pctN: pct(elec.n, n),
          pctHa: null,
          media: null,
          contacto: { n: null, ha: null, media: null },
        }
      : null,
  }
}

/**
 * Cobertura preventiva frente a presion de incendios, por region.
 *
 * Share contra share, deliberadamente: un ratio km/ha explota con denominadores
 * chicos -- calculado sobre los datos reales, Tarapaca da 251,7 km por cada
 * 1.000 ha quemadas y Atacama 182,6 frente a los 2,9 del Biobio, y esa lista
 * seria activamente enganosa. Dos participaciones sobre el mismo eje 0-100 no
 * tienen ese problema.
 *
 * PROHIBIDO derivar de aqui una correlacion o una regresion: n=16 regiones, sin
 * alineacion temporal (el OECV es una foto 2025-26 y los incendios cubren nueve
 * temporadas: es stock contra flujo) y confundido por superficie regional y tipo
 * de vegetacion. Cualquier r se citaria fuera de contexto en una semana.
 */
export function cruceCoberturaPresion(kmPorRegion, porRegion, { top = 8, destacada } = {}) {
  if (!kmPorRegion || !porRegion?.length) return null
  const km = new Map()
  for (const [k, v] of Object.entries(kmPorRegion)) km.set(normRegion(k), v)
  const totalKm = [...km.values()].reduce((a, b) => a + b, 0)

  // oecv cubre 15 regiones e incendios 16: left join sobre las de incendios, y
  // 0 km se dibuja como punto en 0 %, nunca como fila ausente.
  const usaHa = porRegion[0]?.ha != null
  const peso = (d) => (usaHa ? d.ha : d.n)
  const totalPeso = porRegion.reduce((a, d) => a + peso(d), 0)

  const filas = porRegion
    .map((d) => {
      const k = km.get(normRegion(d.v)) ?? 0
      const pctKm = pct(k, totalKm)
      const pctPeso = pct(peso(d), totalPeso)
      return { region: d.v, km: k, peso: peso(d), pctKm, pctPeso, brecha: pctKm - pctPeso }
    })
    .sort((a, b) => b.pctPeso - a.pctPeso)

  // La fila de la region filtrada SIEMPRE se muestra, aunque el corte por
  // superficie la deje fuera. Sin esto, filtrar por una de las ocho regiones de
  // menor peso (Los Rios, Los Lagos, Magallanes, Coquimbo, Tarapaca, Atacama,
  // Arica y Parinacota, Antofagasta -- la MITAD del pais) apagaba las ocho
  // filas del grafico sin dejar ninguna destacada: la region elegida no estaba,
  // asi que ninguna cumplia `f.region === destacada`. Medido sobre los datos
  // reales antes de arreglarlo: ?region=Los Ríos daba 8 filas y 0 destacadas.
  const clave = normRegion(destacada ?? '')
  const propia = clave ? (filas.find((d) => normRegion(d.region) === clave) ?? null) : null
  const top8 = filas.slice(0, top)
  const mostradas = propia && !top8.includes(propia) ? [...top8, propia] : top8

  return {
    filas: mostradas,
    // La fila de la region filtrada, para poder enunciar sus dos cifras aparte
    // del grafico. null sin filtro, o si la region no aparece en los incendios.
    propia,
    // true cuando la region entro por ser la filtrada y no por su peso: la nota
    // lo dice, en vez de dejar una novena fila sin explicacion.
    propiaFueraDelTop: !!propia && !top8.includes(propia),
    usaHa,
    totalKm,
    // Sobre las filas REALMENTE mostradas, no sobre el top fijo: si no, la nota
    // «estas 8 regiones concentran X %» mentiria en cuanto se anade la novena.
    cubrePeso: mostradas.reduce((a, d) => a + d.pctPeso, 0),
    cubreKm: mostradas.reduce((a, d) => a + d.pctKm, 0),
    max: Math.max(1, ...mostradas.map((d) => Math.max(d.pctKm, d.pctPeso))),
  }
}

/**
 * Avance del programa OECV desde kpis.json.
 *
 * Tres estados distintos que NUNCA deben colapsar en `?? 0`:
 *   sin-programa  Planificado 0 -- Arica y Parinacota, que ademas no trae la
 *                 clave `reportado`. Sin barra y sin division.
 *   sin-dato      hay plan pero no llego reportado. Distinto de reportar cero.
 *   pendiente     reportado < plan. Atacama y Antofagasta reportan CERO con
 *                 plan > 0: es un cero informado y se muestra como 0 %.
 *                 (Atacama declara ademas MOP 28,7 en su propio registro: es
 *                 una inconsistencia entre dos hojas del Excel de origen, ver
 *                 ETL/build_kpis.py. Prevalece `reportado`.)
 *   al-dia        reportado >= plan. Seis regiones se pasan de la meta.
 *
 * Se ordena por KILOMETROS FALTANTES y no por porcentaje: ordenar por % pone
 * primero los 2,1 km de Antofagasta, que es ruido operativo.
 */
export function avanceOECV(kpis, region) {
  const o = kpis?.oecv
  if (!o) return null

  const filas = Object.entries(o.por_region ?? {}).map(([clave, d]) => {
    const region = normRegion(clave)
    const plan = d.Planificado ?? 0
    const rep = d.reportado
    if (!plan) return { region, estado: 'sin-programa', plan: 0, rep: rep ?? null, falta: 0, pct: null }
    if (rep == null) return { region, estado: 'sin-dato', plan, rep: null, falta: plan, pct: null }
    return {
      region,
      estado: rep >= plan ? 'al-dia' : 'pendiente',
      plan,
      rep,
      falta: plan - rep,
      pct: pct(rep, plan),
    }
  })

  const pendientes = filas
    .filter((f) => f.estado === 'pendiente' || f.estado === 'sin-dato')
    .sort((a, b) => b.falta - a.falta)
  const backlog = pendientes.reduce((a, f) => a + f.falta, 0)
  const cabeza = Math.min(4, pendientes.length)
  const enCabeza = pendientes.slice(0, cabeza).reduce((a, f) => a + f.falta, 0)

  // El avance de la region filtrada. Estaba calculado desde siempre --es una de
  // las 16 filas de arriba-- y no se publicaba: filtrar por Biobio no decia
  // absolutamente nada del avance de Biobio, aunque kpis.json trae sus 731,6 km
  // planificados y sus 734,5 reportados. Con `atenuada` tampoco se notaba, y
  // ahi habia un fallo silencioso: Biobio esta AL DIA, o sea que no aparece en
  // `pendientes`, asi que filtrar por el atenuaba las nueve barras y no
  // destacaba ninguna. Medido antes de arreglarlo: 9 barras, 0 sin atenuar.
  const clave = normRegion(region ?? '')
  const propia = clave ? (filas.find((f) => normRegion(f.region) === clave) ?? null) : null

  return {
    nacional: { plan: o.km_planificados, rep: o.km_reportados, pct: o.avance_pct },
    propia,
    pendientes,
    alDia: filas.filter((f) => f.estado === 'al-dia').sort((a, b) => b.pct - a.pct),
    sinPrograma: filas.filter((f) => f.estado === 'sin-programa'),
    // Backlog OPERATIVO: solo regiones bajo meta. El neto nacional
    // (plan - reportado) compensa las que se pasaron y no sirve para priorizar.
    backlog,
    cabeza,
    concentracion: pct(enCabeza, backlog),
  }
}

/**
 * Riesgo por tendido electrico: la unica causa con contraparte nominada
 * (distribuidoras, SEC), instrumento legal existente (fajas de seguridad y poda
 * bajo tendido, que es literalmente una OECV) y brecha medible.
 */
export function riesgoElectrico(resumen, oecvFeatures, manifest) {
  const e = resumen?.electrico
  if (!e) return null

  let obras = manifest?.capas?.oecv?.dominios?.inst?.find((d) => d.v === INST_ELECTRICA)?.n ?? null
  let km = null

  if (oecvFeatures) {
    let total = 0
    let elec = 0
    let cuenta = 0
    for (const f of oecvFeatures) {
      const p = f.properties
      const L = p.longitud_km ?? 0
      total += L
      if (p.inst === INST_ELECTRICA) {
        elec += L
        cuenta++
      }
    }
    obras = cuenta
    km = { elec, total, pct: pct(elec, total) }
  }

  return { ...e, obras, km }
}

/**
 * Cobertura de puntos stand-by. El hallazgo es la AUSENCIA, y hay que redactarla
 * como brecha de REGISTRO, nunca operativa: que una region no aparezca en la
 * fuente no significa que no tenga brigadas.
 */
export function coberturaStandby(manifest, porRegion, region) {
  const dom = manifest?.capas?.puntos_standby?.dominios?.region
  if (!dom) return null
  const conPuntos = new Set(dom.map((d) => normRegion(d.v)))
  const usaHa = porRegion?.[0]?.ha != null
  const peso = (d) => (usaHa ? d.ha : d.n)
  const sin = (porRegion ?? [])
    .filter((d) => !conPuntos.has(normRegion(d.v)))
    .sort((a, b) => peso(b) - peso(a))
  const pesoTot = (porRegion ?? []).reduce((a, d) => a + peso(d), 0)

  // Puntos de la region filtrada. `propia` es 0 --no null-- cuando la region
  // existe en los incendios pero no registra ningun punto: ese cero es
  // justamente el hallazgo del que habla la nota de la seccion, y hay que poder
  // decirlo en voz alta en vez de callarlo.
  const clave = normRegion(region ?? '')
  const propia = clave ? (dom.find((d) => normRegion(d.v) === clave)?.n ?? 0) : null

  return {
    puntos: dom.reduce((a, d) => a + d.n, 0),
    propia,
    regiones: dom.length,
    regionesTotales: porRegion?.length ?? null,
    porRegion: dom,
    sinPuntos: sin,
    pesoSin: sin.reduce((a, d) => a + peso(d), 0),
    pctPesoSin: pct(
      sin.reduce((a, d) => a + peso(d), 0),
      pesoTot,
    ),
    usaHa,
  }
}

/**
 * Recorta una lista a los `k` primeros y agrupa el resto en "Otras (n)".
 * Se prefiere a un scroll infinito: siete filas es lo que cabe legible en
 * 288 px de ancho util.
 */
export function topConOtras(lista, k = 6, etiqueta = 'Otras') {
  if (!lista || lista.length <= k + 1) return lista ?? []
  const cabeza = lista.slice(0, k)
  const cola = lista.slice(k)
  return [
    ...cabeza,
    {
      v: `${etiqueta} (${cola.length})`,
      n: cola.reduce((a, d) => a + d.n, 0),
      ha: cola[0]?.ha == null ? null : cola.reduce((a, d) => a + d.ha, 0),
      otras: true,
    },
  ]
}

/**
 * Rotulo explicito del ambito de las cifras. Sustituye a la reactividad al
 * viewport: "89,9 % evitables" leido sobre un rectangulo arbitrario invita a
 * citar como nacional algo que no lo es, asi que el panel dice de que habla.
 */
export function ambito(filtros) {
  const f = filtros ?? {}
  const partes = [f.region || 'nacional', f.temporada ? `temporada ${f.temporada}` : 'todas las temporadas']
  if (f.causa_grupo) partes.push(f.causa_grupo.toLowerCase())
  if (f.causa_general) partes.push(f.causa_general)
  return partes.join(' · ')
}
