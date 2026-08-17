import { useEffect, useRef, useState } from 'react'
import { flush } from '../urlState'
import {
  AVISO_CIVICO,
  CAPAS,
  CONTACTO,
  COLOR_CAUSA,
  COLOR_OECV,
  COLOR_RUTA,
  COLOR_REDVIAL,
  COLOR_STANDBY,
  FILTROS,
  NO_ACTIVOS,
  fechaLarga,
  fmt,
  fmt1,
  temporadasIncendios,
} from '../config'

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

// Marcas diacriticas combinantes (U+0300..U+036F), las que deja sueltas
// normalize('NFD'). Se construye desde una CADENA y no como literal de regex
// para que el rango viaje en ASCII puro: escrito como literal, el archivo acaba
// guardando los combinantes de verdad, que son invisibles al revisar el diff y
// los destruye cualquier herramienta que normalice el fuente.
const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g')

/**
 * Clave de ordenacion de regiones: sin diacriticos, sin el prefijo "Region de/
 * del" y sin el articulo inicial. Solo ORDENA -- la opcion siempre muestra la
 * etiqueta original que viene del manifest.
 * Sin quitar el articulo, "La Araucania", "Los Lagos" y "Los Rios" se agrupan
 * bajo L; sin quitar los diacriticos, "Nuble" y "O'Higgins" caen fuera de sitio
 * en un localeCompare ingenuo.
 */
const claveRegion = (s) =>
  s
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/^regi[oó]n\s+(de[l]?\s+)?/i, '')
    .replace(/^(la|las|los|el)\s+/i, '')

function Chip({ color }) {
  return <span className="chip" style={{ background: color }} />
}

/**
 * Fecha de captura de la imagen satelital bajo el CENTRO de la vista.
 *
 * Los cuatro estados se dicen, ninguno se calla. Que la respuesta valga solo
 * para el centro no es un detalle menor y va escrito: World Imagery es un
 * mosaico de miles de escenas de fechas distintas, asi que una sola fecha para
 * toda la pantalla seria falsa.
 */
function FechaImagen({ info }) {
  if (info.estado === 'cargando') {
    return <p className="nota">Consultando la fecha de la imagen…</p>
  }
  if (info.estado === 'error') {
    return <p className="nota">No se pudo consultar la fecha de la imagen.</p>
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

export default function PanelLateral({
  manifest,
  capasActivas,
  onToggleCapa,
  filtros,
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
}) {
  const capasMan = manifest?.capas ?? {}
  const fecha = fechaLarga(manifest?.generado)
  const temps = temporadasIncendios(manifest)

  // Las opciones de cada filtro salen del manifest: el frontend no hardcodea
  // ninguna temporada, region ni causa. Si el ETL ve una temporada nueva,
  // aparece sola aqui.
  const opcionesDe = (campo) => {
    const vistos = new Map()
    for (const capaId of Object.keys(capasMan)) {
      const dom = capasMan[capaId]?.dominios?.[campo]
      if (!dom) continue
      for (const { v, n } of dom) vistos.set(v, (vistos.get(v) ?? 0) + n)
    }
    // Las regiones se ordenan alfabeticamente y el resto por frecuencia. Nadie
    // busca su region por cuantos incendios tuvo: con el orden por cuenta, la
    // lista empezaba en La Araucania, Biobio, Maule… y encontrar la propia
    // exigia leerlas todas.
    return [...vistos.entries()].sort(
      campo === 'region'
        ? (a, b) => claveRegion(a[0]).localeCompare(claveRegion(b[0]), 'es')
        : (a, b) => b[1] - a[1],
    )
  }

  const filtrosVisibles = FILTROS.filter((f) => f.capas.some((c) => capasActivas.includes(c)))
  const hayFiltros = Object.values(filtros).some(Boolean)
  const fuentes = Object.values(capasMan)
    .map((m) => m?.titulo)
    .filter(Boolean)
  const hayPorTramos = CAPAS.some((c) => capasMan[c.id]?.carga === 'demanda')

  // Compartir la vista. El visor guarda capas, filtros y encuadre en la URL
  // desde el principio --urlState.js existe para que "un jefe provincial mande
  // mira esto"--, pero no habia UN SOLO enlace, boton ni mencion en toda la
  // interfaz, asi que nadie fuera del equipo podia saberlo.
  const [aviso, setAviso] = useState('')
  const [urlManual, setUrlManual] = useState('')

  // Al abrir el cajon, el foco entra en su encabezado: si no, se queda en el
  // boton de fuera y el lector de pantalla no anuncia nada de lo que se acaba
  // de abrir. Solo al abrir -- devolverlo al cerrar es cosa de App, que es
  // quien tiene la referencia al boton.
  const cabecera = useRef(null)
  useEffect(() => {
    if (abierto) cabecera.current?.focus()
  }, [abierto])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2000)
    return () => clearTimeout(t)
  }, [aviso])

  const compartir = async () => {
    // Primero flush: la URL se escribe con 250 ms de retraso, asi que sin esto
    // pulsar el boton justo despues de mover el mapa copia el encuadre ANTERIOR.
    flush()
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch {
        // Cancelado por el usuario o rechazado por el navegador: se sigue por
        // el portapapeles en vez de dejarlo sin nada.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setAviso('Enlace copiado')
    } catch {
      // Sin permiso de portapapeles: se muestra el enlace ya seleccionado para
      // copiarlo a mano, que es el unico camino que no depende de ninguna API.
      setUrlManual(url)
    }
  }

  return (
    <aside id="panel-control" className={`panel${abierto ? ' abierto' : ''}`}>
      <header>
        {/* tabIndex -1: no entra en el orden de tabulacion, pero se puede
            enfocar por codigo al abrir el cajon, que es como el lector de
            pantalla se entera de donde acaba de llegar. */}
        <h1 ref={cabecera} tabIndex={-1}>
          Prevención de Incendios Forestales
        </h1>
        {/* Sin "CONAF ·": el banner de arriba ya lo dice, y repetirlo a 12 px
            bajo la marca institucional es ruido (§7.3 del prompt del insumo).
            La fecha va AQUI y no solo en el pie: el panel scrollea, y el pie
            queda fuera de pantalla en cuanto hay capas y filtros: preguntarse
            de cuando son los datos es lo primero que hace quien abre el visor. */}
        {/* "Programa de prevencion" y no "Temporada": lo que dura una temporada
            es el PROGRAMA de obras: la capa de incendios cubre todas las
            temporadas investigadas, asi que anunciar una sola era falso
            respecto de lo que se ve en el mapa. El rango real va en el aviso
            de abajo, dentro de la frase de los incendios, porque solo aplica a
            esa capa: OECV es una foto de 2025-2026 y stand-by un registro
            puntual. La guarda `fecha &&` no es opcional: sin ella el pie dice
            "datos al null" mientras no ha llegado el manifest. */}
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
        {/* Copia canonica en config.js: la misma frase la dicen el cartel sobre
            el mapa y el aviso de descarga. Ver el comentario de NO_ACTIVOS. */}
        <p className="aviso">
          {NO_ACTIVOS}: cada punto es un incendio que ya ocurrió y fue investigado después
          {temps && ` (temporadas ${temps.primera} a ${temps.ultima})`}.
        </p>
        {AVISO_CIVICO && <p className="aviso">{AVISO_CIVICO}</p>}
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </header>

      {/* Filtros ANTES que Capas, al reves que hasta ahora. Las descripciones
          por capa engordan la seccion de abajo de ~150 a ~295 px, y con el
          orden anterior el desplegable de region --lo primero que busca
          cualquiera-- quedaba media pantalla mas abajo en un panel de 320 px
          que ya scrollea. */}
      <section>
        <h2>Filtros</h2>
        {filtrosVisibles.map((f) => {
          const ops = opcionesDe(f.campo)
          if (!ops.length) return null
          return (
            <div key={f.campo}>
              <label className="fila-filtro">
                <span>{f.etiqueta}</span>
                <select
                  value={filtros[f.campo] ?? ''}
                  onChange={(e) => onFiltro(f.campo, e.target.value)}
                >
                  <option value="">Todas</option>
                  {ops.map(([v, n]) => (
                    <option key={v} value={v}>
                      {v} ({fmt.format(n)})
                    </option>
                  ))}
                </select>
              </label>
              {/* Salida explicita para recentrar. El cambio de region ya encuadra
                  solo, pero hay tres casos en que no puede: un enlace que trae
                  su propio lat/lon (se respeta a proposito), reelegir la misma
                  region --el <select> no emite change al reelegir la opcion ya
                  seleccionada-- y haber alejado el mapa a mano. Va FUERA del
                  <label>: dentro, cualquier clic sobre el abriria el desplegable. */}
              {f.campo === 'region' && filtros.region && (
                <button className="centrar" onClick={() => onEncuadrarRegion?.(filtros.region)}>
                  Centrar el mapa en {filtros.region}
                </button>
              )}
            </div>
          )
        })}
        <button className="limpiar" onClick={onLimpiar} disabled={!hayFiltros}>
          Limpiar filtros
        </button>
      </section>

      {/* Justo DESPUES de los filtros y no bajo el encabezado: compartir es lo
          que se hace despues de armar una vista, y colocarlo mas arriba volveria
          a empujar el desplegable de region fuera de pantalla, que es justo lo
          que este orden de secciones acaba de arreglar. */}
      <section>
        <h2>Compartir</h2>
        <button className="compartir" onClick={compartir}>
          Compartir esta vista
        </button>
        {/* Esta frase no es opcional: un enlace con ?region= entrega un panel
            con cifras REGIONALES, y sin avisarlo se citan como nacionales. */}
        <p className="nota">El enlace guarda las capas, los filtros y el encuadre actuales.</p>
        {urlManual && (
          <input
            className="url-manual"
            readOnly
            value={urlManual}
            onFocus={(e) => e.target.select()}
            ref={(el) => el?.select()}
            aria-label="Enlace de esta vista, para copiar"
          />
        )}
        <span className="aviso-copia" aria-live="polite">
          {aviso}
        </span>
      </section>

      <section>
        <h2>Capas</h2>
        {CAPAS.map((c) => {
          const meta = capasMan[c.id]
          if (!meta) return null
          const activa = capasActivas.includes(c.id)
          const fallo = errores?.[c.id]
          return (
            <div key={c.id}>
              <label className="fila-capa">
                <input type="checkbox" checked={activa} onChange={() => onToggleCapa(c.id)} />
                {/* La descripcion se ENVUELVE en vez de recortarse con elipsis
                    y title: el destinatario esta en un telefono y ahi no hay
                    hover, asi que una linea cortada con el texto completo
                    escondido en un atributo no se lo entrega a nadie. El panel
                    scrollea en vertical, que es la direccion barata. */}
                <span className="capa-txt">
                  <span className="etq">{c.etiqueta}</span>
                  {c.descripcion && <span className="capa-desc">{c.descripcion}</span>}
                </span>
                {/* «por tramos» y NO los bytes cuando la capa se sirve por
                    teselas. Era la unica etiqueta permanentemente falsa del
                    panel: rutas y red vial vienen apagadas y CapaTiles nunca
                    llama a onCuenta, asi que su «17.9 MB» no lo reemplazaba
                    jamas ningun numero -- cuando lo que se descarga al
                    encenderlas son unos 300 KB por rango HTTP. Decirle «17.9
                    MB» a alguien con plan de datos es equivocarse por ~60 veces,
                    y siempre en contra de encender la capa barata.
                    `carga` sale del manifest (ETL/build_rutas.py y
                    build_redvial.py lo emiten como 'demanda'). */}
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
              {/* El boton va FUERA del <label> a proposito: dentro, cualquier
                  clic sobre el activaria ademas la casilla y apagaria la capa
                  que se intenta recuperar. */}
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
        {/* Como TEXTO y no en un title: quien tiene que decidir si gasta datos
            moviles esta en un telefono, y ahi no hay hover. */}
        {hayPorTramos && (
          <p className="nota">
            Las capas «por tramos» descargan solo el trozo de mapa que estás mirando (unos 300 KB),
            no el archivo completo.
          </p>
        )}
      </section>

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
            {/* "del terreno" lo respalda config.js: la simbologia oficial del
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

      {/* El resumen OECV vivia aqui y se movio a PanelIndicadores, donde esta
          desglosado por region y por kilometros faltantes. Tenerlo en los dos
          paneles era el mismo dato en dos sitios que pueden divergir. */}

      <section>
        <h2>Mapa base</h2>
        <select value={base} onChange={(e) => onBase(e.target.value)}>
          {Object.keys(basemaps).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {imagen && <FechaImagen info={imagen} />}
      </section>

      {/* Procedencia. Antes decia «Datos generados desde INSUMO_INCENDIO», que
          es el nombre de una CARPETA del repositorio: no le dice nada a nadie
          de fuera y presenta un detalle interno como si fuera la fuente.
          Los titulos NO se escriben a mano: salen del manifest, que ya trae
          «Incendios investigados (UAD)», «OECV — Obras de Eliminacion de
          Combustible Vegetal», «Red vial MOP 2024»… Asi se cumple la regla de
          no hardcodear nada del dominio y desaparece de paso cualquier
          temporada escrita a mano.
          La fecha NO se repite: ya esta en el encabezado a proposito, y el
          mismo dato en dos sitios es el mismo dato que puede divergir. */}
      <footer>
        {/* En el ENCABEZADO se decidio no repetir «CONAF ·» porque el banner ya
            lo dice. En el pie si corresponde: el banner es una imagen, y si no
            carga no queda ni una atribucion en texto en toda la pagina. */}
        <p className="procedencia">Publica: CONAF · Unidad de Información y Análisis</p>
        {fuentes.length > 0 && <p className="procedencia">Fuentes: {fuentes.join(' · ')}</p>}
        {CONTACTO && <p className="procedencia">{CONTACTO}</p>}
      </footer>
    </aside>
  )
}
