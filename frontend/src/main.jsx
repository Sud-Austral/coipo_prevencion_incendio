import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// El CSS de Leaflet va ANTES que el nuestro para que nuestros overrides ganen.
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
