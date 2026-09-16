import { useEffect, useRef, useState } from 'react'
import { flush } from '../urlState'
import { BotonControl, ModalFiltro } from './GrupoFiltro'
import { ModalCapas, ModalMapaBase, ModalTerritorio } from './ControlesPanel'
import { ModalCompartir, ModalDescargas, ModalInformacion } from './ModalesPanel'
import {
  CAPAS,
  COLOR_CAUSA,
  COLOR_OECV,
  COLOR_RUTA,
  COLOR_REDVIAL,
  COLOR_STANDBY,
  FILTROS,
  NO_ACTIVOS,
  UNIDAD_CAPA,
  fechaLarga,
  fmt,
  temporadasIncendios,
} from '../config'

/** Los filtros que forman el territorio: van juntos en su propio botón. */
const TERRITORIO = ['region', 'provincia', 'comuna']

/** Rótulo corto para el botón; el largo sigue siendo el título del modal. */
const CORTO = {
  temporada: 'Temporada',
  causa_grupo: 'Grupo de causa',
  causa_general: 'Causa general',
  tipo: 'Titularidad',
  inst: 'Institución',
  carpeta: 'Carpeta',
}

function Chip({ color }) {
  return <span className="chip" style={{ background: color }} />
}

/**
 * Panel de control de la vista de incendios.
 *
 * TODO CONTROL ES UN BOTÓN QUE ABRE UN MODAL (F2, DECISIONES.md §W). Antes
 * había tres formas distintas de elegir en el mismo panel --<select> para los
 * filtros y el fondo, casillas para las capas--, y las 332 comunas del filtro
 * de territorio no caben en un desplegable nativo, que además tapa el mapa
 * entero en un teléfono.
 *
 * LO QUE SIGUE A LA VISTA, y no es negociable: el aviso de que estos incendios
 * NO están activos (`DECISIONES.md` §O, vigilado por B28) y la leyenda, porque
 * el color es la única codificación de la causa y de la titularidad (§R). Lo
 * accesorio --fuentes, procedencia y notas de detalle-- se fue al modal de
 * Información (decisión de Luis, 2026-09-16).
 *
 * Orden: primero el ÁMBITO, que es lo primero que busca cualquiera que abre el
 * visor («¿y mi región?»); después los filtros y el mapa; y al fondo los tres
 * botones que sacan algo fuera.
 */
export default function PanelLateral({
  manifest,
  capasActivas,
  onToggleCapa,
  filtros,
  opciones,
  comunaIncendios,
  onFiltro,
  onLimpiar,
  cuentas,
  cargando,
  errores,
  onReintentar,
  onEncuadrarRegion,
  base,
  onBase,
  basemaps,
  imagen,
  abierto,
  onCerrar,
  children,
}) {
  const capasMan = manifest?.capas ?? {}
  const fecha = fechaLarga(manifest?.generado)
  const temps = temporadasIncendios(manifest)
  const [abierta, setAbierta] = useState(null)
  const [aviso, setAviso] = useState('')
  const [urlManual, setUrlManual] = useState('')

  // La comuna elegida puede venir de la vista de riesgo como código CUT. Si no
  // tiene equivalencia en el vocabulario de los incendios, el filtro NO se
  // aplica (App.jsx) y hay que DECIRLO: con el aviso callado, el panel mostraría
  // «Todas» mientras el enlace lleva una comuna, y nadie sabría cuál manda.
  const comunaSinEquivalencia = Boolean(filtros.comuna) && !comunaIncendios

  // El <dialog> devuelve el foco solo, pero aquí el modal se DESMONTA al
  // cerrarse --para no tener doce listas montadas-- y entonces el foco cae al
  // body. Se le devuelve al botón que lo abrió.
  const aEnfocar = useRef(null)
  useEffect(() => {
    if (abierta !== null || !aEnfocar.current) return
    const col = aEnfocar.current
    aEnfocar.current = null
    document.querySelector(`.grupo-filtro[data-col="${col}"]`)?.focus()
  }, [abierta])

  const cerrarModal = () => {
    aEnfocar.current = abierta
    setAbierta(null)
  }

  // Al abrir el cajón, el foco entra en su encabezado: si no, se queda en el
  // botón de fuera y el lector de pantalla no anuncia nada de lo que se acaba de
  // abrir. Se salta el primer render: anclado, el panel nace visible y el foco
  // saltaría a su encabezado nada más cargar, robándoselo a quien no pidió nada.
  const cabecera = useRef(null)
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) {
      montado.current = true
      return
    }
    if (abierto) cabecera.current?.focus()
  }, [abierto])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2000)
    return () => clearTimeout(t)
  }, [aviso])

  const compartir = async () => {
    // Primero flush: la URL se escribe con 250 ms de retraso, así que sin esto
    // pulsar el botón justo después de mover el mapa copia el encuadre ANTERIOR.
    flush()
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch {
        // Cancelado por el usuario o rechazado por el navegador: se sigue por el
        // portapapeles en vez de dejarlo sin nada.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setAviso('Enlace copiado')
    } catch {
      // Sin permiso de portapapeles: se muestra el enlace ya seleccionado para
      // copiarlo a mano, que es el único camino que no depende de ninguna API.
      setUrlManual(url)
    }
  }

  // El territorio se rotula ENTERO en el botón: es lo que decide de qué
  // territorio son todas las cifras del visor, y eso no puede vivir sólo dentro
  // de un modal cerrado.
  const territorio =
    [filtros.region, filtros.provincia, comunaIncendios].filter(Boolean).join(' › ') || ''
  const hayTerritorio = Boolean(filtros.region || filtros.provincia || filtros.comuna)
  const filtrosVisibles = FILTROS.filter((f) => !TERRITORIO.includes(f.campo) && opciones?.has(f.campo))
  const activos = Object.entries(filtros).filter(([c, v]) => v && !TERRITORIO.includes(c)).length
  const puestos = Object.values(filtros).filter(Boolean).length
  const datosAbierta = opciones?.get(abierta)

  return (
    <aside id="panel-control" className={`panel${abierto ? ' abierto' : ''}`} aria-label="Control">
      <header>
        {/* tabIndex -1: no entra en el orden de tabulación, pero se puede
            enfocar por código al abrir el cajón, que es como el lector de
            pantalla se entera de dónde acaba de llegar. */}
        <h1 ref={cabecera} tabIndex={-1}>
          Prevención de Incendios Forestales
        </h1>
        {/* «Programa de prevención» y no «Temporada»: lo que dura una temporada
            es el PROGRAMA de obras; la capa de incendios cubre todas las
            temporadas investigadas. La guarda `fecha &&` no es opcional: sin
            ella el panel dice «datos al null» mientras no llega el manifest. */}
        <p className="sub">
          Programa de prevención 2025-2026
          {fecha && (
            <>
              {' · '}
              <span className="fecha" title={`Generado por el ETL el ${fecha}`}>
                datos al {fecha}
              </span>
            </>
          )}
        </p>
        {/* Copia canónica en config.js: la misma frase la dicen el cartel sobre
            el mapa y el aviso de descarga. Ver el comentario de NO_ACTIVOS. */}
        <p className="aviso">
          {NO_ACTIVOS}: cada punto es un incendio que ya ocurrió y fue investigado después
          {temps && ` (temporadas ${temps.primera} a ${temps.ultima})`}.
        </p>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </header>

      <section>
        <h2>Ámbito</h2>
        <div className="filtro-botonera una">
          <BotonControl
            col="territorio"
            corto="Territorio"
            valor={territorio || 'Todo Chile'}
            total={opciones?.get('region')?.opciones.length ?? null}
            activo={hayTerritorio}
            onAbrir={setAbierta}
            titulo={hayTerritorio ? `Ámbito actual: ${territorio}` : 'Todo Chile'}
          />
        </div>
        {comunaSinEquivalencia && (
          <p className="aviso">
            La comuna «{filtros.comuna}» no aparece con ese nombre en los incendios investigados,
            así que ese filtro no se está aplicando.
          </p>
        )}
      </section>

      <section className="seccion-filtros">
        <h2>
          Filtros
          {activos > 0 && <span className="cuenta-filtros">{activos}</span>}
        </h2>
        <div className="filtro-botonera">
          {filtrosVisibles.map((f) => {
            const datos = opciones.get(f.campo)
            const unidad = UNIDAD_CAPA[datos.capa]
            const valor = filtros[f.campo] ?? ''
            return (
              <BotonControl
                key={f.campo}
                col={f.campo}
                corto={CORTO[f.campo] ?? f.etiqueta}
                valor={valor}
                total={datos.opciones.length}
                activo={Boolean(valor)}
                onAbrir={setAbierta}
                titulo={
                  valor
                    ? `${f.etiqueta}: ${valor}`
                    : `${fmt.format(datos.opciones.length)} para elegir en ${f.etiqueta}, contadas en ${unidad[1]}`
                }
              />
            )
          })}
        </div>
        {puestos > 0 && (
          <button className="limpiar" onClick={onLimpiar}>
            Quitar {puestos === 1 ? 'el filtro' : `los ${puestos} filtros`}
          </button>
        )}
      </section>

      <section>
        <h2>Mapa</h2>
        <div className="filtro-botonera">
          <BotonControl
            col="capas"
            corto="Capas"
            valor={`${capasActivas.length} encendidas`}
            total={CAPAS.filter((c) => capasMan[c.id]).length}
            activo={capasActivas.length > 0}
            onAbrir={setAbierta}
            titulo="Qué capas se dibujan en el mapa"
          />
          <BotonControl
            col="base"
            corto="Mapa base"
            valor={base}
            total={Object.keys(basemaps ?? {}).length}
            onAbrir={setAbierta}
            titulo={`Fondo actual: ${base}`}
          />
        </div>
      </section>

      {/* La leyenda SE QUEDA a la vista: aquí el color es la única codificación
          de la causa y de la titularidad, y esconderla dejaría el mapa sin nada
          que lo nombre (DECISIONES.md §R). */}
      <section>
        <h2>Leyenda</h2>
        {capasActivas.includes('incendios') && (
          <>
            <h3>Grupo de causa</h3>
            {Object.entries(COLOR_CAUSA).map(([k, v]) => (
              <div key={k} className="leyenda">
                <Chip color={v} /> {k}
              </div>
            ))}
          </>
        )}
        {capasActivas.includes('oecv') && (
          <>
            {/* «del terreno» lo respalda config.js: la simbología oficial del
                Memo N 3045/2025 es por titularidad del TERRENO, no de la obra. */}
            <h3>OECV · titularidad del terreno</h3>
            {Object.entries(COLOR_OECV).map(([k, v]) => (
              <div key={k} className="leyenda">
                <Chip color={v} /> {k}
              </div>
            ))}
          </>
        )}
        {capasActivas.includes('puntos_standby') && (
          <div className="leyenda">
            <Chip color={COLOR_STANDBY} /> Punto stand-by (espera de brigada)
          </div>
        )}
        {capasActivas.includes('rutas') && (
          <div className="leyenda">
            <Chip color={COLOR_RUTA} /> Ruta de despliegue
          </div>
        )}
        {capasActivas.includes('redvial') && (
          <div className="leyenda">
            <Chip color={COLOR_REDVIAL} /> Red vial MOP
          </div>
        )}
      </section>

      {/* LOS TRES QUE SACAN ALGO FUERA, al fondo y con la misma forma que el
          resto: antes eran dos secciones con su prosa y un pie de tres párrafos. */}
      <section>
        <div className="filtro-botonera tres">
          <BotonControl
            col="info"
            corto="Información"
            total={null}
            onAbrir={setAbierta}
            titulo="Qué muestra este visor, fuentes y procedencia"
          />
          <BotonControl
            col="descargas"
            corto="Descargar"
            total={null}
            onAbrir={setAbierta}
            titulo="CSV, GeoJSON, imagen del mapa e informe en PDF"
          />
          <BotonControl
            col="compartir"
            corto="Compartir"
            total={null}
            onAbrir={setAbierta}
            titulo="El enlace de esta vista exacta"
          />
        </div>
      </section>

      {/* UN SOLO modal a la vez, y montado sólo cuando hay uno abierto. Con
          `key` para que cada control estrene su estado. */}
      {abierta === 'territorio' && (
        <ModalTerritorio
          opciones={opciones}
          filtros={filtros}
          comunaIncendios={comunaIncendios}
          comunaSinEquivalencia={comunaSinEquivalencia}
          onFiltro={onFiltro}
          onEncuadrarRegion={onEncuadrarRegion}
          onCerrar={cerrarModal}
        />
      )}
      {datosAbierta && !TERRITORIO.includes(abierta) && (
        <ModalFiltro
          key={abierta}
          campo={abierta}
          etiqueta={FILTROS.find((f) => f.campo === abierta)?.etiqueta ?? abierta}
          opciones={datosAbierta.opciones}
          unidad={UNIDAD_CAPA[datosAbierta.capa]}
          valor={filtros[abierta] ?? ''}
          cascada={datosAbierta.cascada}
          onElegir={onFiltro}
          onCerrar={cerrarModal}
        />
      )}
      {abierta === 'capas' && (
        <ModalCapas
          capasMan={capasMan}
          capasActivas={capasActivas}
          cuentas={cuentas}
          cargando={cargando}
          errores={errores}
          onToggle={onToggleCapa}
          onReintentar={onReintentar}
          onCerrar={cerrarModal}
        />
      )}
      {abierta === 'base' && (
        <ModalMapaBase
          basemaps={basemaps}
          base={base}
          onBase={onBase}
          imagen={imagen}
          onCerrar={cerrarModal}
        />
      )}
      {abierta === 'info' && <ModalInformacion manifest={manifest} onCerrar={cerrarModal} />}
      {/* La sección de descargas llega como children y no como diez props más:
          necesita las features cargadas, los predicados de filtro, el mapa y el
          basemap, y todo eso ya vive en App. */}
      {abierta === 'descargas' && <ModalDescargas onCerrar={cerrarModal}>{children}</ModalDescargas>}
      {abierta === 'compartir' && (
        <ModalCompartir
          aviso={aviso}
          urlManual={urlManual}
          onCompartir={compartir}
          onCerrar={cerrarModal}
        />
      )}
    </aside>
  )
}
