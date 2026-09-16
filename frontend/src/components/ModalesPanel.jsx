import { CajaModal } from './GrupoFiltro'
import { AVISO_CIVICO, CONTACTO, NO_ACTIVOS, fechaLarga, fmt, temporadasIncendios } from '../config'

/**
 * Los tres modales que no filtran nada: Información, Descargar y Compartir.
 *
 * Origen del continente: coipo_vista_catastro@a1ee125
 * frontend/src/components/ModalesPanel.jsx.
 *
 * QUÉ SE MUEVE AQUÍ Y QUÉ NO (decisión de Luis, 2026-09-16: «mover lo
 * accesorio»). Se mueven las fuentes, la procedencia y las notas de detalle, que
 * son lo que se busca una vez. NO se mueve --sigue a la vista en el panel-- lo
 * que impide leer mal un dato: el aviso de que estos incendios no están activos
 * (DECISIONES.md §O, vigilado por B28) y la leyenda, porque aquí el color es la
 * única codificación de la causa y de la titularidad (§R).
 */

export function ModalInformacion({ manifest, onCerrar }) {
  const fuentes = Object.values(manifest?.capas ?? {})
    .map((m) => m?.titulo)
    .filter(Boolean)
  const fecha = fechaLarga(manifest?.generado)
  const temps = temporadasIncendios(manifest)
  return (
    <CajaModal titulo="Información" etiquetaCerrar="Cerrar información" onCerrar={onCerrar}>
      <h3>Qué muestra este visor</h3>
      <p className="nota">
        {NO_ACTIVOS}: cada punto es un incendio que ya ocurrió y fue investigado después
        {temps && ` (temporadas ${temps.primera} a ${temps.ultima})`}. Las obras OECV son el
        programa de prevención 2025-2026, y las capas viales son el contexto por donde llegan
        las brigadas.
      </p>
      {AVISO_CIVICO && <p className="aviso">{AVISO_CIVICO}</p>}

      <h3>Fuentes</h3>
      {fuentes.length > 0 ? (
        <ul className="lista-simple">
          {fuentes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="nota">Aún no ha llegado el manifest con las fuentes.</p>
      )}

      <h3>Procedencia</h3>
      {/* En el encabezado del panel no se repite «CONAF ·» porque el banner ya
          lo dice; aquí sí corresponde: el banner es una imagen, y si no carga no
          queda ni una atribución en texto en toda la página. */}
      <p className="nota">Publica: CONAF · Unidad de Información y Análisis</p>
      {fecha && <p className="nota">Datos generados por el ETL el {fecha}.</p>}
      {CONTACTO && <p className="nota">{CONTACTO}</p>}
    </CajaModal>
  )
}

/**
 * La explicación entera de la vista Riesgo, en un solo sitio.
 *
 * POR QUE EXISTE: un colega de CONAF la revisó el 2026-09-16 y no encontró
 * explicado NADA --empezando por el número que va al lado de cada comuna en el
 * selector, que es cuántas áreas tiene--. El panel tiene sitio para una pista
 * por control, no para el modelo entero; esto es lo que antes habría sido un
 * «¿qué es esto?» que nadie escribió.
 *
 * TODAS LAS CIFRAS SALEN DEL MANIFEST. Escribir «110.708» aquí sería una cifra
 * que caduca en la siguiente corrida del ETL sin que nada se ponga rojo.
 */
export function ModalInfoRiesgo({ meta, metaPuntos, generado, onCerrar }) {
  const comunas = Object.keys(meta?.partes ?? {}).length
  const familias = Object.values(metaPuntos?.familias ?? {})
  const fuente = metaPuntos?.fuente ?? {}
  const insulares = Object.values(fuente.fuera_de_chile ?? {}).reduce((a, b) => a + b, 0)
  const sinComuna = Object.values(fuente.sin_comuna ?? {}).reduce((a, b) => a + b, 0)
  const lejos = fuente.cut_fuera_de_su_caja?.total ?? 0
  const fecha = fechaLarga(generado)
  return (
    <CajaModal titulo="Información" etiquetaCerrar="Cerrar información" onCerrar={onCerrar}>
      <h3>Qué muestra esta vista</h3>
      <p className="nota">
        El <strong>nivel de riesgo del territorio</strong> según el modelo nacional de CONAF:
        una estimación de <em>amenaza</em> —cuánto favorece el territorio que un incendio
        empiece y avance—, no de cuánto se perdería si ocurriera. {NO_ACTIVOS}.
      </p>
      {meta && (
        <p className="nota">
          Son {fmt.format(meta.features)} áreas de riesgo repartidas en {fmt.format(comunas)}{' '}
          comunas de {fmt.format(meta.regiones?.length ?? 0)} regiones. Cada área es un trozo de
          territorio con un nivel medio de 0 a 4.
        </p>
      )}

      <h3>El número al lado de cada comuna</h3>
      <p className="nota">
        En el selector, «Coihaique (669)» significa que esa comuna tiene{' '}
        <strong>669 áreas de riesgo</strong> en el modelo. No es un puntaje ni un ranking: una
        comuna grande y variada se parte en más áreas que una pequeña y uniforme.
      </p>

      <h3>Los colores</h3>
      <p className="nota">
        Por omisión, el color es la <strong>clase del modelo</strong> (de Muy Bajo a Muy Alto),
        y significa lo mismo en todo el país: un «Alto» de Aysén es el mismo nivel que un
        «Alto» de Valparaíso. Los cortes de cada clase salen del propio modelo y están en la
        leyenda.
      </p>
      <p className="nota">
        «Normalizar dentro de la comuna» cambia a un <strong>contraste interno</strong>: los
        colores comparan sólo las áreas de esa comuna, para ver dónde está lo más y lo menos
        expuesto dentro de ella. Deja de ser comparable con otras comunas —por eso la leyenda
        se marca RELATIVO y muestra los valores absolutos del extremo—, y{' '}
        <strong>no cambia el dato</strong>: el contorno mantiene la clase del modelo.
      </p>

      <h3>Infraestructura crítica</h3>
      <p className="nota">
        Los círculos con un número son <strong>cúmulos</strong>: cuántos elementos hay
        agrupados ahí. Al acercar se separan hasta verse uno a uno, con el icono de su familia.
        {familias.length > 0 && ` Las familias son: ${familias.join(', ')}.`}
      </p>
      {(insulares > 0 || sinComuna > 0 || lejos > 0) && (
        <ul className="lista-simple">
          {insulares > 0 && (
            <li>
              {fmt.format(insulares)} elementos de Isla de Pascua y Juan Fernández no se
              dibujan: quedan fuera del área continental que cubre este visor.
            </li>
          )}
          {sinComuna > 0 && (
            <li>
              {fmt.format(sinComuna)} no traen comuna en el insumo de su servicio: se dibujan,
              pero desaparecen al filtrar por comuna.
            </li>
          )}
          {lejos > 0 && (
            <li>
              {fmt.format(lejos)} llevan un código de comuna que no coincide con dónde están.
              El código lo declara el servicio de origen y este visor no lo corrige: al filtrar
              por comuna salen en la que dice el código.
            </li>
          )}
        </ul>
      )}

      <h3>Qué se puede descargar</h3>
      <p className="nota">
        Con una comuna elegida: sus áreas en CSV (una fila por área, con su nivel y su
        superficie) o en GeoJSON (con la geometría completa, no la simplificada que se dibuja).
        La infraestructura se baja entera o sólo la de la comuna elegida, igual que en el mapa.
        El PNG es la imagen del mapa tal como está, con su atribución.
      </p>

      <h3>Procedencia</h3>
      <p className="nota">Publica: CONAF · Unidad de Información y Análisis</p>
      {meta?.titulo && <p className="nota">Capa: {meta.titulo}</p>}
      {fecha && <p className="nota">Datos generados por el ETL el {fecha}.</p>}
      {CONTACTO && <p className="nota">{CONTACTO}</p>}
    </CajaModal>
  )
}

/** Las descargas llegan como children: las arma App, que tiene las features. */
export function ModalDescargas({ onCerrar, children }) {
  return (
    <CajaModal titulo="Descargar" etiquetaCerrar="Cerrar descargas" onCerrar={onCerrar}>
      {children}
    </CajaModal>
  )
}

export function ModalCompartir({ aviso, urlManual, onCompartir, onCerrar }) {
  return (
    <CajaModal titulo="Compartir" etiquetaCerrar="Cerrar compartir" onCerrar={onCerrar}>
      <button type="button" className="compartir" onClick={onCompartir}>
        Compartir esta vista
      </button>
      {/* Esta frase no es opcional: un enlace con ?region= entrega un panel con
          cifras REGIONALES, y sin avisarlo se citan como nacionales. */}
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
    </CajaModal>
  )
}
