# Mejoras pendientes y hallazgos abiertos

Catálogo de lo que falta, lo que está por debajo del estándar y lo que no se puede copiar
de ningún sitio porque los datos son distintos.

Estado a **2026-09-10**. El repo de referencia es
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
- **Llevar `python ETL/verify.py --negativas` al job `build` del CI.** Ya existe y corre en
  ~19 s, pero el workflow sólo ejecuta la pasada normal a través de `run.py`. Ojo: D12 y
  D13 sí se pueden verificar en CI, porque allí tippecanoe puebla `ETL/_build/`.

### Prioridad media

- **Más mutantes de frontend.** Hoy `npm run verify:mutantes` cubre A1 y B12. Faltan al
  menos: B4 (el suelo del mapa), B8 (la aritmética del panel contra el oráculo) y A10 (la
  pantalla de error sin banner).
- **Un `spike/`**, como el de la referencia: código de medición con su `NOTAS.md`, para que
  las decisiones de rendimiento futuras dejen rastro reproducible en vez de vivir en el
  historial de una sesión.

### Prioridad baja

- **`.vscode/extensions.json`.** El `.gitignore` ya lo prevé (`!.vscode/extensions.json`) y
  no existe.

---

## 2. Mejoras

### Prioridad alta

- **El corrimiento de campos del `.dbf` no tiene vigilante de contenido** (`DECISIONES.md`
  §D). D10 caza que falte un campo de filtro, no que su valor esté desplazado. Un
  `Inst='OP  F'` pasaría hoy. Bastaría afirmar que los valores de un puñado de campos
  categóricos pertenecen a su dominio del manifest.
- **El cruce contra `KM_OFICIAL_NACIONAL` sólo vive en `analisis/leer_capas.py`**
  (`DECISIONES.md` §G), que nadie ejecuta en CI. Si las longitudes geodésicas se
  desincronizan de la cifra oficial, no se entera nadie.

### Prioridad media

- **`analisis/README.md` da mal la ruta del intérprete.** Dice
  `C:\ProgramData\anaconda3\python.exe`; el que responde a `python` en este equipo es
  `C:\Users\luis.monsalve\AppData\Local\anaconda3\python.exe` (medido el 2026-09-10). Y el
  que está roto es `python3`, que es el stub del Store y termina con código 49.
- **`INSUMO_GRAFICO/README.md` nombra un asset que no existe.** Dice
  `banner-conaf-uia.jpg`; el real es `frontend/src/assets/banner-conaf-incendios.jpg`.
- **`npm audit`: 1 vulnerabilidad alta en `nanoid`**, transitiva de la cadena de build. No
  llega a lo publicado, pero conviene subirla cuando se toquen las dependencias.

### Prioridad baja

- **Tres identidades git para la misma persona** (`Luis`, `lmonsalve22`, `Luis Monsalve`,
  todas con el mismo correo) y convención de mensajes mixta: conviven `docs:`, `ci:` y
  `datos:` con mensajes sueltos (`rutas`, `google`, `vamos por el 100`). Un
  `.mailmap` arregla lo primero sin tocar la historia.

---

## 3. Construir (no se puede copiar: los datos difieren)

- La aserción del renderer compartido (arriba). La referencia no la necesita: tiene una
  sola capa de datos.
- Un control negativo del **corrimiento del `.dbf`**. La referencia lee de DuckDB y no
  tiene lectores de shapefile escritos a mano.
- Un vigilante del **modo degradado**: hoy nada impide commitear una corrida de Windows
  salvo el aviso por stderr y la disciplina. Una aserción que compare el `formato` del
  manifest contra lo esperado en `main` lo cerraría.

---

## 4. Dificultades, con tres formas de resolver cada una

### D1. La carga inerte ya se borró; la cuestión jurídica sigue abierta

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

D12 y D13 —las dos aserciones que cazan un huso UTM invertido— necesitan
`ETL/_build/*.geojson`, que sólo se puebla cuando corre tippecanoe.

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
