# Decisiones sobre los datos

Bitácora de las decisiones que **no** son automatizables y de las que sí lo son pero
requieren justificación. Cada una dice qué se decidió, con qué evidencia medida, y qué
aserción la vigila. Si una decisión no tiene vigilante, lo dice.

Reproducir el estado: `python ETL/run.py -v` y después `python ETL/verify.py --negativas`.

Estado a **2026-09-10**. Las cifras llevan fecha porque caducan.

> Este documento manda sobre `ETL/` y sobre la simbología de `frontend/src/config.js`.
> Léelo antes de tocar cualquiera de los dos: casi todo lo que parece un error ahí está
> explicado y medido.

---

## A. El huso UTM no viene declarado, cambia por fila, y la regla obvia manda Calama al mar

**El síntoma.** La planilla de incendios investigados por las UAD trae coordenadas
proyectadas sin decir en qué huso. Chile cruza el 18S y el 19S.

**La causa, medida.** La regla que todo el mundo escribe primero —`X < 500000` → 19S, si
no 18S— falla justo al este del meridiano −69°, que es donde está el norte del país.
Calama da un *easting* de ~510.000 y con esa regla terminaba **470 km mar adentro**.

**Decisión.** Se prueban **ambos husos** y se elige el que cae dentro de la franja de
longitudes de la región declarada en la propia fila (`geo.LON_REGION`). La región viene
en el registro; el huso no. Se usa el dato que sí está para deducir el que falta.

**Qué lo vigila.** **D13** (mediana de la distancia al camino más cercano < 1,5 km) y
**D12** (99 % de los incendios a menos de 25 km de un camino). Un punto con el huso
invertido aterriza 300–600 km al oeste, en el Pacífico, y revienta las dos.
Control negativo: `python ETL/verify.py --negativas` desplaza la longitud de media
muestra 5° al oeste y exige que D13 se ponga roja.

**Qué cuesta.** Medido el 2026-09-10 sobre 500 incendios contra 19.242 líneas viales:
mediana **0,36 km**, p95 **2,2 km**, máximo **10,2 km**, y **500/500** dentro de 25 km.

> **Ojo:** D12 y D13 sólo corren si existe `ETL/_build/*.geojson`, el intermedio que
> consume tippecanoe. En Windows no se genera (ver §L), así que en local hay que
> producirlo antes. `--negativas` **no se salta el control en silencio**: si falta, lo
> dice y cuenta como fallo.

---

## B. El CRS no se asume nunca: hay cuatro sistemas entre los shapefiles

**El síntoma.** Los insumos regionales llegan de 16 unidades distintas, cada una con su
software y su plantilla.

**La causa, medida.** Entre los 33 shapefiles conviven **22 en EPSG:32719, 9 en 32718, 1
en 4326 y 1 en 9707**. En la corrida de rutas del 2026-09-10 el reparto medido fue
`{32718: 1358, 32719: 4124}` features.

**Decisión.** Se lee el EPSG del `.prj` de **cada** archivo. No hay valor por omisión, y
no se infiere del nombre ni de la región.

**Qué lo vigila.** **D9** (todas las coordenadas dentro del rectángulo de Chile). Un CRS
mal supuesto saca los puntos del país.

---

## C. La Red vial MOP no declara CRS, y el bbox lo delató

**El síntoma.** `Red-vial_MOP_2024.json` son 87 MB de GeoJSON sin miembro `crs` y con
coordenadas que no son grados.

**La causa, medida.** Es **EPSG:32719**, deducido del bbox y **confirmado reproyectando el
primer vértice**: cae en Arauco–Lebu, coincidiendo con lo que dicen sus propios campos
`NOMBRE_CAM` y `REGION`.

**Decisión.** Se fija 32719 explícitamente en `ETL/build_redvial.py`, con la comprobación
escrita al lado. No se adivina en cada corrida.

**Qué lo vigila.** **D9** y **D4** (bbox del PMTiles dentro de Chile). Medido el
2026-09-10: `[-74.142, -54.948, -67.061, -17.498]`.

---

## D. Los anchos del `.dbf` están en bytes, no en caracteres

**El síntoma.** El campo `Inst` de algunos shapefiles salía como `'OP  F'` en vez de
`'MOP'`.

**La causa, medida.** El formato DBF declara el ancho de cada campo **en bytes**.
Decodificar el registro completo a texto *antes* de cortarlo por esos anchos desplaza
todos los campos posteriores a la primera tilde: una `ó` ocupa dos bytes y un carácter.

**Decisión.** `ETL/shp_reader.py` corta el registro **en bytes** y decodifica cada campo
por separado, con el `.cpg` cuando existe.

**Qué lo vigila.** **D10** (los campos de filtro están presentes) sólo caza la ausencia,
no el corrimiento. **No hay aserción que vigile el contenido de los campos de texto.**
Anotado en `mejoras.md`.

---

## E. El `Consolidado` de rutas pierde 476 rutas, así que no se usa como fuente única

**El síntoma.** El archivo consolidado nacional traía menos rutas que la suma de los
regionales.

**La causa, medida.** **201 registros con geometría vacía** y 198 de ellos sólo en La
Araucanía; 476 rutas perdidas en total. En la corrida del 2026-09-10 el ETL volvió a
reportar los **201 registros sin geometría** y los omitió.

**Decisión.** Se elige **la mejor fuente por región**, no una fuente única. La tabla con
la elección y su motivo vive en `ETL/build_rutas.py`.

**Qué lo vigila.** **D6** (el número de features cuadra con el manifest). Vigila que no se
pierdan *más*, no que la elección por región siga siendo la mejor: eso es una decisión
que hay que revisar cuando lleguen insumos nuevos.

---

## F. Tres features de Los Lagos vienen en 17S declarando 18S

**El síntoma.** Tres rutas de Los Lagos caían en el Atlántico.

**La causa, medida.** Vienen en UTM **17S** pese a que su `.prj` declara 18S. Se detectan
por su *easting* mayor que 1.000.000, **no** por un bbox de Chile: reproyectadas dan
lon ≈ −67,8, que **cae dentro** del rectángulo nacional aunque a latitud −42 eso sea
Argentina. Un filtro por bbox no las habría visto.

**Decisión.** Se descartan, y el ETL las nombra una por una al hacerlo. Corrida del
2026-09-10:

```
[rutas] 3 features con coordenadas fuera de rango UTM, descartadas:
    Los Lagos: Putemún - Rilán - Aguantao
    Los Lagos: Yutuy - Punta Peuque
    Los Lagos: Cruce Ruta 5 - By Pass Chacao
```

**Qué cuesta.** Tres rutas menos, con nombre y apellido en la salida. Se prefiere eso a
publicarlas en el país equivocado.

---

## G. `Shape_Leng` viene en grados, así que las longitudes se recalculan

**El síntoma.** Las longitudes del `.dbf` no cuadraban con los kilómetros informados.

**La causa, medida.** `Shape_Leng` está en **grados** en todos los `.dbf`. Y para OECV hay
un agravante: ese archivo fuerza **todo Chile a la zona 19**, así que la distancia
proyectada depende de lo lejos que esté el tramo del meridiano central.

**Decisión.** La longitud se calcula **sobre la geometría**, y para OECV de forma
**geodésica**. Nunca se lee de `Shape_Leng`.

**Qué lo vigila.** El cruce contra `KM_OFICIAL_NACIONAL` de `ETL/build_oecv.py` y contra
`kpis.json`, que hace `analisis/leer_capas.py`. **No corre en `verify.py`.** Anotado en
`mejoras.md`.

---

## H. Un solo renderer de canvas para todas las capas, o sólo la de encima recibe los clics

**El síntoma.** Con varias capas encendidas, OECV y stand-by dejaban de responder al clic.

**La causa, medida.** Leaflet engancha los eventos de ratón **al elemento `<canvas>`**. Con
un canvas por capa, sólo la de encima recibe los clics y las de debajo no llegan a
consultarse. Y **cuál queda encima lo decide el orden en que terminan de descargarse los
archivos**: incendios son 3,9 MB, siempre llega el último, y dejaba mudas a las demás.

**Decisión.** El renderer se declara **una vez en las opciones del mapa**, no en cada
componente, y todas las capas vectoriales lo comparten.

**La regla escrita se quedaba corta, y se amplía (2026-09-10).** No basta con «ningún
componente declara `renderer`»: `Map.getRenderer` evalúa
`layer.options.renderer || this._getPaneRenderer(layer.options.pane) || this.options.renderer`,
y `_getPaneRenderer` **crea un renderer nuevo para cualquier pane que no sea
`overlayPane`**, con precedencia sobre el compartido. O sea que declarar un `pane` propio
reintroduce el defecto sin haber escrito la palabra `renderer`. La regla correcta es:
**ninguna capa vectorial declara `renderer` NI `pane`.** Lo del `pane` está **leído en
el fuente** de Leaflet 1.9.4 de `node_modules` (por un subagente), **no comprobado con un
mutante**. Y C1 no lo cazaría tal como está: en su estado sano sólo contestan incendios y
stand-by, que son las dos `CapaPuntos` y compartirían el mismo pane mutado.

Esto no afecta a los marcadores con icono de la vista de priorización: un `L.Marker` no es
un `Path`, nunca llama a `getRenderer()`, y su icono se registra con
`addInteractiveTarget`. Son **dos caminos de eventos disjuntos** —el canvas lleva
`_leaflet_disable_events` y `Map._handleDOMEvent` descarta lo que venga de él—, así que el
pane de marcadores no compite por ser el `target`. Ver `CapaIconos.jsx`.

**Qué lo vigila.** **La aserción C1 de `frontend/scripts/verify-priorizacion.mjs`, con su
control negativo.** Enciende OECV + stand-by + incendios, barre una rejilla de 15×10 clics
sobre el mapa y exige que respondan **dos capas distintas por lo menos**. Medido en el
estado sano: 2 capas (26 aciertos de incendios, 1 de stand-by).

**Alcance de C1, medido con tres mutantes (2026-09-14).** Una primera versión de este
párrafo afirmaba que el mutante de `mejoras.md` no reproducía el defecto «ejecutado». **Era
falso**: lo que se había visto verde era una C1 anterior que no podía detectar nada. Contra
la C1 válida:

| Mutante | C1 | Qué capa contesta |
|---|---|---|
| `renderer` quitado de las opciones del mapa (el de `mejoras.md`) | **roja** | sólo incendios (7) |
| renderer compartido pero **sin** `tolerance: 8` | **roja** | sólo incendios (7) |
| canvas **propio por capa**, con `tolerance: 8` intacta | **roja** | sólo stand-by (9) |

Así que C1 **sí** vigila §H —el tercer caso es el síntoma exacto: sólo contesta la capa de
encima—, pero **también** se pone roja si se pierde la tolerancia, que es otro defecto. Los
dos primeros mutantes mezclan ambos y no dicen cuál cazaron. El control negativo del arnés
usa el tercero.

**Estado: CERRADA.**

---

## I. Las capas viales van a teselas y las ligeras siguen en GeoJSON

**El síntoma.** Las dos capas viales suman 19.000 líneas y 5,7 M de vértices.

**La causa, medida.** Como GeoJSON obligarían a descargar el país entero a detalle
completo sólo para ver el mapa nacional. Medido el 2026-09-10 en modo degradado: rutas
pasa de 3.843.489 a 100.253 vértices simplificando a 25 m; redvial, de 2.191.840 a
236.384.

**Decisión.** Las dos viales salen como **PMTiles**; el navegador pide por HTTP Range sólo
el viewport al zoom actual. Las ligeras siguen en **GeoJSON** porque hay que filtrarlas
por atributo y tenerlas enteras en memoria de todos modos.

**Qué cuesta.** Que el servidor **tiene que soportar HTTP Range**. Sin respuestas `206` el
visor **no dibuja ninguna carretera** y falla con «Check that your storage backend
supports HTTP Byte Serving». Eso no lo cazaba nadie hasta el job `humo` de
`.github/workflows/deploy.yml`, que pide `Range: bytes=0-126` contra el sitio publicado y
exige un 206 con el magic `PMTiles`.

**Qué lo vigila.** **D2** (header PMTiles válido), **D3** (los zooms del header cuadran con
el manifest) y **D4** (bbox). Medido: ambas capas `z4-13`.

---

## J. Los categóricos viajan como índices contra tablas del manifest

**El síntoma.** `incendios.geojson` pesaba 6,0 MB con las 23 columnas en texto.

**La causa, medida.** Repetir «Región del Biobío» y «Negligentes» catorce mil veces es la
mayor parte del archivo.

**Decisión.** Los campos categóricos se emiten como **índices enteros** contra
`tablas[campo][codigo]` del manifest. Bajan el archivo de **6,0 a 3,9 MB** y convierten el
filtrado en comparación de enteros.

**Qué cuesta.** Que el manifest pasa a ser el **contrato**: el frontend no hardcodea
ninguna temporada, región, causa ni institución. Si llega la temporada 2026-2027 aparece
sola en los filtros al reejecutar el ETL. A cambio, un índice que apunte a la tabla
equivocada da una etiqueta **plausible y falsa**, que es el peor fallo posible aquí.

**Qué lo vigila.** **D10** (los campos de filtro existen) y **D11** (las regiones están
canonizadas en todas las capas). D11 es la que impide que
«Región Metropolitana de Santiago» conviva con «Metropolitana» y se cuele como una opción
extra del filtro que deja capas enteras en cero sin ningún aviso.

---

## K. La fecha del manifest se arma con los componentes del ISO, no con `new Date()`

**El síntoma.** «datos al …» mostraba un día menos.

**La causa, medida.** `manifest.generado` es UTC. En Chile, `new Date(iso)` **retrocede un
día** todo lo generado antes de las 03:00 UTC.

**Decisión.** La fecha se arma con los **componentes del ISO**, sin construir un `Date`.

**Y dónde se muestra.** En la **cabecera** del panel, no sólo en el pie: el panel scrollea
y el pie queda fuera de pantalla en cuanto hay capas y filtros, y de cuándo son los datos
es lo primero que pregunta quien abre el visor.

---

## L. Sin tippecanoe el ETL degrada a GeoJSON, y por eso el único productor válido es Actions

**El síntoma.** Una corrida local en Windows cambiaba el formato de las capas publicadas.

**La causa, medida.** `tippecanoe` no corre nativo en Windows. Si falta, `ETL/tiles.py`
cae en **modo degradado**: emite `rutas.geojson` y `redvial.geojson` simplificados a 25 m
en vez de los `.pmtiles`, y lo anota en el manifest. El frontend monta entonces otro
componente para dibujar las capas viales.

**Decisión.** `frontend/public/data/` **se versiona**, y su **único productor válido es el
runner de GitHub Actions** (Ubuntu, tippecanoe 2.78.0). Para trabajar en local,
`npm run datos`, que baja lo ya publicado leyendo la lista del propio manifest.

**Qué cuesta.** Que el modo degradado deja artefactos con el mismo nombre que los buenos.
El 2026-09-10 se encontraron `rutas.geojson` (3,8 MB) y `redvial.geojson` (8,9 MB) del
6-ago **todavía versionados** junto a los `.pmtiles` del 3-sep: 12,7 MB muertos que el
manifest no declaraba y que nadie usaba. Se borraron.

**Y un efecto secundario que hay que saber:** como `_build/` sólo se puebla cuando corre
tippecanoe, **en Windows el cruce espacial de §A no se ejecuta**. Para correrlo en local
hay que generar el intermedio a mano (ver `CLAUDE.md` §3).

---

## M. La simbología de OECV es la oficial, no una elección de gusto

**Decisión.** Los tres colores de OECV por titularidad del terreno están definidos en el
**Memo N° 3045/2025** de la Gerencia de Protección contra Incendios Forestales de CONAF:
Fiscal `#2E7D32` (verde), Privado `#EF6C00` (naranjo), Sin determinar `#F9A825` (amarillo).

**Qué cuesta.** Que no se tocan por criterio estético. Y que todo color nuevo del visor
tiene que **no chocar** con esa tríada: por eso `COLOR_VERIFICADO` es cian oscuro
`#00838F`, que además sigue distinguible con daltonismo.

La paleta de causas es **Okabe-Ito**, elegida porque el color es la **única** codificación
de la causa y tiene que distinguirse con daltonismo.

---

## N. Los mapas base se eligieron midiendo, no leyendo la documentación del proveedor

**El síntoma 1: CARTO.** El fondo claro vivía en `basemaps.cartocdn.com` hasta que CARTO
cerró el acceso anónimo en **2026-08**. **No devolvió un 4xx**: siguió respondiendo
`200 OK` con un PNG válido, pero con «API KEY REQUIRED» estampado **dentro de los
píxeles**. Un sitio estático servido por Pages no puede guardar un secreto —ni una clave
restringida por dominio, que igual viaja en el bundle—, así que la salida fue un proveedor
sin clave.

**El síntoma 2: los zooms.** `maxNativeZoom` **no** sale de `MapServer?f=json`: ese
`maxLOD` describe la rejilla, no lo que hay cacheado sobre Chile, y **mintió en 5 de los 7
servicios evaluados**. La autoridad es el endpoint `/tilemap`, medido en seis puntos
—Arica, Valparaíso, Ñuble, Biobío, Araucanía y Punta Arenas—, que dieron el mismo techo en
los seis:

| servicio | declara | real |
|---|---:|---:|
| Canvas/World_Light_Gray_Base | 23 | **16** |
| Canvas/World_Dark_Gray_Base | 23 | **16** |
| World_Shaded_Relief | 13 | 13 |
| World_Topo_Map | 23 | 19 |
| World_Street_Map | 23 | 19 (no se usa) |
| NatGeo_World_Map | 16 | **12** (descartada) |
| World_Terrain_Base | 13 | **9** (descartada) |

Sin `maxNativeZoom`, pasado el caché real la tesela **sigue llegando con 200 OK** y un JPEG
gris de 2.521 B que dice «Map data not yet available», idéntico byte a byte en Arica,
Valdivia y Patagonia. Es decir: se cambiaría la marca de agua de CARTO por un cartel gris
en inglés, que es peor.

**Y la trampa dentro de la trampa:** el agotamiento **no se mide por el tamaño del
archivo**. `World_Topo_Map` devuelve 2.419 B de crema en blanco sobre el secano a z18 —que
es el mapa diciendo correctamente «aquí no hay nada»— y confundir eso con agotamiento
cuesta tres zooms de detalle real. `/tilemap` distingue las dos cosas; el peso del PNG no.

**Decisión.** Cada mapa base lleva su `maxNativeZoom` **medido**, y las tres sondas que
detectan un proveedor caído quedan escritas en `frontend/src/config.js`, porque **ningún
código HTTP las detecta**.

**Qué cuesta.** Las claves de `BASEMAPS` son un **contrato público**: cada una es a la vez
la etiqueta del selector, el valor de `?base=` en la URL y el literal contra el que
comparan `App.jsx` y `mapaPNG.js`. Añadir una es libre; **renombrar o retirar una ya
publicada cambia el significado de todo enlace compartido**, y `BASEMAPS[base] ?? .Claro`
degrada en silencio.

---

## Ñ. `AVISO_CIVICO` y `CONTACTO` van en `null`, y eso es una decisión, no un pendiente

**Decisión.** Los dos son `null` **a propósito**. Cualquier teléfono, correo o llamado a la
acción debe venir **redactado y autorizado por la Unidad de Información y Análisis de
CONAF**: este visor publica bajo la marca institucional, y un número inventado o copiado
de otra fuente le atribuye a CONAF un mensaje que no ha emitido.

**Y una tentación concreta que conviene nombrar:** el repositorio de GitHub donde vive este
código **no es un canal institucional de CONAF** —pertenece a la consultora que lo
desarrolla—, así que enviar ahí el reclamo de un vecino le inventa a la institución una vía
de atención que no ha publicado.

**Estado: ABIERTA.** Cuando la Unidad entregue el texto, se escribe ahí y la interfaz lo
pinta sola.

---

## O. El visor dice tres veces que no muestra incendios activos

**La causa.** Es el malentendido más caro del visor: miles de puntos naranjos sobre una
región, bajo un encabezado que nombra la temporada en curso, se leen como incendios
**activos ahora mismo**.

**Decisión.** La constante `NO_ACTIVOS` se pinta en tres superficies distintas. Y el
encabezado **no anuncia una sola temporada**: la capa cubre las nueve investigadas, y
`temporadasIncendios()` lee el rango de los `dominios` del manifest. **Ninguna temporada
está hardcodeada**: una nueva aparece sola.

---

## P. La normalización comunal reparte por rango, y no es un min-max (2026-09-10)

**Lo que se pidió.** Un botón que, con una comuna elegida, recalcule la escala de colores
entre el **mínimo y el máximo de esa comuna**, para poder responder «cuáles son las áreas
más prioritarias *dentro de esta comuna*» y no sólo «comparadas con todo Chile». Con la
escala del modelo, Mulchén se ve casi entera de un color pese a tener diferencias internas
reales.

**Por qué el min-max lineal no sirve, medido antes de elegir.** Normalizando Mulchén entre
su mínimo (0,1361) y su máximo (0,5555), el reparto en diez escalones queda
`[21, 54, 10, 3, 0, 4, 10, 3, 2, 3]`: **75 de sus 110 manchas (68 %) siguen amontonadas en
los dos escalones más bajos** y la mediana normalizada cae en 0,145. El problema no es que
la escala sea nacional, es que la distribución es muy asimétrica —332 de las 572 manchas
del país caen entre 0,136 y 0,272—, y reescalar los extremos no la endereza. Coyhaique es
peor: tiene **2 manchas en 0,0000 exacto** que tiran del mínimo y dejan el 15 % de la
comuna repartido en 7 milésimas de rampa.

**Decisión.** El color se reparte por la **posición dentro del ranking de la comuna**
(ocho escalones por cuantiles, anclados en el mínimo y el máximo comunales, que son los dos
extremos que se pidieron). Medido: el escalón más cargado baja de **54 a 15** manchas en
Mulchén, de **122 a 45** en Coyhaique y de **46 a 30** en Los Ángeles.

**El precio, y dónde se declara.** El color pasa a indicar **posición relativa, no
magnitud**: dos manchas contiguas en el ranking se ven igual de separadas difieran 0,001 o
0,15. Eso lo dice la leyenda con esas palabras. Con `K = 1` la misma función degenera en el
min-max lineal, por si alguna vez se quiere ofrecer también esa lectura.

**El dato original no se toca.** No existe ningún `puntaje_normalizado`, ni en el GeoJSON
ni en memoria: la normalización vive en una función pura de `src/escalas.js` y sólo la
consume el callback de estilo. Materializarla en el ETL habría creado un campo **que caduca
cada vez que entre una comuna nueva** —exactamente el defecto que el autor del modelo evitó
al rechazar los quintiles— y que además se exportaría y acabaría leído como si fuera el
puntaje.

**Por qué es opt-in y nunca el modo por omisión.** `priorizacion.py` calcula en escala
**absoluta** a propósito: *«Un hexagono da el mismo puntaje se corran tres comunas o las
346 del pais»*, y usa cortes fijos porque *«con quintiles, anadir comunas recolocaria a
todas las demas»*. La lectura relativa no puede desplazar a esa; convive con ella y se
anuncia. El botón **no existe sin una comuna elegida**, y elegir «Todas» devuelve la escala
del modelo sola: así el modo relativo nunca puede quedar activo sobre una vista
multicomunal, que es donde comparar colores entre comunas engañaría de verdad.

**Cómo se distinguen las dos lecturas.** Familia cromática distinta (secuencial naranja la
del modelo, morada la relativa), distintivo `RELATIVO` junto al título, extremos rotulados
con el **valor absoluto** y nunca con 0-100, y el **contorno de cada mancha conserva el
color de su clase absoluta** mientras el relleno usa la rampa comunal.

**Qué lo vigila.** C4, C4b, C5 y C6 de `verify-priorizacion.mjs`: que normalizar use más
colores, que ninguno acapare el mapa, que la leyenda rotule mínimo y máximo absolutos sin
hablar de porcentajes, y que cambiar de comuna recalcule los anclajes.

---

## Fallos propios cometidos al establecer todo esto

Se dejan escritos porque el diagnóstico falso fue plausible y podría repetirse.

1. **Di por buena la mediana del cruce sin mirar contra qué se cruzaba.** El 2026-09-10
   corrí `verify.py` y salió «✔ todo correcto» con el cruce espacial **omitido**: sin
   `ETL/_build/`, D12 y D13 no se ejecutaban y nadie lo decía en rojo. La suite entera
   parecía verde mientras las dos aserciones que importan no corrían. Por eso `--negativas`
   ahora **falla** si no puede verificarlas.

2. **Generé sólo `rutas` en `_build/` y leí el D12 rojo como un problema de datos.** Con
   una sola capa vial, 16 de 500 incendios quedan a más de 25 km de un camino y D12 se
   pone roja. No era un defecto: era mi intermedio incompleto. Producción cruza contra
   **rutas y redvial**, 19.242 líneas. Casi lo reporto como hallazgo.

3. **Reconfiguré `sys.stdout` y di el problema por cerrado.** El aviso más importante que
   emite el ETL —«sin tippecanoe: NO COMMITEES esta salida»— va por **stderr**, y siguió
   saliendo como el literal `⚠` hasta que lo miré otra vez. Arreglar la mitad de un
   problema de codificación se parece mucho a arreglarlo entero.

4. **Escribí la mutación D8 sin prever que reventaría el verificador.** Vaciar las
   coordenadas de un feature hacía que `_cruce_espacial` muriera con `ValueError` en el
   desempaquetado `for lon, lat in pts` en vez de dejar que D8 se pusiera roja. El control
   negativo encontró un bug real en el código de producción a los cinco minutos de
   existir; era exactamente su trabajo, pero no lo esperaba tan pronto.

5. **Supuse que el intérprete de este equipo era el que dice `analisis/README.md`.** Ese
   documento afirma que el real es `C:\ProgramData\anaconda3\python.exe`. Medido el
   2026-09-10, el que responde a `python` es
   `C:\Users\luis.monsalve\AppData\Local\anaconda3\python.exe`. La nota está desfasada y
   sigue en el repo.
