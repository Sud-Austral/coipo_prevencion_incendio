import { useEffect, useId, useRef } from 'react'
import { fmt } from '../config'

/**
 * La botonera del panel: un BOTÓN y una CAJA de modal, más la pareja concreta
 * que sirve a los filtros de una dimensión.
 *
 * Origen: coipo_vista_catastro@a1ee125 frontend/src/components/GrupoFiltro.jsx
 * (`BotonControl` y `CajaModal` casi literales, con los tokens de este visor).
 * Lo que NO se trae de allí, por decisión de Luis del 2026-09-16: la selección
 * es ÚNICA, no múltiple. Aquí un filtro es «una región», «una temporada», y así
 * es como viaja en la URL desde el principio: `?region=Biobío`. Con casillas,
 * cada enlace compartido y cada cifra del panel de indicadores cambiarían de
 * significado. Por eso las opciones son `radio` y no `checkbox`.
 *
 * POR QUÉ BOTONERA Y NO <select>. Con Territorio partido en tres niveles y las
 * 332 comunas dentro, un desplegable nativo obliga a recorrer la lista a ciegas:
 * no deja buscar, no dice cuántas quedan y en móvil tapa el mapa entero. El
 * modal va anclado a la izquierda, sobre el panel, para que el mapa siga a la
 * vista mientras se elige y se vea cambiar.
 *
 * DECISIONES QUE NO SON DE ESTILO (heredadas de catastro y medidas allí):
 *
 * - Lo elegido va EN EL BOTÓN, siempre visible. Un filtro activo que no se ve
 *   hace que el mapa muestre menos de lo que debería sin nada en pantalla que
 *   lo explique, y ésa es la forma más fácil de citar una cifra equivocada.
 * - Un botón sin opciones se atenúa pero SIGUE ABRIENDO: deshabilitarlo
 *   escondería el motivo.
 * - Se aplica al instante, sin «Aplicar»: es lo que hacía el desplegable.
 * - `radio` de verdad y no botones con aria-pressed: el lector de pantalla ya
 *   sabe anunciarlos y funcionan con teclado sin programar nada.
 */

/** Un botón de la botonera, sea del control que sea. */
export function BotonControl({ col, corto, valor, total, activo = false, titulo, onAbrir }) {
  return (
    <button
      type="button"
      className={`grupo-filtro${activo ? ' con-filtro' : ''}${total === 0 ? ' vacio' : ''}`}
      // Por aquí lo encuentra el panel para devolverle el foco al cerrar el
      // modal: el <dialog> lo devuelve solo, pero aquí se DESMONTA al cerrar
      // --para no tener doce listas montadas-- y entonces el foco cae al body.
      data-col={col}
      // Decir que abre un diálogo es lo que hace que un lector de pantalla
      // anuncie «abre un cuadro de diálogo» en vez de sólo «botón».
      aria-haspopup="dialog"
      onClick={() => onAbrir(col)}
      title={titulo}
    >
      <span className="gf-titulo">{corto}</span>
      {total != null && <span className="gf-total">{fmt.format(total)}</span>}
      {/* El valor va EL ÚLTIMO en el DOM y salta a su propia línea: en la
          primera no cabe «Biobío › Biobío › Mulchén» junto al título. */}
      {valor && <span className="gf-valor">{valor}</span>}
    </button>
  )
}

/**
 * La caja de un modal del panel, sin saber qué lleva dentro.
 *
 * Es un <dialog> nativo abierto con showModal(), igual que ModalFicha: el
 * navegador aporta el foco atrapado, Escape, el fondo inerte, el ::backdrop y
 * la top layer --así que ningún z-index del panel puede taparlo-- y devuelve el
 * foco al botón que lo abrió.
 *
 * VA ANCLADA A LA IZQUIERDA, y eso es CSS y no JS (ver `.modal-filtro` en
 * App.css). El ::backdrop se vuelve transparente en la misma regla: cubre TODA
 * la pantalla, así que sin eso el mapa quedaría velado por mucho que la caja se
 * corriera a un lado, y el sentido de anclarla es ver el mapa cambiar.
 */
export function CajaModal({ titulo, cuenta, onCerrar, etiquetaCerrar, pie, children }) {
  const ref = useRef(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      className="modal-filtro"
      ref={ref}
      // useId y no un literal: con doce modales posibles, un id fijo saldría
      // repetido en cuanto dos coexistieran aunque sea un instante.
      aria-labelledby={id}
      onClose={onCerrar}
      // Un clic en el ::backdrop tiene como target el propio <dialog>; en el
      // contenido, el hijo. Por eso el contenido va envuelto en un <div>.
      onClick={(e) => e.target === ref.current && onCerrar()}
    >
      <div className="mf-caja">
        <header className="mf-cabecera">
          <h2 id={id}>{titulo}</h2>
          {cuenta && <p className="mf-cuenta">{cuenta}</p>}
          <button
            type="button"
            className="ficha-cerrar"
            onClick={onCerrar}
            aria-label={etiquetaCerrar ?? `Cerrar ${titulo}`}
          >
            ×
          </button>
        </header>

        <div className="mf-cuerpo">{children}</div>

        <footer className="mf-pie">
          {pie ?? <span />}
          {/* «Listo» y no «Aplicar»: no hay nada que aplicar, el mapa ya cambió
              al elegir. Prometer un Aplicar que no existe haría dudar de si el
              filtro entró. */}
          <button type="button" className="mf-listo" onClick={onCerrar}>
            Listo
          </button>
        </footer>
      </div>
    </dialog>
  )
}

/**
 * Una opción de selección única. `sub` es la segunda línea (la usa Territorio
 * para decir la región de una comuna) y `cifra` va a la derecha, con la unidad
 * de la capa que cuenta.
 */
export function Opcion({ nombre, marcada, onElegir, etiqueta, sub, cifra, vacia }) {
  return (
    <li>
      <label className={vacia ? 'gf-opcion vacia' : 'gf-opcion'}>
        <input type="radio" name={nombre} value={etiqueta} checked={marcada} onChange={onElegir} />
        <span className="gf-etq">
          {etiqueta}
          {sub && <em className="gf-sub">{sub}</em>}
        </span>
        <span className="gf-cifra">{cifra}</span>
      </label>
    </li>
  )
}

/**
 * El modal de un filtro de una dimensión: su lista de valores.
 *
 * La cifra de cada opción lleva SIEMPRE su unidad («8 incendios», «12 obras»):
 * «(8)» a secas no dice qué cuenta, y la misma «Región» cuenta incendios u
 * obras según qué capas estén encendidas (DECISIONES.md §Q).
 */
export function ModalFiltro({ campo, etiqueta, opciones, unidad, valor, cascada, onElegir, onCerrar }) {
  const cifra = (n) => `${fmt.format(n)} ${unidad[n === 1 ? 0 : 1]}`
  return (
    <CajaModal
      titulo={etiqueta}
      cuenta={
        cascada
          ? `${fmt.format(opciones.length)} con los filtros puestos`
          : `${fmt.format(opciones.length)} en la capa entera`
      }
      etiquetaCerrar={`Cerrar ${etiqueta}`}
      onCerrar={onCerrar}
      pie={
        valor ? (
          <button type="button" className="limpiar" onClick={() => onElegir(campo, '')}>
            Quitar este filtro
          </button>
        ) : null
      }
    >
      {!cascada && (
        <p className="nota">
          Esta capa se sirve por tramos y esta publicación no trae el cruce con los demás
          filtros: sus cifras son de la capa entera y no se estrechan.
        </p>
      )}
      <ul className="gf-lista">
        <Opcion
          nombre={`filtro-${campo}`}
          marcada={!valor}
          onElegir={() => onElegir(campo, '')}
          etiqueta="Todas"
          cifra=""
        />
        {opciones.map((o) => (
          <Opcion
            key={o.v}
            nombre={`filtro-${campo}`}
            marcada={valor === o.v}
            onElegir={() => onElegir(campo, o.v)}
            etiqueta={o.v}
            cifra={cifra(o.n)}
            vacia={o.n === 0}
          />
        ))}
      </ul>
    </CajaModal>
  )
}
