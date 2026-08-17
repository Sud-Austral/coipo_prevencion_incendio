import { useCallback, useRef } from 'react'

const PASO = 8
const PASO_GRANDE = 40

/**
 * Tirador para ensanchar el panel de control.
 *
 * Es un <div role="separator"> y no un <input type="range">: el patron ARIA de
 * un separador redimensionable ("window splitter") es exactamente esto, y un
 * range aparece en el orden de tabulacion como un control de formulario mas,
 * anunciado como «control deslizante» dentro de una lista de filtros.
 *
 * EL TECLADO NO ES OPCIONAL. Un tirador que solo responde al raton deja el ancho
 * del panel fuera del alcance de quien navega con teclado, y aqui el ancho es lo
 * que decide si los nombres de causa especifica se leen enteros o recortados.
 */
export default function Tirador({ ancho, min, max, onAncho, onArrastre }) {
  // El desplazamiento entre el borde del panel y donde se agarro: sin esto el
  // panel salta para poner su borde bajo el cursor en el primer pixel de
  // movimiento.
  const desfase = useRef(0)
  const pendiente = useRef(0)

  // El panel se consulta por id y no por parentElement: el tirador es su
  // hermano fijo, no su hijo (ver el comentario de .tirador en App.css).
  const bordes = () => document.getElementById('panel-control')?.getBoundingClientRect()

  const alBajar = useCallback(
    (e) => {
      // Solo el boton principal: con el secundario se abre el menu contextual y
      // el puntero se quedaria capturado sin que llegue nunca un pointerup.
      if (e.button !== 0) return
      const caja = bordes()
      if (!caja) return
      desfase.current = e.clientX - caja.right
      e.currentTarget.setPointerCapture(e.pointerId)
      onArrastre(true)
    },
    [onArrastre],
  )

  const alMover = useCallback(
    (e) => {
      if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return
      const caja = bordes()
      if (!caja) return
      const x = e.clientX - desfase.current
      // Estrangulado a un frame: pointermove llega mas a menudo que el repintado
      // y escribir la variable en cada evento obliga a recalcular la rejilla
      // varias veces por frame para nada.
      cancelAnimationFrame(pendiente.current)
      pendiente.current = requestAnimationFrame(() => onAncho(x - caja.left))
    },
    [onAncho],
  )

  const alSoltar = useCallback(
    (e) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      cancelAnimationFrame(pendiente.current)
      onArrastre(false)
    },
    [onArrastre],
  )

  const alPulsar = useCallback(
    (e) => {
      const paso =
        e.key === 'ArrowLeft' ? -PASO : e.key === 'ArrowRight' ? PASO : null
      if (paso !== null) onAncho(ancho + (e.shiftKey ? Math.sign(paso) * PASO_GRANDE : paso))
      else if (e.key === 'Home') onAncho(min)
      else if (e.key === 'End') onAncho(max)
      else return
      // Las flechas desplazan el panel si no se detienen aqui, y el panel se
      // moveria bajo el foco mientras se ajusta su ancho.
      e.preventDefault()
    },
    [ancho, min, max, onAncho],
  )

  return (
    <div
      className="tirador"
      role="separator"
      aria-orientation="vertical"
      aria-controls="panel-control"
      aria-label="Ancho del panel de capas y filtros"
      aria-valuenow={ancho}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${ancho} píxeles`}
      tabIndex={0}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onKeyDown={alPulsar}
      onDoubleClick={() => onAncho(320)}
      title="Arrastra para ensanchar el panel. Doble clic para volver al ancho normal."
    />
  )
}
