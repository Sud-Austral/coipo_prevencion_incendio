import {
  CAPAS,
  COLOR_CAUSA,
  COLOR_OECV,
  COLOR_RUTA,
  COLOR_REDVIAL,
  COLOR_STANDBY,
  FILTROS,
  fechaLarga,
  fmt,
  fmt1,
} from '../config'

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

function Chip({ color }) {
  return <span className="chip" style={{ background: color }} />
}

export default function PanelLateral({
  manifest,
  kpis,
  capasActivas,
  onToggleCapa,
  filtros,
  onFiltro,
  onLimpiar,
  cuentas,
  cargando,
  base,
  onBase,
  basemaps,
  abierto,
  onCerrar,
}) {
  const capasMan = manifest?.capas ?? {}
  const fecha = fechaLarga(manifest?.generado)

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
    return [...vistos.entries()].sort((a, b) => b[1] - a[1])
  }

  const filtrosVisibles = FILTROS.filter((f) => f.capas.some((c) => capasActivas.includes(c)))
  const hayFiltros = Object.values(filtros).some(Boolean)

  return (
    <aside className={`panel${abierto ? ' abierto' : ''}`}>
      <header>
        <h1>Prevención de Incendios Forestales</h1>
        {/* Sin "CONAF ·": el banner de arriba ya lo dice, y repetirlo a 12 px
            bajo la marca institucional es ruido (§7.3 del prompt del insumo).
            La fecha va AQUI y no solo en el pie: el panel scrollea, y el pie
            queda fuera de pantalla en cuanto hay capas y filtros: preguntarse
            de cuando son los datos es lo primero que hace quien abre el visor. */}
        <p className="sub">
          Temporada 2025-2026
          {fecha && (
            <>
              {' · '}
              <span className="fecha" title={`Generado por el ETL el ${fecha}`}>
                datos al {fecha}
              </span>
            </>
          )}
        </p>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </header>

      <section>
        <h2>Capas</h2>
        {CAPAS.map((c) => {
          const meta = capasMan[c.id]
          if (!meta) return null
          const activa = capasActivas.includes(c.id)
          return (
            <label key={c.id} className="fila-capa">
              <input type="checkbox" checked={activa} onChange={() => onToggleCapa(c.id)} />
              <span className="etq">{c.etiqueta}</span>
              <span className="meta">
                {cargando[c.id] ? (
                  <em>cargando…</em>
                ) : activa && cuentas[c.id] != null ? (
                  fmt.format(cuentas[c.id])
                ) : (
                  kb(meta.bytes ?? 0)
                )}
              </span>
            </label>
          )
        })}
      </section>

      <section>
        <h2>Filtros</h2>
        {filtrosVisibles.map((f) => {
          const ops = opcionesDe(f.campo)
          if (!ops.length) return null
          return (
            <label key={f.campo} className="fila-filtro">
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
          )
        })}
        <button className="limpiar" onClick={onLimpiar} disabled={!hayFiltros}>
          Limpiar filtros
        </button>
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
            <h3>OECV · titularidad</h3>
            {Object.entries(COLOR_OECV).map(([k, v]) => (
              <div key={k} className="leyenda">
                <Chip color={v} /> {k}
              </div>
            ))}
          </>
        )}
        {capasActivas.includes('puntos_standby') && (
          <div className="leyenda">
            <Chip color={COLOR_STANDBY} /> Punto stand-by
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

      {kpis?.oecv && (
        <section>
          <h2>Resumen OECV</h2>
          <div className="kpi">
            <b>{fmt1.format(kpis.oecv.km_planificados)} km</b> planificados
          </div>
          <div className="kpi">
            <b>{fmt1.format(kpis.oecv.km_reportados)} km</b> reportados
          </div>
          <div className="barra">
            <span style={{ width: `${Math.min(100, kpis.oecv.avance_pct)}%` }} />
          </div>
          <div className="kpi">{fmt1.format(kpis.oecv.avance_pct)} % de avance nacional</div>
        </section>
      )}

      <section>
        <h2>Mapa base</h2>
        <select value={base} onChange={(e) => onBase(e.target.value)}>
          {Object.keys(basemaps).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </section>

      <footer>
        {fecha ? `Datos generados el ${fecha} desde ` : 'Datos generados desde '}
        <code>INSUMO_INCENDIO</code>.
      </footer>
    </aside>
  )
}
