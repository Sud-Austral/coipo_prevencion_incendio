import { fmt, fmt1 } from './config'

/** Huso UTM legible. La fuente NO declara el huso y cambia por fila; el ETL lo
 *  resuelve probando ambos contra la franja de longitudes de la region. */
const HUSO = { 32718: 'huso 18S', 32719: 'huso 19S' }

/** Metros UTM tal como vienen, sin agrupar (ver la ficha del incendio) pero con
 *  COMA decimal: 19 de los 14.705 incendios traen decimas de metro y la ficha
 *  del 1262 decia «257878.8 E · 6322367.6 N», con punto, al lado de la
 *  superficie «2.532 ha» (medido el 2026-09-14). Se cambia solo el separador,
 *  no se redondea: los digitos son los del registro. */
const metros = (v) => String(v).replace('.', ',')

/**
 * 'YYYY-MM-DD' -> 'D de mes de YYYY'. El ETL ya normalizo la mezcla de
 * datetime, texto 'dd/mm/yyyy' y centinelas que trae el Excel, asi que aqui
 * solo puede llegar ISO o nada. Se construye la fecha en hora LOCAL --con el
 * constructor de tres argumentos-- y no con `new Date(iso)`, que interpreta la
 * cadena como UTC y en Chile (UTC-3/-4) devuelve el dia ANTERIOR.
 */
function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  if (!m) return iso ?? null
  const f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return f.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Contenido de la ficha que se abre al hacer clic en una figura del mapa.
 *
 * Devuelven DATOS, no HTML. Antes esto construia el string del popup de Leaflet
 * y por eso necesitaba escapar a mano cada valor (los datos traen apostrofes,
 * como "O'Higgins"). Al pintarlos React, ese escapado -- y la familia de bugs
 * que lo acompana -- desaparece.
 */

const fila = (k, v) => (v === undefined || v === null || v === '' ? null : [k, String(v)])

const ficha = (capa, titulo, filas, color) => ({
  capa,
  titulo: titulo || capa,
  color,
  filas: filas.filter(Boolean),
})

/** `d` resuelve un campo codificado como indice contra la tabla del manifest. */
/**
 * LAS 23 COLUMNAS DE LA HOJA, TODAS, y en el orden en que estan en el Excel.
 *
 * Antes esta ficha mostraba nueve filas y el ETL solo traia trece columnas de
 * las 23 de 'BBDD INVESTIGACION UAD CONSOLIDADA COMPLETA.xlsx'. Las diez que
 * faltaban no estaban ocultas por una decision: no llegaban al visor, asi que
 * desde dentro parecia que la fuente no las tenia.
 *
 * El orden sigue el del Excel a proposito: asi se puede cotejar la ficha contra
 * la planilla columna por columna. Si alguien reordena por gusto visual, ese
 * cotejo deja de ser posible.
 *
 * `fila()` descarta null y '', asi que una celda vacia no pinta una fila vacia:
 * la cobertura real va del 100 % (region, causa) al 66,7 % (fecha de inicio de
 * investigacion). Ver el reporte de cobertura en ETL/build_incendios.py.
 */
export function fichaIncendio(p, d, color) {
  return ficha(
    'Incendio investigado',
    p.nombre || (p.n_incendio ? `Incendio ${p.n_incendio}` : ''),
    [
      fila('ID', p.id),
      fila('Región', d('region', p.region)),
      fila('Provincia', d('provincia', p.provincia)),
      fila('Comuna', d('comuna', p.comuna)),
      fila('Temporada', d('temporada', p.temporada)),
      fila('N° incendio', p.n_incendio),
      // 'Nombre' es el titulo de la ficha, no se repite como fila.
      fila('Causa investigada', d('causa_codigo', p.causa_codigo)),
      fila('Causa específica', d('causa_especifica', p.causa_especifica)),
      fila('Causa general', d('causa_general', p.causa_general)),
      fila('Código causa general', d('causa_general_codigo', p.causa_general_codigo)),
      fila('Grupo de causa', d('causa_grupo', p.causa_grupo)),
      // Las coordenadas de origen. Se muestran juntas y con el huso, porque un
      // par UTM sin huso no ubica nada: en esta fuente el huso cambia por fila.
      fila(
        'Coordenadas UTM',
        p.utm_x != null && p.utm_y != null
          ? // SIN separador de miles, al reves que el resto de las cifras de la
            // ficha: en es-CL el separador de miles es el PUNTO, asi que
            // fmt.format(360886) da «360.886» y un easting se lee como si
            // tuviera decimales. Una coordenada mal leida manda a alguien a
            // otro sitio; los metros van sin agrupar.
            `${metros(p.utm_x)} E · ${metros(p.utm_y)} N${HUSO[p.utm_epsg] ? ` · ${HUSO[p.utm_epsg]}` : ''}`
          : null,
      ),
      fila('Superficie', p.superficie_ha != null ? `${fmt1.format(p.superficie_ha)} ha` : null),
      // El encabezado de esta columna en el Excel es 'jefe brigada****' pero su
      // contenido son codigos de causa ('01.01.02', '4.1.2'), no personas.
      // Comprobado sobre las 14.985 filas: 203 valores distintos y coincide con
      // 'Causa investigada 2023' en el 0,2 %. Se rotula por lo que ES --un
      // codigo de la columna 'jefe brigada' del Excel-- y no por lo que su
      // encabezado promete, para no propagar el error de la planilla.
      fila('Código «jefe brigada» (Excel)', d('jefe_brigada', p.jefe_brigada)),
      fila('Mes de investigación', d('mes_investigacion', p.mes_investigacion)),
      fila('Investigado por', d('investigado_por', p.investigado_por)),
      fila('Inicio del incendio (R20)', fechaCorta(p.inicio_r20)),
      fila('Hora de inicio (R20)', p.hora_r20),
      fila('Inicio de la investigación', fechaCorta(p.inv_inicio)),
      fila('Fin de la investigación', fechaCorta(p.inv_fin)),
      fila('Informe', p.informe),
    ],
    color,
  )
}

export function fichaOECV(p, color) {
  return ficha(
    'Obra de eliminación de combustible vegetal',
    p.nombre,
    [
      fila('Titularidad', p.tipo),
      fila('Institución', p.inst),
      fila('Región', p.region),
      fila('Origen', p.grupo),
      fila('Longitud', p.longitud_km != null ? `${fmt1.format(p.longitud_km)} km` : null),
    ],
    color,
  )
}

/** Evidencia de verificación en terreno; `origen` dice qué archivo la envió. */
export function fichaVerificado(p, color) {
  return ficha(
    'OECV verificado en terreno',
    p.nombre,
    [
      fila('Institución', p.inst),
      fila('Región', p.region),
      fila('Longitud', p.longitud_km != null ? `${fmt1.format(p.longitud_km)} km` : null),
      fila('Archivo de origen', p.origen),
    ],
    color,
  )
}

export function fichaRuta(p, capa = 'Tramo vial', color) {
  return ficha(
    capa,
    p.nombre || p.rol,
    [
      fila('Rol', p.rol),
      fila('Clasificación', p.clasificacion),
      fila('Carpeta', p.carpeta),
      fila('Región', p.region),
      fila('Longitud del tramo', p.km_tramo != null ? `${fmt.format(p.km_tramo)} m` : null),
      fila('Enrolado', p.enrolado),
      fila('Concesionada', p.concesionada),
      fila('Origen', p.origen),
      // Solo la capa de Metropolitana trae causalidad.
      fila('Grupo de causa', p.causa_grupo),
      fila('Causa general', p.causa_general),
    ],
    color,
  )
}

export function fichaStandBy(p, color) {
  return ficha(
    'Punto stand-by',
    p.nombre,
    [
      fila('Descripción', p.descripcion),
      fila('Responsable', p.responsable),
      fila('Código', p.codigo),
      fila('Región', p.region),
    ],
    color,
  )
}

// Cifras con decimales FIJOS en es-CL, como el resto de la interfaz. Antes eran
// toFixed, que siempre usa punto: la ficha decia «0.1998» y «49.8 %» mientras el
// panel de indicadores escribe «59,4 %» (capturas del 2026-09-14). Con minimo =
// maximo de decimales el cero final dice con que precision viaja el dato, y los
// decimales son los que trae el insumo (medido el 2026-09-15 en las 111.939
// manchas): nivel_medio y su rango con 3, pct_alto con 1 y area_ha con 2. Asi
// aqui no hay redondeo, solo relleno.
const fmt3 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fmt2 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num = (f, v) => (typeof v === 'number' ? f.format(v) : null)

/**
 * Area de riesgo (hasta el 2026-09-16 se llamaba «mancha» en la interfaz; el
 * campo del dato sigue siendo `mancha_id`, que es contrato publicado).
 *
 * `nivel_medio` VA SIEMPRE ACOMPANADO de su rango min-max y de `pct_alto`,
 * porque la clase es un PROMEDIO redondeado: una mancha «Medio» puede tener
 * piezas en Alto (manchas_riesgo.py). Por eso tambien se muestra que parte de
 * su superficie con dato esta en nivel Alto o Muy Alto.
 *
 * `pct_alto` YA VIENE EN PORCENTAJE (0..100). NO pasa por un formateador con
 * style:'percent', que multiplica por 100 y escribiria «5.000,0 %».
 *
 * La clase se rotula «(escala del modelo)» y no desaparece nunca, tampoco en
 * modo normalizado: es el ancla que impide leer el color relativo de una comuna
 * como si fuera una magnitud comparable con otra.
 */
export function fichaMancha(p, rango, color, region) {
  return ficha(
    'Área de riesgo',
    `${p.comuna} · ${p.clase}`,
    [
      fila('Comuna', p.comuna),
      fila('Región', region),
      fila('Clase (escala del modelo)', p.clase),
      fila('Nivel medio (0 a 4)', num(fmt3, p.nivel_medio)),
      fila(
        'Rango interno',
        typeof p.nivel_medio_min === 'number' && typeof p.nivel_medio_max === 'number'
          ? `${fmt3.format(p.nivel_medio_min)} – ${fmt3.format(p.nivel_medio_max)}`
          : null,
      ),
      fila('Superficie en nivel Alto o Muy Alto', typeof p.pct_alto === 'number' ? `${fmtPct1.format(p.pct_alto)} %` : null),
      // Solo tiene sentido dentro de la comuna cargada, que es la unica que hay.
      rango ? fila('Posición en su comuna', `${fmt.format(rango.pos)}.ª de ${fmt.format(rango.total)}`) : null,
      // 2 decimales y no Math.round: el 32 % de las manchas mide menos de 1 ha
      // (medido), y redondeadas se leerian todas «0 ha».
      fila('Superficie', typeof p.area_ha === 'number' ? `${fmt2.format(p.area_ha)} ha` : null),
      // Celdas H3 distintas con al menos un trozo en la mancha. Cuenta
      // fragmentos: una celda partida por el limite comunal cuenta en las dos.
      fila('Celdas H3', typeof p.n_hexagonos === 'number' ? fmt.format(p.n_hexagonos) : null),
      fila('Identificador', p.mancha_id),
    ],
    color,
  )
}

/**
 * Elemento de infraestructura critica.
 *
 * NUNCA se muestran `descriptio` ni `drawOrder` de las unidades penitenciarias:
 * el primero trae un bloque HTML completo de Google Earth y el segundo un
 * '**********' por desbordamiento del dBase. Por eso el ETL no los publica.
 */
export function fichaPunto(p, color) {
  return ficha(
    p.grupo || 'Infraestructura crítica',
    p.nombre || p.grupo,
    [
      fila('Tipo', p.tipo),
      fila('Comuna', p.comuna),
      fila('Dirección', p.direccion),
      fila('Matrícula', typeof p.matricula === 'number' ? fmt.format(p.matricula) : null),
      // El codigo de dependencia del MINEDUC viaja sin traducir a proposito: el
      // .dbf no trae diccionario y el .qmd tampoco, asi que rotularlo
      // «Municipal» seria una etiqueta plausible y sin respaldo en el dato.
      fila('Dependencia (código MINEDUC)', p.dependencia_cod),
      fila('Complejidad', p.complejidad),
      fila('Detalle', p.detalle),
      fila('Ámbito', p.ambito),
      fila('Beneficiarios', typeof p.beneficiarios === 'number' ? fmt.format(p.beneficiarios) : null),
      fila('Arranques', typeof p.arranques === 'number' ? fmt.format(p.arranques) : null),
      fila('Tensión', p.tension_kv ? `${p.tension_kv} kV` : null),
      fila('Propiedad', p.propiedad),
      fila('Operador', p.operador),
      fila('Tecnología', p.tecnologia),
      fila('Altura', typeof p.altura_m === 'number' ? `${fmt1.format(p.altura_m)} m` : null),
      fila('Código OACI', p.codigo_oaci),
      fila('Uso', p.uso),
      fila('Estado', p.estado),
      // Solo las 8 familias del insumo nacional (2026-09-16) tienen estos
      // campos, y cada uno lo trae UNA sola familia: `urgencia` viene de salud,
      // `preparada` de educacion, y `anio`/`poblacion`/`sector`/`riesgo` de
      // comunidades preparadas. `fila` descarta los nulos, asi que no hay que
      // ramificar por familia.
      fila('Atención de urgencia', p.urgencia),
      // `preparada` es booleano: sin esto saldria «false», que no es un texto
      // que nadie quiera leer en una ficha. Las 97 escuelas preparadas del
      // insumo estan marcadas asi.
      fila('Escuela preparada', typeof p.preparada === 'boolean' ? (p.preparada ? 'Sí' : 'No') : null),
      fila('Sector', p.sector),
      // El dato viene como texto y a veces es «-»: se muestra tal cual salvo
      // ese marcador, que no dice nada.
      fila('Población', p.poblacion === '-' ? null : p.poblacion),
      fila('Clasificación de riesgo', p.riesgo),
      fila('Año', p.anio),
    ],
    color,
  )
}
