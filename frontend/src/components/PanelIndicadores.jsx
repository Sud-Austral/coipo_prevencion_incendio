import { useMemo } from 'react'
import { COLOR_CAUSA, fmt, fmt1 } from '../config'
import {
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

  const cruce = useMemo(
    () => cruceCoberturaPresion(manifest?.capas?.oecv?.km_por_region, nacional?.porRegion),
    [manifest, nacional],
  )
  const avance = useMemo(() => avanceOECV(kpis), [kpis])
  const electrico = useMemo(
    () => riesgoElectrico(resumen, oecv?.features, manifest),
    [resumen, oecv, manifest],
  )
  const standby = useMemo(() => coberturaStandby(manifest, nacional?.porRegion), [manifest, nacional])
  const causas = useMemo(() => topConOtras(resumen?.porGeneral, 6), [resumen])

  const conFeatures = resumen?.fuente === 'geojson'
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
    <aside className={clase} aria-label="Indicadores">
      <header>
        <h1>Indicadores</h1>
        <p className="sub">
          Incendios <strong>investigados por la UAD</strong>, no la totalidad de los incendios del
          país.
        </p>
        <p className="ambito">Ámbito: {ambito(filtros)}</p>
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

      {/* ---------- 2 · el impacto en prevención ---------- */}
      {cruce && (
        <section>
          <h2>Cobertura preventiva vs presión</h2>
          <LeyendaMancuerna
            a="% de los km de OECV"
            b={cruce.usaHa ? '% de la superficie quemada' : '% de los incendios'}
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
          <Cifra
            valor={fmt1.format(avance.nacional.pct)}
            unidad="%"
            etiqueta="de avance nacional"
            detalle={`${km(avance.nacional.rep)} reportados de ${km(avance.nacional.plan)} planificados`}
          />
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
                    atenuada={filtros?.region && filtros.region !== f.region}
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
          <h2>Puntos stand-by</h2>
          <p className="kpi">
            <b>{fmt.format(standby.puntos)} puntos</b> en {standby.regiones} de{' '}
            {standby.regionesTotales} regiones
          </p>
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
        Agregados calculados en el navegador sobre las capas cargadas; responden a los filtros
        activos.
      </footer>
    </aside>
  )
}
