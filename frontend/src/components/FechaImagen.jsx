import { fechaLarga, fmt1 } from '../config'

/**
 * Fecha de captura de la imagen satelital bajo el CENTRO de la vista.
 *
 * Los cuatro estados se dicen, ninguno se calla. Que la respuesta valga solo
 * para el centro no es un detalle menor y va escrito: World Imagery es un
 * mosaico de miles de escenas de fechas distintas, asi que una sola fecha para
 * toda la pantalla seria falsa.
 *
 * Vive en su propio archivo desde que hay dos paneles con selector de mapa
 * base: estaba dentro de PanelLateral, y la vista de priorizacion necesita el
 * MISMO texto. Copiarlo habria dejado dos redacciones que divergen en cuanto
 * alguien matice una.
 */
export default function FechaImagen({ info }) {
  if (info.estado === 'cargando') {
    return <p className="nota">Consultando la fecha de la imagen…</p>
  }
  if (info.estado === 'error') {
    return <p className="nota">No se pudo consultar la fecha de la imagen.</p>
  }
  // Fecha conocida de antemano. Se dice ademas QUE ES un mosaico anual, porque
  // Sentinel-2 revisita cada ~5 dias y es facil suponer que se esta viendo la
  // pasada mas reciente: esto es un compuesto de todo el año, sin nubes.
  if (info.estado === 'fijo') {
    return (
      <>
        <p className="kpi">
          <b>{info.texto}</b>
        </p>
        <p className="nota">
          10 m por píxel. No hay un mes de captura: cada píxel se toma de la observación menos
          nublada del año, así que dos puntos vecinos pueden ser de fechas muy distintas. Eso es lo
          que permite que no haya nubes.
        </p>
        <p className="nota">
          Si necesitas la fecha exacta de una imagen, usa el mapa base <b>Satelital</b>: ese sí la
          informa punto por punto.
        </p>
      </>
    )
  }

  const detalle = [
    info.resolucion != null && `${fmt1.format(info.resolucion)} m por píxel`,
    info.fuente,
  ]
    .filter(Boolean)
    .join(' · ')

  if (info.estado === 'sin-fecha') {
    return (
      <p className="nota">
        {info.motivo === 'mosaico'
          ? `A este nivel de acercamiento se ve el mosaico global de baja resolución${
              detalle ? ` (${detalle})` : ''
            }, que no publica fecha de captura. Acércate para ver la fecha de la imagen de alta resolución.`
          : 'El servicio no informa qué imagen cubre este punto.'}
      </p>
    )
  }

  return (
    <>
      <p className="kpi">
        Imagen del <b>{fechaLarga(info.iso)}</b>
      </p>
      {detalle && <p className="nota">{detalle}.</p>}
      <p className="nota">
        Corresponde al centro de la vista y cambia al desplazar el mapa: el fondo satelital es un
        mosaico de escenas de distintas fechas, no una sola foto.
      </p>
    </>
  )
}
