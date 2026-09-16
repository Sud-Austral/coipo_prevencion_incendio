import { useRef, useState } from 'react'
import { csvInfraPuntos, csvRiesgo, geojsonDe, guardar, nombreArchivo } from '../descargas'
import { capturarMapa, lienzoAPng } from '../mapaPNG'
import FechaImagen from './FechaImagen'
import { COLOR_FAMILIA, COLOR_NIVEL, RAMPA_NORMALIZADA, fmt } from '../config'
import { ModalInfoRiesgo } from './ModalesPanel'

/**
 * Panel izquierdo de la vista de riesgo.
 *
 * DOS LEYENDAS DISTINTAS Y NO UNA CON OTRO TITULO. Es la decision central de
 * esta pestaña: la escala absoluta y la comunal cuentan cosas que no se pueden
 * comparar entre si, y un usuario que confunda las dos concluira que una comuna
 * tiene tanto riesgo como otra porque las dos «tienen zonas oscuras». Por eso el
 * modo relativo cambia de forma (rampa continua en vez de fichas discretas), de
 * familia de color (morado en vez de la rampa naranja), rotula sus extremos con
 * el valor ABSOLUTO --nunca 0-100-- y lleva un distintivo.
 *
 * LAS COMUNAS, LAS REGIONES Y LAS CLASES SALEN DEL MANIFEST. Aqui no se escribe
 * ninguna: si el modelo incorpora una comuna o cambia un corte, aparece solo.
 */

// Decimales FIJOS en es-CL: los cortes y los niveles viajan con 3 como maximo.
const fmtCorte = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })
const fmt3 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const rangoDeClase = ({ desde, hasta }) => {
  if (desde == null) return `< ${fmtCorte.format(hasta)}`
  if (hasta == null) return `≥ ${fmtCorte.format(desde)}`
  return `${fmtCorte.format(desde)} – ${fmtCorte.format(hasta)}`
}

function Chip({ color }) {
  return <span className="chip" style={{ background: color }} />
}

export default function PanelRiesgo({
  manifest,
  cut,
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
  fuenteInfra,
  cargando,
  error,
  onReintentar,
  onEncuadrar,
  abierto,
  onCerrar,
  datosAreas,
  // La geometria COMPLETA de la comuna, publicada: la descarga GeoJSON sale de
  // aqui y no de lo dibujado, que son teselas.
  urlGeojson,
  datosPuntos,
  pasaPuntos,
  // La misma decodificacion que abre la ficha: el CSV la necesita para escribir
  // «Antenas de telecomunicaciones» donde el dato trae un indice.
  decodificarPunto,
  map,
  base,
  onBase,
  basemaps,
  imagen,
}) {
  const cabecera = useRef(null)
  const [estadoPng, setEstadoPng] = useState('')
  // Un solo modal, y por eso un booleano y no el id del abierto.
  const [info, setInfo] = useState(false)

  const meta = manifest?.capas?.riesgo
  const metaPuntos = manifest?.capas?.infra_puntos
  const parte = cut ? meta?.partes?.[cut] : null
  const comuna = parte?.comuna ?? ''
  const normalizado = ctx?.modo === 'normalizada'

  // Miembro foráneo del GeoJSON: el archivo circula suelto y tiene que decir de
  // dónde salió y con qué recorte.
  const procedencia = {
    fuente: 'Modelo de riesgo de incendio forestal CONAF (lab/priorizacion, notebook 4)',
    comuna: comuna || 'ninguna',
    cod_comuna: cut || null,
    region: parte?.region ?? null,
  }

  const avisar = (nombre, n) => setEstadoPng(`${nombre} · ${fmt.format(n)} registros`)

  const bajarManchas = async (formato) => {
    const nombre = nombreArchivo('riesgo', { comuna }, formato)
    if (formato === 'csv') {
      const r = csvRiesgo(datosAreas?.features, { region: parte?.region, cut })
      guardar(nombre, r.texto, 'text/csv;charset=utf-8')
      avisar(nombre, r.n)
      return
    }
    // La geometria sin simplificar vive en el GeoJSON publicado de la comuna; se
    // baja al pedirla y se le agrega la procedencia, como a toda descarga.
    setEstadoPng(`Descargando la geometría de ${comuna}…`)
    try {
      const r = await fetch(urlGeojson)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const gj = await r.json()
      const salida = geojsonDe('riesgo', gj.features, null, { meta: procedencia })
      guardar(nombre, salida.texto, 'application/geo+json')
      avisar(nombre, salida.n)
    } catch (e) {
      setEstadoPng(`No se pudo descargar la geometría (${e.message}).`)
    }
  }

  // El mismo predicado que filtra los iconos filtra el archivo: una sola regla.
  const bajarPuntos = (formato) => {
    const r =
      formato === 'csv'
        ? csvInfraPuntos(datosPuntos?.features, pasaPuntos, decodificarPunto)
        : geojsonDe('infraestructura', datosPuntos?.features, pasaPuntos, {
            // El GeoJSON decodifica por el mismo camino que la capa de
            // incendios --tablas + codificados, conservando el codigo en
            // `<campo>_cod`-- en vez de por `decodificarPunto`: ahi el archivo
            // circula suelto y el codigo original vale tanto como la etiqueta.
            tablas: metaPuntos?.tablas,
            codificados: metaPuntos?.codificados,
            meta: procedencia,
          })
    const nombre = nombreArchivo('infraestructura', { comuna }, formato)
    guardar(nombre, r.texto, formato === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json')
    avisar(nombre, r.n)
  }

  // La capa es NACIONAL desde el 2026-09-16: siempre hay algo que descargar, y
  // con comuna elegida se descarga la suya.
  const hayInfra = (cuentaPuntos ?? 0) > 0
  // Lo que el ETL dejó fuera por caer fuera del área continental, sumado por
  // familia: Isla de Pascua y Juan Fernández (DECISIONES.md §X).
  const insulares = Object.values(fuenteInfra?.fuera_de_chile ?? {}).reduce((a, b) => a + b, 0)
  const sinGeom = meta?.fuente?.sin_geometria

  return (
    <aside id="panel-control" className={`panel${abierto ? ' abierto' : ''}`}>
      <header>
        <h1 ref={cabecera} tabIndex={-1}>
          Riesgo de incendio forestal
        </h1>
        <p className="sub">
          Nivel de riesgo del territorio, de 0 a 4, en áreas dentro de cada comuna
        </p>
        {/* En la cabecera y no al final: la pregunta «¿qué es este número?» se
            hace ANTES de tocar nada, y un botón al fondo del panel no se ve. */}
        <button type="button" className="centrar info-vista" onClick={() => setInfo(true)}>
          Qué muestra esta vista
        </button>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </header>

      

      {error && (
        <section>
          <p className="aviso">
            No se pudieron cargar las áreas de {comuna || 'la comuna'}.{' '}
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
          <select value={cut ?? ''} onChange={(e) => onComuna(e.target.value)}>
            <option value="">Elige una comuna</option>
            {(meta?.regiones ?? []).map((r) => (
              <optgroup key={r.region} label={r.region}>
                {r.comunas.map((c) => (
                  <option key={c} value={c}>
                    {meta.partes[c].comuna} ({fmt.format(meta.partes[c].features)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {/* La duda concreta que reportó el colega de CONAF: el número del
            selector no se explicaba en ningún sitio. Va aquí, pegado al
            control, y desarrollado en «Qué muestra esta vista». */}
        <p className="pista">
          El número entre paréntesis es cuántas áreas de riesgo tiene la comuna.
        </p>

        {!cut && (
          <p className="pista">
            El mapa muestra las {fmt.format(meta?.regiones?.length ?? 0)} regiones y{' '}
            {fmt.format(Object.keys(meta?.partes ?? {}).length)} comunas del modelo. Elige una comuna,
            o toca un área, para normalizar, ver su ficha o descargarla.
          </p>
        )}

        {/* Sin teselas el mapa no tiene con qué dibujar: el ETL corrió sin GDAL.
            Se dice, en vez de mostrar un mapa vacío que se lee como «sin riesgo». */}
        {meta && !meta.teselas && (
          <p className="aviso">
            Esta publicación no trae las teselas de riesgo, así que las áreas no se pueden dibujar.
          </p>
        )}

        {parte && (
          <button className="centrar" onClick={() => onEncuadrar(cut)}>
            Centrar el mapa en {comuna}
          </button>
        )}

        {parte && (
          <button
            className={normalizado ? 'normalizar activo' : 'normalizar'}
            onClick={() => onModo(normalizado ? 'absoluta' : 'normalizada')}
            aria-pressed={normalizado}
          >
            {normalizado ? 'Volver a la escala del modelo' : `Normalizar dentro de ${comuna}`}
          </button>
        )}
      </section>

      {/* Va en la sección de la leyenda, pegado a los colores que regula, y no
          en una sección propia: es un ajuste de UNA capa, no un modo del
          visor. La etiqueta nombra la capa —«áreas de riesgo»— porque
          en esta vista hay dos capas encima del mapa y un rótulo genérico
          dejaría dudando de si también afecta a los iconos. */}
      <section>
        <h2>Leyenda</h2>

        <label className="fila-opacidad" htmlFor="opacidad-manchas">
          <span>Opacidad de las áreas</span>
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
          aria-label="Opacidad de las áreas de riesgo"
          aria-valuetext={`${Math.round(opacidad * 100)} por ciento`}
        />

        {!normalizado ? (
          <>
            <h3>Clase · nivel medio del modelo</h3>
            {/* De mayor a menor: la leyenda se lee de arriba abajo y lo que
                importa --el riesgo más alto-- va primero. */}
            {(meta?.clases ?? [])
              .slice()
              .reverse()
              .map((c) => (
                <div key={c.clase} className="leyenda">
                  <Chip color={COLOR_NIVEL[c.nivel] ?? '#CCCCCC'} /> {c.clase}
                  <span className="leyenda-rango">{rangoDeClase(c)}</span>
                </div>
              ))}
            <p className="pista">
              La clase es el promedio del nivel en el área. Comparable entre comunas.
            </p>
          </>
        ) : (
          <>
            <h3>
              Contraste interno · {comuna}
              <span className="distintivo">RELATIVO</span>
            </h3>
            {ctx.uniforme ? (
              <p className="pista">
                {ctx.m === 1
                  ? 'Esta comuna tiene una sola área: no hay contraste interno que mostrar.'
                  : 'Todas las áreas de esta comuna tienen el mismo nivel.'}
              </p>
            ) : (
              <>
                <div className="rampa" aria-hidden="true">
                  {RAMPA_NORMALIZADA.map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </div>
                {/* Los extremos con su valor ABSOLUTO, nunca 0-100: es lo que
                    impide leer «el maximo de una comuna» como si fuera el mismo
                    nivel que «el maximo de otra». */}
                <div className="rampa-extremos">
                  <span>mín. {fmt3.format(ctx.min)}</span>
                  <span>máx. {fmt3.format(ctx.max)}</span>
                </div>
              </>
            )}
            <p className="pista">
              Los colores comparan sólo dentro de {comuna} ({fmt.format(ctx.m)} áreas).
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
        {/* Cobertura NACIONAL desde el 2026-09-16. Los elementos se agrupan en
            cúmulos numerados y se separan al acercar: ya no hay un umbral por
            debajo del cual desaparecen. */}
        <p className="pista">
          {cut
            ? `Elementos en ${comuna}; el resto del país sigue en el mapa al quitar la comuna.`
            : 'Cobertura nacional. Los elementos se agrupan en círculos con su cuenta; al acercar se separan.'}
        </p>
        {/* Lo descartado se DICE. Isla de Pascua y Juan Fernández quedan fuera
            de la caja continental del visor (DECISIONES.md §X): sin esta línea,
            un hospital que no está se lee como que no existe. */}
        {insulares > 0 && (
          <p className="pista">
            {fmt.format(insulares)} elementos de Isla de Pascua y Juan Fernández no se dibujan:
            quedan fuera del área continental que cubre este visor.
          </p>
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
        <p className="pista">
          {comuna ? `Sólo ${comuna}, como en el mapa.` : 'Elige una comuna para descargar sus áreas.'}
        </p>

        <div className="botones-descarga">
          <button className="centrar" disabled={!datosAreas} onClick={() => bajarManchas('csv')}>
            Áreas (CSV)
          </button>
          <button className="centrar" disabled={!urlGeojson} onClick={() => bajarManchas('geojson')}>
            Áreas (GeoJSON)
          </button>
          <button className="centrar" disabled={!hayInfra} onClick={() => bajarPuntos('csv')}>
            Infraestructura (CSV)
          </button>
          <button className="centrar" disabled={!hayInfra} onClick={() => bajarPuntos('geojson')}>
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
              const nombre = nombreArchivo('riesgo', { comuna }, 'png')
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
          {cargando
            ? 'Cargando…'
            : `${fmt.format(cuentaAreas ?? 0)} áreas de riesgo${cut ? '' : ' en el país'}`}
        </p>
        <p className="kpi">
          {fmt.format(cuentaPuntos ?? 0)} elementos de infraestructura{cut ? '' : ' en el país'}
        </p>
        {meta && (
          <p className="pista">
            {meta.titulo}: {fmt.format(meta.features)} áreas en{' '}
            {fmt.format(Object.keys(meta.partes ?? {}).length)} comunas
            {metaPuntos && ` · ${metaPuntos.titulo}: ${fmt.format(metaPuntos.features)} puntos`}
          </p>
        )}
        {/* Un dato que el pipeline descarta en silencio no se percibe como
            ausente sino como inexistente: se dice cuántas áreas no se dibujan. */}
        {sinGeom?.n > 0 && (
          <p className="pista">
            {fmt.format(sinGeom.n)} áreas del modelo no traen geometría y no se dibujan (
            {Object.keys(sinGeom.por_region ?? {}).join(', ')}; {fmtCorte.format(sinGeom.area_ha)} ha
            en total).
          </p>
        )}
      </section>
      {info && (
        <ModalInfoRiesgo
          meta={meta}
          metaPuntos={metaPuntos}
          generado={manifest?.generado}
          onCerrar={() => setInfo(false)}
        />
      )}
    </aside>
  )
}
