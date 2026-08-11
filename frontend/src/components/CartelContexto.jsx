import { NO_ACTIVOS, fmt, temporadasIncendios } from '../config'

/**
 * Cartel de contexto sobre el mapa.
 *
 * Es lo unico que lee quien llega por un enlace en el telefono y no toca nada:
 * en movil los dos paneles nacen cerrados (App.jsx), asi que la primera
 * pantalla es banda verde, mapa de puntos, un ☰ y un icono de barritas, con
 * CERO palabras. Y la lectura natural de miles de puntos naranjos sobre una
 * region es "incendios activos ahora mismo", que es exactamente lo contrario de
 * lo que muestran los datos.
 *
 * NO es un <dialog> y NO usa showModal(), al reves que ModalFicha. Recibir a un
 * ciudadano con una barrera modal que hay que cerrar antes de ver nada es
 * hostil, y obligaria a gestionar foco atrapado y fondo inerte para un texto
 * que solo informa. Esto es un aviso que se puede ignorar y que los cajones
 * tapan cuando se abren (z-index 998 contra 1000).
 *
 * Cada frase va condicionada a SU capa: si alguien apago los incendios, la
 * frase de los incendios no se pinta. Describir lo que no esta en pantalla
 * confunde mas que callarse.
 *
 * La copia de "ya ocurrido" sale de config.js y la comparten el encabezado del
 * panel izquierdo y el aviso de descarga: ver el comentario de NO_ACTIVOS.
 */
export default function CartelContexto({
  manifest,
  capasActivas,
  onAbrirPanel,
  onAbrirKpi,
  onCerrar,
}) {
  // Sin manifest no hay conteo ni temporadas, y un cartel que dijera
  // "undefined incendios" seria peor que ninguno. Ese instante ya lo cubre el
  // aviso de descarga.
  if (!manifest) return null

  const temps = temporadasIncendios(manifest)
  const n = manifest.capas?.incendios?.features
  const hay = (id) => capasActivas.includes(id)

  return (
    <aside className="cartel" aria-label="Qué muestra este mapa">
      {hay('incendios') && (
        <p>
          Mapa de incendios forestales <strong>ya ocurridos</strong>. Cada punto es un incendio que
          la UAD investigó después para determinar su causa
          {n != null && `: ${fmt.format(n)} incendios investigados`}
          {temps && ` entre las temporadas ${temps.primera} y ${temps.ultima}`} — no son todos los
          incendios del país.
        </p>
      )}
      {hay('oecv') && (
        <p>
          {/* Sin describir la paleta: COLOR_OECV tiene TRES tintas (fiscal,
              privado, sin determinar) y resumirlas en una frase obligaria a
              elegir una y mentir sobre las otras dos. La leyenda ya las pinta. */}
          Las líneas son <strong>obras de eliminación de combustible vegetal</strong>, los
          cortafuegos que se hacen para frenar el fuego; los colores están en la leyenda.
        </p>
      )}
      <p className="cartel-clave">{NO_ACTIVOS}.</p>
      <div className="cartel-botones">
        {/* "Ver indicadores" existe tambien para ponerle nombre al icono de
            barritas, que sin esto es el unico control del visor que no dice
            que hace. */}
        <button onClick={onAbrirPanel}>Ver capas y filtros</button>
        <button onClick={onAbrirKpi}>Ver indicadores</button>
        <button className="cartel-ok" onClick={onCerrar}>
          Entendido
        </button>
      </div>
    </aside>
  )
}
