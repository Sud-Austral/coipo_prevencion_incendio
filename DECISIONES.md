# Decisiones sobre los datos

Bitácora de las decisiones que **no** son automatizables y de las que sí lo son pero
requieren justificación. Cada una dice qué se decidió, con qué evidencia medida, y qué
aserción la vigila. Si una decisión no tiene vigilante, lo dice.

Reproducir el estado: `python ETL/run.py -v` y después `python ETL/verify.py --negativas`.

Estado a **2026-09-15** (§A–§P medidos el 2026-09-10; §Q y §R, el 2026-09-14; §S, el
2026-09-15). Las cifras llevan fecha porque caducan.

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

> **Actualización 2026-09-15.** Las cifras de esta sección son del modelo de priorización de
> 3 comunas, que ya no se publica (§S). La decisión se volvió a medir con el modelo nacional y
> se mantiene por otro motivo: en Mulchén, entre su mínimo (0) y su máximo (3,998), el
> min-max en diez escalones queda `[3, 0, 17, 59, 11, 19, 85, 11, 3, 5]` y **144 de sus 213
> manchas (68 %) caen en sólo dos escalones**, porque los niveles se agrupan cerca del centro
> de cada clase. Las cinco comunas medidas (Mulchén, Los Angeles, Coihaique, Natales,
> Santiago) tienen mínimo 0. La función es la misma; sólo lee `nivel_medio` en vez de
> `puntaje_medio`. Vigilan C4, C4b, C5 y C6, reescritas sobre la comuna que el arnés elige
> por definición.

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

## Q. La BBDD completa y Líneas eléctricas se publican como derivados, y el código 4.10 se recupera del texto (2026-09-14)

**Lo que se pidió.** Un GeoJSON con **todas las columnas** de
`BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx`, con los puntos en lat/lon, y una vista
de los incendios cuya «Causa general 2023» es «Líneas eléctricas».

**Un Excel corregido reemplazó al anterior.** Llegó una versión «(2)» con las mismas 14.985
filas y 23 columnas en 'Hoja 1', y sustituyó al archivo de `INSUMO_INCENDIO/`. Diferencias
medidas celda a celda contra el anterior:

- ID renumerados de 1 a 14.985 (el anterior tenía 5 duplicados y llegaba a 14.979);
- 132 comunas y 83 provincias que decían «Sin registro» ahora traen valor;
- **17 X y 12 Y corregidas**, una de ellas 60 km (Y 6.312.675 → 6.252.095);
- 16 fechas y horas que decían `#N/D` ahora tienen valor;
- la variante «residenciales , industriales» quedó unificada.

El número de puntos no cambió: 14.705, con 280 sin coordenadas y 45 con el huso de respaldo.

**Por qué van en `manifest.derivados` y no en `manifest.capas`.** `PanelLateral.jsx`
suma los `dominios` de todas las capas para los filtros y `App.jsx` une sus `bbox` para el
encuadre inicial. Una copia decodificada de incendios dentro de `capas` habría duplicado los
conteos de cada filtro sin que nada se pusiera rojo.

**Qué son.**

- **`bbdd_uad_completa.geojson`**: 14.705 puntos y 12.462.054 B.
  - Las claves son **las cabeceras reales** del Excel, normalizadas con `" ".join(h.split())` y en su orden.
  - Todas están presentes en cada feature (null cuando falta), más `lat`, `lon` y `utm_epsg`.
  - Los valores son los ya normalizados por el ETL (§A, §D).
- **`lineas_electricas.geojson`**: 1.248 puntos y 1.076.820 B. Es el filtro literal
  `Causa general 2023 == "Líneas eléctricas"` sobre la BBDD completa. Hay 22 filas sin coordenadas, que se declaran en `sin_coordenadas` con sus ID y su región: no desaparecen en silencio.
- **De dónde salen.** Los dos se construyen **con las mismas features** que `incendios.geojson`, antes de `codificar()`: no hay un segundo lector que pueda divergir.
- **Guardas del ETL.**
  - Revienta si la hoja trae una columna que no llega a los derivados.
  - Revienta si el literal de la causa desaparece del dominio, en vez de publicar un archivo vacío.

**Cómo se comprobó, con tres oráculos distintos.**
1. Una implementación independiente del contrato, escrita antes de tocar el ETL,
   produjo archivos **idénticos byte a byte** a los del ETL en Windows y a los que publicó CI
   en Ubuntu (sha256 `fec1bb29…` y `a4c56eac…`).
2. Contra la vista de referencia de la Región Metropolitana, hecha por otra persona con otro
   proceso, se emparejaron 135 puntos por (comuna, fecha, hora):
   - **mediana 64 m, p95 545 m** y ninguno a más de 50 km;
   - con los puntos desplazados al huso vecino, la mediana salta a 555 km, así que el cruce sí distingue;
   - los 3 puntos a más de 1 km (IDs 12336, 12174 y 12420) están en el huso correcto: la diferencia es de coordenada de origen entre la referencia y la BBDD.
3. D17 y D18 cruzan los derivados contra `incendios.geojson` fila a fila en cada corrida.

**El universo no es el de la referencia, y es a propósito.** La vista de referencia de la RM
tenía 386 puntos que mezclaban causas 1.1, 1.2, 1.5, 4.1, 4.6 y 4.10. El derivado usa sólo el literal
pedido: 195 filas en la RM. La referencia además coloreaba por un ráster de riesgo que no está
en el repo.

**El defecto del código 4.10, que estuvo publicado.** «Código causa general 2023» llega como
**número** en el Excel, y como número 4.10 es 4.1. `fmt_codigo('%g')` publicaba así
«Otras causas» bajo el 4.1 de «Faenas forestales», y 1.10 bajo 1.1:

- **1.056 features** con la etiqueta equivocada hasta el 2026-09-14 (1.006 y 50);
- la tabla `causa_general_codigo` no tenía ni `4.10` ni `1.10`;
- `analisis/` lo presentaba como hallazgo («4.1 lleva dos etiquetas»).

`_codigo_general` toma el prefijo de dos niveles de «Causa investigada 2023», que es texto y
conserva el `4.10`, **sólo si coincide como número** con la celda del Excel. Medido: 0 conflictos
y 3 filas con código de dos niveles (`4.6`).

**Qué lo vigila.**

- **D16**: el código general es el prefijo de la causa investigada.
- **D16b**: cada código lleva una sola etiqueta. Va con identificador propio porque es la única guarda de una fila 4.10.x con la etiqueta de 4.1 (el prefijo cuadra y D16 queda verde). Su mutación la aísla. Visto: con D16b anulada en una copia de `verify.py`, esa mutación sobrevive.
- **D17** y **D18**: los derivados coinciden con incendios fila a fila.
- **Sobre lo publicado antes del arreglo**, D16 marcaba 1.056 filas en rojo.

**Dos defectos latentes cerrados en la misma revisión.**

- **Celda de región vacía.** Pandas la entrega como `NaN` y `canon_region` la convertía en la
  cadena `'nan'`, que se habría publicado como región en `sin_coordenadas.por_region` con todo
  en verde. Ahora pasa por `norm_txt` antes. D11 cubre también esas claves, con su mutación.
  Visto: con la extensión de D11 anulada, la mutación sobrevive.
- **Filas sin ID.** Se publican con ID null, porque es lo que dice la fuente, y el log las cuenta. D17 y D18
  ya no indexan por ID: dos filas sin ID habrían dado falsos rojos.

**Lo que queda abierto.** La grafía de las comunas no se canoniza: el subconjunto eléctrico
trae 226 etiquetas para 220 comunas (CABRERO/Cabrero, angol/Angol, ARAUCO/Arauco, Chile
chico/Chile Chico, Isla De Maipo/Isla de Maipo, Padre Las Casas/Padre las Casas). La vista las
agrupa con una clave normalizada; el ETL y los filtros del visor no. Está en `mejoras.md`.

---

## R. La interfaz se alinea con catastro, con acento azul, y Líneas eléctricas es una vista del visor (2026-09-14)

**Lo que pasó.** La vista de Líneas eléctricas se publicó primero como una página aparte,
oscura, sin banner ni pestañas, con una paleta propia y sin enlace desde el visor. Luis no la
encontró y señaló que los colores no tenían relación ni con lo pedido ni con la línea
gráfica. Pidió además alinear todo el visor con `coipo_vista_catastro`: filtros en botones y la
ficha que manda el punto a Google Maps y Earth.

**Decisiones de Luis (2026-09-14).**

- **Líneas eléctricas es la tercera vista del visor, `?vista=electrico`**, a la derecha de Priorización.
  - Hereda banner, pestañas, paneles, cajones móviles, tema, ficha, Compartir y Descargar.
  - `lineas-electricas.html` terminará como redirección que conserva `?region=`.
- **Tema igual que el visor**: sigue el sistema, con los tokens de `index.css`.
- **Puntos por subcausa en las familias de `COLOR_CAUSA`**: 4.9.x derivados de Negligentes
  `#E69F00` y 1.9.x de Accidentales `#0072B2`. Así un incendio negligente es naranjo en las dos vistas.
- **Calor en rampa amarillo→rojo**, sin tramo azul, que se confundiría con los accidentales. Los puntos llevan borde blanco.
- **Público general.** Nombres cortos de subcausa en lenguaje simple, en una tabla atada a los
  códigos oficiales. La ficha muestra el nombre oficial y el código. **Luis revisa los nombres cortos antes de publicarlos.**
- **Ventana horaria 13:00–17:59 fija**, rotulada «ventana propuesta» y no como norma.
- **Filtros**: región, comuna, temporada, subcausa y negligente/accidental.
- **Acento de selección y foco: el azul del visor, no el verde de catastro.** En prevención el
  verde ya significa algo normativo: OECV Fiscal `#2E7D32` (Memo 3045/2025) y la causa Naturales
  `#009E73`. Un botón «seleccionado» verde junto a un tramo Fiscal verde confunde dos cosas distintas.
- **Orden de trabajo**:
  - **F0**: defectos y vigilantes;
  - **F1**: piel común;
  - **F2**: botonera en Incendios;
  - **F3**: Priorización;
  - **F4**: indicadores plegables;
  - **F5**: Líneas eléctricas integrada;
  - **F6**: retiro de la página aparte.

**Qué se trae de catastro y qué no.** Catastro y prevención salieron del mismo código
(`Tirador.jsx` es idéntico en los dos) y se separaron. Se copia el continente sin dominio,
anotando su origen `coipo_vista_catastro@a1ee125`: `BotonControl`, `CajaModal`, el CSS
`.grupo-filtro`/`.modal-filtro` y la URL de Earth en forma de búsqueda.

**No se traen**, por defectos vistos en capturas de catastro:

- el cajón con z-index 1000, que deja el zoom sobre el título;
- la etiqueta de fecha que pinta una pastilla vacía;
- el cartel arriba, que queda tapado;
- las filas de 25 px en táctil;
- el blanco sobre acento (2,09:1 en oscuro);
- «Quitar los 1 filtros»;
- retirar la leyenda, porque aquí el color es la única codificación de la causa;
- el ancho de panel de 560 px, que a 1201 px deja el mapa bajo el mínimo.

**La URL de Earth.** La de cámara (`/web/@lat,lon,0a,1200d,…`) aterriza a 1,2 km sobre el
satélite **sin ninguna marca** del punto: visto en captura. La de búsqueda (`/web/search/lat,lon`) planta
la chincheta. Catastro ya lo había aprendido; prevención seguía con la de cámara.

---

## S. El riesgo nacional reemplaza a la priorización de 3 comunas, y se publica un archivo por comuna (2026-09-15)

**Lo que llegó.** Un insumo nuevo de `lab/priorizacion` (notebook 4, `manchas_riesgo.py`,
salida `data/out4`): **111.939 manchas en 343 comunas de las 16 regiones**, un GeoJSON por
región. La región 12 viene **simplificada** en `manchas_riesgo_h3r8_12.json` (75 MB) porque
el original de 130 MB no cabe en el historial de GitHub. Se versiona en `INSUMO_RIESGO/`
junto con el CSV de las mismas manchas y `parametros.json`, copiados con sha256 idéntico al
del lab.

**No es una versión del modelo anterior, es otro modelo.** El de 3 comunas combinaba
riesgo, interfaz urbano-forestal, infraestructura y comunidades preparadas (`puntaje` 0–1 y
cuatro `sub_*`). Este mide **sólo la amenaza**: `nivel_medio` es la media del nivel de riesgo
(0–4) ponderada por superficie con dato, sobre celdas H3 de resolución 8 recortadas por
comuna, y una mancha es un conjunto conexo de celdas de la misma clase **dentro de una
comuna**. No hay exposición.

**Decisiones de Luis (2026-09-15), entre las opciones que se le plantearon:**

1. **Reemplazar** el modelo de 3 comunas y **conservar los íconos** de infraestructura
   crítica de Los Ángeles, Mulchén y Coyhaique encima de las manchas nuevas.
2. **Renombrar la vista a «Riesgo»**, porque «Alto» se leería como «prioridad alta». Los
   enlaces con `?vista=priorizacion` siguen abriéndola (`ALIAS_VISTA` en `config.js`).
3. **Navegar por comuna**: se elige la comuna y se carga sólo esa. Las alternativas eran
   teselas nacionales (se ve todo el país, pero hay que reescribir dibujo, ficha y
   normalización sobre `protomaps-leaflet`, y sólo se puede verificar en Actions: en este
   equipo no hay tippecanoe, WSL ni Docker) o un híbrido de las dos.

**Por qué un archivo por comuna, medido.** Nacional son **6.015.832 vértices**. Un único
GeoJSON pesa 163 MiB tal como sale del insumo (~154 MB con 5 decimales): GitHub rechaza
archivos de más de 100 MB y el canvas de Leaflet no lo dibuja. Por comuna la mediana pesa
**137 KB**; 10 comunas pasan de 1 MB y 5 de 10 MB (Natales 36,8 MB, Punta Arenas 16,0, Cabo
de Hornos 14,1, Tortel 14,0 y Aisén 11,2). Como una mancha nunca cruza un límite comunal,
partir por comuna no corta ninguna.

**El contrato.** `capas.riesgo` no tiene `archivo` sino `partes[<CUT>]` con `comuna`,
`region`, `archivo`, `features`, `bytes`, `bbox` y `clases`; además `regiones` (de norte a
sur, con sus comunas), `clases` (etiquetas y cortes, de `parametros.json`) y `fuente` (las
cuentas). Todo consumidor que recorría `capas[*].archivo` se adaptó: `verify.py`, el job
`humo`, `npm run datos` y `analisis/leer_capas.py`.

**Cinco trampas del insumo, todas medidas:**

- **1.231 manchas sin geometría** en la región 12 (9,24 ha en total, ninguna de más de
  0,04 ha), que dejó la simplificación. No se inventa su geometría: se descartan y se
  **cuentan** en `fuente.sin_geometria`, y el panel lo dice.
- **El CSV trae 111.943 filas y los GeoJSON 111.939**: 4 astillas de 0 ha que el notebook
  descarta al escribir la salida web. Se listan en `fuente.solo_en_csv`.
- **La grafía de las comunas cambió**: «Coihaique» (antes Coyhaique) y «Mulchén» (antes
  Mulchen). La infraestructura sigue escribiendo las viejas y **cruzar por nombre dejaba 0
  íconos**. Se cruza por **código CUT** (prefijo de `mancha_id`, y el campo `cut` nuevo de
  `infra_puntos`). Los nombres viejos se publican como `alias`, sacados de
  `build_infra_puntos.COMUNAS`, para que los enlaces `?comuna=Mulchen` sigan funcionando.
- **El `bbox` redondeado con `round()` deja manchas fuera de su caja**: las coordenadas
  viajan con 6 decimales y la caja con 5, y D14 no tiene margen. Medido: **436 manchas en 277
  comunas** se salían. Se redondea **hacia afuera**.
- **Una corrida nueva del notebook escribe `_12.geojson` y no borra el `_12.json`**. Si
  conviven dos fuentes para una misma región, el ETL se niega a elegir.

**La clase y el color.** `clase` sale de cortes fijos (0,5 / 1,5 / 2,5 / 3,5) sobre
`nivel_medio`, así que es comparable entre comunas. En un corte exacto el dato trae
cualquiera de las dos clases vecinas (123 manchas publicadas: la clase se calculó antes de
redondear a 3 decimales); fuera de los cortes no hay ni una discrepancia, y el ETL lo exige.
Los colores van por **nivel** y no por etiqueta (`COLOR_NIVEL`), y las etiquetas salen del
manifest: con las claves en femenino del modelo anterior («Muy Alta») el mapa entero habría
salido gris sin un error. La rampa es la del notebook 4 (`#F9A129` … `#650101`), elegida allí
porque el primer paso de la OrRd anterior (`#FEF0D9`) no se distinguía del blanco de «sin
dato».

**La región sale del CSV**, no de una tabla escrita a mano: `cod_region` → `region` →
`canon_region()`, y cada nombre tiene que caer en las 16 regiones del visor (D11).

**Rendimiento, medido el 2026-09-15** en Chrome headless, con una pestaña limpia por comuna,
servidor local y el heap leído después de forzar la recolección de basura:

| comuna | carga (CPU ×1 / ×4) | repintado de opacidad (×1 / ×4) | heap |
|---|---|---|---|
| Mulchén (213 manchas) | 0,4 s / 1,8 s | 24 ms / 118 ms | 15 MB |
| Aisén (6.980) | 1,0 s / 3,7 s | 185 ms / 780 ms | 95 MB |
| Punta Arenas (10.590) | 1,4 s / 4,4 s | 363 ms / 1,3 s | 124 MB |
| Natales (25.278) | 3,0 s / 8,4 s | 635 ms / 2,1 s | 267 MB |

Al volver a «Elige una comuna» el heap baja a 14 MB y el canvas queda sin tinta: las
manchas de una comuna **no** entran en la caché de módulo (`useGeoJSON(..., { cachear:
false })`). La tabla no incluye la red: sobre Pages, Natales son 36,8 MB antes de gzip. Una
primera medición daba 818 MB para Natales y era un artefacto de la herramienta: las páginas
anteriores seguían vivas en la caché atrás/adelante y el heap se leía sin recolectar.

**Qué lo vigila.**
- Datos (`verify.py`): **D1 y D5–D9 archivo por archivo** en las 343 comunas; **D14** (cada
  mancha en la caja de su comuna, con su CUT y su nombre); **D15** (cada punto de
  infraestructura en la caja de su CUT); **D19** (rangos del modelo y clase coherente con los
  cortes); **D20** (partes = total, leídas = publicadas + sin geometría, CSV = leídas + sólo
  en CSV, las 16 regiones y ningún `mancha_id` repetido). **12 mutaciones nuevas**; las 31
  se ponen rojas.
- Vista (`verify-priorizacion.mjs`, que conserva su nombre): **C2** (el enlace viejo abre
  Riesgo sin comuna y sin tinta), **C3** (la grafía vieja elige la comuna y cruza los íconos
  por CUT), **C15** (la leyenda rotula las clases del manifest y la mayor parte de la tinta es
  de sus colores: 97,1 % en Mulchén), y C4–C13 reescritas sobre la comuna que el arnés elige
  **por definición** desde `dist/data`, sin escribir ninguna.

**Qué NO está resuelto:**
- **Las 5 comunas de más de 10 MB son lentas en un equipo modesto** (Natales: 8,4 s de carga
  y 2,1 s por repintado con la CPU a ×4). Aligerarlas con una simplificación de cobertura
  (`shapely.coverage_simplify`, que respeta los bordes compartidos) cambiaría la geometría
  publicada: es una decisión sobre el dato y no se tomó. Simplificar cada mancha por separado
  **abre grietas**: medido a 25 m, los pares de manchas solapadas pasan de 23 a 13.627.
- **La región 12 publicada es la simplificada**: 5 geometrías inválidas por autointersección
  y bordes corridos hasta ~100 m (p99 20–30 m) respecto del original. La herramienta y la
  tolerancia de esa simplificación no quedaron registradas en el lab.
- **`mancha_id` no es estable entre corridas del modelo** (lleva el menor índice H3 de la
  mancha y un sufijo): no sirve para enlazar una mancha concreta desde fuera.
- **`doble_ponderacion.md` y `.tex` describen el modelo retirado.** Qué hacer con ellos lo
  decide Luis.

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

6. **Publiqué una página que nadie podía encontrar.** El 2026-09-14 la vista de Líneas
   eléctricas quedó en `lineas-electricas.html` sin ningún enlace desde el visor. Luis entró
   por la raíz, vio dos pestañas y preguntó dónde estaba. Lo había anotado como «pendiente»
   sin decir que, entrando por la dirección de siempre, no existía.

7. **Medí el contraste de la paleta y no miré la línea gráfica.** Los nueve colores de
   subcausa pasaban el validador, pero no tenían relación con `COLOR_CAUSA` ni con el sitio: el
   mismo incendio negligente era naranjo en el visor y magenta en la página nueva. Una
   medición correcta no sustituye mirar el resultado junto a lo que ya existe.

8. **Dejé una superposición temporal en archivos versionados.** Para probar la página copié
   datos de prueba en `frontend/public/data` con la idea de restaurarlos al final. Luis
   commiteó y empujó a mitad de la sesión y la superposición entró en `18ff9db`, con el
   manifest mezclando la capa vieja y los derivados nuevos. No llegó al sitio, porque CI
   regenera las capas antes de construir (lo publicado coincide byte a byte con la salida del
   ETL), y el commit de datos de CI la reemplazó 4 minutos después (22:36:31 → 22:40:39 UTC).
   Pero quedó en la historia. Las superposiciones van en copias, nunca en el árbol que alguien
   puede commitear.

9. **Regeneré el notebook sin ejecutarlo.** `construir_notebook.py` dice que el entregable es
   el `.ipynb` ejecutado; lo regeneré, no corrí `nbconvert` y quedó publicado sin una sola salida
   (de 42 a 0). Se reejecutó el mismo día contra los datos de CI: 43 salidas, 0 errores y las 7
   figuras miradas.
