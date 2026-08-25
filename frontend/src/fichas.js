import { fmt, fmt1 } from './config'

/** Huso UTM legible. La fuente NO declara el huso y cambia por fila; el ETL lo
 *  resuelve probando ambos contra la franja de longitudes de la region. */
const HUSO = { 32718: 'huso 18S', 32719: 'huso 19S' }

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
            `${p.utm_x} E · ${p.utm_y} N${HUSO[p.utm_epsg] ? ` · ${HUSO[p.utm_epsg]}` : ''}`
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
