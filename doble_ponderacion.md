# ¿Se están ponderando dos veces los mismos elementos?

Revisión de las ponderaciones nuevas del programa de priorización contra la metodología
oficial del índice de Riesgo de Incendios Forestales de CONAF.

**Fecha:** 2026-09-14
**Documento revisado:** `Riesgo-Incendios-Forestales-Resumen-Ejecutivo-Final-12022021.pdf`
(Departamento de Desarrollo e Investigación, GEPRIF, CONAF, enero 2021; 37 páginas).
Copia en `INSUMO_PRIORIZACION/`.
**Código revisado:** `lab/priorizacion/notebook/priorizacion.py`, capas de
`lab/priorizacion/data/raw/` y `raw2/`, y la capa publicada `priorizacion.geojson`.

---

## 1. Respuesta corta

**Sí, hay doble ponderación, y afecta a dos de los cinco componentes.** No a los cinco, y
no en el mismo grado. El detalle importa más que el titular:

| Componente nuevo | Peso | ¿Está ya dentro del Riesgo? | Veredicto |
|---|---:|---|---|
| Riesgo de incendios forestales | 30 % | — (es el contenedor) | — |
| **Interfaz** | **20 %** | **Sí, DOS veces**: como Amenaza (§4.1.3.1) y como Vulnerabilidad (§5.1.5) | **Triple conteo** |
| **Infraestructura crítica** | **20 %** | **Sí, parcialmente**: §5.1.4, pero sólo la energética | **Doble conteo parcial** |
| Cicatrices de áreas afectadas | 15 % | Solapamiento conceptual con la Amenaza Estadística (§4.1.1), **pero en temporadas distintas** | Riesgo bajo, con matices |
| Comunidades y Escuelas Preparadas | 15 % | No aparece en el documento | **Limpio** |

El problema más serio no es el que parece. **La interfaz urbano-forestal ya se cuenta dos
veces dentro del propio índice de Riesgo de CONAF**, antes de que nosotros le sumemos un
20 % aparte. Al sumarlo, queda contada tres veces.

---

## 2. Cómo se construye el Riesgo, según el documento

El documento es explícito en su estructura (§4, §5, §5.2):

```
RIESGO = suma ponderada de  AMENAZA  +  VULNERABILIDAD        (pág. 26)

AMENAZA (pág. 9-18)
├── 4.1.1 Amenaza Estadística
│     └── Frecuencia de incendios, últimas 5 temporadas (2015-2016 a 2019-2020)
├── 4.1.2 Amenaza Estructural
│     ├── Velocidad de propagación por modelo de combustible
│     ├── Temperatura máxima (promedio histórico)
│     ├── Pendiente
│     └── Exposición
└── 4.1.3 Elementos de Amenaza  (antrópicos)
      ├── 4.1.3.1  INTERFAZ URBANO-FORESTAL        ←──┐
      ├── 4.1.3.2  Red de carreteras y caminos        │
      ├── 4.1.3.3  Densidad poblacional               │  la misma variable
      └── 4.1.3.4  Red eléctrica                      │  entra por los dos
                                                      │  lados del índice
VULNERABILIDAD (pág. 19-25)                           │
├── 5.1.1 Valor económico del combustible             │
├── 5.1.2 Valor ecológico del combustible             │
├── 5.1.3 SNASPE (áreas silvestres protegidas)        │
├── 5.1.4  INFRAESTRUCTURA CRÍTICA                    │
├── 5.1.5  INTERFAZ URBANO-FORESTAL              ←────┘
├── 5.1.6 Red eléctrica
└── 5.1.7 Red de caminos y carreteras
```

Citas literales que sostienen lo anterior:

> **§5.2, pág. 26** — «La integración de los factores que se han desarrollado con
> anterioridad, es decir, amenaza y vulnerabilidad, se realiza mediante **la suma ponderada
> de los valores –reescalados– del territorio** para cada uno de ellos.»

> **§4.1.3.1, pág. 13** — «Para la clasificación de las áreas de **interfaz urbano
> forestal**, se han utilizado datos entregados por el MINVU del Censo 2017. Se clasificó la
> información por tipo de área urbana, resultando como área urbana consolidada principal,
> área urbana consolidada secundaria, aldea y vivienda rural.»

> **§5.1.5, pág. 22** — «La Figura 20 muestra el **área de interfaz** para los diferentes
> tipos de viviendas de la región de Ñuble. Las áreas urbanas consolidadas poseen una menor
> **vulnerabilidad**…»

> **§5.1.4, pág. 21** — «La Figura 19 muestra las **infraestructuras críticas de la
> superintendencia de electricidad y combustible**… principalmente **subestaciones
> eléctricas, estaciones de servicios, centrales eléctricas, almacenamiento de combustible**
> (gas, diesel).»

Y el propio documento confirma, al describir los resultados, que la interfaz es uno de los
motores del resultado final:

> **Cierre de §4.1, pág. 18** — «Para la categoría muy alta y alta la amenaza…
> principalmente corresponde a las variables de **interfaz urbano forestal** de las grandes
> ciudades… también las zonas que presentan una mayor frecuencia de incendios históricos y
> una alta densidad de viviendas rurales.»
>
> La misma página explica cómo se integran los tres componentes: «Para obtener el factor de
> amenaza, **se intersectan** los índices amenaza estadística, amenaza estructural y
> elementos de amenaza… después de realizar una agrupación mediante **cuantiles y criterio
> experto**.»

> **§5.2 (resultados de riesgo), pág. 26** — «Las zonas con riesgo alto a muy alto…
> coinciden con las áreas silvestres protegidas de la región, incendios históricos,
> **interfaz urbano forestal** y caminos que poseen alta transitabilidad.»

### 2.1 Recuento: cuántas veces entra cada variable

Sumando lo que hace el documento (columnas 1 y 2) y lo que añaden las ponderaciones nuevas
(columna 3):

| Variable | En Amenaza | En Vulnerab. | Componente aparte | **Total** |
|---|:--:|:--:|:--:|:--:|
| **Interfaz urbano-forestal** | ✓ §4.1.3.1 | ✓ §5.1.5 | ✓ 20 % | **3×** |
| **Red eléctrica / subestaciones** | ✓ §4.1.3.4 | ✓ §5.1.6 + §5.1.4 | ✓ (dentro de infra) | **3-4×** |
| Red de caminos y carreteras | ✓ §4.1.3.2 | ✓ §5.1.7 | — | **2×** |
| Infraestructura crítica no eléctrica | — | — | ✓ 20 % | 1× |
| Densidad poblacional | ✓ §4.1.3.3 | — | — | 1× |
| Frecuencia histórica de incendios | ✓ §4.1.1 | — | — | 1× |
| Combustible / clima / topografía | ✓ §4.1.2 | ✓ §5.1.1-5.1.2 | — | 2× |
| SNASPE | — | ✓ §5.1.3 | — | 1× |
| Cicatrices 2021-2026 | — | — | ✓ 15 % | 1× |
| Comunidades y Escuelas Preparadas | — | — | ✓ 15 % | 1× |

**Dos cosas que conviene separar al discutirlo:**

- **Lo que hereda del documento** (filas con ✓ en las dos primeras columnas): la interfaz,
  la red eléctrica, los caminos y el combustible ya entran dos veces **dentro del propio
  índice de CONAF**. Eso no lo introducimos nosotros y no lo podemos deshacer sin las capas
  intermedias. Es discutible que sea un error: en el marco amenaza × vulnerabilidad, una
  misma variable puede legítimamente actuar como fuente de ignición *y* como bien expuesto.
  Lo que no es defendible es **no declararlo**.
- **Lo que añadimos nosotros** (columna 3): aquí sí hay decisión propia, y es donde la
  interfaz pasa de 2× a 3×.

---

## 3. Caso por caso

### 3.1 Interfaz — triple conteo. **El problema más grave.**

La interfaz entra **tres veces** en el puntaje final:

1. Dentro del 30 % de Riesgo, vía **Amenaza** (§4.1.3.1): la interfaz como fuente de
   ignición — viviendas rurales, uso cotidiano del fuego, quemas.
2. Dentro del mismo 30 % de Riesgo, vía **Vulnerabilidad** (§5.1.5): la interfaz como
   elemento expuesto a dañarse.
3. Como componente propio, con **20 %**.

Las dos primeras están dentro del documento de CONAF y no dependen de nosotros. La tercera
es la que añade la ponderación nueva.

**Que es la misma capa, no una parecida.** El documento clasifica la interfaz en «área
urbana consolidada principal, área urbana consolidada secundaria, aldea y vivienda rural»
(MINVU, Censo 2017). La capa `raw2/INTERFAZ` que alimenta nuestro componente tiene
exactamente esas categorías, más dos:

```
Vivienda Rural          340.877
Urbano Principal         12.481
Urbano Secundario        11.541
Loteos - Parcelaciones    6.550
Aldea                     4.276
Campamentos               1.216
                        ────────
                        376.941 polígonos
```

Las cuatro categorías del documento están ahí con el mismo nombre. No es una fuente
alternativa: es la misma familia de datos.

### 3.2 Infraestructura crítica — doble conteo **parcial**

Aquí conviene no exagerar. La infraestructura del documento es **energética y de
combustibles**, de la SEC: subestaciones eléctricas, estaciones de servicio, centrales
eléctricas, almacenamiento de gas y diésel.

La nuestra (`raw2/INFRAESTRUCTURA_CRITICA`) tiene seis familias:

| Familia | ¿En el documento CONAF? |
|---|---|
| SUBESTACIONES | **Sí** (§5.1.4, y además §4.1.3.4 y §5.1.6 como red eléctrica) |
| ANTENAS | No |
| CENTROS_DE_SALUD | No |
| CENTROS_PENITENCIARIOS | No |
| RED_AEROPORTUARIA | No |
| SERVICIOS_SANITARIOS_RURALES | No |

**Sólo una de las seis familias se duplica.** Las otras cinco son aportes genuinamente
nuevos: el índice de CONAF no valora hospitales, escuelas, antenas ni cárceles.

Ahora bien, el solapamiento de la parte eléctrica es **triple**, igual que la interfaz: la
red eléctrica está en Amenaza (§4.1.3.4) y en Vulnerabilidad (§5.1.6), y las subestaciones
otra vez en Infraestructura Crítica (§5.1.4).

**Matiz sobre el peso real.** En el modelo actual las siete familias se promedian con peso
igual — verificado en `priorizacion.py`, `pesos_infra` asigna `1.0` a subestaciones,
antenas, aeroportuaria, ssr, salud, educacion y penitenciarias —, así que las subestaciones
aportan **1/7 del subíndice**. Contando puntos publicados son **26 de 696 (3,7 %)**. El
doble conteo existe, pero su magnitud dentro de este componente es pequeña.

(Nota: el modelo actual usa siete familias porque incluye `educacion`; la carpeta
`raw2/INFRAESTRUCTURA_CRITICA` de la metodología nueva trae seis, sin establecimientos
educacionales. Conviene confirmar si eso es deliberado.)

### 3.3 Cicatrices — el solapamiento que parece obvio y **no lo es**

La sospecha natural es que las cicatrices dupliquen la **Amenaza Estadística**, que es «el
índice frecuencia; relativo al número de incendios forestales de las últimas 5 temporadas»
(§4.1.1, pág. 9). Pero hay tres diferencias reales:

1. **Las ventanas temporales no se solapan.** El documento usa **2015-2016 a 2019-2020**.
   Las cicatrices disponibles (`raw2/POLIGONO_DE_AREA_AFECTADA`) son **2021-2022,
   2022-2023, 2023-2024, 2024-2025 y 2025-2026**. Son periodos **disjuntos**: el índice de
   Riesgo de 2021 no puede contener información de incendios posteriores a su publicación.
2. **Miden cosas distintas.** Frecuencia = número de eventos. Cicatriz = superficie
   efectivamente quemada. Un sector con muchos incendios pequeños y otro con un solo
   megaincendio pueden intercambiar posiciones según cuál se mire.
3. **El signo puede ser opuesto.** Una cicatriz reciente **reduce** el combustible
   disponible. El índice de Riesgo ya pondera «velocidad de propagación de los modelos de
   combustible» (§4.1.2.1), que en un área recién quemada es baja. Sumar la cicatriz como
   factor que **aumenta** la prioridad puede estar contradiciendo, no duplicando, lo que ya
   dice el Riesgo.

**Conclusión:** no es doble conteo en sentido estricto. Pero el punto 3 merece una decisión
explícita del equipo: *¿una cicatriz reciente hace un sector más prioritario o menos?* Las
dos respuestas son defendibles (más: el sector demostró ser propenso y hay que recuperarlo;
menos: no hay combustible que arda en los próximos años), pero hay que elegir una y
escribirla, porque el modelo hoy no la tiene.

### 3.4 Comunidades y Escuelas Preparadas — limpio

No aparece en ninguna sección del documento. Es un dato de gestión de CONAF (dónde se ha
intervenido), no una característica del territorio. Es el único de los cuatro componentes
externos que no arrastra ningún solapamiento.

Ojo con una cosa distinta: «Preparadas» significa que **ya se trabajó ahí**. Si el índice
lo suma como factor que aumenta la prioridad, está priorizando lo ya atendido. El modelo
actual tiene esto resuelto a medias — calcula un `indice_brecha` que invierte el signo de
este componente (`1.0 - sub_preparadas`) para responder «¿dónde todavía no hemos llegado?»
— pero **ese índice no es el que se publica**. Es otra decisión que conviene hacer
explícita.

---

## 4. Evidencia empírica sobre los datos publicados

Correlación de Spearman entre los subíndices de las 572 manchas de
`priorizacion.geojson` (Coyhaique, Los Ángeles y Mulchén):

| Par | ρ |
|---|---:|
| sub_riesgo — sub_interfaz | **+0,486** |
| sub_interfaz — sub_infra | +0,461 |
| sub_riesgo — sub_infra | +0,329 |
| sub_riesgo — sub_preparadas | +0,171 |
| sub_interfaz — sub_preparadas | +0,189 |
| sub_infra — sub_preparadas | +0,202 |

**Cómo hay que leer esto, con honestidad.** Una correlación de +0,486 entre riesgo e
interfaz es **consistente** con que la interfaz esté dentro del riesgo, pero **no lo
demuestra**: podría explicarse igual por el hecho trivial de que donde hay gente hay
interfaz, infraestructura y también más ignición. **La prueba del doble conteo es
documental** (sección 2), no estadística. La correlación sólo confirma que el efecto no es
despreciable en los datos reales.

Sí es concluyente lo otro: los dos componentes que se duplican son justamente los que más
territorio cubren.

| Subíndice | Manchas con valor > 0 | Media |
|---|---:|---:|
| sub_riesgo | 570 / 572 (99,7 %) | 0,5268 |
| sub_interfaz | 436 / 572 (76,2 %) | 0,3597 |
| sub_infra | 108 / 572 (18,9 %) | 0,0259 |
| sub_preparadas | 33 / 572 (5,8 %) | 0,0184 |

Riesgo e interfaz están presentes en casi todas partes; infraestructura y preparadas son
casi siempre cero. **El solapamiento se concentra exactamente en los dos componentes que
deciden el mapa.**

---

## 5. Qué problemas causa esto para la metodología

### 5.1 Los pesos declarados dejan de significar lo que dicen

Es el problema central. Cuando el programa declara «Interfaz: 20 %», cualquiera entiende
que la interfaz determina una quinta parte del resultado. No es así.

Sea **α** la fracción del índice de Riesgo atribuible a la interfaz (por sus dos entradas,
amenaza y vulnerabilidad). El peso efectivo es:

```
peso_efectivo(interfaz) = 0,20 + 0,30 · α
```

| Si α vale… | Peso efectivo | Sobre el declarado |
|---|---:|---:|
| 0,10 | 0,230 | +15 % |
| 0,20 | 0,260 | +30 % |
| 0,30 | 0,290 | +45 % |
| 0,40 | 0,320 | +60 % |

**No podemos fijar α**, porque el documento **no publica los pesos internos** de la suma
ponderada (ver §7, incertidumbres). Pero cualquier valor razonable deja el peso efectivo
de la interfaz por encima del de infraestructura, que nominalmente es igual (20 %). Los dos
componentes que el programa declara equivalentes **no lo son**.

### 5.2 El análisis de sensibilidad da resultados falsos

Si alguien pregunta «¿cuánto cambia el mapa si bajamos la interfaz del 20 % al 10 %?», la
respuesta que se obtenga será **una subestimación**: al mover ese peso sólo se mueve una de
las tres entradas de la interfaz; las otras dos viajan dentro del 30 % de Riesgo y no se
tocan. El modelo parecerá más robusto a ese parámetro de lo que realmente es.

Esto no es hipotético: el notebook ya mide que, moviendo pesos ±0,10, cambian de clase
entre el 21,8 % y el 28,1 % de los hexágonos. Esa cifra está calculada sobre pesos
nominales, así que describe menos movimiento del que habría.

### 5.3 Doble penalización territorial y refuerzo circular

Un sector de interfaz urbano-forestal con una subestación recibe puntaje por:

- estar en interfaz (20 % directo),
- estar clasificado como riesgo alto **porque tiene interfaz** (dentro del 30 %),
- tener infraestructura crítica (20 %),
- estar clasificado como riesgo alto **porque tiene red eléctrica** (otra vez dentro del 30 %).

Los factores no se suman, se **refuerzan**. El resultado es que las zonas de interfaz
saldrán sistemáticamente como las más prioritarias. Puede que eso sea correcto como
política —proteger donde vive la gente—, pero deja de ser **una conclusión del análisis**
para ser **un artefacto de su construcción**. Y esa diferencia es justamente la que un
análisis territorial existe para aportar.

### 5.4 Pérdida de poder discriminante

Cuando varios componentes miden lo mismo, el índice compuesto se aproxima a una función de
un solo factor y deja de separar territorios. En los datos publicados eso todavía no es
agudo (ρ = +0,486 entre riesgo e interfaz, sección 4), pero el síntoma ya apareció antes en
este proyecto: el notebook dejó registrada una correlación de **0,85 entre `sub_interfaz` y
`sub_infra` en la capa gruesa** de 40.000 ha, con aviso explícito de redundancia. *(Ese
0,85 procede del notebook y no lo recalculé: la capa gruesa tiene 15 manchas y no está
publicada. Las cifras de la sección 4 sí son medición propia sobre las 572 manchas.)*

### 5.5 El peso nominal ya no se parece al efectivo, y está medido

Con las ponderaciones **actuales** (riesgo 0,40 · interfaz 0,20 · infra 0,20 · preparadas
0,20), el peso **efectivo** de cada componente —su aporte real a `puntaje_medio`— no se
parece al nominal. Calculado sobre las 572 manchas publicadas:

| Componente | Peso nominal | Aporte medio | **Peso efectivo** |
|---|---:|---:|---:|
| Riesgo | 0,40 | 0,2107 | **0,723** |
| Interfaz | 0,20 | 0,0719 | **0,247** |
| Infraestructura | 0,20 | 0,0052 | **0,018** |
| Preparadas | 0,20 | 0,0037 | **0,013** |

*(Control aritmético: los cuatro aportes suman 0,2915, que es exactamente la media
observada de `puntaje_medio`.)*

La causa aquí es distinta del doble conteo —infra y preparadas valen cero en el 81 % y el
94 % de las manchas, así que no pueden mover nada—, pero el efecto se suma al anterior: **el
mapa es, de hecho, riesgo (72 %) + interfaz (25 %); los otros dos componentes juntos no
llegan al 4 %** pese a declarar 20 % cada uno. Cambiar los pesos nominales de 40/20/20/20 a
30/20/20/15/15 no corregirá eso por sí solo: mientras un componente sea cero en casi todo el
territorio, su peso nominal es decorativo.

Y nótese la coincidencia incómoda: **los dos componentes que sí mueven el mapa (riesgo e
interfaz, 97 % del aporte) son exactamente los dos que se solapan entre sí.**

### 5.6 Un agravante práctico: el Riesgo llega como caja negra

Comprobado sobre el insumo real: la capa `RIESGO_3_COMUNAS.shp` (463.366 polígonos) tiene
**exactamente dos campos**: `Id` y `gridcode` (0 a 4, de Muy Bajo a Muy Alto).

```
campos: ['Id', 'gridcode']
gridcode: {2: 20082, 3: 17392, 1: 10737, 4: 1416, 0: 373}
```

Es el producto **final** ya integrado. No trae la amenaza y la vulnerabilidad por separado,
ni ninguno de sus subcomponentes. **Con este insumo es imposible descontar la contribución
de la interfaz o de la red eléctrica**: no se puede separar lo que ya viene sumado. Esto
descarta la solución técnicamente más limpia (reconstruir el riesgo sin los componentes
repetidos) salvo que GEPRIF entregue las capas intermedias.

---

## 6. Opciones, con su coste

Ninguna es gratis. Van de menor a mayor esfuerzo.

### Opción A — Declararlo y no tocar los pesos

Mantener 30/20/20/15/15 y documentar que **son pesos de énfasis, no de contribución**, con
la tabla de la sección 3 al lado.

- **A favor:** coste cero; no rompe la comparabilidad con lo ya entregado; políticamente es
  defendible que la interfaz pese más, porque es donde está la gente.
- **En contra:** el índice sigue sin poder interpretarse como se lee, y el análisis de
  sensibilidad sigue mintiendo. Traslada el problema al lector.

### Opción B — Quitar del cálculo lo que ya está dentro del Riesgo

Eliminar «Interfaz» como componente propio y dejar que entre sólo por el Riesgo; dejar en
«Infraestructura crítica» únicamente las cinco familias que CONAF no considera (antenas,
salud, penitenciarios, aeroportuaria, SSR).

- **A favor:** elimina el doble conteo de raíz; cada elemento entra una vez.
- **En contra:** se pierde control sobre cuánto pesa la interfaz, porque queda sepultada en
  un peso interno que no conocemos; y el resultado cambiará bastante respecto de lo ya
  mostrado. Además, el 20 % liberado hay que repartirlo, y eso es otra decisión.

### Opción C — Pedir a GEPRIF las capas intermedias

Solicitar al Departamento de Desarrollo e Investigación la Amenaza y la Vulnerabilidad por
separado, o mejor, los subíndices. Con ellos se puede construir un índice **sin
repeticiones**, eligiendo explícitamente por dónde entra cada variable.

- **A favor:** es la única solución metodológicamente correcta; además permitiría publicar
  los pesos reales.
- **En contra:** depende de terceros y de plazos que no controlamos. Es la vía a abrir ya,
  aunque se adopte A o B mientras tanto.

### Opción D — Sustituir el Riesgo por sus partes no repetidas

Usar el Riesgo **sólo** por su Amenaza Estadística y su Amenaza Estructural (frecuencia,
combustible, temperatura, pendiente, exposición) y llevar interfaz, infraestructura y red
vial fuera, como componentes propios y con peso explícito.

- **A favor:** es la formulación más limpia y la más fácil de explicar.
- **En contra:** requiere lo mismo que C (capas intermedias) y además rehacer la
  metodología, no sólo los pesos.

### Recomendación

**Abrir la Opción C ya** —cuesta un correo y es la única que resuelve el fondo— y mientras
llega la respuesta **adoptar la A con la tabla de solapamientos publicada junto al mapa**.
La B es tentadora por limpia, pero cambiar el resultado sin poder explicar cuánto pesa ahora
la interfaz sustituye un problema conocido por otro opaco.

Con independencia de la opción, hay **dos decisiones que el equipo debe tomar y escribir**,
porque hoy no están en ninguna parte y no son técnicas:

1. **¿Una cicatriz reciente sube o baja la prioridad?** (sección 3.3)
2. **¿«Preparadas» suma o resta?** ¿El mapa señala dónde hay que trabajar, o dónde ya se
   trabajó? (sección 3.4)

---

## 7. Incertidumbres — lo que NO se pudo comprobar

Se declaran porque afectan a la fuerza de las conclusiones.

1. **No conozco los pesos internos del índice de Riesgo.** El documento dice «suma
   ponderada» (§5.2) pero **no publica los coeficientes** de amenaza ni de vulnerabilidad,
   ni el reparto entre sus subcomponentes. Por eso la sección 5.1 está planteada de forma
   paramétrica (en función de α) y no con un número. **Sin ese dato no se puede cuantificar
   el sobrepeso exacto, sólo acotarlo.**
2. **Tampoco se conoce cómo se «intersectan» los tres componentes de la amenaza.** El
   documento dice que se intersectan y luego se agrupan «mediante cuantiles y criterio
   experto» (pág. 18). «Criterio experto» no es reproducible desde el documento.
3. **No verifiqué el solapamiento espacial píxel a píxel** entre la capa de riesgo alto y la
   de interfaz. Habría sido la evidencia más directa, pero con `gridcode` como único
   atributo (§5.6) sólo mediría coincidencia territorial, que no distingue «la interfaz está
   dentro del riesgo» de «ambos ocurren donde hay gente». Las correlaciones de la sección 4
   se aportan con esa misma cautela.
4. **Las ponderaciones nuevas no están implementadas todavía.** El modelo publicado sigue
   con 0,40 / 0,20 / 0,20 / 0,20 y **sin componente de cicatrices**. Todo lo anterior es un
   análisis previo a implementarlas.
5. **La capa de cicatrices 2025-2026 no está completa**; la carpeta se llama literalmente
   `2025-2026 (se cargará lunes 14)`.

---

## 8. Resumen para la reunión

- **Sí hay doble ponderación, y el caso grave es la interfaz**: ya entra dos veces dentro
  del índice de Riesgo de CONAF (como amenaza y como vulnerabilidad), así que sumarle un
  20 % propio la cuenta **tres veces**.
- **Infraestructura crítica se duplica sólo en su parte eléctrica** (subestaciones, 1 de 6
  familias). Las otras cinco son aporte genuino.
- **Cicatrices no es doble conteo**: cubre temporadas *posteriores* (2021-2026) a las del
  índice de Riesgo (2015-2020). Pero hay que decidir si una cicatriz reciente sube o baja la
  prioridad, porque el combustible quemado no vuelve a arder de inmediato.
- **Preparadas está limpio**, aunque hay que decidir si suma o resta.
- **Consecuencia práctica:** los pesos declarados no son los efectivos —hoy el mapa es
  riesgo 72 % + interfaz 25 %, con infraestructura y preparadas por debajo del 4 % juntas,
  pese a declarar 20 % cada una—, el análisis de sensibilidad subestima el papel de la
  interfaz, y las zonas de interfaz saldrán siempre arriba por construcción y no por
  hallazgo.
- **Obstáculo:** el Riesgo llega como un único `gridcode` de 0 a 4, así que hoy **no se
  puede descontar** lo repetido. La salida de fondo es pedir a GEPRIF las capas intermedias.
