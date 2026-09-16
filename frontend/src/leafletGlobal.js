// El global que los plugins de Leaflet escritos para <script> sueltos esperan
// encontrar. Vive en su propio modulo para que el `import` que lo evalua pueda
// ir ANTES del plugin: ver el comentario de src/cumulos.js.
import L from 'leaflet'

globalThis.L = L

export default L
