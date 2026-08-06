import { fmt, fmt1 } from './config'

// Los datos traen apostrofes ("O'Higgins") y comillas; sin escapar romperian el
// HTML del popup.
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const fila = (k, v) =>
  v === undefined || v === null || v === ''
    ? ''
    : `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`

const tabla = (titulo, filas, chip) =>
  `<div class="pop">
     <h4>${chip ?? ''}${esc(titulo)}</h4>
     <table>${filas.join('')}</table>
   </div>`

const chipColor = (color) => `<span class="chip" style="background:${color}"></span>`

/** `d` resuelve un campo codificado como indice contra la tabla del manifest. */
export function popupIncendio(p, d) {
  return tabla(p.nombre || `Incendio ${p.n_incendio ?? ''}`, [
    fila('N° incendio', p.n_incendio),
    fila('Temporada', d('temporada', p.temporada)),
    fila('Comuna', d('comuna', p.comuna)),
    fila('Provincia', d('provincia', p.provincia)),
    fila('Región', d('region', p.region)),
    fila('Grupo de causa', d('causa_grupo', p.causa_grupo)),
    fila('Causa general', d('causa_general', p.causa_general)),
    fila('Causa específica', d('causa_especifica', p.causa_especifica)),
    fila('Superficie', p.superficie_ha != null ? `${fmt1.format(p.superficie_ha)} ha` : null),
  ])
}

export function popupOECV(p, color) {
  return tabla(
    p.nombre || 'Obra OECV',
    [
      fila('Titularidad', p.tipo),
      fila('Institución', p.inst),
      fila('Región', p.region),
      fila('Origen', p.grupo),
      fila('Longitud', p.longitud_km != null ? `${fmt1.format(p.longitud_km)} km` : null),
    ],
    chipColor(color),
  )
}

export function popupRuta(p) {
  return tabla(p.nombre || p.rol || 'Tramo vial', [
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
  ])
}

export function popupStandBy(p) {
  return tabla(p.nombre || 'Punto stand-by', [
    fila('Descripción', p.descripcion),
    fila('Responsable', p.responsable),
    fila('Código', p.codigo),
    fila('Región', p.region),
  ])
}
