// Simbologia de la vista de lineas electricas: color por subcausa, contorno,
// cumulos, calor y mapa base por omision.
//
// Todo lo de este archivo esta MEDIDO el 2026-09-14, no elegido a ojo. Los
// scripts de la medicion no viven en el repo (eran desechables); lo que queda
// es el numero y el metodo, para que la proxima revision pueda rehacerlo.

// ---------------------------------------------------------------------------
// COLOR POR SUBCAUSA (`Causa investigada 2023`)
//
// Decision de Luis: familia 1.9.x (accidentales) en tonos FRIOS y familia
// 4.9.x (negligentes) en CALIDOS. Frios = tono OKLCH 170-300 (turquesa, azul,
// violeta); calidos = 335-95 (magenta, rojo, naranja, ocre, marron).
//
// Metodo: skill dataviz, validate_palette.js (OKLab x100, CVD simulado con
// Machado 2009 a severidad 1.0). Es un MAPA, asi que cuentan TODAS las parejas
// (36) y no solo las vecinas: dos puntos cualesquiera pueden quedar juntos.
// Se busco por computo el conjunto que maximiza la peor pareja con banda de
// luminancia 0,43-0,77, croma >= 0,10 y contraste >= 3:1 contra el tono
// dominante de «Claro» (#eeeeee, ver BASE_POR_OMISION). Resultado con
// `--pairs all --surface #eeeeee`:
//
//   banda PASS · croma PASS · contraste PASS (9/9 >= 3:1)
//   vision normal PASS  peor pareja 15,0 (#995c8b 4.9.6 / #d50b51 4.9.2; piso 15)
//   CVD WARN            peor pareja  7,8 (#e34cbb 4.9.1 / #1091c9 1.9.1; objetivo 8)
//
// El WARN no se puede cerrar con esta decision de diseno, y conviene saber por
// que: nueve categorias en un mapa estan por encima del tope que el propio
// metodo declara (tres para todas-las-parejas). Con seis calidos confinados a
// su familia, ocho semillas distintas de la busqueda toparon en 7,6-8,0 de CVD
// y 14,2-15,1 de vision normal. Lo que lo compensa, y por eso el WARN es
// legal: la leyenda nombra cada codigo con su conteo, el popup de cada punto
// dice el codigo y el nombre de la subcausa, y el contraste FRIO/CALIDO --que
// es la lectura principal-- es mucho mayor que cualquier pareja interna.
//
// Asignacion: dentro de cada familia, el color mas saturado va al codigo con
// mas incendios (4.9.2, 286 puntos -> carmesi), y el marron --el mas neutro--
// a «otras causas no clasificadas» (4.9.5).
// ---------------------------------------------------------------------------
export const COLOR_SUBCAUSA = {
  '1.9.1': '#1091c9', // Contacto de fauna con el tendido
  '1.9.2': '#7550eb', // Material desprendido por el viento contra el tendido
  '1.9.3': '#1844b9', // Otro accidente electrico no clasificado
  '4.9.1': '#e34cbb', // Combustion de vegetacion por contacto o proximidad
  '4.9.2': '#d50b51', // Corte de conductor por caida de rama o arbol
  '4.9.3': '#8f0d56', // Corte de conductor por caida o fatiga de estructura
  '4.9.4': '#bb731d', // Sobrecalentamiento de estructuras
  '4.9.5': '#7c4b02', // Otras causas electricas negligentes no clasificadas
  '4.9.6': '#995c8b', // Corte de cable por crecimiento de vegetacion
}

// Codigo que la paleta no conoce (una subcausa nueva en el Excel). Gris NEUTRO
// a proposito: tiene que leerse como «sin color asignado», no como una
// subcausa mas. La leyenda lo declara con data-respaldo="1" y lo cuenta.
// 3,70:1 contra #eeeeee.
export const COLOR_RESPALDO = '#7a7a7a'

// Contorno BLANCO de 1,5 px en cada punto. Sobre «Claro» casi no se ve y no
// hace falta (el relleno ya da >= 3:1), pero es lo que rescata el punto en los
// fondos oscuros, donde los nueve rellenos caen a 1,0-1,1:1: blanco contra el
// dominante de «Oscuro» #474749 da 9,6:1. Y separa el punto del calor oscuro.
export const COLOR_CONTORNO = '#ffffff'

// ---------------------------------------------------------------------------
// MAPA BASE POR OMISION
//
// Tono dominante (media RGB del bin mas poblado, histograma de 16 niveles por
// canal) de 15 teselas por fondo: Metropolitana, Valparaiso, Maule, Biobio y
// La Araucania --las cinco regiones con mas incendios de esta causa-- a
// z9/z11/z13, los mismos zooms que la medicion de src/config.js. Cuantos de
// los 9 colores quedan bajo 3:1 contra ese dominante, y que fraccion media del
// AREA de las teselas queda bajo 3:1:
//
//   Claro        #eeeeee (87% del area)  0/9 · 3,3% del area
//   Topografico  #fbfbf9 (30%)           0/9 · 9,6%
//   Calles       #f2efe9 (49%)           0/9 · 17,1%
//   Relieve      #e4d9d7 (18%)           3/9 · 41,3%
//   Oscuro       #474749 (90%)           9/9 · 98,3%
//   Satelital    #574926 (4%)            9/9 · 87,7%
//   Sentinel-2   #584529 (5%)            9/9 · 78,0%
//
// La interfaz es oscura como la referencia, pero el fondo del MAPA no: con un
// fondo oscuro la mejor paleta de nueve que se encontro por el mismo metodo
// no pasa el piso de vision normal (13,8) ni el de CVD (7,3).
// ---------------------------------------------------------------------------
export const BASE_POR_OMISION = 'Claro'

// ---------------------------------------------------------------------------
// CALOR
//
// Rampa de UN solo tono neutro (grafito), de claro a oscuro, y no la clasica
// azul-amarillo-rojo de la referencia: esa rampa reutiliza justo los tonos de
// las dos familias de subcausa, y un punto carmesi sobre una mancha roja
// deja de leerse. El gris no compite con ningun color de la leyenda y ademas
// no sugiere «peligro», que es lo correcto: esto es concentracion historica de
// incendios, no un indice de riesgo.
//
// leaflet.heat convierte la opacidad acumulada del pixel en la posicion del
// gradiente, asi que la parada 1 es el pixel mas cargado.
// ---------------------------------------------------------------------------
export const GRADIENTE_CALOR = {
  0.1: '#8a8a8a',
  0.4: '#5a5a5a',
  0.7: '#333333',
  1.0: '#141414',
}

// Presets del deslizador 1..3. radio y desenfoque en px a zoom >= 9 (se
// escalan hacia abajo a zoom nacional, ver main.js); `factor` multiplica la
// celda mas cargada para fijar el tope de la escala: menos tope, mas zonas
// saturadas.
export const PRESETS_CALOR = {
  1: { radius: 20, blur: 16, factor: 1.6 },
  2: { radius: 28, blur: 22, factor: 1.0 },
  3: { radius: 36, blur: 28, factor: 0.6 },
}
