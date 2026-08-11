import { useEffect, useMemo, useRef } from 'react'
import { AVISO_CIVICO, COLOR_CAUSA, fmt, fmt1 } from '../config'
import {
  agruparQuemas,
  ambito,
  avanceOECV,
  coberturaStandby,
  cruceCoberturaPresion,
  resumenDesdeManifest,
  resumenIncendios,
  riesgoElectrico,
  topConOtras,
} from '../indicadores'
import {
  BarraFila,
  CapaApagada,
  Cifra,
  Columnas,
  LeyendaLineas,
  LeyendaMancuerna,
  Lineas,
  Mancuerna,
  TablaKpi,
} from './graficos'

const ha = (v) => `${fmt1.format(v)} ha`
const km = (v) => `${fmt1.format(v)} km`
const pc = (v) => `${fmt1.format(v)} %`

// Los mismos colores que usa el mapa para el grupo de causa: si la leyenda del
// panel y la del mapa discreparan, el color dejaria de significar nada.
const SERIES_CAUSA = [
  { clave: 'pctNeg', etiqueta: 'Negligentes', color: COLOR_CAUSA.Negligentes },
  { clave: 'pctInt', etiqueta: 'Intencionales', color: COLOR_CAUSA.Intencionales },
]

export default function PanelIndicadores({
  manifest,
  kpis,
  incendios,
  oecv,
  filtros,
  capasActivas,
  pasaIncendio,
  onToggleCapa,
  cargando,
  abierto,
  onCerrar,
}) {
  const tablas = manifest?.capas?.incendios?.tablas

  // UNA pasada por las features acumula todos los agregados. Medido sobre el
  // archivo real (14.705 features, JIT caliente): 1,58 ms sin filtro y 1,06 ms
  // con filtro de region, 100 pasadas por medicion. Solo corre cuando cambia el
  // filtro, y esa misma accion ya obliga a Leaflet a refiltrar 14.705 markers
  // de canvas, que es bastante mas caro.
  //
  // pasaIncendio es null cuando no hay filtro de incendios y esta memoizado en
  // [filtros, tablas], asi que es referencialmente estable frente a paneos,
  // fichas y cambios de mapa base: el panel no recalcula por ninguno de esos.
  const resumen = useMemo(
    () =>
      incendios
        ? resumenIncendios(incendios.features, tablas, pasaIncendio)
        : resumenDesdeManifest(manifest),
    [incendios, tablas, pasaIncendio, manifest],
  )

  // Reparto NACIONAL, sin filtro. Los dos indicadores que comparan regiones
  // entre si lo necesitan: con el filtro puesto, la mancuerna se quedaria en
  // una sola fila y el conteo de "7 de 16 regiones" diria "1 de 1". La region
  // seleccionada se DESTACA sobre el reparto completo, no lo reemplaza.
  // Solo se recalcula cuando cambian los datos, nunca al mover un filtro.
  const nacional = useMemo(
    () =>
      incendios ? resumenIncendios(incendios.features, tablas, null) : resumenDesdeManifest(manifest),
    [incendios, tablas, manifest],
  )

  // Las tres secciones que comparan regiones entre si siguen calculandose sobre
  // el reparto NACIONAL --esa es la unica forma de que la comparacion signifique
  // algo-- pero ahora reciben la region filtrada para poder enunciar su cifra
  // propia y garantizar que su fila aparezca. Antes de esto, filtrar por una
  // region no cambiaba absolutamente nada en ellas.
  const cruce = useMemo(
    () =>
      cruceCoberturaPresion(manifest?.capas?.oecv?.km_por_region, nacional?.porRegion, {
        destacada: filtros?.region,
      }),
    [manifest, nacional, filtros?.region],
  )
  const avance = useMemo(() => avanceOECV(kpis, filtros?.region), [kpis, filtros?.region])
  const electrico = useMemo(
    () => riesgoElectrico(resumen, oecv?.features, manifest),
    [resumen, oecv, manifest],
  )
  const standby = useMemo(
    () => coberturaStandby(manifest, nacional?.porRegion, filtros?.region),
    [manifest, nacional, filtros?.region],
  )
  const causas = useMemo(() => topConOtras(resumen?.porGeneral, 6), [resumen])

  // Conductas detras de los incendios por negligencia. k=5 y no 6 porque la
  // fila de quemas lleva un rotulo largo y agrupado.
  const conductas = useMemo(
    () => topConOtras(agruparQuemas(resumen?.negligentes?.porEspecifica), 5),
    [resumen],
  )
  // Cobertura de las filas NOMBRADAS, calculada y no escrita a mano: sin
  // decirla, la seccion afirma mas concentracion de la que el dato soporta.
  const cubreConductas = useMemo(() => {
    const total = resumen?.negligentes?.n ?? 0
    if (!total) return null
    const nombradas = conductas.filter((d) => !d.otras)
    // El numero de conductas plegadas se cuenta sobre la lista de origen, no se
    // extrae del rotulo «Otras (n)»: ese texto lo compone topConOtras y
    // parsearlo de vuelta ataria esta frase a su formato.
    const restantes = agruparQuemas(resumen.negligentes.porEspecifica).length - nombradas.length
    return { pct: (100 * nombradas.reduce((a, d) => a + d.n, 0)) / total, restantes }
  }, [conductas, resumen])

  // Ver el comentario gemelo en PanelLateral: el foco entra al encabezado al
  // abrir el cajon, y App lo devuelve al boton al cerrarlo.
  const cabecera = useRef(null)
  useEffect(() => {
    if (abierto) cabecera.current?.focus()
  }, [abierto])

  const conFeatures = resumen?.fuente === 'geojson'
  const hayFiltro = Object.values(filtros ?? {}).some(Boolean)
  const encenderIncendios = () => onToggleCapa?.('incendios')
  const capaIncendios = 'Incendios investigados'

  // Durante una recarga se mantiene el render anterior atenuado en vez de
  // vaciar el panel: un esqueleto que parpadea cada vez que se enciende una
  // capa es peor que un numero que envejece medio segundo.
  const clase = [
    'panel-kpi',
    abierto ? 'abierto' : '',
    cargando?.incendios && resumen ? 'refrescando' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <aside id="panel-indicadores" className={clase} aria-label="Indicadores">
      <header>
        {/* h2 y no h1: el unico h1 del documento es el del panel izquierdo.
            Dos h1 compiten por ser el titulo de la pagina y un lector de
            pantalla los anuncia como dos documentos superpuestos.
            Sube el recuento de .panel-kpi h2 de 8 a 9, o sea que B7 (>= 6) sale
            reforzada, no en riesgo. */}
        <h2 ref={cabecera} tabIndex={-1}>
          Indicadores
        </h2>
        <p className="sub">
          Incendios <strong>investigados por la UAD</strong>, no la totalidad de los incendios del
          país.
        </p>
        {/* Sin las features, resumenDesdeManifest devuelve SIEMPRE lo nacional:
            no acepta filtro. Declarar «Ámbito: Biobío» sobre la cifra del país
            seria publicar una contradiccion, asi que el rotulo lo desmiente. */}
        <p className="ambito">
          Ámbito: {ambito(filtros)}
          {!conFeatures && hayFiltro && ' — cifras nacionales: la capa de incendios no está cargada'}
        </p>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar indicadores">
          ×
        </button>
      </header>

      {!resumen && (
        <section>
          <p className="apagada">Cargando indicadores…</p>
        </section>
      )}

      {/* ---------- 1 · la cifra que justifica el programa ---------- */}
      {resumen && (
        <section>
          <h2>Incendios evitables</h2>
          {/* "los inició una persona" y no "de causa humana": es MAS preciso
              que el propio titulo, porque el calculo suma solo Negligentes e
              Intencionales y deja fuera los Accidentales, que tambien son
              humanos. La bajada guia sin afirmar nada nuevo. */}
          <p className="bajada">
            Cuántos de estos incendios los inició una persona, por descuido o a propósito.
          </p>
          <Cifra
            valor={fmt1.format(resumen.evitables.pct)}
            unidad="%"
            etiqueta="de los incendios investigados son de causa humana"
            detalle={
              resumen.evitables.pctHa != null
                ? `${pc(resumen.evitables.pctHa)} de la superficie quemada · ${fmt.format(
                    resumen.evitables.n,
                  )} de ${fmt.format(resumen.n)} incendios`
                : `${fmt.format(resumen.evitables.n)} de ${fmt.format(resumen.n)} incendios`
            }
          />
          {['Negligentes', 'Intencionales'].map((g) => {
            const d = resumen.porGrupo.find((x) => x.v === g)
            if (!d) return null
            return (
              <BarraFila
                key={g}
                etiqueta={g}
                valor={d.pct}
                max={100}
                texto={pc(d.pct)}
                extra={fmt.format(d.n)}
                color={COLOR_CAUSA[g]}
              />
            )
          })}
          <p className="nota">
            Suma de causas negligentes e intencionales. Las indeterminadas quedan en el denominador:
            es conservador, sólo puede bajar la cifra.
          </p>
        </section>
      )}

      {/* ---------- 1b · de qué conducta estamos hablando ----------
          El visor afirmaba que casi el 90 % son de causa humana y se detenia
          ahi. "Causa humana" no le dice a un vecino si el problema es quemar
          basura en el patio, una fogata o una colilla, y esa informacion YA
          estaba descargada en el navegador: su unico uso hasta ahora era
          detectar el contacto con el tendido electrico. */}
      {resumen && (
        <section>
          <h2>Qué estaban haciendo</h2>
          <p className="bajada">
            Las conductas detrás de los incendios por descuido, según lo que registró la
            investigación.
          </p>
          {resumen.fuente === 'manifest' ? (
            // EXACTAMENTE esta condicion: cualquier otra mas estrecha dejaria
            // «Enciende la capa» en pantalla con las capas ya cargadas, y el
            // sondeo de scripts/verify-panel.mjs espera a que ese aviso
            // desaparezca -- no fallaria una asercion, agotaria el job.
            <CapaApagada etiqueta={capaIncendios} onEncender={encenderIncendios} />
          ) : (
            conductas.length > 0 && (
              <>
                {conductas.map((d) => (
                  <BarraFila
                    key={d.v}
                    etiqueta={d.v}
                    titulo={d.detalle}
                    valor={d.n}
                    max={conductas[0].n}
                    texto={fmt.format(d.n)}
                    extra={d.ha == null ? null : ha(d.ha)}
                    color={d.otras ? 'var(--border)' : COLOR_CAUSA.Negligentes}
                    atenuada={d.otras}
                  />
                ))}
                {/* La gemela lista el catalogo ORIGINAL sin agrupar: la fusion
                    de las quemas es una decision de presentacion y el dato
                    oficial tiene que seguir accesible. */}
                <TablaKpi
                  titulo="Causa específica de los incendios por negligencia, sin agrupar"
                  cabeceras={['Causa específica', 'Incendios', 'Hectáreas']}
                  filas={resumen.negligentes.porEspecifica.map((d) => [
                    d.v,
                    fmt.format(d.n),
                    d.ha == null ? 'sin dato' : fmt1.format(d.ha),
                  ])}
                />
                {cubreConductas && (
                  <p className="nota">
                    Estas filas cubren el {pc(cubreConductas.pct)} de los{' '}
                    {fmt.format(resumen.negligentes.n)} incendios por negligencia
                    {cubreConductas.restantes > 0 &&
                      `; las ${cubreConductas.restantes} conductas restantes suman el resto`}
                    .
                  </p>
                )}
                <p className="nota">
                  Es un recuento de lo ocurrido, no una lista de recomendaciones ni una norma.
                </p>
                {AVISO_CIVICO && <p className="nota">{AVISO_CIVICO}</p>}
              </>
            )
          )}
        </section>
      )}

      {/* ---------- 2 · el impacto en prevención ---------- */}
      {cruce && (
        <section>
          <h2>Cobertura preventiva vs presión</h2>
          {/* El mismo ternario que ya usa la leyenda de abajo: sin el, la frase
              mentiria en el camino degradado sin superficie, que
              verify-panel.mjs ejercita. */}
          <p className="bajada">
            Qué parte de los kilómetros de cortafuegos del país está en cada región, comparada con
            qué parte de {cruce.usaHa ? 'la superficie quemada' : 'los incendios'} ocurre ahí.
          </p>
          {/* La cifra de la region filtrada, enunciada aparte del grafico. El
              reparto de abajo sigue siendo NACIONAL a proposito --sin el no hay
              contra que comparar-- pero antes filtrar por una region no cambiaba
              ni una cifra de este bloque. */}
          {cruce.propia && (
            <>
              <h3>{cruce.propia.region}</h3>
              <BarraFila
                etiqueta="de los km de OECV del país"
                valor={cruce.propia.pctKm}
                max={cruce.max}
                texto={pc(cruce.propia.pctKm)}
                extra={km(cruce.propia.km)}
              />
              <BarraFila
                etiqueta={
                  cruce.usaHa ? 'de la superficie quemada del país' : 'de los incendios del país'
                }
                valor={cruce.propia.pctPeso}
                max={cruce.max}
                texto={pc(cruce.propia.pctPeso)}
                extra={cruce.usaHa ? ha(cruce.propia.peso) : fmt.format(cruce.propia.peso)}
                color={COLOR_CAUSA.Intencionales}
              />
              {/* El caso «redondea a cero» se dice aparte: con Antofagasta
                  --2,2 km y 40,6 ha, o sea 0,046 % y 0,006 % del pais-- la
                  brecha real es +0,04 pp y la frase salia como «+0 pp de
                  cobertura por sobre su peso», que no significa nada. */}
              {fmt1.format(Math.abs(cruce.propia.brecha)) === '0' ? (
                <p className="kpi">
                  Brecha: <b>menos de 0,1 pp</b>: su parte de los cortafuegos y su parte del fuego
                  son prácticamente iguales.
                </p>
              ) : (
                <p className="kpi">
                  Brecha:{' '}
                  <b>{`${cruce.propia.brecha > 0 ? '+' : '−'}${fmt1.format(Math.abs(cruce.propia.brecha))} pp`}</b>{' '}
                  {cruce.propia.brecha > 0
                    ? 'de cobertura por sobre su peso en el fuego.'
                    : 'de cobertura por debajo de su peso en el fuego.'}
                </p>
              )}
              <h3>Comparación con el resto del país</h3>
            </>
          )}
          <LeyendaMancuerna
            a="% de los km de OECV"
            b={cruce.usaHa ? '% de la superficie quemada' : '% de los incendios'}
            c="A la derecha, la diferencia entre ambos en puntos porcentuales (pp)."
          />
          <Mancuerna
            filas={cruce.filas}
            max={cruce.max}
            destacada={filtros?.region}
            etiqueta={`Participación de cada región en los kilómetros de OECV y en ${
              cruce.usaHa ? 'la superficie quemada' : 'el número de incendios'
            }, con la brecha en puntos porcentuales. ${cruce.filas.length} regiones que concentran ${pc(
              cruce.cubrePeso,
            )}.`}
          />
          <TablaKpi
            titulo="Cobertura preventiva frente a presión de incendios, por región"
            cabeceras={[
              'Región',
              '% km OECV',
              cruce.usaHa ? '% superficie' : '% incendios',
              'Brecha (pp)',
            ]}
            filas={cruce.filas.map((f) => [
              f.region,
              pc(f.pctKm),
              pc(f.pctPeso),
              fmt1.format(f.brecha),
            ])}
          />
          <p className="nota">
            Estas {cruce.filas.length} regiones concentran {pc(cruce.cubrePeso)} de{' '}
            {cruce.usaHa ? 'la superficie quemada' : 'los incendios'} y {pc(cruce.cubreKm)} de los
            kilómetros. Reparto nacional de todas las temporadas: el filtro de región destaca una
            fila, no recorta la comparación.
          </p>
          {/* Explica la fila de mas. Sin esto, la novena aparece sin motivo. */}
          {cruce.propiaFueraDelTop && (
            <p className="nota">
              {cruce.propia.region} no está entre las {cruce.filas.length - 1} de mayor{' '}
              {cruce.usaHa ? 'superficie quemada' : 'número de incendios'}; se añade a la
              comparación por ser la región filtrada.
            </p>
          )}
          {/* Este pie NO es opcional. Sin el, la figura se lee como un juicio
              sobre la asignacion del programa, que es exactamente lo que el
              dato no permite afirmar. */}
          <p className="nota">
            Descriptivo. Las OECV se emplazan por exposición (interfaz urbano-rural, caminos,
            infraestructura), no en proporción a la superficie quemada. La comparación no implica
            causalidad: las obras son una foto de la temporada 2025-2026 y los incendios cubren
            nueve temporadas.
          </p>
        </section>
      )}

      {/* ---------- 3 · el hallazgo accionable ---------- */}
      <section>
        <h2>Riesgo por tendido eléctrico</h2>
        {/* Esta seccion se renderiza SIEMPRE y degrada a <CapaApagada>: la
            bajada va bajo el h2 igual, y tiene que leerse bien cuando lo unico
            que sigue es «Enciende la capa…». */}
        <p className="bajada">
          Qué parte de los incendios y de la superficie quemada se originó en líneas eléctricas.
        </p>
        {conFeatures && electrico ? (
          <>
            <BarraFila
              etiqueta="de los incendios"
              valor={electrico.pctN}
              max={100}
              texto={pc(electrico.pctN)}
              extra={fmt.format(electrico.n)}
            />
            <BarraFila
              etiqueta="de la superficie quemada"
              valor={electrico.pctHa}
              max={100}
              texto={pc(electrico.pctHa)}
              extra={ha(electrico.ha)}
            />
            <p className="kpi">
              <b>{ha(electrico.media)}</b> por incendio, frente a {ha(resumen.media)} del promedio.
            </p>
            {electrico.contacto?.n > 0 && (
              <p className="nota">
                La sub-causa más destructiva del conjunto es el contacto o proximidad de la
                vegetación con el tendido: {fmt.format(electrico.contacto.n)} incendios y{' '}
                {ha(electrico.contacto.ha)}, {ha(electrico.contacto.media)} cada uno.
              </p>
            )}
            {electrico.km && (
              <p className="nota">
                Contrapeso: las empresas eléctricas ejecutan {fmt.format(electrico.obras)} obras OECV
                por {km(electrico.km.elec)}, el {fmt1.format(electrico.km.pct)} % del total.
              </p>
            )}
          </>
        ) : (
          <CapaApagada etiqueta={capaIncendios} onEncender={encenderIncendios} />
        )}
      </section>

      {/* ---------- 4 · lo único accionable esta temporada ---------- */}
      {avance && (
        <section>
          <h2>Avance OECV 2025-2026</h2>
          {/* "planificados" y no "comprometidos": es literalmente lo que dice
              kpis.km_planificados. El titulo conserva el anclaje temporal, que
              es el unico bloque que solo habla de esta temporada. */}
          <p className="bajada">
            Kilómetros de cortafuegos planificados para la temporada y cuántos van reportados.
          </p>
          {/* Con region filtrada, la cifra grande es la de ESA region y el
              nacional baja a linea de referencia. El dato estaba descargado
              desde siempre en kpis.oecv.por_region y el visor no lo decia: con
              Biobio filtrado seguia anunciando el 78,8 % del pais.
              Los cuatro estados de avanceOECV NUNCA colapsan en `?? 0`. */}
          {avance.propia ? (
            <>
              {avance.propia.pct == null ? (
                <p className="kpi">
                  <b>{avance.propia.region}</b> ·{' '}
                  {avance.propia.estado === 'sin-programa'
                    ? 'sin programa 2025-2026'
                    : `${km(avance.propia.plan)} planificados, sin dato de avance`}
                </p>
              ) : (
                <Cifra
                  valor={fmt1.format(avance.propia.pct)}
                  unidad="%"
                  etiqueta={`de avance en ${avance.propia.region}`}
                  detalle={`${km(avance.propia.rep)} reportados de ${km(avance.propia.plan)} planificados · ${
                    avance.propia.estado === 'al-dia'
                      ? 'al día o por sobre la meta'
                      : `faltan ${km(avance.propia.falta)}`
                  }`}
                />
              )}
              <p className="nota">
                Referencia nacional: {pc(avance.nacional.pct)} de avance,{' '}
                {km(avance.nacional.rep)} de {km(avance.nacional.plan)}.
              </p>
            </>
          ) : (
            <Cifra
              valor={fmt1.format(avance.nacional.pct)}
              unidad="%"
              etiqueta="de avance nacional"
              detalle={`${km(avance.nacional.rep)} reportados de ${km(avance.nacional.plan)} planificados`}
            />
          )}
          {avance.pendientes.length > 0 && (
            <>
              <h3>Regiones pendientes</h3>
              {avance.pendientes.map((f) =>
                f.estado === 'sin-dato' ? (
                  <p key={f.region} className="kpi">
                    <b>{f.region}</b> · {km(f.plan)} planificados, sin dato de avance
                  </p>
                ) : (
                  <BarraFila
                    key={f.region}
                    etiqueta={f.region}
                    valor={f.pct}
                    max={100}
                    texto={pc(f.pct)}
                    extra={`faltan ${km(f.falta)}`}
                    // Solo se atenua el resto si la region filtrada esta DE
                    // VERDAD en esta lista. Antes bastaba con que hubiera
                    // filtro: filtrando por Biobio --que esta al dia y por
                    // tanto no es pendiente-- se atenuaban las nueve barras y
                    // no se destacaba ninguna. Medido: 9 barras, 0 sin atenuar.
                    atenuada={
                      filtros?.region &&
                      avance.pendientes.some((p) => p.region === filtros.region) &&
                      filtros.region !== f.region
                    }
                  />
                ),
              )}
              <p className="nota">
                {avance.cabeza} regiones concentran {pc(avance.concentracion)} de los{' '}
                {km(avance.backlog)} pendientes. Se ordena por kilómetros faltantes y no por
                porcentaje: por porcentaje encabezaría la región con el programa más pequeño.
              </p>
            </>
          )}
          {avance.alDia.length > 0 && (
            <p className="nota">
              Al día o por sobre la meta ({avance.alDia.length}):{' '}
              {avance.alDia.map((f) => `${f.region} ${pc(f.pct)}`).join(' · ')}.
            </p>
          )}
          {avance.sinPrograma.length > 0 && (
            <p className="nota">
              Sin programa 2025-2026: {avance.sinPrograma.map((f) => f.region).join(', ')}.
            </p>
          )}
        </section>
      )}

      {/* ---------- 5 · la serie ---------- */}
      {resumen?.porTemporada?.length > 0 && (
        <section>
          <h2>Incendios por temporada</h2>
          <p className="bajada">
            Cuántos incendios investigó la UAD cada temporada, desde la primera con datos.
          </p>
          <h3>Número de incendios investigados</h3>
          <Columnas
            datos={resumen.porTemporada}
            valor={(d) => d.n}
            etiqueta={`Incendios investigados por temporada, de ${resumen.porTemporada[0].v} a ${
              resumen.porTemporada.at(-1).v
            }: de ${fmt.format(resumen.porTemporada[0].n)} a ${fmt.format(
              resumen.porTemporada.at(-1).n,
            )}.`}
          />
          {conFeatures && (
            <>
              <h3>Superficie quemada</h3>
              {/* Eje lineal y sin corte, con etiqueta directa SOLO en la
                  columna anomala: escala logaritmica no, porque una barra debe
                  partir de cero. El aplastamiento del resto es la verdad. */}
              <Columnas
                datos={resumen.porTemporada}
                valor={(d) => d.ha}
                anotacion={resumen.porTemporada.reduce(
                  (mejor, d, i, a) => (d.ha > a[mejor].ha ? i : mejor),
                  0,
                )}
                formato={fmt1}
                etiqueta={`Superficie quemada por temporada, en hectáreas. Máximo ${ha(
                  Math.max(...resumen.porTemporada.map((d) => d.ha)),
                )}.`}
              />
            </>
          )}
          <TablaKpi
            titulo="Incendios investigados y superficie quemada por temporada"
            cabeceras={['Temporada', 'Incendios', 'Hectáreas']}
            filas={resumen.porTemporada.map((d) => [
              d.v,
              fmt.format(d.n),
              d.ha == null ? 'sin dato' : fmt1.format(d.ha),
            ])}
          />
          <p className="nota">
            El alza del número refleja también la ampliación de la cobertura de investigación de la
            UAD; no debe leerse como aumento de la ocurrencia.
          </p>
        </section>
      )}

      {/* ---------- 6 · la lectura robusta al confundido de #5 ---------- */}
      <section>
        <h2>Composición de causas</h2>
        {/* "De cada 100" traduce el porcentaje sin usar la palabra. Dos series
            (SERIES_CAUSA), no las cinco de COLOR_CAUSA. */}
        <p className="bajada">
          De cada 100 incendios investigados en una temporada, cuántos fueron por descuido y
          cuántos intencionales.
        </p>
        {conFeatures && resumen.porTemporada.length > 1 ? (
          <>
            <LeyendaLineas series={SERIES_CAUSA} />
            <Lineas
              datos={resumen.porTemporada}
              series={SERIES_CAUSA}
              etiqueta={`Participación de causas negligentes e intencionales por temporada. En ${
                resumen.porTemporada.at(-1).v
              }, ${pc(resumen.porTemporada.at(-1).pctNeg)} negligentes y ${pc(
                resumen.porTemporada.at(-1).pctInt,
              )} intencionales.`}
            />
            <TablaKpi
              titulo="Participación de negligentes e intencionales por temporada"
              cabeceras={['Temporada', '% negligentes', '% intencionales']}
              filas={resumen.porTemporada.map((d) => [d.v, pc(d.pctNeg), pc(d.pctInt)])}
            />
            <p className="nota">
              Las proporciones son mucho más robustas al crecimiento de la cobertura que los
              recuentos. La primera temporada tiene pocos casos y sesgo hacia lo sospechoso, así que
              la tendencia se lee desde la segunda: un desplazamiento de la fiscalización hacia la
              educación, la regulación de quemas y el manejo de interfaz.
            </p>
          </>
        ) : (
          <CapaApagada etiqueta={capaIncendios} onEncender={encenderIncendios} />
        )}
      </section>

      {/* ---------- 7 · causas generales ---------- */}
      {causas?.length > 0 && (
        <section>
          <h2>Causas generales</h2>
          {/* "registrada en la investigacion" acota de donde sale la categoria.
              El detalle fino es causa_especifica y solo vive en la ficha del
              mapa, asi que no se promete aqui. */}
          <p className="bajada">
            La categoría de causa registrada en la investigación, ordenada por número de incendios.
          </p>
          {causas.map((d) => (
            <BarraFila
              key={d.v}
              etiqueta={d.v}
              valor={d.n}
              max={causas[0].n}
              texto={fmt.format(d.n)}
              extra={d.ha == null ? null : ha(d.ha)}
              color={d.otras ? 'var(--border)' : 'var(--accent)'}
              atenuada={d.otras}
            />
          ))}
          {conFeatures && (
            <p className="nota">
              La barra ordena por número y la segunda cifra son hectáreas: no coinciden. Líneas
              eléctricas es cuarta por recuento y segunda por superficie.
            </p>
          )}
        </section>
      )}

      {/* ---------- 8 · la ausencia ---------- */}
      {standby && capasActivas?.includes('puntos_standby') && (
        <section>
          <h2>Puntos de espera de brigadas (stand-by)</h2>
          <p className="bajada">
            Lugares donde una brigada se posiciona para llegar antes. Aquí solo se ve dónde hay
            registro.
          </p>
          {/* Con region filtrada manda su conteo. El CERO se dice en voz alta:
              es exactamente el hallazgo del que habla la nota de mas abajo, y
              callarlo mientras el encabezado declara la region seria peor que
              no mostrar nada. */}
          {standby.propia != null ? (
            <>
              <p className="kpi">
                {standby.propia > 0 ? (
                  <>
                    <b>{fmt.format(standby.propia)} puntos</b> registrados en {filtros.region}
                  </>
                ) : (
                  <>
                    <b>Ningún punto registrado</b> en {filtros.region}
                  </>
                )}
              </p>
              <p className="nota">
                Referencia nacional: {fmt.format(standby.puntos)} puntos en {standby.regiones} de{' '}
                {standby.regionesTotales} regiones.
              </p>
            </>
          ) : (
            <p className="kpi">
              <b>{fmt.format(standby.puntos)} puntos</b> en {standby.regiones} de{' '}
              {standby.regionesTotales} regiones
            </p>
          )}
          {standby.sinPuntos.length > 0 && (
            <p className="nota">
              {standby.sinPuntos
                .slice(0, 2)
                .map((d) => d.v)
                .join(' y ')}{' '}
              {standby.usaHa
                ? `suman ${ha(standby.sinPuntos.slice(0, 2).reduce((a, d) => a + d.ha, 0))} quemadas`
                : `suman ${fmt.format(
                    standby.sinPuntos.slice(0, 2).reduce((a, d) => a + d.n, 0),
                  )} incendios`}{' '}
              y no registran ningún punto. La ausencia es de registro en la fuente, no
              necesariamente de brigadas.
            </p>
          )}
        </section>
      )}

      <footer>
        {!conFeatures && hayFiltro
          ? 'Con la capa de incendios apagada, los agregados salen del manifiesto y son nacionales: no responden al filtro.'
          : 'Agregados calculados en el navegador sobre las capas cargadas; responden a los filtros activos.'}
      </footer>
    </aside>
  )
}
