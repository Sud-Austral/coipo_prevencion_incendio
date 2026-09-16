import { useEffect, useRef } from 'react'
import { urlEarth, urlMapsPano, urlSatelite, urlStreetView } from '../enlacesGoogle'

const PESTANAS = [
  { id: 'satelite', etiqueta: 'Satélite', titulo: 'Vista satelital de Google Maps en el punto de la ficha' },
  { id: 'streetview', etiqueta: 'Street View', titulo: 'Street View de Google en el punto de la ficha' },
]

/**
 * El punto de la ficha visto en Google, dentro del visor: satelite y Street
 * View en pestanas, y Earth como unica salida a otra pestana (Earth no se deja
 * incrustar; ver src/enlacesGoogle.js).
 *
 * Es un SEGUNDO <dialog> abierto con showModal() encima de la ficha, que sigue
 * abierta debajo: el navegador pone la top layer, el Escape que cierra solo el
 * de arriba, el foco atrapado y el ::backdrop, igual que en ModalFicha.
 *
 * VA COMO HERMANO DE LA FICHA, NUNCA COMO HIJO, ni en el DOM ni en el arbol de
 * React. En React 19.2 el evento `close` se escucha en el propio <dialog> pero
 * se propaga por el arbol de componentes (react-dom-client.development.js:
 * 19410-19413; solo scroll y scrollend se quedan en el destino), asi que un
 * dialog hijo --incluso por portal-- dispararia al cerrarse el onClose de la
 * ficha y cerraria las dos. Y en el DOM, el arnes lee los enlaces y el HTML de
 * `dialog.ficha`: un hijo se los contaminaria.
 *
 * EL IFRAME SOLO EXISTE MIENTRAS ESTA ABIERTO. El dialog se monta siempre (para
 * tener la referencia) y su contenido solo con una pestana elegida. Asi abrir
 * una ficha no le pide nada a Google --C1 abre y cierra ~150 fichas en unos
 * segundos--, y al cerrar Street View deja de cargar. Lo vigila C16.
 */
export default function ModalVistaGoogle({ coord, titulo, vista, onVista, onCerrar }) {
  const ref = useRef(null)
  const abierta = !!(vista && coord)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierta && !d.open) d.showModal()
    else if (!abierta && d.open) d.close()
  }, [abierta])

  // Flechas entre pestanas, como en Pestanas.jsx: es lo que el patron de
  // tablist exige y lo que anuncia un lector de pantalla.
  const alTeclado = (e) => {
    const i = PESTANAS.findIndex((p) => p.id === vista)
    let j
    if (e.key === 'ArrowRight') j = (i + 1) % PESTANAS.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + PESTANAS.length) % PESTANAS.length
    else return
    e.preventDefault()
    onVista(PESTANAS[j].id)
    e.currentTarget.parentElement.children[j]?.focus()
  }

  const activa = PESTANAS.find((p) => p.id === vista) ?? PESTANAS[0]

  return (
    <dialog
      className="vista-google"
      ref={ref}
      aria-labelledby="vista-google-titulo"
      // Escape, el fondo y la × terminan todos aqui, por el `close` nativo.
      onClose={onCerrar}
      // Un clic en el ::backdrop tiene como target el propio <dialog>; la caja
      // ocupa todo el dialogo, asi que un clic dentro nunca lo es.
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {abierta && (
        <div className="vista-google-caja">
          <header>
            <h2 id="vista-google-titulo">Vista del punto</h2>
            {/* Sin la coordenada: con punto decimal romperia el es-CL del
                visor, y con coma decimal «-37,4693, -72,3539» se lee como
                cuatro numeros. */}
            {titulo && <p className="vista-google-sub">{titulo}</p>}
            {/* close() y no onCerrar: el navegador solo devuelve el foco al
                boton de la ficha si el foco sigue DENTRO del dialogo al
                cerrarse. Limpiar antes el estado desmontaria esta ×, que es la
                que tiene el foco, y el foco caeria en <body>. */}
            <button
              type="button"
              className="vista-google-cerrar"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar vista"
            >
              ×
            </button>
          </header>

          <div className="vista-google-pestanas" role="tablist" aria-label="Tipo de vista">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`vista-google-pestana-${p.id}`}
                data-vista={p.id}
                aria-selected={p.id === vista}
                aria-controls="vista-google-marco"
                tabIndex={p.id === vista ? 0 : -1}
                className="vista-google-pestana"
                onClick={() => onVista(p.id)}
                onKeyDown={alTeclado}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {/* EL AVISO VA ANTES DEL RECUADRO, no debajo: lo normal es que no
              haya imagenes --el embed no busca el panorama mas cercano, exige
              que este pegado al punto-- y debajo se lee despues de mirar el
              negro, cuando ya parece que el visor falla. */}
          {vista === 'streetview' && (
            <p className="vista-google-nota">
              Street View solo muestra imágenes si el punto está junto a una calle o camino
              recorrido por Google. Si no hay,{' '}
              <a href={urlMapsPano(coord)} target="_blank" rel="noopener noreferrer">
                buscar alrededor en Google Maps ↗
              </a>
              .
            </p>
          )}

          <div
            className="vista-google-marco"
            id="vista-google-marco"
            role="tabpanel"
            aria-labelledby={`vista-google-pestana-${activa.id}`}
          >
            {/* key por pestana: un iframe nuevo en cada cambio. Cambiar el src
                del mismo iframe apila entradas en el historial, y «Atras»
                moveria el iframe en vez de salir de la pagina.
                referrerPolicy no-referrer: Google recibe la coordenada que el
                usuario pidio ver, pero no la direccion del visor. */}
            <iframe
              key={activa.id}
              title={activa.titulo}
              src={vista === 'streetview' ? urlStreetView(coord) : urlSatelite(coord)}
              referrerPolicy="no-referrer"
              allowFullScreen
            />
          </div>

          <p className="vista-google-pie">
            <a href={urlEarth(coord)} target="_blank" rel="noopener noreferrer">
              Abrir en Google Earth ↗
            </a>
          </p>
        </div>
      )}
    </dialog>
  )
}
