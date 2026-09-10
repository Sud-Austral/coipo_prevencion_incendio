/**
 * Barra de vistas: «Incendios» y «Priorizacion».
 *
 * VIVE DENTRO DE <header class="banner"> Y NO ES UN ITEM DE LA REJILLA, igual
 * que .cartel y .descargando son fixed por la misma razon. Un cuarto hijo en
 * flujo de .app crearia una fila implicita que empujaria el mapa hacia abajo, y
 * hay DOS aserciones que miden exactamente eso: A7 de verify-banner y B2 de
 * verify-panel comprueban |mapa.top - banner.alto| <= 1, en 3 y 10 anchos. Al
 * ir dentro del <header>, banner.alto ya la incluye y las dos siguen verdes.
 *
 * EL FONDO NO PUEDE SER EL VERDE INSTITUCIONAL. A1 y A2 no miden el DOM: barren
 * los pixeles del PNG capturado para hallar donde termina la banda verde. Una
 * barra de #064928 pegada bajo la imagen alargaria esa banda y las pondria
 * rojas. Por eso usa --panel, que ademas la separa visualmente del membrete.
 *
 * VISTAS vive en config.js, junto a BASEMAPS y por la misma razon: sus claves
 * son contrato publico --el valor de ?vista= en la URL-- y ademas este archivo
 * solo puede exportar componentes (regla react/only-export-components).
 */
import { VISTAS } from '../config'

export default function Pestanas({ vista, onVista }) {
  // Flechas para moverse entre pestanas: es lo que el patron de tablist exige y
  // lo que un lector de pantalla anuncia. Sin esto la barra es navegable por
  // tabulacion pero no se comporta como las pestanas que dice ser.
  const alTeclado = (e) => {
    const i = VISTAS.findIndex((v) => v.id === vista)
    if (e.key === 'ArrowRight') onVista(VISTAS[(i + 1) % VISTAS.length].id)
    else if (e.key === 'ArrowLeft') onVista(VISTAS[(i - 1 + VISTAS.length) % VISTAS.length].id)
    else return
    e.preventDefault()
  }

  return (
    <div className="pestanas" role="tablist" aria-label="Vistas del visor">
      {VISTAS.map((v) => {
        const activa = v.id === vista
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`pestana-${v.id}`}
            aria-selected={activa}
            aria-controls="vista-activa"
            // Solo la pestana activa entra en el orden de tabulacion; entre
            // ellas se navega con las flechas.
            tabIndex={activa ? 0 : -1}
            className={activa ? 'pestana activa' : 'pestana'}
            onClick={() => onVista(v.id)}
            onKeyDown={alTeclado}
          >
            {v.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
