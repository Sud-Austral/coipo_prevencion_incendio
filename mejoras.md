# Mejoras pendientes y hallazgos abiertos

Catálogo de lo que falta, lo que está por debajo del estándar y lo que no se puede copiar
de ningún sitio porque los datos son distintos.

Estado a **2026-09-15**. El repo de referencia es
[`coipo_vista_catastro`](https://github.com/Sud-Austral/coipo_vista_catastro): mismo stack
(React 19 + Vite 8 + Leaflet + oxlint + Python 3.13 + Pages, sin backend), otros datos.

---

## Reglas del trabajo

1. **Respetar el estilo de la casa.** Español, comentarios sin tildes en el código y con
   tildes en la interfaz, el comentario explica el *porqué* con la medida al lado, y las
   decisiones con evidencia van a `DECISIONES.md`. Nada de dominios hardcodeados: todo sale
   del `manifest.json`.
2. **No romper las invariantes del pipeline.** El único productor válido de
   `frontend/public/data/` es Actions; los arneses no importan nada de `src/`; el base path
   se comprueba sobre el artefacto y sobre el sitio publicado.
3. **Cada bloque nuevo de verificación llega con su mutante.** Si añades una aserción,
   añade su mutación. Es la regla que da sentido a `--negativas` y a
   `npm run verify:mutantes`.
4. **El repo de referencia es la plantilla**, pero no siempre gana: hay cosas que aquí ya
   están mejor (ver la última sección). Antes de "alinear" algo, comprobar en qué dirección.

## 0. Alineación de la interfaz con `coipo_vista_catastro` (plan F0–F6)

Decidido por Luis el 2026-09-14. Las decisiones y su porqué están en `DECISIONES.md` §R.
Cada fase deja el sitio en verde, con sus arneses y mutantes, y Luis decide cuándo
commitear y publicar cada una.

| Fase | Qué | Estado |
|---|---|---|
| **F0** | Defectos y vigilantes, sin rediseño | **HECHA, sin commitear** (detalle abajo) |
| F1 | Piel común: token de control, radios, sombra por tema, un solo anillo de foco, ficha con cabecera sticky y pista de scroll, botón de acento con contraste en oscuro | **HECHA el 2026-09-15, sin commitear** (`DECISIONES.md` §U) |
| F2 | Incendios: filtros en botonera con modal anclado (copiado de catastro con origen), Territorio región › provincia › comuna, Capas, Mapa base, Información · Descargar · Compartir | pendiente |
| F3 | Riesgo (antes Priorización) con la misma botonera. Su leyenda ya está en es-CL desde el 2026-09-15, al cambiar el insumo (`DECISIONES.md` §S) | pendiente |
| F4 | Indicadores en secciones plegables (`<details>` con el h2 dentro del `summary`) | pendiente |
| F5 | Líneas eléctricas como tercera vista `?vista=electrico` | pendiente |
| F6 | `lineas-electricas.html` pasa a redirección que conserva `?region=` | pendiente |

**Lo que dejó F0.**

- **Pestañas:** el cajón izquierdo ya no las tapa a ≤900 px. Lo vigila B24.
- **Foco:** el panel de indicadores ya no lo roba al cargar. Lo vigila B25.
- **Aviso con una temporada:** ya no dice «Enciende la capa» con una capa encendida. Explica por qué no hay serie y da las cifras de esa temporada. Lo vigila B26.
- **Cuentas de los filtros:**
  - cada filtro cuenta en la **primera capa encendida** a la que se aplica, con su unidad («incendios», «obras», «tramos», «rutas de despliegue»…);
  - antes «Biobío (5.049)» sumaba incendios, obras, stand-by, rutas y tramos, y con sólo Red vial encendida la carpeta contaba rutas de una capa apagada;
  - «Titularidad (OECV)» ofrecía 28 tipos de infraestructura de Priorización.

  Lo vigila B27, en 4 combinaciones de capas.
- **«No muestra incendios activos»:** vigilado como VISIBLE en el encabezado del panel, en el cartel, en el GeoJSON descargado y en el informe (B28). `getClientRects` solo no basta: con el cajón cerrado devuelve un rectángulo oculto.
- **Google en la ficha:**
  - la ficha abre el punto en satélite y Street View dentro de un modal del visor, y el iframe sólo existe mientras está abierto;
  - Street View sólo tiene imágenes pegado a una calle recorrida por Google, y ninguna URL sin clave salta al panorama más cercano: el aviso va encima del recuadro y ofrece «buscar alrededor en Google Maps»;
  - Earth, que no se deja incrustar, sale a otra pestaña con `/web/search/lat,lon` y planta la chincheta (la URL de cámara aterrizaba sin ninguna marca);
  - lo vigilan C12 y C16 (`DECISIONES.md` §T).
- **Fichas en es-CL:** además corrigió 46 porcentajes de 2.288 que `toFixed(1)` redondeaba mal. Lo vigilan C13 y C14.
- **Guardas de parcheo** de `verify:mutantes` y `verify:priorizacion -- --negativas`:
  - instantánea con sha256 y respaldo en disco con `pendiente.json`, que la corrida siguiente detecta;
  - restauración ante SIGINT, SIGTERM, SIGHUP y SIGBREAK;
  - `--solo` con un id desconocido falla.
- **Datos:**
  - la región vacía ya no se publica como `'nan'`;
  - D16b tiene identificador y mutación propios;
  - D17 y D18 toleran IDs nulos;
  - el notebook quedó reejecutado.

### Hallazgos abiertos que destapó F0 (defectos previos, no introducidos)

- ~~**El informe se titula con la fecha UTC.**~~ **CERRADO el 2026-09-15**: la fecha sale de
  la hora local (`fechaLarga(hoy())`). Lo vigila B31, que emula Pago Pago y Kiritimati
  (UTC−11 y UTC+14) y exige el mismo día que el nombre del CSV.
- ~~**Una cifra escrita a mano que es falsa con filtro.**~~ **CERRADO el 2026-09-15**: el
  puesto de Líneas eléctricas por recuento y por superficie se calcula de los incendios del
  ámbito. Lo vigila B29, con un oráculo propio en el país y en una temporada distinta.
- ~~**«0 % de los incendios investigados son de causa humana» con 0 incendios**~~ **CERRADO
  el 2026-09-15**: dice «Ningún incendio investigado cumple los filtros actuales». Lo vigila
  B30 con `?temporada=0000-0000`.
- ~~**Pestañas por teclado.**~~ **CERRADO en F1**: el foco va con la selección, y Inicio y Fin
  completan el patrón. Lo vigila B32.
- **`?vista=priorizacion` ignora `?lat=&lon=&z=`**: reencuadra a la comuna. Un enlace
  compartido desde esa vista perdería su encuadre. *Deducido del efecto `encuadradoPrior` y
  medido con una URL a mano; no generado desde el botón «Compartir».*
- ~~**La ficha de un incendio se corta a 1440×900.**~~ **CERRADO en F1**: cabecera fija, pista de
  desvanecido y `scroll-padding` para el foco. Lo vigila C17.
- **Filtros cortados a 287 px.** 6 de las 14 causas generales y 2 de las 7 carpetas se cortan en la lista. → F2,
  con filas que envuelven el texto.
- **Un filtro puesto en la URL cuyas capas están todas apagadas** sigue aplicándose, pero no
  se ve en el panel.
- **Con sólo OECV encendida, la región ofrece opciones con «(0 obras)».** Es honesto, pero
  ocultarlas es una decisión de presentación de Luis.
- **`--negativas` y `verify:mutantes` sobrescriben las capturas de `.verificacion/` con
  estados mutados.** Medido el 2026-09-15: tras `verify:priorizacion -- --negativas` la ficha
  capturada decía «2532.0 ha» (el último mutante de C14) y se leyó como un defecto que no
  existía. Conviene que las corridas con mutante escriban sus capturas en otra carpeta.
- **Un arnés que necesite otros datos no tiene dónde ponerlos**, salvo `verify:priorizacion`,
  que acepta `VERIFY_DATOS=<carpeta>` desde el 2026-09-15. Los demás sirven `dist/data`, que
  es copia de `public/data`: la tentación de componer ahí ya se pagó dos veces
  (`DECISIONES.md`, fallos 8 y 10).
- **Los arneses no fijan `prefers-color-scheme`.** En parte cerrado en F1: el de riesgo arranca
  en claro y captura los dos temas (C18). Falta `verify:electrico`, que se reescribe en F5.
- ~~**Perfiles de Chrome que los arneses dejan en `%TEMP%`**~~ **CERRADO el 2026-09-15.** Ya
  eran 381 perfiles y 8,7 GB: verify-priorizacion y verify-electrico no borraban el suyo, y
  panel y banner lo borraban justo tras `kill()`, con Chrome reteniendo archivos y el error
  silenciado. Ahora los cuatro esperan a que Chrome salga y reintentan; si no pueden, lo
  dicen. Comprobado: tras correr los cuatro arneses quedan 0. Un corte por señal sí deja el
  perfil de esa corrida (el proceso sale desde el manejador).
- **`src/index.css` y `src/fichas.js` tienen CRLF en la copia de trabajo** (git normaliza a LF).
  Por eso las anclas de sus mutantes son de una sola línea.

### Decisiones de Luis del 2026-09-15

- **`INSUMO_ELECTRICO/` y `doble_ponderacion.md` se mantienen.**
- **Riesgo: no se simplifica ninguna geometría, pero se trabaja en formato web optimizado
  (teselas), separadas por región.** **Hecho el mismo día**: `DECISIONES.md` §T. Queda por
  decidir si las teselas se versionan (~150 MB en la historia por cada cambio del insumo de
  riesgo) o viven sólo en el artefacto de Pages.
- **Los datos de subcausa se muestran tal como vienen.** Los datos son de otro departamento
  y Luis construye la herramienta: no hay tabla de «nombres cortos» que revisar. Deja sin
  efecto ese punto de `DECISIONES.md` §R.
- **Filtros en cascada**: cada filtro ofrece sólo lo que existe con los demás filtros
  puestos. Resuelve las opciones «(0 obras)» y va con F2.
- **La grafía de las comunas se canoniza** a la forma «Cabrero» (no «CABRERO»). **Hecho el
  2026-09-15**: 24 grafías unidas en `comunas_unidas`, vigilado por D21.
- **F1–F4 antes que F5**, como dice el plan.

### Pendientes de datos

- ~~**Las 5 comunas de riesgo de más de 10 MB son lentas en un equipo modesto.**~~ **CERRADO
  el 2026-09-15 con teselas por región** (`DECISIONES.md` §T): la vista ya no descarga
  geometría para dibujar; Natales encuadrada son 4,6 MB de rangos contra 36,8 MB. **Sin
  comprobar:** el workflow con GDAL en Actions.
- **9 astillas de riesgo de 0 ha no tienen figura en las teselas** (una unidad de tesela en
  z14 mide ~2 m). Siguen en atributos, CSV y GeoJSON; D26 las cuenta.
- **La región 12 de riesgo se publica simplificada**, con 5 geometrías inválidas y 1.231
  manchas sin geometría (9,24 ha, contadas en el manifest). Si el lab registra cómo se
  simplificó, o produce el `.json` de forma reproducible, se puede verificar; hoy no.

- ~~**Canonizar la grafía de las comunas en el ETL.**~~ **HECHO el 2026-09-15** (D21).

### Para F5 (salió de la revisión adversarial de la página de Líneas eléctricas)

- **Círculos comunales que roban el clic.** Se añaden después de los puntos al mismo canvas, y
  una comuna con un solo incendio (43 de 218) tapa su punto → `interactive:false` o `bringToBack`.
- **Cúmulos bloqueados tras cambiar de fondo.** markercluster congela `_maxZoom` al crearse:
  tras pasar a Satelital (maxZoom 18) un cúmulo que sólo se separaba a z19 queda bloqueado → `maxZoom` fijo en el mapa.
- **Comentario del calor que no cuadra con el código.** Dice «a z5 queda en la mitad», pero el piso es 0,8.
- **Huecos del arnés actual (`verify-electrico.mjs`).**
  - Ninguna aserción vigila §H: el clic se hace con las comunas apagadas y no cuenta canvas.
  - El mutante de E5 se pone rojo por el formato de la clave, no por la agrupación.
  - ~~Sus guardas no atienden SIGHUP ni SIGBREAK.~~ **CERRADO el 2026-09-15**: las cuatro
    señales, matan build y Chrome, y borran el respaldo tras un corte limpio. Probado con
    `--solo E11 --simular-ctrl-c 6000 --senal SIGHUP`: salida 129, fuente igual byte a byte y
    sin respaldo.

### Para `coipo_vista_catastro` (vistos al relevarlo; no se tocan desde este repo)

- **Cajón:** z-index 1000; el zoom de Leaflet se pinta sobre el título del cajón a 400 px.
- **`EtiquetaImagen`:** pinta una pastilla vacía bajo el zoom.
- **Cartel:** va arriba y queda tapado por el zoom y por la etiqueta de fecha con Satelital.
- **Táctil:** filas de 25 px, porque la media query `coarse` va antes de la regla base.
- **Contraste:** blanco sobre el acento lleno en oscuro, 2,09:1.
- **Textos:** «Quitar los 1 filtros»; h2 duplicado en Descargar; doble marcador en las secciones plegadas.
- **Filtros:** `con-filtro` activo en Territorio y Mapa base sin haber elegido nada.
- **Modales:** listas con scroll de 240 px cortadas en seco, sin pista de que hay más.

---

## 1. Faltantes por integrar

### Prioridad alta

- ~~**La aserción del renderer compartido, y su mutante.**~~ **HECHO el 2026-09-10.** Es
  **C1** de `frontend/scripts/verify-priorizacion.mjs`, con su control negativo
  (`npm run verify:priorizacion -- --negativas`). Enciende OECV + stand-by + incendios,
  barre una rejilla de 15×10 clics y exige que respondan dos capas distintas.

  **Dos cosas que salieron al escribirla**, medidas ejecutándolas:

  1. **El mutante que proponía esta ficha SÍ reproduce el defecto**, pero no sólo ese.
     Quitar `renderer` de las opciones del mapa pone C1 roja; también la pone roja un
     renderer compartido sin `tolerance: 8`. El mutante que aísla §H es un canvas propio
     por capa **conservando la tolerancia** (sólo contesta la capa de encima). Una versión
     anterior de esta nota decía que el mutante propuesto «dejaba C1 en verde»: **era
     falso**, lo que se vio verde fue una C1 que no podía detectar nada.
  2. **La prueba no puede ser «dos capas superpuestas» cualesquiera.** Tienen que ser dos
     capas de CANVAS: las áreas de priorización y sus iconos no valen, porque los marcadores
     viven en el pane de marcadores y son otro camino de eventos.

  De paso, la regla de `DECISIONES.md` §H se amplió: no basta con no declarar `renderer`,
  tampoco se puede declarar `pane` propio en una capa vectorial. **Eso último está leído en
  el fuente de Leaflet, no comprobado con un mutante**, y C1 no lo cazaría tal como está.
- ~~**Llevar `python ETL/verify.py --negativas` al job `build` del CI.**~~ **HECHO**: es el
  paso «Controles negativos de los datos» de `deploy.yml`, que corre D12 y D13 porque allí
  tippecanoe puebla `ETL/_build/`. Hoy son 45 mutaciones: 20 de ellas, de la capa de riesgo
  y sus teselas (2026-09-15).

### Prioridad media

- **Más mutantes de frontend.** Desde F0 (2026-09-15) `npm run verify:mutantes` tiene 17:
  A1, B12, B24, B25, B26, B27 y B28. Faltan al menos: B4 (el suelo del mapa), B8 (la
  aritmética del panel contra el oráculo) y A10 (la pantalla de error sin banner).
- **Un `spike/`**, como el de la referencia: código de medición con su `NOTAS.md`, para que
  las decisiones de rendimiento futuras dejen rastro reproducible en vez de vivir en el
  historial de una sesión.

### Prioridad baja

- ~~**`.vscode/extensions.json`.**~~ **HECHO el 2026-09-15** (oxc y Python).

---

## 2. Mejoras

### Prioridad alta

- ~~**El corrimiento de campos del `.dbf` no tiene vigilante de contenido.**~~ **HECHO en
  parte el 2026-09-15**: D23 caza los síntomas (doble espacio, bordes, U+FFFD, mojibake) y una
  titularidad OECV fuera del Memo 3045/2025, y su mutación `'OP  F'` se pone roja. Un valor
  desplazado que parezca limpio sigue pasando.
- ~~**El cruce contra `KM_OFICIAL_NACIONAL` sólo vive en `analisis/leer_capas.py`.**~~
  **HECHO el 2026-09-15**: D22, con tolerancia del 12 % y dos mutaciones.

### Prioridad media

- ~~**`analisis/README.md` da mal la ruta del intérprete.**~~ **HECHO el 2026-09-15.**
- ~~**`INSUMO_GRAFICO/README.md` nombra un asset que no existe.**~~ **HECHO el 2026-09-15.**
- ~~**`npm audit`: 1 vulnerabilidad alta en `nanoid`.**~~ **HECHO el 2026-09-15**: 3.3.19.

### Prioridad baja

- **Tres identidades git para la misma persona** (`Luis`, `lmonsalve22`, `Luis Monsalve`,
  todas con el mismo correo) y convención de mensajes mixta: conviven `docs:`, `ci:` y
  `datos:` con mensajes sueltos (`rutas`, `google`, `vamos por el 100`). **El `.mailmap`
  está puesto desde el 2026-09-15**; la convención de mensajes sigue mixta.

---

## 3. Construir (no se puede copiar: los datos difieren)

- La aserción del renderer compartido (arriba). La referencia no la necesita: tiene una
  sola capa de datos.
- Un control negativo del **corrimiento del `.dbf`**. La referencia lee de DuckDB y no
  tiene lectores de shapefile escritos a mano.
- ~~Un vigilante del **modo degradado**.~~ **HECHO el 2026-09-15**: D24, que `run.py`
  exige en Actions (viales en PMTiles con tippecanoe y riesgo con teselas de GDAL).

---

## 4. Dificultades, con tres formas de resolver cada una

### D1. La carga inerte ya se borró; la cuestión jurídica sigue abierta

> **Decidido y hecho el 2026-09-15: opción C para las actas.** Luis pidió eliminarlas. Ver
> `CLAUDE.md` §7.1: purgadas de las 4 ramas y verificado con un clon nuevo. **Queda
> abierto:** los PR #1 y #2 y las URL de commits viejos las siguen sirviendo hasta que
> GitHub Support purgue esas referencias; la solicitud la hace Luis.

**Hecho el 2026-09-10.** Se borraron de `INSUMO_INCENDIO/` **241 archivos, 492,1 MB**, todo
lo que ningún paso del pipeline abre: 70 PDF (329,8 MB), 16 `.docx` (81,0 MB), 40 fotos
(76,4 MB), 2 `.rar` (ya extraídos, y el ETL lee el `.shp` desempaquetado), 14 `.xml` y 12
`.qmd` de metadatos, y los índices `.sbn`/`.sbx`/`.qix` de ArcGIS.

Verificado ejecutando el ETL completo después del borrado: **mismas 14.705 / 1.863 / 1.114 /
327 / 5.278 / 13.964 features, mismos dominios y mismos KPIs**. El directorio pasó de
832 MB a 340 MB, y de 775 a 534 archivos.

**Lo que el borrado NO resolvió.** `.git` sigue en 718 MB: la historia conserva los blobs,
así que un clon no adelgaza y **las 9 actas de reunión (8 PDF y `Acta Reunión.docx`) siguen
siendo recuperables por cualquiera** que clone el repositorio público. Si la preocupación
era la exposición, sigue intacta.

**Lo que sí está comprobado:** la capa publicada **no expone nombres**. `jefe_brigada` e
`investigado_por` viajan como códigos (`'5.1'`, `'UAD.86A'`) contra las tablas del manifest.
Y **nadie ha abierto ninguna acta** para comprobar si consignan asistentes: eso sigue siendo
una duda, no un hallazgo.

| | Pros | Contras |
|---|---|---|
| **A. Dejarlo así** | Coste cero; el árbol de trabajo ya está limpio | Las actas siguen en la historia de un repo público |
| **B. Hacer el repo privado y publicar sólo Pages** | Inmediato y reversible; cierra la exposición sin tocar la historia | Pierde que cualquiera clone y trabaje con las capas |
| **C. Reescribir la historia para purgar los blobs** | Lo único que adelgaza el clon y borra de verdad | Con ramas publicadas (`uat`, `imgbot`), fusionar la cadena reescrita con la vieja **resucita lo purgado**; la operación más peligrosa de la lista |

**Recomendación: B si preocupan las actas, C sólo con decisión institucional escrita.** Antes
de cualquiera de las dos, conviene abrir las 9 actas y comprobar si de verdad consignan
datos personales — puede que la respuesta sea que no y no haya nada que decidir.

Para recuperar cualquier archivo borrado: `git checkout HEAD -- <ruta>`.

### D2. El cruce espacial no corre en Windows

> **Hecho el 2026-09-15: opción B.** `tiles.py` escribe el intermedio también en modo
> degradado. Comprobado ejecutando `run.py --layers rutas,redvial` sin tippecanoe: 32 s, los
> dos intermedios en `_build/` y el cruce igual que en CI (mediana 0,36 km, 500/500).

D12 y D13 —las dos aserciones que cazan un huso UTM invertido— necesitan
`ETL/_build/*.geojson`, que sólo se poblaba cuando corría tippecanoe.

| | Pros | Contras |
|---|---|---|
| **A. Dejar que `--negativas` falle si falta (hoy)** | Honesto: nunca se salta en silencio | Obliga a un paso manual antes de poder correr los negativos en local |
| **B. Que `tiles.py` escriba el intermedio también en modo degradado** | Una línea; el cruce correría siempre | Añade escritura de 13 MB a cada corrida degradada |
| **C. Un `--solo-intermedio` en `run.py`** | Explícito y barato | Otra bandera que mantener |

**Recomendación: B.** El intermedio ya se calcula; sólo no se guarda. Escribirlo en
`_build/` (que está gitignorado) cuesta nada y cierra la brecha para siempre.

### D3. El README escrito a mano contra el bot que lo regenera

`.github/workflows/readme.yml` llama a `Sud-Austral/coipo_aireadme@v1` en cada push a
`main`. En el repo de referencia ese bot ya sustituyó un README rico por uno de 45 líneas.

| | Pros | Contras |
|---|---|---|
| **A. Mover el saber a `CLAUDE.md`/`DECISIONES.md` (hecho)** | El contenido queda a salvo aunque el bot pise el README | Hay que mantener `README_CANDIDATE.md` como borrador |
| **B. Quitar el workflow del bot** | El README a mano sobrevive | Rompe la estandarización de la flota, que `auditar_workflows.py` comprueba |
| **C. No hacer nada** | Cero trabajo | El contenido más valioso del repo depende de que el bot no corra |

**Recomendación: A, ya aplicada.** Es la que respeta la flota y pone el saber a salvo.

### D4. Los mutantes de frontend son caros

Cada mutante paga un `npm run build` y una tanda de Chrome; el arnés del panel tarda ~1 min.

| | Pros | Contras |
|---|---|---|
| **A. Fuera de CI, a mano antes de tocar la verificación** | No alarga cada push | Depende de la disciplina |
| **B. En CI, sólo en `workflow_dispatch`** | Reproducible y auditable, sin coste diario | Hay que acordarse de lanzarlo |
| **C. En CI en cada push** | Máxima garantía | Multiplica por N el tiempo del job visual |

**Recomendación: B.** El equivalente barato —`verify.py --negativas`, 19 s— sí debe correr
en cada push.

---

## 5. Lo que ya está al nivel (no rehacer)

Esto es **mejor** que en el repo de referencia. Antes de "alinear", comprobar la dirección:

- **`.gitattributes`**: marca 17 extensiones como binarias y además fuerza `text eol=lf` en
  los formatos de texto, para que el ETL produzca el mismo byte en Windows y en el runner.
  La referencia no tiene ese bloque.
- **`ETL/requirements.txt`** existe y está acotado por rangos. La referencia no tiene
  ningún manifiesto de dependencias.
- **`ETL/run.py`**: paralelismo por procesos con longest-job-first, tracebacks serializados
  al cruzar el proceso, y un punto de entrada único.
- **La verificación visual bloquea el despliegue.** El job `verificar-visual` corre en
  paralelo y `deploy` depende de él. En la referencia el arnés de navegador existe pero no
  corre en CI.
- **`analisis/leer_capas.py`** como contraparte Python del frontend, que valida el contrato
  contra el manifest antes de leer.
- **Los lectores SHP/DBF/PRJ/CPG y KML/KMZ en Python puro**, sin GDAL ni geopandas.
- **12 reglas de COIPO_ERRORES instaladas** frente a las 7 de la referencia.

---

## Orden sugerido de ejecución

1. ~~La aserción del renderer compartido y su mutante~~ — **hecha el 2026-09-10** (C1 de
   `verify-priorizacion.mjs`). Ver §1 para las dos correcciones que salieron al escribirla.
2. `verify.py --negativas` al job `build` del CI (§1, alta) — barato y ya está escrito.
   Nota: ahora son **15 aserciones y 14 mutaciones**, con D14 y D15 nuevas.
3. ~~**Llevar `npm run verify:priorizacion` al CI.**~~ **HECHO el 2026-09-10**, pero al job
   **`build`** y no a `verificar-visual`: C1–C10 afirman cifras de las capas reales y
   `verificar-visual` excluye `/frontend/public/data/` a propósito. En `build` los datos
   acaban de generarse. Va tras `npm run build` (el arnés sirve `dist/`, no lo construye) y
   antes de subir el artefacto de Pages, así que una vista rota no se despliega. Sin
   `--negativas`: tres mutaciones con un build cada una son ~4 min, y §D4 ya decidió que
   los mutantes de frontend no corren en cada push.
4. ~~**Exportar las dos capas nuevas como GeoJSON/CSV.**~~ **HECHO el 2026-09-10.** No se
   tocó `SeccionDescargas`, que vive dentro de `PanelLateral` y esa vista no lo monta: los
   cuatro botones están en `PanelPriorizacion` y reutilizan `geojsonDe`, `armarCSV`,
   `guardar` y `nombreArchivo`, más dos funciones nuevas (`csvPriorizacion`,
   `csvInfraPuntos`) con el molde de `csvStandby`. Lo descargado respeta la comuna del
   mapa, y eso lo vigila **C11** con su mutante. No se exporta ninguna columna
   normalizada: caducaría en cuanto cambiara el conjunto de comunas (ver `DECISIONES.md` §P).
3. Que `tiles.py` guarde el intermedio en modo degradado (§4 D2, recomendación B).
4. El vigilante de dominios que caza el corrimiento del `.dbf` (§2, alta).
5. Los mutantes que faltan: B4, B8, A10 (§1, media).
6. Las dos correcciones documentales de §2 (media), que son de un minuto cada una.
7. D1 cuando haya decisión institucional.
