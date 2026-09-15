// leaflet.heat 0.2.0 y leaflet.markercluster 1.5.3 no importan Leaflet: se
// cuelgan de la variable GLOBAL `L` al evaluarse (`L.HeatLayer = ...`,
// `L.MarkerClusterGroup = L.FeatureGroup.extend(...)`), porque se escribieron
// para <script> sueltos. Empaquetados sin esto revientan con
// "L is not defined" al cargar el modulo.
//
// Por eso este modulo se importa ANTES que los dos plugins en main.js: los
// import se evaluan en el orden en que aparecen, y el global tiene que existir
// cuando el plugin se evalua, no despues.
import L from 'leaflet'

globalThis.L = L

export default L
