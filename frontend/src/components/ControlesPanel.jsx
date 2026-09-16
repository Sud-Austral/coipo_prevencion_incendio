import FechaImagen from './FechaImagen'
import { CajaModal, Opcion } from './GrupoFiltro'
import { CAPAS, UNIDAD_CAPA, fmt } from '../config'

/**
 * Los controles del panel que no son una dimensión temática: el territorio, las
 * capas y el mapa base. Viven aquí y no en PanelLateral porque son listas con
 * su propia lógica, y ese archivo es el índice del panel.
 *
 * Origen del continente: coipo_vista_catastro@a1ee125
 * frontend/src/components/ControlesPanel.jsx. El contenido es otro: allá el
 * territorio recorta un catastro por superficie y aquí recorta incendios,
 * obras, puntos y tramos, cada uno con su unidad.
 */

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

/**
 * Territorio: Región › Provincia › Comuna, los tres niveles a la vez y
 * encadenados.
 *
 * UN SOLO BOTÓN Y UN SOLO MODAL para los tres, y no tres botones: con tres, dos
 * quedarían inertes mientras no hubiera región elegida. Aquí los niveles
 * inferiores no existen hasta que tienen sentido, que es lo que hacía la
 * cascada de los <select> que había antes.
 *
 * PROVINCIA Y COMUNA SÓLO RECORTAN INCENDIOS: es la única capa que las trae
 * (OECV y stand-by publican región y nada más), así que sólo aparecen cuando esa
 * capa está encendida. Región, en cambio, recorta todas.
 */
export function ModalTerritorio({
  opciones,
  filtros,
  comunaIncendios,
  comunaSinEquivalencia,
  onFiltro,
  onEncuadrarRegion,
  onCerrar,
}) {
  const nivel = (campo, titulo, valor) => {
    const datos = opciones.get(campo)
    if (!datos) return null
    const unidad = UNIDAD_CAPA[datos.capa]
    return (
      <div className="mf-nivel" key={campo}>
        <h3>{titulo}</h3>
        <ul className="gf-lista">
          <Opcion
            nombre={`territorio-${campo}`}
            marcada={!valor}
            onElegir={() => onFiltro(campo, '')}
            etiqueta={campo === 'region' ? 'Todo Chile' : 'Todas'}
            cifra=""
          />
          {datos.opciones.map((o) => (
            <Opcion
              key={o.v}
              nombre={`territorio-${campo}`}
              marcada={valor === o.v}
              onElegir={() => onFiltro(campo, o.v)}
              etiqueta={o.v}
              cifra={`${fmt.format(o.n)} ${unidad[o.n === 1 ? 0 : 1]}`}
              vacia={o.n === 0}
            />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <CajaModal
      titulo="Territorio"
      cuenta={
        filtros.region
          ? 'Las cifras de todo el visor son de este territorio'
          : `${fmt.format(opciones.get('region')?.opciones.length ?? 0)} regiones · sin recorte`
      }
      etiquetaCerrar="Cerrar territorio"
      onCerrar={onCerrar}
      pie={
        filtros.region ? (
          <button type="button" className="limpiar" onClick={() => onFiltro('region', '')}>
            Volver a todo Chile
          </button>
        ) : null
      }
    >
      {/* La comuna elegida puede venir de la vista de riesgo como código CUT y
          no tener equivalencia en el vocabulario de los incendios: 10 de las 308
          se escriben distinto (DECISIONES.md §W). Se dice aquí y en el botón. */}
      {comunaSinEquivalencia && (
        <p className="aviso">
          La comuna «{filtros.comuna}» no aparece con ese nombre en los incendios investigados,
          así que ese filtro no se está aplicando.
        </p>
      )}
      {nivel('region', 'Región', filtros.region ?? '')}
      {filtros.region && nivel('provincia', 'Provincia', filtros.provincia ?? '')}
      {filtros.region && nivel('comuna', 'Comuna', comunaIncendios ?? '')}
      {/* Salida explícita para recentrar. El cambio de región ya encuadra solo,
          pero hay tres casos en que no puede: un enlace que trae su propio
          lat/lon (se respeta a propósito), reelegir la misma región y haber
          alejado el mapa a mano. */}
      {filtros.region && (
        <button type="button" className="centrar" onClick={() => onEncuadrarRegion?.(filtros.region)}>
          Centrar el mapa en {filtros.region}
        </button>
      )}
    </CajaModal>
  )
}

/** Las capas del mapa, con su peso, su cuenta y su error si lo hubo. */
export function ModalCapas({ capasMan, capasActivas, cuentas, cargando, errores, onToggle, onReintentar, onCerrar }) {
  const hayPorTramos = CAPAS.some((c) => capasMan[c.id]?.carga === 'demanda')
  return (
    <CajaModal
      titulo="Capas"
      cuenta={`${capasActivas.length} de ${CAPAS.filter((c) => capasMan[c.id]).length} encendidas`}
      etiquetaCerrar="Cerrar capas"
      onCerrar={onCerrar}
    >
      {CAPAS.map((c) => {
        const meta = capasMan[c.id]
        if (!meta) return null
        const activa = capasActivas.includes(c.id)
        const fallo = errores?.[c.id]
        return (
          <div key={c.id}>
            <label className="fila-capa">
              <input type="checkbox" checked={activa} onChange={() => onToggle(c.id)} />
              {/* La descripción se ENVUELVE en vez de recortarse con elipsis y
                  title: el destinatario está en un teléfono y ahí no hay hover. */}
              <span className="capa-txt">
                <span className="etq">{c.etiqueta}</span>
                {c.descripcion && <span className="capa-desc">{c.descripcion}</span>}
              </span>
              {/* «por tramos» y NO los bytes cuando la capa se sirve por teselas:
                  decirle «17,9 MB» a alguien con plan de datos es equivocarse por
                  ~60 veces, y siempre en contra de encender la capa barata. */}
              <span className="meta">
                {fallo ? (
                  'no se pudo cargar'
                ) : cargando[c.id] ? (
                  <em>cargando…</em>
                ) : activa && cuentas[c.id] != null ? (
                  fmt.format(cuentas[c.id])
                ) : meta.carga === 'demanda' ? (
                  'por tramos'
                ) : (
                  kb(meta.bytes ?? 0)
                )}
              </span>
            </label>
            {/* El botón va FUERA del <label> a propósito: dentro, cualquier clic
                sobre él activaría además la casilla y apagaría la capa que se
                intenta recuperar. */}
            {fallo && (
              <p className="capa-error">
                No llegaron los datos de esta capa.{' '}
                <button type="button" onClick={() => onReintentar?.(c.id)}>
                  Reintentar
                </button>
              </p>
            )}
          </div>
        )
      })}
      {hayPorTramos && (
        <p className="nota">
          Las capas «por tramos» descargan solo el trozo de mapa que estás mirando (unos 300 KB),
          no el archivo completo.
        </p>
      )}
    </CajaModal>
  )
}

/** El mapa base, con la fecha de la imagen satelital cuando la hay. */
export function ModalMapaBase({ basemaps, base, onBase, imagen, onCerrar }) {
  const claves = Object.keys(basemaps ?? {})
  return (
    <CajaModal
      titulo="Mapa base"
      cuenta={`${claves.length} fondos`}
      etiquetaCerrar="Cerrar mapa base"
      onCerrar={onCerrar}
    >
      <ul className="gf-lista">
        {claves.map((k) => (
          <Opcion
            key={k}
            nombre="mapa-base"
            marcada={base === k}
            onElegir={() => onBase(k)}
            etiqueta={k}
            cifra=""
          />
        ))}
      </ul>
      {imagen && <FechaImagen info={imagen} />}
    </CajaModal>
  )
}
