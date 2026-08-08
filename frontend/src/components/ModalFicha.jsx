import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ficha && !d.open) d.showModal()
    else if (!ficha && d.open) d.close()
  }, [ficha])

  return (
    <dialog
      className="ficha"
      ref={ref}
      aria-labelledby="ficha-titulo"
      // 'close' cubre Escape y el boton de cerrar por igual.
      onClose={onCerrar}
      // Un clic en el ::backdrop tiene como target el propio <dialog>; en el
      // contenido, el hijo. Por eso el contenido va envuelto en un <div>.
      onClick={(e) => e.target === ref.current && onCerrar()}
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
        </div>
      )}
    </dialog>
  )
}
