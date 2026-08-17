import { useEffect, useState } from 'react'
import {
  CAPAS,
  COLOR_CAUSA,
  COLOR_OECV,
  COLOR_REDVIAL,
  COLOR_RUTA,
  COLOR_STANDBY,
  NO_ACTIVOS,
  fechaLarga,
  fmt,
  temporadasIncendios,
} from '../config'
import {
  csvIncendios,
  csvOECV,
  csvStandby,
  geojsonDe,
  guardar,
  hoy,
  nombreArchivo,
  urlPublicada,
} from '../descargas'
import { capturarMapa, lienzoAPng } from '../mapaPNG'
import { construirInforme, paletaClara } from '../informe'
import { ambito } from '../indicadores'
import { flush } from '../urlState'
import PanelIndicadores from './PanelIndicadores'

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Capas que se pueden exportar como datos: las que llegan como GeoJSON. En
 *  produccion rutas y redvial se sirven por teselas y no hay features en el
 *  cliente -- se ofrecen igual, pero deshabilitadas y con el motivo escrito. */
const EXPORTABLES = ['incendios', 'oecv', 'puntos_standby', 'rutas', 'redvial']

/**
 * Leyenda del mapa del informe. Se arma de las MISMAS constantes que pinta el
 * mapa y que muestra el panel de control: una leyenda que no coincide con los
 * colores de la imagen es peor que no tener leyenda.
 */
function leyendaDe(capasActivas) {
  const l = []
  if (capasActivas.includes('incendios')) {
    for (const [k, v] of Object.entries(COLOR_CAUSA)) l.push({ etiqueta: k, color: v })
  }
  if (capasActivas.includes('oecv')) {
    for (const [k, v] of Object.entries(COLOR_OECV)) l.push({ etiqueta: `OECV ${k.toLowerCase()}`, color: v })
  }
  if (capasActivas.includes('puntos_standby')) l.push({ etiqueta: 'Punto stand-by', color: COLOR_STANDBY })
  if (capasActivas.includes('rutas')) l.push({ etiqueta: 'Ruta de despliegue', color: COLOR_RUTA })
  if (capasActivas.includes('redvial')) l.push({ etiqueta: 'Red vial MOP', color: COLOR_REDVIAL })
  return l
}

export default function SeccionDescargas({
  manifest,
  filtros,
  capasActivas,
  datos,
  predicados,
  map,
  base,
  propsIndicadores,
}) {
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!estado) return
    const t = setTimeout(() => setEstado(''), 4000)
    return () => clearTimeout(t)
  }, [estado])

  const tablas = manifest?.capas?.incendios?.tablas
  const codificados = manifest?.capas?.incendios?.codificados ?? []
  const ambitoTexto = ambito(filtros)

  const procedencia = () => ({
    fuente: 'CONAF · Unidad de Información y Análisis',
    generado_etl: manifest?.generado ?? null,
    descargado: hoy(),
    ambito: ambitoTexto,
    filtros: { ...filtros },
    url: window.location.href,
    aviso: NO_ACTIVOS,
  })

  const listo = (nombre, bytes) => setEstado(`${nombre} · ${kb(bytes)}`)

  const csvDe = (id) => {
    const fs = datos[id]?.features
    if (!fs) return null
    if (id === 'incendios') return csvIncendios(fs, tablas, predicados.incendios)
    if (id === 'oecv') return csvOECV(fs, predicados.oecv)
    if (id === 'puntos_standby') return csvStandby(fs, predicados.puntos_standby)
    return null
  }

  const bajarCSV = (id) => {
    const r = csvDe(id)
    if (!r) return
    setEstado(`Preparando ${fmt.format(r.n)} filas…`)
    const bytes = guardar(nombreArchivo(id, filtros, 'csv'), r.texto, 'text/csv;charset=utf-8')
    listo(nombreArchivo(id, filtros, 'csv'), bytes)
  }

  const bajarGeoJSON = (id) => {
    const fs = datos[id]?.features
    if (!fs) return
    const r = geojsonDe(id, fs, predicados[id], {
      tablas: id === 'incendios' ? tablas : null,
      codificados: id === 'incendios' ? codificados : [],
      meta: procedencia(),
    })
    setEstado(`Preparando ${fmt.format(r.n)} figuras…`)
    const nombre = nombreArchivo(id, filtros, 'geojson')
    listo(nombre, guardar(nombre, r.texto, 'application/geo+json'))
  }

  const bajarPNG = async () => {
    setOcupado(true)
    setError('')
    try {
      setEstado('Capturando el mapa…')
      const { lienzo, fallidas } = await capturarMapa(map, base)
      const blob = await lienzoAPng(lienzo)
      const nombre = nombreArchivo('mapa', filtros, 'png')
      guardar(nombre, blob)
      setEstado(`${nombre} · ${kb(blob.size)}${fallidas ? ` · ${fallidas} teselas no cargaron` : ''}`)
    } catch (e) {
      setError(`No se pudo generar la imagen del mapa (${e.message}).`)
    } finally {
      setOcupado(false)
    }
  }

  const bajarInforme = async () => {
    // window.open TIENE que llamarse sincronamente dentro del manejador o el
    // bloqueador de ventanas emergentes lo mata; la captura del mapa es await.
    // Por eso se abre primero con un aviso y se reescribe al terminar.
    const win = window.open('', '_blank')
    if (!win) {
      setError('El navegador bloqueó la ventana emergente. Habilítalas para este sitio y reintenta.')
      return
    }
    win.document.write(
      '<!DOCTYPE html><meta charset="utf-8"><title>Generando el informe…</title>' +
        '<p style="font:15px system-ui;padding:24px">Generando el informe…</p>',
    )
    setOcupado(true)
    setError('')
    try {
      flush() // la URL se escribe con 250 ms de retraso; sin esto el informe cita la anterior
      setEstado('Generando el informe…')

      let mapa = null
      let mapaMotivo = null
      try {
        const { lienzo } = await capturarMapa(map, base)
        mapa = lienzo.toDataURL('image/png')
      } catch (e) {
        mapaMotivo = `No se pudo incluir la imagen del mapa (${e.message}). El resto del informe sí es válido.`
      }

      // Import dinamico: react-dom/server ya es dependencia transitiva, y asi
      // Vite lo deja en un fragmento aparte que solo baja quien pide un PDF.
      const { renderToStaticMarkup } = await import('react-dom/server')
      const indicadores = renderToStaticMarkup(
        <PanelIndicadores {...propsIndicadores} abierto onCerrar={() => {}} />,
      )

      const temps = temporadasIncendios(manifest)
      const html = construirInforme({
        ambito: ambitoTexto,
        filtros,
        capas: CAPAS.filter((c) => capasActivas.includes(c.id)).map((c) => c.etiqueta),
        url: window.location.href,
        fechaDatos: fechaLarga(manifest?.generado),
        fechaInforme: fechaLarga(new Date().toISOString().slice(0, 10)) ?? hoy(),
        aviso: NO_ACTIVOS,
        temporadas: temps ? `${temps.primera} a ${temps.ultima}` : null,
        mapa,
        mapaMotivo,
        leyenda: leyendaDe(capasActivas),
        indicadores,
        notas: [
          'Fuente: CONAF · Unidad de Información y Análisis. Los indicadores se calculan en el navegador sobre las capas cargadas y responden a los filtros declarados en la portada.',
          'Las advertencias metodológicas de cada indicador acompañan a su propia sección y forman parte del informe.',
        ],
        paleta: paletaClara(),
        autoImprimir: true,
      })
      win.document.open()
      win.document.write(html)
      win.document.close()
      setEstado('Informe abierto en una pestaña nueva. Usa «Guardar como PDF».')
    } catch (e) {
      try {
        win.close()
      } catch {
        /* ya cerrada por el usuario */
      }
      setError(`No se pudo generar el informe (${e.message}).`)
    } finally {
      setOcupado(false)
    }
  }

  const capasConDatos = EXPORTABLES.map((id) => {
    const meta = manifest?.capas?.[id]
    if (!meta) return null
    const def = CAPAS.find((c) => c.id === id)
    const porTeselas = meta.formato === 'pmtiles'
    const cargada = !!datos[id]?.features
    return {
      id,
      etiqueta: def?.etiqueta ?? id,
      porTeselas,
      cargada,
      // Callar por que un boton no funciona se convierte en un ticket de
      // soporte: el motivo va escrito.
      motivo: porTeselas
        ? 'se sirve por teselas y no hay figuras en el navegador'
        : !capasActivas.includes(id)
          ? 'enciende la capa para poder exportarla'
          : !cargada
            ? 'aún se está descargando'
            : null,
    }
  }).filter(Boolean)

  return (
    <section>
      <h2>Descargar</h2>
      <p className="capa-desc">
        Todo lo que se descarga respeta el filtro activo: <b>{ambitoTexto}</b>.
      </p>

      <button className="compartir" onClick={bajarInforme} disabled={ocupado || !map} aria-busy={ocupado}>
        Informe con el mapa (PDF)
      </button>
      <p className="capa-desc">
        Abre una pestaña con el informe listo para imprimir. En el diálogo, elige «Guardar como PDF».
      </p>

      <button className="limpiar" onClick={bajarPNG} disabled={ocupado || !map}>
        Imagen del mapa (PNG)
      </button>

      <h3>Datos del ámbito</h3>
      {capasConDatos.map((c) => (
        <div key={c.id} className="fila-descarga">
          <span className="etq">{c.etiqueta}</span>
          {c.motivo ? (
            <span className="meta">{c.motivo}</span>
          ) : (
            <span className="acciones">
              {/* `disabled` mira si la capa esta CARGADA, no si el CSV se
                  puede construir: llamar a csvDe() aqui armaba las 14.705
                  filas enteras en CADA render solo para decidir si el boton
                  esta gris. La comprobacion real vive en el onClick. */}
              <button onClick={() => bajarCSV(c.id)} disabled={ocupado}>
                CSV
              </button>
              <button onClick={() => bajarGeoJSON(c.id)} disabled={ocupado}>
                GeoJSON
              </button>
            </span>
          )}
        </div>
      ))}

      <p className="nota">
        El CSV usa «;» como separador y coma decimal, que es lo que abre Excel en español de Chile.
        En pandas: <code>read_csv(…, sep=&apos;;&apos;, decimal=&apos;,&apos;)</code>.
      </p>
      {manifest?.capas?.incendios?.archivo && (
        <p className="nota">
          Sin filtrar y con los códigos originales:{' '}
          <a href={urlPublicada(manifest.capas.incendios.archivo)} download>
            archivo publicado
          </a>
          .
        </p>
      )}

      <span className="aviso-copia" aria-live="polite">
        {estado}
      </span>
      {error && (
        <p className="nota aviso-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
