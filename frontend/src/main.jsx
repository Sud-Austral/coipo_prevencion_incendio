import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// El CSS de Leaflet va ANTES que el nuestro para que nuestros overrides ganen.
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

// El esqueleto de arranque de index.html se retira ANTES del primer render, no
// despues: React monta dentro de #root y dejarlo puesto lo apilaria sobre el
// banner real durante un fotograma. Retirarlo aqui es ademas lo que mantiene
// ciegas a A10 y al sondeo de A1 de scripts/verify-banner.mjs.
document.getElementById('arranque')?.remove()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
