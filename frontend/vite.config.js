import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El repo no se llama <org>.github.io, asi que Pages sirve la app bajo el
// subpath /coipo_prevencion_incendio/. Sin este `base` los assets se piden a la
// raiz del dominio y la app sale en blanco al desplegar, aunque funcione en dev.
// Todas las rutas de datos deben usar import.meta.env.BASE_URL (ver src/config.js).
export default defineConfig({
  base: '/coipo_prevencion_incendio/',
  plugins: [react()],
  build: {
    // Multipagina: el visor y la vista de lineas electricas.
    //
    // index.html va EXPLICITO y no es redundante: en cuanto se declara `input`,
    // Vite deja de incluirlo por omision y el visor principal dejaria de
    // construirse con codigo de salida 0.
    //
    // `rolldownOptions` y no `rollupOptions`: en Vite 8.2.0 el segundo esta
    // marcado @deprecated (node_modules/vite/dist/node/index.d.ts).
    //
    // fileURLToPath y nunca `new URL(...).pathname`: en Windows la segunda da
    // "/C:/Users/...", una ruta que no existe.
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        electrico: fileURLToPath(new URL('./lineas-electricas.html', import.meta.url)),
      },
    },
  },
})
