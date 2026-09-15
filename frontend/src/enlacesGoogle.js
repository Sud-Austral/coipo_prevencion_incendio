/**
 * Direcciones de Google para el punto de una ficha: dos para incrustar en el
 * visor (satelite y Street View) y una para salir a Earth en otra pestana.
 *
 * Vive fuera de los componentes porque un .jsx solo puede exportar componentes
 * (regla react/only-export-components), y porque las plantillas son anclas de
 * los mutantes de C12 en scripts/verify-priorizacion.mjs: cada una tiene que
 * aparecer UNA sola vez en este archivo. Por eso los comentarios escriben el
 * punto como LAT,LON y nunca con la sintaxis de la plantilla.
 *
 * QUE SE PUEDE INCRUSTAR Y QUE NO, medido con curl y Chrome el 2026-09-15:
 *
 *   earth.google.com/web/search/LAT,LON      X-Frame-Options: SAMEORIGIN; en un
 *                                            iframe Google pinta «403». NO.
 *   google.com/maps/search/?api=1&query=...  X-Frame-Options: SAMEORIGIN. NO.
 *   google.com/maps?...&output=embed         301 a /maps/embed?origin=mfe&pb=...,
 *                                            cuya respuesta final NO trae
 *                                            X-Frame-Options. Pinta satelite.
 *   google.com/maps?layer=c&...&output=svembed  igual, 301 a /maps/embed. Pinta
 *                                            Street View donde hay panorama.
 *   google.com/maps/embed/v1/...             la Embed API oficial: 401 sin clave.
 *
 * Se usan las dos formas sin clave porque el visor no tiene API ni clave, y
 * una clave en un sitio estatico seria publica. La contrapartida: ninguna de
 * las dos esta documentada por Google, y nada en CI comprueba que siga
 * dejandose incrustar (seria una prueba de red, inestable). Si un dia el modal
 * sale en blanco, lo primero es repetir el curl de arriba.
 *
 * Street View solo encuentra panorama MUY cerca del punto, no busca el camino
 * mas proximo. Medido el 2026-09-15: hay panorama en una calle de Los Angeles
 * (-37.4693,-72.3539), en el centro de Mulchen y en el incendio 1262, que cae
 * sobre la ruta F-800; no lo hay en un punto forestal (-37.80,-72.10) ni en el
 * incendio 4229 («Hospital», -37.47481,-72.34329), urbano pero dentro del
 * predio: «No hay imagenes de Street View disponibles». La mayoria de las
 * manchas de riesgo son rurales.
 *
 * La coordenada llega redondeada a 5 decimales (App.jsx, conCoord) y como
 * numero, asi que la plantilla escribe su String: -37.4693, sin ceros de cola
 * y sin exponente en las latitudes y longitudes de Chile.
 */

// z=16 encuadra ~1 km de ancho en el modal: cabe una mancha de riesgo tipica
// con su entorno. t=k es satelite; sin el, el embed abre el mapa de calles.
export const urlSatelite = ([lat, lon]) =>
  `https://www.google.com/maps?q=${lat},${lon}&ll=${lat},${lon}&t=k&z=16&hl=es&output=embed`

// cbp=11,0,0,0,0 es la orientacion inicial por omision (rumbo 0, sin cabeceo).
export const urlStreetView = ([lat, lon]) =>
  `https://www.google.com/maps?layer=c&cbll=${lat},${lon}&cbp=11,0,0,0,0&hl=es&output=svembed`

// Earth EN FORMA DE BUSQUEDA, y lo aprendio por las malas. Estuvo con la URL de
// camara --/web/@LAT,LON,0a,1200d,...-- que SOLO mueve la camara: aterrizaba a
// 1,2 km sobre un campo generico, sin nada que marcara el punto. Abiertas las
// dos y fotografiadas: la de busqueda planta chincheta roja, rotula la
// coordenada y abre su panel; la de camara no pinta ni una marca y el unico
// rotulo era un POI ajeno. Repetido el 2026-09-14 con el incendio 1262 (Cuesta
// Llampaiquillo), capturando a los 40 s: la de camara, bosque y un camino sin
// ninguna marca; la de busqueda, chincheta roja en el centro rotulada
// 33°12'37.8"S 71°35'51.7"W y el panel «QCQ2+QWV Casablanca».
//
// El HTTP 200 no vale como prueba: Earth es una SPA y devuelve 200 para
// cualquier ruta. Lo que se comprueba es la CAPTURA; la forma del enlace, y
// que su coordenada sea la del registro, la vigila C12.
export const urlEarth = ([lat, lon]) => `https://earth.google.com/web/search/${lat},${lon}`
