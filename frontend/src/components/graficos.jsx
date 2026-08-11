// Primitivas de grafico del panel de indicadores. SVG y HTML a mano, sin
// libreria. Las razones, y tambien lo que cuesta:
//
// 1. La mancuerna -- el grafico de impacto en prevencion, el mas importante del
//    panel -- no es un tipo estandar en ninguna libreria: Recharts y Chart.js no
//    la traen y en ECharts sale con custom series. Habria que dibujarla a mano
//    igual, con la libreria encima.
// 2. El repo no tiene NINGUNA dependencia de UI: leaflet, pmtiles,
//    protomaps-leaflet, react, react-dom y react-leaflet son todas cañeria de
//    mapa. Anadir la primera es una decision de proyecto, no un detalle.
// 3. El bundle ya va por 523 kB minificados (152 kB gzip) y Vite avisa por
//    pasar de 500.
// 4. A 288 px de ancho util se pelea mas con los margenes, leyendas y
//    contenedores responsivos por defecto de una libreria que lo que se ahorra.
//
// LO QUE NO ES razon, aunque una version anterior de este comentario lo decia:
// que una libreria impida seguir el tema. Recharts pasa fill/stroke tal cual al
// SVG, asi que <Bar fill="var(--accent)" /> funciona sin matchMedia ni estado.
// El SVG a mano lo hace igual de bien, no mejor.
//
// EL COSTE: 320 lineas propias que mantener, sin tooltips ni transiciones y sin
// la red de seguridad de una libreria probada. Si algun dia el panel necesita
// interaccion de verdad, cambiar de opinion es barato: todo esto es
// presentacional y solo recibe props.
//
// Lienzo util: 288 px = 320 del panel - 2x16 de padding. Los SVG se declaran a
// ese ancho exacto para dibujarse 1:1, con max-width:100% por si el panel se
// estrecha.

import { fmt, fmt1 } from '../config'

const W = 288

// SVG no corta ni pone puntos suspensivos: hay que truncar a mano. 14 caracteres
// es lo que entra en 82 px a 11 px de system-ui; el texto completo va al <title>
// del propio <text>, asi que el tooltip nunca miente.
const recortar = (s, max = 14) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** Icono del boton que abre el panel. SVG y no un glifo de texto: no hay
 *  caracter fiable para "graficos", y con currentColor no depende del tema. */
export function IconoIndicadores() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="13" x2="3" y2="8" />
        <line x1="8" y1="13" x2="8" y2="3" />
        <line x1="13" y1="13" x2="13" y2="6" />
      </g>
    </svg>
  )
}

/** Cifra principal. Deliberadamente NO es un grafico: una barra unica o una
 *  torta de dos sectores para un porcentaje son ruido con forma de dato. */
export function Cifra({ valor, unidad, etiqueta, detalle }) {
  return (
    <div className="cifra">
      <b>
        {valor}
        {unidad && <span className="cifra-u">{unidad}</span>}
      </b>
      <p className="cifra-etq">{etiqueta}</p>
      {detalle && <p className="nota">{detalle}</p>}
    </div>
  )
}

/**
 * Una fila de tabla-barra: rotulo, cifra(s) y barra.
 *
 * Es HTML y no SVG porque el valor va SIEMPRE escrito. Eso resuelve de paso el
 * unico aviso del validador de paleta: #E69F00 (Negligentes) da 2,18:1 sobre el
 * panel claro, por debajo de 3:1, y el requisito es que el color no sea la unica
 * codificacion. Con el numero al lado, la barra es refuerzo, no informacion.
 */
export function BarraFila({
  etiqueta,
  valor,
  max,
  texto,
  extra,
  color = 'var(--accent)',
  atenuada,
  // Por omision el title repite la etiqueta, que es lo que hace falta cuando se
  // recorta con elipsis. Se puede sustituir cuando la fila agrupa varias
  // categorias y el detalle no cabe en el rotulo.
  titulo,
}) {
  const ancho = max > 0 ? Math.max(0, Math.min(100, (100 * valor) / max)) : 0
  return (
    <div className={`fila-kpi${atenuada ? ' atenuada' : ''}`}>
      <span className="fila-etq" title={titulo ?? etiqueta}>
        {etiqueta}
      </span>
      <span className="fila-num">{texto}</span>
      {extra != null && <span className="fila-extra">{extra}</span>}
      <div className="barra">
        <span style={{ width: `${ancho}%`, background: color }} />
      </div>
    </div>
  )
}

/**
 * Medidor de avance. Reusa el idioma de .barra que ya existia para el OECV.
 *
 * No lleva marca del 100 % porque ninguna barra puede pasarse: las regiones que
 * superan la meta NO se dibujan como medidor, se agrupan en una linea aparte.
 * Asi la pista siempre significa 0-100 % y ninguna barra miente por topado.
 */
export function Medidor({ pct, color = 'var(--accent)' }) {
  return (
    <div className="barra">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

/**
 * Columnas. Una sola tinta: temporadas es una escala ordinal y pintar cada
 * columna de un color distinto codificaria una categoria que no existe.
 *
 * `anotacion` etiqueta UNA columna. Se etiqueta selectivamente y no todas: con
 * un maximo 4,5 veces mayor que el resto, nueve cifras encima de nueve columnas
 * serian ilegibles y la que importa es la anomala.
 */
export function Columnas({ datos, valor, alto = 88, anotacion, etiqueta, formato = fmt }) {
  if (!datos?.length) return null
  const EJE = 13 // banda inferior reservada a los rotulos del eje x
  const TECHO = anotacion ? 14 : 4 // aire para la anotacion
  const H = alto
  const max = Math.max(...datos.map(valor), 1)
  const paso = W / datos.length
  const ancho = Math.min(24, paso - 6)
  const cero = H - EJE
  const y = (v) => TECHO + (1 - v / max) * (cero - TECHO)
  const cx = (i) => (i + 0.5) * paso

  return (
    <svg
      className="grafico"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={etiqueta}
    >
      <title>{etiqueta}</title>
      <line x1="0" y1={cero + 0.5} x2={W} y2={cero + 0.5} stroke="var(--border)" strokeWidth="1" />
      {datos.map((d, i) => {
        const v = valor(d)
        const alt = Math.max(1, cero - y(v))
        return (
          <rect
            key={d.v}
            x={cx(i) - ancho / 2}
            y={cero - alt}
            width={ancho}
            height={alt}
            rx="2"
            fill="var(--accent)"
          />
        )
      })}
      {datos.map((d, i) => (
        <text
          key={d.v}
          className="eje"
          x={cx(i)}
          y={H - 3}
          textAnchor="middle"
          fill="var(--text-2)"
        >
          {d.v.slice(2, 4)}-{d.v.slice(7, 9)}
        </text>
      ))}
      {anotacion != null && (
        <text
          className="anot"
          x={Math.max(2, Math.min(W - 2, cx(anotacion)))}
          y={y(valor(datos[anotacion])) - 4}
          textAnchor={anotacion > datos.length / 2 ? 'end' : 'middle'}
          fill="var(--text-h)"
        >
          {formato.format(valor(datos[anotacion]))}
        </text>
      )}
    </svg>
  )
}

/**
 * Mancuerna: dos puntos por fila sobre UN eje comun.
 *
 * La identidad la lleva la FORMA (relleno frente a hueco), no el color, asi que
 * es segura para daltonismo por construccion -- lo que importa aqui, porque la
 * paleta oficial de titularidad OECV no pasa el validador CVD y este grafico
 * no puede depender de tono.
 *
 * Un doble eje "km contra ha" seria el anti-patron clasico: dos escalas
 * arbitrarias inventan una correlacion. Dos participaciones sobre el mismo eje
 * 0-100 % no tienen ese problema.
 */
export function Mancuerna({ filas, max, destacada, etiqueta }) {
  if (!filas?.length) return null
  // Cinturon: si la region destacada NO esta entre las filas, no se atenua
  // ninguna. Sin esto, destacar una region ausente apagaba el grafico entero y
  // dejaba cero señal -- que es peor que no destacar nada. Hoy quien llama se
  // encarga de que la fila este siempre (ver cruceCoberturaPresion), pero esto
  // impide que cualquier otra llamada futura reproduzca el fallo.
  const hayDestacada = !destacada || filas.some((f) => f.region === destacada)
  const FILA = 22
  const CABEZA = 14
  const X0 = 86
  const X1 = 246 // 160 px de pista; de 250 a 288 va la brecha en pp
  const H = CABEZA + filas.length * FILA + 2
  const tope = Math.ceil(max / 10) * 10 || 10
  const x = (p) => X0 + (Math.max(0, p) / tope) * (X1 - X0)
  const marcas = []
  for (let t = 0; t <= tope; t += 10) marcas.push(t)

  return (
    <svg
      className="grafico"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={etiqueta}
    >
      <title>{etiqueta}</title>

      {marcas.map((t) => (
        <g key={t}>
          <line
            x1={x(t) + 0.5}
            y1={CABEZA - 4}
            x2={x(t) + 0.5}
            y2={H - 4}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text className="eje" x={x(t)} y={8} textAnchor="middle" fill="var(--text-2)">
            {t}
          </text>
        </g>
      ))}

      {/* Cabecera de la columna de la derecha. La unidad tiene que verse EN
          PANTALLA: hasta ahora «Brecha (pp)» solo existia en la TablaKpi, que
          App.css esconde con clip-path, asi que quien mira leia numeros sueltos
          sin unidad.
          Va como cabecera de columna y NO pegada a cada cifra porque «+12,1 pp»
          mide 40,1 px de los 42 que hay entre x=246 y x=288 (medido: 5,018 px
          por caracter a 10 px), y con la region mas alta pegada al tope del eje
          su disco de r=4,5 llegaria a pisar el rotulo. */}
      <text className="eje" x={W} y={8} textAnchor="end" fill="var(--text-2)">
        pp
      </text>

      {filas.map((f, i) => {
        const y = CABEZA + i * FILA + FILA / 2
        const activa = !destacada || !hayDestacada || f.region === destacada
        const tinta = activa ? 'var(--accent)' : 'var(--border)'
        return (
          <g key={f.region}>
            {/* Atenuar con opacity hundia el rotulo hasta ~2,3:1, el peor
                contraste del visor, y es justo el nombre de la region que el
                filtro NO destaca: sigue siendo un dato que hay que poder leer.
                --text-2 baja la jerarquia sin mezclar con el fondo. */}
            <text
              className="rotulo"
              x="0"
              y={y + 3.5}
              fill={activa ? 'var(--text-h)' : 'var(--text-2)'}
            >
              {recortar(f.region)}
              <title>{f.region}</title>
            </text>
            <line
              x1={x(Math.min(f.pctKm, f.pctPeso))}
              y1={y}
              x2={x(Math.max(f.pctKm, f.pctPeso))}
              y2={y}
              stroke="var(--border)"
              strokeWidth="2"
            />
            {/* relleno = kilometros de OECV */}
            <circle cx={x(f.pctKm)} cy={y} r="4.5" fill={tinta} />
            {/* hueco = superficie quemada; --panel y no transparent para que la
                linea de union no se vea cruzar el disco */}
            <circle
              cx={x(f.pctPeso)}
              cy={y}
              r="4"
              fill="var(--panel)"
              stroke={tinta}
              strokeWidth="2"
            />
            <text
              className="brecha"
              x={W}
              y={y + 3.5}
              textAnchor="end"
              fill={activa ? 'var(--text-h)' : 'var(--text-2)'}
            >
              {f.brecha > 0 ? '+' : '−'}
              {fmt1.format(Math.abs(f.brecha))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Leyenda de la mancuerna: repite las dos formas a tamaño real.
 *
 * `c` es opcional y expande la abreviatura de la columna de la derecha, que en
 * el SVG solo cabe como «pp». Va sin muestra de color a proposito: no nombra
 * una serie, explica una unidad. Y este <div> NO es un svg.grafico, asi que no
 * entra ni en el recuento de B7 ni en la igualdad de B9 de verify-panel.
 */
export function LeyendaMancuerna({ a, b, c }) {
  return (
    <div className="leyenda-formas">
      <span>
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <circle cx="5.5" cy="5.5" r="4.5" fill="var(--accent)" />
        </svg>
        {a}
      </span>
      <span>
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <circle cx="5.5" cy="5.5" r="4" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
        </svg>
        {b}
      </span>
      {c && <span className="leyenda-nota">{c}</span>}
    </div>
  )
}

/**
 * Lineas con el ULTIMO VALOR rotulado en el extremo derecho.
 *
 * El rotulo lleva la cifra y no el nombre de la serie, y va en var(--text-h) y
 * no en el color de la serie. Rotular con el nombre en su propio color parecia
 * lo elegante y era ilegible: #E69F00 (Negligentes) da 2,18:1 sobre el panel
 * claro -- se vio en captura-kpi-1920-light-2.png, no lo dijo ninguna asercion.
 * Los nombres viven en la leyenda, donde el color es una muestra junto a texto
 * de contraste normal. De paso el grafico queda auto-rotulado y no necesita eje
 * vertical, que en 288 px habria costado un tercio del ancho util.
 */
export function Lineas({ datos, series, alto = 92, etiqueta, tope }) {
  if (!datos?.length) return null
  const EJE = 13
  const X1 = 236 // de 241 a 288 van los valores
  const H = alto
  const cero = H - EJE
  const max = Math.max(...datos.flatMap((d) => series.map((s) => d[s.clave] ?? 0)))
  // El techo se calcula de los datos y no se fija en 70: con un filtro de
  // region la participacion puede pasar de ahi, y la linea se saldria del
  // lienzo sin que nada avisara.
  const alto100 = tope ?? Math.min(100, Math.ceil(max / 10) * 10 + 10)
  const x = (i) => (datos.length === 1 ? 0 : (i / (datos.length - 1)) * X1)
  const y = (v) => 6 + (1 - v / alto100) * (cero - 6)

  // Si los dos ultimos valores caen a menos de 11 px, se separan: dos cifras
  // superpuestas no son ninguna.
  const finales = series.map((s) => ({ s, v: datos.at(-1)[s.clave] ?? 0, y: y(datos.at(-1)[s.clave] ?? 0) }))
  finales.sort((a, b) => a.y - b.y)
  for (let i = 1; i < finales.length; i++) {
    if (finales[i].y - finales[i - 1].y < 11) finales[i].y = finales[i - 1].y + 11
  }

  return (
    <svg
      className="grafico"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={etiqueta}
    >
      <title>{etiqueta}</title>
      <line x1="0" y1={cero + 0.5} x2={X1} y2={cero + 0.5} stroke="var(--border)" strokeWidth="1" />
      {series.map((s) => (
        <path
          key={s.clave}
          d={datos.map((d, i) => `${i ? 'L' : 'M'}${x(i)} ${y(d[s.clave] ?? 0)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {finales.map((f) => (
        <text key={f.s.clave} className="brecha" x={X1 + 5} y={f.y + 3.5} fill="var(--text-h)">
          {fmt1.format(f.v)} %
        </text>
      ))}
      {[0, datos.length - 1].map((i) => (
        <text key={i} className="eje" x={x(i)} y={H - 3} textAnchor={i ? 'end' : 'start'} fill="var(--text)">
          {datos[i].v}
        </text>
      ))}
    </svg>
  )
}

/** Leyenda de series: muestra de color + nombre en texto de contraste normal. */
export function LeyendaLineas({ series }) {
  return (
    <div className="leyenda-formas">
      {series.map((s) => (
        <span key={s.clave}>
          <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden="true">
            <line x1="0" y1="5.5" x2="14" y2="5.5" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
          </svg>
          {s.etiqueta}
        </span>
      ))}
    </div>
  )
}

/**
 * Gemela accesible de un grafico SVG: los valores fila a fila, oculta a la
 * vista pero no al lector de pantalla. Un aria-label resumen no basta cuando la
 * figura tiene nueve puntos y ninguno esta escrito.
 */
export function TablaKpi({ titulo, cabeceras, filas }) {
  return (
    // La <table> va DENTRO de un <div> y no lleva ella la clase que la oculta:
    // width:1px no encoge una tabla. Con table-layout automatico el ancho usado
    // es al menos el de contenido minimo, asi que la tabla se quedaba en 413 px,
    // salia del panel y sumaba 109 px al scrollWidth del documento -- medido:
    // 2029 sobre un viewport de 1920, justo lo que tumba A9. Un bloque si
    // respeta width:1px, y su overflow:hidden corta el desbordamiento de la
    // tabla antes de que llegue a contar.
    <div className="tabla-kpi">
      <table>
        <caption>{titulo}</caption>
        <thead>
          <tr>
            {cabeceras.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f[0]}>
              <th scope="row">{f[0]}</th>
              {f.slice(1).map((c, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Aviso de capa apagada, con el boton que la enciende. */
export function CapaApagada({ etiqueta, onEncender }) {
  return (
    <p className="apagada">
      Enciende la capa «{etiqueta}» para ver este indicador.{' '}
      <button type="button" onClick={onEncender}>
        Encender
      </button>
    </p>
  )
}
