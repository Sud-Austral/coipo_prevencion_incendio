import { useCallback, useEffect, useRef, useState } from 'react'
import ModalVistaGoogle from './ModalVistaGoogle'

/**
 * Ficha de la figura seleccionada en el mapa.
 *
 * Es un <dialog> nativo abierto con showModal(), no un div con position:fixed:
 * asi el navegador aporta gratis el foco atrapado dentro, el cierre con Escape,
 * el fondo inerte y el ::backdrop. Ademas vive en la top layer, asi que ningun
 * z-index de Leaflet o del cajon lateral puede taparlo.
 *
 * El dialogo se monta SIEMPRE (para tener la referencia) y solo su contenido es
 * condicional.
 */
export default function ModalFicha({ ficha, onCerrar }) {
  const ref = useRef(null)
  // La vista de Google pertenece a UNA ficha: se guarda con cual, y cuando la
  // ficha se cierra o cambia por cualquier camino la pestana deriva a null y el
  // iframe se desmonta, sin un efecto que lo sincronice.
  const [vista, setVista] = useState(null)
  const pestana = vista?.de === ficha ? vista.pestana : null
  // ¿Queda contenido por debajo de lo visible? Gobierna la pista del pie y la
  // linea bajo la cabecera fija (F1, DECISIONES.md §U).
  const [hayMas, setHayMas] = useState(false)
  const [desplazada, setDesplazada] = useState(false)
  const medir = useCallback(() => {
    const d = ref.current
    // 2 px de tolerancia: el zoom del navegador deja scrollTop fraccionario y la
    // pista no se apagaba nunca en el ultimo pixel.
    setHayMas(!!d && d.scrollTop + d.clientHeight < d.scrollHeight - 2)
    setDesplazada(!!d && d.scrollTop > 0)
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ficha && !d.open) d.showModal()
    else if (!ficha && d.open) d.close()
    // Cada ficha empieza arriba: el dialogo es el mismo nodo y conservaba el
    // desplazamiento de la anterior.
    if (ficha) d.scrollTop = 0
    medir()
  }, [ficha, medir])

  // Un cambio de tamaño de la ventana cambia lo que cabe sin que haya scroll.
  useEffect(() => {
    const d = ref.current
    if (!d || !ficha || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(d)
    return () => ro.disconnect()
  }, [ficha, medir])

  return (
    <>
      <dialog
        className={desplazada ? 'ficha desplazada' : 'ficha'}
        ref={ref}
        aria-labelledby="ficha-titulo"
        // 'close' cubre Escape y el boton de cerrar por igual.
        onClose={onCerrar}
        // Un clic en el ::backdrop tiene como target el propio <dialog>; en el
        // contenido, el hijo. Por eso el contenido va envuelto en un <div>.
        onClick={(e) => e.target === ref.current && onCerrar()}
        onScroll={medir}
      >
        {ficha && (
          <div className="ficha-caja">
            <header>
              <p className="ficha-capa">
                {ficha.color && <span className="chip" style={{ background: ficha.color }} />}
                {ficha.capa}
              </p>
              <h2 id="ficha-titulo">{ficha.titulo}</h2>
              <button type="button" className="ficha-cerrar" onClick={onCerrar} aria-label="Cerrar ficha">
                ×
              </button>
            </header>

            {/* Origen de la fila de acciones: coipo_vista_catastro@a1ee125
                frontend/src/components/ModalFicha.jsx:48-63, que la tenia como
                dos enlaces de ida a Google Maps y Earth.

                Desde el 2026-09-15 (DECISIONES.md §V) no salen a otra pestana:
                abren el punto en satelite o Street View DENTRO del visor, en
                ModalVistaGoogle. Google Maps y Earth no se dejan incrustar
                (X-Frame-Options: SAMEORIGIN, medido); las formas que si, y por
                que, estan en src/enlacesGoogle.js. Earth queda como enlace
                dentro de ese modal.

                Botones y no enlaces: un <a href> que al pulsarlo abre otra cosa
                dice una al pasar el raton y al lector de pantalla, y hace otra
                al pulsarlo. Y nada de Google se pide hasta que el usuario pulsa. */}
            {ficha.coord && (
              <p className="ficha-acciones">
                <button
                  type="button"
                  data-vista="satelite"
                  aria-haspopup="dialog"
                  onClick={() => setVista({ de: ficha, pestana: 'satelite' })}
                >
                  Vista satelital
                </button>
                <button
                  type="button"
                  data-vista="streetview"
                  aria-haspopup="dialog"
                  onClick={() => setVista({ de: ficha, pestana: 'streetview' })}
                >
                  Street View
                </button>
              </p>
            )}

            {ficha.filas.length ? (
              <table>
                <tbody>
                  {ficha.filas.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="ficha-vacia">Esta figura no trae más atributos.</p>
            )}
            {/* La pista de que hay mas: se apaga al llegar al final (§U). */}
            <div className="ficha-pista" hidden={!hayMas} aria-hidden="true" />
          </div>
        )}
      </dialog>

      {/* HERMANO de la ficha y no hijo: ver la cabecera de ModalVistaGoogle.
          Al cerrarse solo suelta la vista; la ficha sigue abierta debajo. */}
      <ModalVistaGoogle
        coord={ficha?.coord}
        titulo={ficha?.titulo}
        vista={pestana}
        onVista={(p) => setVista({ de: ficha, pestana: p })}
        onCerrar={() => setVista(null)}
      />
    </>
  )
}
