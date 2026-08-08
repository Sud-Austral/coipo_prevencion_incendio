import { fmt, fmt1 } from './config'

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
export function fichaIncendio(p, d, color) {
  return ficha(
    'Incendio investigado',
    p.nombre || (p.n_incendio ? `Incendio ${p.n_incendio}` : ''),
    [
      fila('N° incendio', p.n_incendio),
      fila('Temporada', d('temporada', p.temporada)),
      fila('Comuna', d('comuna', p.comuna)),
      fila('Provincia', d('provincia', p.provincia)),
      fila('Región', d('region', p.region)),
      fila('Grupo de causa', d('causa_grupo', p.causa_grupo)),
      fila('Causa general', d('causa_general', p.causa_general)),
      fila('Causa específica', d('causa_especifica', p.causa_especifica)),
      fila('Superficie', p.superficie_ha != null ? `${fmt1.format(p.superficie_ha)} ha` : null),
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
