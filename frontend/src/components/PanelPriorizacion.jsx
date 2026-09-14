import { useRef, useState } from 'react'
import {
  csvInfraPuntos,
  csvPriorizacion,
  geojsonDe,
  guardar,
  nombreArchivo,
} from '../descargas'
import { capturarMapa, lienzoAPng } from '../mapaPNG'
import FechaImagen from './FechaImagen'
import {
  COLOR_CLASE,
  COLOR_FAMILIA,
  CORTES_CLASE,
  ORDEN_CLASE,
  RAMPA_NORMALIZADA,
  fmt,
} from '../config'

/**
 * Panel izquierdo de la vista de priorizacion.
 *
 * DOS LEYENDAS DISTINTAS Y NO UNA CON OTRO TITULO. Es la decision central de
 * esta pestaña: la escala absoluta y la comunal cuentan cosas que no se pueden
 * comparar entre si, y un usuario que confunda las dos concluira que una comuna
 * es tan prioritaria como otra porque las dos «tienen zonas rojas». Por eso el
 * modo relativo cambia de forma (rampa continua en vez de fichas discretas), de
 * familia de color (morado en vez de la secuencial naranja), rotula sus
 * extremos con el valor ABSOLUTO --nunca 0-100-- y lleva un distintivo.
 */

const rangoDeClase = (i) => {
  const lo = i === 0 ? null : CORTES_CLASE[i - 1]
  const hi = i === ORDEN_CLASE.length - 1 ? null : CORTES_CLASE[i]
  if (lo === null) return `< ${hi}`
  if (hi === null) return `≥ ${lo}`
  return `${lo} – ${hi}`
}

function Chip({ color }) {
  return <span className="chip" style={{ background: color }} />
}

export default function PanelPriorizacion({
  manifest,
  comuna,
  onComuna,
  onModo,
  opacidad,
  onOpacidad,
  // El modo activo se lee de `ctx.modo` y no de una prop aparte: contextoEscala
  // puede degradar a 'absoluta' por su cuenta (comuna sin registros), y con dos
  // fuentes la leyenda acabaria diciendo «relativo» sobre colores absolutos.
  ctx,
  familias,
  familiasActivas,
  onFamilia,
  cuentaAreas,
  cuentaPuntos,
  iconosLejos,
  cargando,
  error,
  onReintentar,
  onEncuadrar,
  abierto,
  onCerrar,
  datosAreas,
  datosPuntos,
  map,
  base,
  onBase,
  basemaps,
  imagen,
}) {
  const cabecera = useRef(null)
  const [estadoPng, setEstadoPng] = useState('')

  // El mismo predicado que filtra el mapa filtra el archivo: una sola regla, no
  // dos que puedan divergir.
  const pasa = comuna ? (p) => p.comuna === comuna : null
  // Miembro foráneo del GeoJSON: el archivo circula suelto y tiene que decir de
  // dónde salió y con qué recorte.
  const procedencia = {
    fuente: 'Modelo de priorización territorial CONAF',
    comuna: comuna || 'todas',
  }

  const bajar = (capa, datos, formato, csv) => {
    const r =
      formato === 'csv'
        ? csv(datos?.features, pasa)
        : geojsonDe(capa, datos?.features, pasa, { meta: procedencia })
    const nombre = nombreArchivo(capa, { comuna }, formato)
    guardar(nombre, r.texto, formato === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json')
    setEstadoPng(`${nombre} · ${r.n} registros`)
  }

  const bajarDatos = (f) => bajar('priorizacion', datosAreas, f, csvPriorizacion)
  const bajarPuntos = (f) => bajar('infraestructura', datosPuntos, f, csvInfraPuntos)
  const meta = manifest?.capas?.priorizacion
  const metaPuntos = manifest?.capas?.infra_puntos

  // Las comunas salen del manifest, NUNCA de una lista escrita aqui: si el ETL
  // incorpora una comuna nueva, aparece sola. Es la regla central del repo.
  const comunas = (meta?.dominios?.comuna ?? [])
    .slice()
    .sort((a, b) => a.v.localeCompare(b.v, 'es'))

  const normalizado = ctx?.modo === 'normalizada'

  return (
    <aside id="panel-control" className={`panel${abierto ? ' abierto' : ''}`}>
      <header>
        <h1 ref={cabecera} tabIndex={-1}>
          Áreas de priorización
        </h1>
        <p className="sub">
          Dónde concentrar la prevención, por riesgo, interfaz urbano-forestal e
          infraestructura crítica
        </p>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </header>

      {error && (
        <section>
          <p className="aviso">
            No se pudieron cargar las áreas priorizadas.{' '}
            <button className="centrar" onClick={onReintentar}>
              Reintentar
            </button>
          </p>
        </section>
      )}

      <section>
        <h2>Comuna</h2>
        <label className="fila-filtro">
          <span>Ver una comuna</span>
          <select value={comuna ?? ''} onChange={(e) => onComuna(e.target.value)}>
            <option value="">Todas</option>
            {comunas.map((c) => (
              <option key={c.v} value={c.v}>
                {c.v} ({fmt.format(c.n)})
              </option>
            ))}
          </select>
        </label>

        {comuna && (
          <button className="centrar" onClick={() => onEncuadrar(comuna)}>
            Centrar el mapa en {comuna}
          </button>
        )}

        {/* El boton solo existe con UNA comuna seleccionada. Sin esa condicion,
            el modo relativo podria coexistir con una vista multicomunal, que es
            exactamente donde comparar colores entre comunas engaña. */}
        {comuna ? (
          <button
            className={normalizado ? 'normalizar activo' : 'normalizar'}
            onClick={() => onModo(normalizado ? 'absoluta' : 'normalizada')}
            aria-pressed={normalizado}
          >
            {normalizado ? 'Volver a la escala del modelo' : `Normalizar dentro de ${comuna}`}
          </button>
        ) : (
          <p className="pista">
            Elige una comuna para poder comparar sus áreas entre sí.
          </p>
        )}
      </section>

      {/* Va en la sección de la leyenda, pegado a los colores que regula, y no
          en una sección propia: es un ajuste de UNA capa, no un modo del
          visor. La etiqueta nombra la capa —«manchas de priorización»— porque
          en esta vista hay dos capas encima del mapa y un rótulo genérico
          dejaría dudando de si también afecta a los iconos. */}
      <section>
        <h2>Leyenda</h2>

        <label className="fila-opacidad" htmlFor="opacidad-manchas">
          <span>Opacidad de las manchas</span>
          <output htmlFor="opacidad-manchas">{Math.round(opacidad * 100)} %</output>
        </label>
        <input
          id="opacidad-manchas"
          className="deslizador"
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(opacidad * 100)}
          // onChange y no onInput: en React onChange YA se dispara en cada
          // movimiento del pulgar para un input range, así que el mapa se
          // repinta mientras se arrastra, sin soltar.
          onChange={(e) => onOpacidad(Number(e.target.value) / 100)}
          aria-label="Opacidad de las manchas de priorización"
          aria-valuetext={`${Math.round(opacidad * 100)} por ciento`}
        />


        {!normalizado ? (
          <>
            <h3>Clase · escala del modelo</h3>
            {/* De mayor a menor: la leyenda se lee de arriba abajo y lo que
                importa --lo mas prioritario-- va primero. */}
            {ORDEN_CLASE.map((c, i) => [c, rangoDeClase(i)])
              .reverse()
              .map(([c, rango]) => (
                <div key={c} className="leyenda">
                  <Chip color={COLOR_CLASE[c]} /> {c}
                  <span className="leyenda-rango">{rango}</span>
                </div>
              ))}
            <p className="pista">Comparable entre comunas y entre corridas.</p>
          </>
        ) : (
          <>
            <h3>
              Contraste interno · {ctx.comuna}
              <span className="distintivo">RELATIVO</span>
            </h3>
            {ctx.uniforme ? (
              <p className="pista">
                {ctx.m === 1
                  ? 'Esta comuna tiene una sola área: no hay contraste interno que mostrar.'
                  : 'Todas las áreas de esta comuna tienen el mismo puntaje.'}
              </p>
            ) : (
              <>
                <div className="rampa" aria-hidden="true">
                  {RAMPA_NORMALIZADA.map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </div>
                {/* Los extremos con su valor ABSOLUTO, nunca 0-100: es lo que
                    impide leer «el maximo de Mulchen» como si fuera el mismo
                    nivel que «el maximo de Coyhaique». */}
                <div className="rampa-extremos">
                  <span>mín. {ctx.min.toFixed(4)}</span>
                  <span>máx. {ctx.max.toFixed(4)}</span>
                </div>
              </>
            )}
            <p className="pista">
              Los colores comparan sólo dentro de {ctx.comuna} ({fmt.format(ctx.m)} áreas).
            </p>
            <p className="pista">
              Escala por rango: el color indica posición relativa, no magnitud. El
              contorno mantiene la clase del modelo.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Infraestructura crítica</h2>
        {/* Sin este aviso, un mapa alejado sin iconos se lee como «la capa no
            cargó» en vez de «están, pero a esta escala se amontonan». */}
        {iconosLejos && (
          <p className="pista aviso-zoom">
            Acerca el mapa o elige una comuna para ver los elementos.
          </p>
        )}
        {familias.length === 0 && !cargando && (
          <p className="pista">No hay elementos para mostrar.</p>
        )}
        {familias.map((f) => (
          <label key={f.v} className="fila-capa">
            <input
              type="checkbox"
              checked={familiasActivas.includes(f.v)}
              onChange={() => onFamilia(f.v)}
            />
            <Chip color={COLOR_FAMILIA[f.v] ?? '#4B5563'} />
            <span className="capa-txt">
              <span className="etq">{f.etiqueta}</span>
            </span>
            <span className="meta">{fmt.format(f.n)}</span>
          </label>
        ))}
      </section>

      {/* El mismo selector que la otra vista, y no uno propio: las claves de
          BASEMAPS son contrato público --son el valor de ?base= en la URL-- y
          un enlace compartido tiene que abrir el mismo fondo en las dos
          pestañas. Se lee de `basemaps`, nunca de una lista escrita aquí. */}
      <section>
        <h2>Mapa base</h2>
        <select value={base} onChange={(e) => onBase(e.target.value)}>
          {Object.keys(basemaps ?? {}).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {imagen && <FechaImagen info={imagen} />}
      </section>

      <section>
        <h2>Descargar</h2>
        {/* Lo descargado respeta la comuna elegida, igual que el mapa: si se
            está mirando Mulchén, el archivo trae Mulchén. El rótulo lo dice
            para que nadie crea que se lleva el país entero. */}
        <p className="pista">
          {comuna ? `Sólo ${comuna}, como en el mapa.` : 'Las tres comunas.'}
        </p>

        <div className="botones-descarga">
          <button className="centrar" onClick={() => bajarDatos('csv')}>
            Áreas (CSV)
          </button>
          <button className="centrar" onClick={() => bajarDatos('geojson')}>
            Áreas (GeoJSON)
          </button>
          <button className="centrar" onClick={() => bajarPuntos('csv')}>
            Infraestructura (CSV)
          </button>
          <button className="centrar" onClick={() => bajarPuntos('geojson')}>
            Infraestructura (GeoJSON)
          </button>
        </div>

        <button
          className="centrar"
          disabled={!map}
          onClick={async () => {
            setEstadoPng('Capturando el mapa…')
            try {
              const { lienzo, fallidas } = await capturarMapa(map, base)
              const blob = await lienzoAPng(lienzo)
              const nombre = nombreArchivo('priorizacion', { comuna }, 'png')
              guardar(nombre, blob)
              setEstadoPng(`${nombre}${fallidas ? ` · ${fallidas} teselas no cargaron` : ''}`)
            } catch (e) {
              setEstadoPng(`No se pudo generar la imagen (${e.message}).`)
            }
          }}
        >
          Imagen del mapa (PNG)
        </button>
        {estadoPng && <p className="pista">{estadoPng}</p>}
      </section>

      <section className="fuentes">
        <h2>En el mapa</h2>
        <p className="kpi">
          {cargando ? 'Cargando…' : `${fmt.format(cuentaAreas ?? 0)} áreas priorizadas`}
        </p>
        <p className="kpi">
          {fmt.format(cuentaPuntos ?? 0)} elementos de infraestructura
          {iconosLejos && ' (ocultos a esta escala)'}
        </p>
        {meta && (
          <p className="pista">
            {meta.titulo}: {fmt.format(meta.features)} áreas
            {metaPuntos && ` · ${metaPuntos.titulo}: ${fmt.format(metaPuntos.features)} puntos`}
          </p>
        )}
      </section>
    </aside>
  )
}
