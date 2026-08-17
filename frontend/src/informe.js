// Constructor del informe imprimible.
//
// Devuelve una CADENA y no toca el DOM: por eso se puede comprobar desde Node
// (asercion B18) sin navegador. Quien la abre en una ventana nueva es
// PanelLateral, con el patron que INTERNO_SAFF ya usa en ocho paginas:
//
//     const win = window.open('', '_blank')
//     win.document.open(); win.document.write(html); win.document.close()
//     …y dentro del HTML: <script>window.onload=function(){window.print()}</script>
//
// Sin libreria de PDF. `<meta charset="utf-8">` basta para que a e i o u con
// tilde y la enye salgan bien, que es justo el dolor de jsPDF (obliga a
// incrustar una tipografia en base64). Y nuestros graficos ya son SVG en linea:
// serializan tal cual.

/**
 * Escapa para HTML, incluyendo comillas.
 *
 * El precedente de INTERNO_SAFF escapa solo & < > pero interpola dentro de
 * atributos entrecomillados, asi que una comilla en el dato se sale del
 * atributo. Nuestras `causa_especifica` son texto libre copiado de un Excel de
 * terceros: no es una posibilidad teorica.
 */
export const escapar = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Claves de color y tipografia que el informe necesita resolver por su cuenta. */
export const CLAVES_PALETA = [
  '--text',
  '--text-2',
  '--text-h',
  '--bg',
  '--panel',
  '--border',
  '--accent',
  '--sans',
  '--mono',
  '--verde-institucional',
]

// Respaldo de ultimo recurso: paleta CLARA literal. Si la lectura de la hoja de
// estilos falla, el informe sale con estos valores y nunca con texto claro sobre
// papel blanco.
const PALETA_MINIMA = {
  '--text': '#3b3b46',
  '--text-2': '#55505e',
  '--text-h': '#08060d',
  '--bg': '#ffffff',
  '--panel': '#ffffff',
  '--border': '#d9d8dd',
  '--accent': '#1f6feb',
  '--sans': "system-ui, 'Segoe UI', Roboto, sans-serif",
  '--mono': 'ui-monospace, Consolas, monospace',
  '--verde-institucional': '#064928',
}

/**
 * Paleta CLARA leida de la hoja de estilos.
 *
 * getComputedStyle NO sirve: con el sistema en modo oscuro devuelve la paleta
 * oscura, y un informe de texto claro sobre papel blanco es ilegible. Se busca
 * la regla `:root` que NO esta dentro de @media (prefers-color-scheme: dark),
 * que en index.css es la primera del archivo.
 */
export function paletaClara(doc = document) {
  try {
    for (const hoja of doc.styleSheets) {
      let reglas
      try {
        reglas = hoja.cssRules
      } catch {
        continue // hoja de otro origen
      }
      for (const regla of reglas) {
        if (regla.type !== 1 || !/(^|,)\s*:root\s*$/.test(regla.selectorText ?? '')) continue
        const v = {}
        for (const k of CLAVES_PALETA) {
          const x = regla.style.getPropertyValue(k).trim()
          if (x) v[k] = x
        }
        if (v['--accent']) return { ...PALETA_MINIMA, ...v }
      }
    }
  } catch {
    /* sin acceso a las hojas: se cae al respaldo */
  }
  return { ...PALETA_MINIMA }
}

const bloqueVars = (paleta) =>
  `:root{${Object.entries(paleta)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`

// Los tamaños de los SVG se midieron contra un lienzo de 288 px en pantalla
// (ver App.css). En el informe el SVG escala por su viewBox: a dos columnas de
// ~86 mm, 1 unidad de usuario son ~0,3 mm y una etiqueta de 10 px imprime a
// ~8,5 pt, que es lo correcto. A una columna de 180 mm imprimiria a 17 pt, que
// seria absurdo. De ahi que las hojas de indicadores vayan a DOS columnas.
const ESTILO = `
@page{size:210mm 297mm;margin:0}
@page mapa{size:297mm 210mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font:11pt/1.45 var(--sans);color:var(--text-h);background:#fff}
.hoja{padding:16mm 14mm;page-break-after:always;break-after:page}
.hoja:last-child{page-break-after:auto;break-after:auto}
.hoja-mapa{page:mapa;padding:10mm}
.phdr{display:flex;justify-content:space-between;gap:8mm;font-size:8pt;color:var(--text-2);
  border-bottom:1px solid var(--border);padding-bottom:2mm;margin-bottom:6mm}
.banda{height:6mm;background:var(--verde-institucional);margin:-16mm -14mm 8mm;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:22pt;line-height:1.15;letter-spacing:-0.01em;margin-bottom:4mm}
h2{font-size:10pt;text-transform:uppercase;letter-spacing:.08em;color:var(--text-2);margin:0 0 3mm}
h3{font-size:9.5pt;margin:3mm 0 1.5mm}
p{margin:0 0 2mm}
.sub{font-size:12pt;color:var(--text-2);margin-bottom:8mm}
.meta{font:9pt var(--mono);color:var(--text-2)}
.meta b{color:var(--text-h)}
.ficha-datos{margin:6mm 0;border-top:1px solid var(--border)}
.ficha-datos div{display:flex;gap:4mm;padding:1.6mm 0;border-bottom:1px solid var(--border);font-size:9.5pt}
.ficha-datos dt{width:44mm;flex:none;color:var(--text-2)}
.mapa-img{display:block;width:100%;height:auto;border:1px solid var(--border)}
.cols{column-count:2;column-gap:8mm}
section{break-inside:avoid;page-break-inside:avoid;margin-bottom:6mm}
.nota{font-size:8pt;line-height:1.35;color:var(--text-2);margin-top:1.5mm}
.bajada{font-size:9pt;color:var(--text-2);margin-bottom:2mm}
.cifra b{display:block;font-size:26pt;font-weight:600;line-height:1.05;letter-spacing:-0.02em}
.cifra-u{font-size:14pt;font-weight:500}
.cifra-etq{font-size:9.5pt}
.fila-kpi{display:grid;grid-template-columns:1fr auto auto;column-gap:3mm;row-gap:.6mm;
  align-items:baseline;margin-bottom:2mm;font-size:8.5pt}
.fila-etq{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.fila-num,.fila-extra{font:8pt var(--mono)}
.fila-extra{color:var(--text-2)}
.barra{grid-column:1/-1;height:1.4mm;background:var(--border);border-radius:.7mm;overflow:hidden;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.barra span{display:block;height:100%;background:var(--accent);
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.grafico{display:block;max-width:100%;height:auto;margin:1mm 0 2mm}
.grafico .eje{font:10px var(--mono)}
.grafico .rotulo{font-size:11px;font-family:var(--sans)}
.grafico .brecha,.grafico .anot{font:10px var(--mono)}
.grafico .rotulo-serie{font-size:10px;font-family:var(--sans);font-weight:600}
.leyenda-formas{display:flex;flex-wrap:wrap;gap:1mm 4mm;font-size:8pt;margin:1mm 0}
.leyenda-formas span{display:inline-flex;align-items:center;gap:1.5mm}
.chip{width:3mm;height:3mm;border-radius:.8mm;display:inline-block;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Las gemelas accesibles de los graficos dejan de estar ocultas: un informe
   necesita tablas de datos, y estas ya existen y estan verificadas. */
.tabla-kpi{margin:2mm 0 3mm}
.tabla-kpi table{border-collapse:collapse;width:100%;font-size:7.5pt}
.tabla-kpi caption{text-align:left;font-weight:600;font-size:8pt;margin-bottom:1mm}
.tabla-kpi th,.tabla-kpi td{border-bottom:1px solid var(--border);padding:.8mm 1.5mm;text-align:right}
.tabla-kpi th:first-child,.tabla-kpi td:first-child{text-align:left}
.tabla-kpi thead th{color:var(--text-2);font-weight:600}
.apagada,.cerrar,.abrir,.abrir-kpi,.tirador{display:none}
`

/**
 * @param {object} m  modelo del informe
 * @param {boolean} m.autoImprimir  añade el disparo de window.print()
 */
// El cierre del <script> se parte como `</${'script'}>` y no se escribe entero:
// una cadena con </script> literal cerraria la etiqueta si este modulo acabara
// en linea dentro de un HTML. INTERNO_SAFF lo resuelve con `<\/script>`, que
// hace lo mismo pero el linter marca la barra como escape inutil -- porque en un
// modulo lo es. Partirlo es correcto en los dos casos.
export function construirInforme(m) {
  const {
    titulo = 'Prevención de Incendios Forestales',
    ambito,
    filtros = {},
    capas = [],
    url,
    fechaDatos,
    fechaInforme,
    aviso,
    temporadas,
    mapa, // data URI del PNG, o null
    mapaMotivo, // por que no hay mapa
    leyenda = [], // [{etiqueta, color}]
    indicadores = '', // HTML ya renderizado de PanelIndicadores
    notas = [],
    paleta = PALETA_MINIMA,
    autoImprimir = true,
  } = m

  const e = escapar
  const cabecera = (extra = '') =>
    `<div class="phdr"><span><b>CONAF</b> · Unidad de Información y Análisis</span>` +
    `<span>${e(ambito)}</span><span>${e(fechaInforme)}</span></div>${extra}`

  const filas = Object.entries(filtros).filter(([, v]) => v)

  const portada = `<div class="hoja">
<div class="banda"></div>
${cabecera()}
<h1>${e(titulo)}</h1>
<p class="sub">Informe del ámbito consultado en el visor</p>
<div class="ficha-datos">
<div><dt>Ámbito</dt><dd>${e(ambito)}</dd></div>
${filas.map(([k, v]) => `<div><dt>Filtro · ${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}
<div><dt>Capas activas</dt><dd>${e(capas.join(' · ') || 'ninguna')}</dd></div>
<div><dt>Datos al</dt><dd>${e(fechaDatos ?? 'sin fecha')}</dd></div>
<div><dt>Informe generado el</dt><dd>${e(fechaInforme)}</dd></div>
${url ? `<div><dt>Vista</dt><dd class="meta">${e(url)}</dd></div>` : ''}
</div>
${aviso ? `<p class="nota"><b>${e(aviso)}</b>${temporadas ? ` Temporadas ${e(temporadas)}.` : ''}</p>` : ''}
</div>`

  const hojaMapa = `<div class="hoja hoja-mapa">
${cabecera()}
<h2>Mapa del ámbito</h2>
${
  mapa
    ? `<img class="mapa-img" src="${mapa}" alt="Mapa de los incendios investigados del ámbito consultado">`
    : `<p class="nota">${e(mapaMotivo ?? 'No se pudo incluir la imagen del mapa.')}</p>`
}
<div class="leyenda-formas">${leyenda
    .map((l) => `<span><span class="chip" style="background:${e(l.color)}"></span>${e(l.etiqueta)}</span>`)
    .join('')}</div>
</div>`

  const hojaIndicadores = `<div class="hoja">
${cabecera()}
<div class="cols">${indicadores}</div>
</div>`

  const hojaNotas = notas.length
    ? `<div class="hoja">
${cabecera()}
<h2>Nota metodológica</h2>
${notas.map((n) => `<p class="nota">${e(n)}</p>`).join('')}
</div>`
    : ''

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8">
<title>${e(`${titulo} — ${ambito} — ${fechaInforme}`)}</title>
<style>${bloqueVars(paleta)}${ESTILO}</style>
</head><body>
${portada}
${hojaMapa}
${hojaIndicadores}
${hojaNotas}
${autoImprimir ? `<script>window.onload=function(){window.print()}</${'script'}>` : ''}
</body></html>`
}
