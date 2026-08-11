import { useCallback, useEffect, useRef, useState } from 'react'
import { DATA } from '../config'

// Cache a nivel de modulo: sobrevive a los remontajes de React (incluido el
// doble montaje de StrictMode en desarrollo), asi que cada archivo se descarga
// una sola vez por sesion.
const cache = new Map()

export function useManifest() {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch(`${DATA}/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => vivo && setManifest(d))
      .catch((e) => vivo && setError(e))
    return () => {
      vivo = false
    }
  }, [])

  return { manifest, error }
}

/**
 * Descarga un GeoJSON solo cuando `activo` es true (carga perezosa).
 * Las capas viales pesan varios MB y no deben descargarse si nadie las enciende.
 */
export function useGeoJSON(archivo, activo) {
  const [data, setData] = useState(() => (archivo ? cache.get(archivo) : null) ?? null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  // Contador de reintentos: es lo unico que puede volver a disparar el efecto
  // cuando ni `archivo` ni `activo` han cambiado.
  const [intento, setIntento] = useState(0)
  const abort = useRef(null)

  useEffect(() => {
    if (!archivo || !activo) return
    if (cache.has(archivo)) {
      setData(cache.get(archivo))
      return
    }
    const ctrl = new AbortController()
    abort.current = ctrl
    setCargando(true)
    setError(null)

    fetch(`${DATA}/${archivo}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`${archivo}: HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        cache.set(archivo, d)
        setData(d)
        setCargando(false)
      })
      .catch((e) => {
        // El setCargando(false) va ANTES del return por aborto, no despues:
        // apagar una capa a mitad de descarga cancela el fetch, y con la
        // bandera arriba para siempre el aviso «Descargando … incendios» se
        // quedaba clavado y el panel entero al 55 % de opacidad por la clase
        // `refrescando`.
        setCargando(false)
        if (e.name === 'AbortError') return
        setError(e)
      })

    return () => ctrl.abort()
  }, [archivo, activo, intento])

  /**
   * Reintenta una descarga que fallo. La clave se borra del cache de modulo por
   * si acaso: hoy `cache.set` solo corre tras un fetch correcto, asi que un
   * fallo no puede envenenarlo, pero si alguien mueve ese set el early-return
   * de `cache.has` dejaria el reintento sin efecto y en silencio.
   */
  const reintentar = useCallback(() => {
    if (archivo) cache.delete(archivo)
    setError(null)
    setIntento((n) => n + 1)
  }, [archivo])

  return { data, cargando, error, reintentar }
}

export function useKpis() {
  const [kpis, setKpis] = useState(null)
  useEffect(() => {
    let vivo = true
    fetch(`${DATA}/kpis.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && setKpis(d))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  return kpis
}
