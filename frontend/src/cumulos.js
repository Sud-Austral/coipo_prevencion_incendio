// leaflet.markercluster 1.5.3 NO importa Leaflet: se cuelga de la variable
// GLOBAL `L` al evaluarse (`L.MarkerClusterGroup = L.FeatureGroup.extend(...)`),
// porque se escribio para <script> sueltos. Empaquetado sin esto revienta con
// "L is not defined" al cargar el modulo.
//
// El global se pone en OTRO modulo (`leafletGlobal.js`) y se importa ANTES que
// el plugin: los import se evaluan en el orden en que aparecen, asi que dentro
// de este archivo el global ya existe cuando el plugin se evalua. La misma
// solucion, y por la misma razon, que en src/electrico/leaflet-global.js.
import L from './leafletGlobal'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'

export default L
