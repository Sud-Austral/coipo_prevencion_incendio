// Iconos de las familias de infraestructura critica.
//
// SVG a mano y no una libreria: el repo no tiene NINGUNA dependencia de UI
// (leaflet, pmtiles, protomaps-leaflet, react y react-dom son todas cañeria de
// mapa), y anadir la primera es una decision de proyecto, no un detalle de esta
// pestaña. Ocho glifos de 24x24 cuestan menos que un paquete.
//
// Cada glifo se dibuja BLANCO sobre un disco del color de su familia. El disco
// no es decorativo: sobre las areas priorizadas --que van de crema a granate
// oscuro-- un glifo suelto se pierde en la mitad de los fondos, y el disco le
// da un contraste constante contra cualquiera de los cinco.
//
// Los paths usan `fill` y no `stroke` para que a 22 px no dependan del grosor
// de linea, que a ese tamaño se convierte en una mancha.

import { COLOR_FAMILIA } from './config'

// Se exporta porque mapaPNG.js redibuja estos mismos glifos con Path2D al
// exportar: los marcadores son nodos del DOM y no entran en el lienzo por si
// solos. Una segunda copia de los paths alli se desincronizaria en cuanto
// alguien retocara un icono.
export const GLIFOS = {
  // Escuela: techo a dos aguas sobre un cuerpo con puerta.
  educacion:
    'M12 3 2 8v2h20V8L12 3zM4 11v8H2v2h20v-2h-2v-8h-2v8h-4v-5h-4v5H6v-8H4z',
  // Comunidad preparada: tres figuras, la del centro delante. La familia
  // `escuelas_prep` que habia aqui NO existe en el insumo nacional: una escuela
  // preparada es un establecimiento educacional con `preparada` en true (97 de
  // 11.122), no una familia aparte.
  comunidades_prep:
    'M12 3.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM5.4 5.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18.6 5.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 9.4c-2.4 0-4 1.3-4 3.1V17h8v-4.5c0-1.8-1.6-3.1-4-3.1zM5.4 10.6c-1.9 0-3.2 1-3.2 2.4V17h4.2v-4.5c0-.8.2-1.4.5-1.9zM18.6 10.6c1.9 0 3.2 1 3.2 2.4V17h-4.2v-4.5c0-.8-.2-1.4-.5-1.9z',
  // Salud: cruz griega.
  salud: 'M10 2h4v6h6v4h-6v10h-4V12H4V8h6V2z',
  // Servicios sanitarios rurales: gota de agua.
  ssr: 'M12 2.5C12 2.5 5 10.2 5 14.6A7 7 0 0 0 19 14.6C19 10.2 12 2.5 12 2.5z',
  // Antena: mastil con dos arcos de emision.
  antenas:
    'M11 8h2l3 13h-2.3l-.6-3h-2.2l-.6 3H8l3-13zm1-5a2.5 2.5 0 0 1 1.6 4.4l-.8-1.4a1 1 0 1 0-1.6 0l-.8 1.4A2.5 2.5 0 0 1 12 3zM7.6 2.2l1 1.3a4.5 4.5 0 0 0 0 6.6l-1 1.3a6 6 0 0 1 0-9.2zm8.8 0a6 6 0 0 1 0 9.2l-1-1.3a4.5 4.5 0 0 0 0-6.6l1-1.3z',
  // Subestacion: rayo.
  subestaciones: 'M13 2 4 13h6l-1 9 9-11h-6l1-9z',
  // Aerodromo: avion en planta.
  aeropuerto: 'M21 15v-2l-8-4.5V3.5a1.5 1.5 0 0 0-3 0V8.5L2 13v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5.5L21 15z',
  // Unidad penitenciaria: cuerpo con barrotes.
  penitenciaria: 'M4 3h2v18H4V3zm4.5 0h2v18h-2V3zM13 3h2v18h-2V3zm4.5 0h2v18h-2V3z',
}

/**
 * HTML de un marcador. Se compone a mano porque L.divIcon recibe una cadena.
 *
 * SIN interpolar nada del dato: aqui solo entran claves de GLIFOS y colores de
 * COLOR_FAMILIA, los dos de config.js. El nombre del elemento va al popup por
 * React, que lo escapa; meterlo aqui seria abrir un XSS con datos de terceros.
 */
export function htmlIcono(familia) {
  const glifo = GLIFOS[familia]
  const color = COLOR_FAMILIA[familia] ?? '#4B5563'
  // data-familia lo lee mapaPNG.js para saber que glifo redibujar al exportar.
  const abre = `<span class="pin" data-familia="${familia}" style="background:${color}">`
  if (!glifo) return `${abre}</span>`
  return `${abre}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glifo}"/></svg></span>`
}

export const FAMILIAS_CON_ICONO = Object.keys(GLIFOS)
