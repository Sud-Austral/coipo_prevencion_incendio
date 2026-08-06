import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El repo no se llama <org>.github.io, asi que Pages sirve la app bajo el
// subpath /coipo_prevencion_incendio/. Sin este `base` los assets se piden a la
// raiz del dominio y la app sale en blanco al desplegar, aunque funcione en dev.
// Todas las rutas de datos deben usar import.meta.env.BASE_URL (ver src/config.js).
export default defineConfig({
  base: '/coipo_prevencion_incendio/',
  plugins: [react()],
})
