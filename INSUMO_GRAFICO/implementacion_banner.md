# Prompt: integrar un banner institucional como cabecera de una app web

Este documento es un **prompt reutilizable**. Pásalo a un agente junto con el archivo de
imagen del banner. Sirve para cualquier stack (React, Vue, Svelte, Next, Django, Rails,
HTML plano) porque las decisiones difíciles son de geometría y de verificación, no de
framework.

Reemplaza lo que va entre `⟨⟩` y borra el anexo si tu asset no es `banner3.jpg`.

---

## Objetivo

Integrar `⟨ruta/al/banner.jpg⟩` como cabecera institucional de la aplicación, sin
deformarlo, sin perder los elementos de marca obligatorios y sin degradar la primera
pintura de la página.

Contexto del proyecto: ⟨stack, dónde vive el layout principal, si hay una cabecera o
navbar actual⟩.

---

## 1. Primero medir el asset. No asumir nada.

**Antes de escribir una línea de CSS**, mide el archivo real. Las especificaciones
escritas a mano sobre un asset suelen estar desactualizadas o ser aproximadas, y una
sola de estas medidas mal supuesta manda al tacho toda la maqueta.

Con Python + Pillow (o equivalente). En Windows sin Python, el equivalente sin instalar
nada es .NET: `Add-Type -AssemblyName System.Drawing`, `New-Object System.Drawing.Bitmap`
y `LockBits` + `Marshal::Copy` para volcar el bitmap a un `byte[]` e indexarlo
(`GetPixel` a secas es demasiado lento para barrer un asset entero):

```python
from PIL import Image
im = Image.open("banner.jpg")
w, h = im.size
print("tamaño", (w, h), "razón", round(w / h, 2))

# 1. ¿La primera y la última fila son contenido o artefacto del JPEG?
for y in (0, 1, h - 2, h - 1):
    print(y, [im.getpixel((x, y)) for x in (5, w // 3, w // 2, w - 5)])

# 2. ¿Dónde empiezan y terminan los elementos que NO se pueden recortar
#    (franjas, filetes, líneas de color)? Barre una fila y busca los saltos.
fila = h // 20            # cerca del borde superior
prev, cortes = None, []
for x in range(w):
    p = im.getpixel((x, fila))
    if prev and sum(abs(a - b) for a, b in zip(p, prev)) > 60:
        cortes.append((x, round(100 * x / w, 2), p))
    prev = p
print("transiciones:", cortes[:12])

# 3. ¿Hasta dónde llega la marca (logos + texto)? Mira la columna donde el
#    contenido claro sobre fondo deja de aparecer.
```

Anota, como hechos medidos:

| Dato | Por qué importa |
|---|---|
| Ancho × alto y **razón de aspecto** | Decide si `cover` recorta por ancho o por alto (§2) |
| ¿La fila 0 o la última son un artefacto claro del JPEG? | Se ve como una línea de 1 px sobre el fondo oscuro. Se recorta |
| Posición **en %** de franjas/filetes | Si algún día los redibujas en CSS, necesitas el % exacto |
| Alto de esas franjas en % | Te dice cuánto recorte vertical toleran (normalmente: casi ninguno) |
| Hasta qué % llega la marca | Todo lo que está a la derecha es fondo sacrificable |
| Colores exactos del fondo (izquierda, centro, derecha) | Para el color de respaldo y para detectar costuras |
| ¿El fondo es **un** color o varios? ¿Hay transiciones? | Un campo que parece plano puede llevar dos tonos y una diagonal entre ellos. Si vas a recortar y rellenar con color plano, necesitas la primera columna **uniforme** en todas las filas, no la que "se ve igual" |
| ¿Los elementos de identidad son **realmente** lo que el brief dice? | Un filete de dos colores no es una bandera de tres. Verifica antes de tratarlo como intocable: esa premisa condiciona todo el resto |
| Peso en bytes | Decide si hace falta una variante móvil (§6) |

---

## 2. La trampa central: `cover` con un asset muy apaisado

Un banner institucional típico ronda **10:1**. Una cabecera web ronda **20:1** o más.
Esa diferencia es la que rompe casi todas las implementaciones ingenuas.

`object-fit: cover` (o `background-size: cover`) **escala por la dimensión que le falta**:

- Contenedor **más apaisado** que el asset (p. ej. 1400×72 = 19,4:1 contra un asset
  10,4:1) → escala **por ancho** y **recorta arriba y abajo**. Con el ejemplo: la imagen
  llega a 134,8 px de alto y se comen ~63 px. **Cualquier franja o filete cerca de los
  bordes horizontales desaparece.**
- Contenedor **menos apaisado** que el asset (p. ej. 390×76 = 5,1:1) → escala **por
  alto** y **recorta por la derecha**. Eso normalmente es lo que quieres en móvil,
  porque la marca vive a la izquierda.

**Calcula el número antes de elegir**, no después:

```
altoRenderizado = anchoContenedor / razónDelAsset
recorteVertical = altoRenderizado − altoContenedor     // si es > 0, cover recorta arriba y abajo
```

Si el brief pide simultáneamente «alto fijo de 64-80 px» y «no recortes las franjas
superior e inferior», **esos dos requisitos son incompatibles** con un asset de 10:1.
No los silencies: dilo y resuelve con §3.

---

## 3. Decidir el alto: árbol de decisión

**Opción A — proporción natural (recomendada por defecto).**

```css
.banner { background: ⟨color de fondo del asset⟩; line-height: 0; }
.banner img { display: block; width: 100%; height: auto; }
```

Sin recorte, sin deformación, cumple los «no hagas» al pie de la letra. Coste: el alto
crece con el ancho de la ventana (un asset 10,4:1 mide 131 px a 1366 y 185 px a 1920).

Elígela salvo que el alto sea un problema demostrado.

⚠️ **La proporción natural sola no sobrevive al móvil**, y cuanto más apaisado el asset,
antes se rompe: uno de 17:1 mide 22 px de alto en una pantalla de 390 px, y ahí la marca
no es pequeña, es invisible. El arreglo no es una media query con `object-fit` (§6): es
un **piso de altura expresado como ancho mínimo de imagen**, que no necesita breakpoint
y no puede deformar ni amputar nada.

```css
.banner { background: ⟨color de fondo⟩; overflow: hidden; line-height: 0; }
.banner img {
  display: block;
  /* razón = ancho/alto del asset. Por debajo de (alto mínimo × razón) de viewport la
     imagen deja de encoger y desborda por la derecha; el contenedor la recorta. */
  width: max(100%, calc(⟨alto mínimo⟩ * ⟨razón⟩));
  height: auto;
}
```

Con `--alto-minimo: 68px` y razón 17,13 el cruce cae en 1165 px: por encima se ve la
composición entera, por debajo se ancla la marca a la izquierda con altura constante.
Como el recorte es puramente horizontal y **nunca** hay `object-fit`, ningún filete
cercano al borde superior o inferior se puede perder en ningún ancho.

Antes de usarlo, comprueba una cosa en las medidas del §1: que el borde derecho del
viewport caiga siempre dentro de una **zona de color uniforme** del asset en el rango de
anchos realistas. Si el asset lleva un remate decorativo a la derecha, el piso lo recorta
—es el precio— pero el corte no debe dejar una franja bitono.

**Opción B — alto fijo, recorte y elementos críticos redibujados en CSS.**

Solo si A da un alto inaceptable. Recortas con `cover` y vuelves a dibujar las franjas
con pseudo-elementos, usando los porcentajes que **mediste** en §1:

```css
.banner { height: 80px; position: relative; overflow: hidden; }
.banner img { width: 100%; height: 100%; object-fit: cover; object-position: left center; }
.banner::before, .banner::after {
  content: ''; position: absolute; left: ⟨x0%⟩; width: ⟨ancho%⟩; height: 4px;
  background: linear-gradient(90deg, ⟨c1⟩ 0 33.34%, ⟨c2⟩ 0 66.67%, ⟨c3⟩ 0 100%);
}
.banner::before { top: 0 } .banner::after { bottom: 0 }
```

⚠️ Esos porcentajes solo son válidos **mientras `cover` escale por ancho**. Por debajo
del ancho de cruce (`altoContenedor × razónDelAsset`) empieza a escalar por alto y los
pseudo-elementos se desalinean: apágalos con una media query en ese punto. Es frágil;
por eso A es el defecto.

**Opción C — recomponer el asset.** Si el diseño exige 64 px y las franjas son
innegociables, el arreglo correcto no es CSS: es pedir al equipo gráfico un asset
pensado para 20:1. Dilo en vez de forzar A o B.

En este proyecto es lo que terminó pasando, y conviene saber cuánto compra: el membrete
de 10,42:1 obligaba a una maqueta con recorte horizontal y un factor de escala medido a
mano contra la columna exacta donde el campo se volvía uniforme —frágil, y había que
rehacerlo entero si el asset cambiaba—. El asset rediseñado de 17,13:1 la sustituyó por
la opción A con piso: dos números declarados (`--razon-banner`, `--alto-minimo`) y ni un
píxel recortado en escritorio. **Si puedes recomponer el asset, hazlo antes que ser
ingenioso en CSS.**

**Nunca**: `width: 100%` + `height` fijo sin `object-fit`. Eso deforma la marca.

---

## 4. Preparar el archivo

- **Recorta los artefactos de borde** que hayas detectado en §1. Una fila clara de 1 px
  a lo ancho de un fondo oscuro se ve como una raya blanca y parece un error de maqueta.
- **Reoptimiza**: `quality=90, optimize=True` suele bajar bastante el peso sin pérdida
  visible (en el caso de referencia: 82 KB → 42 KB).
- **Dónde ponerlo**: si tu bundler procesa assets importados (Vite, webpack, Next),
  impórtalo desde el código (`import banner from '../assets/banner.jpg'`). Así obtienes
  hash de contenido —y por tanto cache-busting— y la base pública resuelta sola. Solo
  usa la carpeta pública/estática si el bundler no procesa imágenes, y ahí compón la URL
  con la variable de base del proyecto, **nunca con una barra inicial literal**: se rompe
  en cuanto la app se despliegue bajo un subpath.

---

## 5. El componente

Reutilizable, sin lógica de negocio, con la marca como único contenido obligatorio:

- Etiqueta semántica de cabecera con `role="banner"` (o el landmark equivalente).
- La imagen va como `<img>` con `alt` **descriptivo de la organización**, no
  `alt="banner"` ni `alt=""`. Ej.: `alt="⟨Organización⟩ — ⟨Unidad⟩"`.
- `width` y `height` con las dimensiones **originales**: el navegador reserva el alto
  antes de decodificar y no hay salto de contenido (CLS).
- `fetchpriority="high"` y `decoding="async"`: es contenido sobre el pliegue.
- El fondo del contenedor va del color del asset, para que no se vea una franja blanca
  mientras decodifica ni si la imagen falla.
- Si el banner enlaza al inicio, el enlace necesita nombre accesible propio y un
  `:focus-visible` visible contra el fondo oscuro.
- Si el diseño pide título de módulo o acciones a la derecha, exponlos como props o
  slots, y colócalos **solo sobre la zona sin marca** (la derecha), con contraste AA
  comprobado contra el color de fondo real de esa zona.

**Define tokens de color** (`--color-institucional`, `--color-acento`) con los valores
medidos. Decide explícitamente **si reemplazan o conviven** con la paleta actual de la
app: si ya hay un color primario en uso en botones, gráficos y favicon, propagarlo es un
rediseño que toca muchos archivos. Cualquiera de las dos opciones es válida; lo que no
vale es dejarlo ambiguo. Escribe la decisión en un comentario del CSS, para que nadie la
«arregle» después.

---

## 6. Móvil

Ancla la marca a la izquierda y sacrifica la derecha. Si ya usas el piso de altura del
§3-A, **esto ya está resuelto y no necesitas media query**: por debajo del cruce la
imagen desborda y el contenedor la recorta por la derecha. La media query solo hace falta
si vas por la opción B:

```css
@media (max-width: ⟨768⟩px) {
  .banner img { height: ⟨68⟩px; object-fit: cover; object-position: left center; }
}
```

Elige el alto **mirando la captura**, no calculando: baja hasta que el texto más pequeño
de la marca deje de leerse, y quédate un escalón arriba. En el caso de referencia, 68 px
en una pantalla de 390 px mantenía legible un logotipo con tres líneas de texto — con los
dos assets, el de 10,42:1 y el de 17,13:1.

Si a ningún alto razonable se lee, el respaldo es fondo sólido del color institucional +
solo el isotipo (recortado del asset), no un banner ilegible.

**Variante reducida (`srcset`/`<picture>`)**: solo si el ahorro lo justifica. Un asset ya
optimizado de ~40-80 KB en **una** petición cacheada no lo justifica; uno de 400 KB sí.
Calcula el ahorro antes de añadir un segundo archivo y un paso de generación.

---

## 7. Convivencia con la cabecera existente

Casi siempre ya hay una barra de navegación, y a veces también una cabecera de título.
Tres reglas:

1. **Un solo elemento fijo.** Si la navegación ya es `sticky`, el banner **no** debe
   serlo. Dos elementos fijos se comen permanentemente el alto de ambos; en una
   herramienta que se lee a diario, eso es espacio robado en cada scroll. Deja que el
   banner se vaya y que quede la barra.
2. **No apiles bandas del mismo color.** Si el banner y la navbar comparten familia
   cromática, cualquier tercera franja de ese color (una cabecera de título, por ejemplo)
   se lee como error. Despinta esa tercera franja y déjala como barra de estado neutra,
   invirtiendo los botones que estaban pensados sobre color (relleno en vez de contorno).
3. **Elimina la marca duplicada.** Un texto tipo «⟨SIGLA⟩» en la navbar bajo un banner
   que ya dice el nombre completo es ruido, y ese espacio horizontal suele hacer falta.
   **Excepción:** las pantallas de pre-pintado (el esqueleto en el HTML) y las de
   login/error deben seguir siendo **texto**. Meter ahí una imagen agrava justo lo que
   ese esqueleto existe para evitar: la página en blanco inicial.

Solo introduce una variable de alto de cabecera (`--altura-cabecera`) si algo la usa de
verdad (compensar un elemento fijo, `scroll-margin-top` para anclas). Si no, es deuda.

---

## 8. Verificación — obligatoria, y es mirar, no razonar

Que el código compile no verifica nada de esto. **Genera capturas y míralas.** Con
Chrome headless basta:

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
  --virtual-time-budget=8000 --window-size=1366,900 \
  --user-data-dir=/tmp/perfil --screenshot=out.png "⟨URL⟩"
```

(`--virtual-time-budget` es imprescindible si la app carga por JS: sin él capturas una
página vacía.)

Matriz mínima **a mirar**:

| Ancho | Qué se comprueba |
|---|---|
| 1920 | El alto no se descontrola; la zona derecha no queda vacía de forma rara |
| 1366 | Franjas/filetes **intactos**; sin línea clara de 1 px en los bordes |
| ⟨ancho de cruce⟩ | Opción B: los pseudo-elementos siguen alineados. Opción A con piso: el alto deja de encoger justo ahí y el borde derecho no muestra costura |
| 768 | Transición al modo móvil sin salto ni deformación |
| 390 | **El texto más pequeño de la marca se lee** (amplía el recorte para juzgarlo) |

Y además:

- **Amplía la zona de la marca** (recorte + escalado ×4) en la captura móvil. A tamaño
  real es imposible juzgar la legibilidad.
- **Tema oscuro**, si la app lo tiene. Ojo: emular `prefers-color-scheme` no basta si la
  app lee el tema de `localStorage` primero — fíjalo como lo haría el usuario.
- **Con scroll aplicado**, para confirmar qué queda fijo y qué no.
- **Mide, no estimes a ojo**: alto real del banner, de la navbar y del cromo total; y que
  el elemento fijo quede en `top: 0` tras hacer scroll. Si no puedes ejecutar JS contra la
  página, mide **sobre el PNG capturado** con las mismas herramientas del §1: barre una
  columna buscando dónde el color del banner da paso al de la barra. Es mejor que una
  consulta al DOM, porque comprueba lo que se pintó, no lo que el CSS declaró. Compara
  cada ancho contra `max(viewport / razón, alto mínimo)`; si un solo ancho no cuadra, el
  modelo mental está mal, no la captura.
- **Verifica los elementos de identidad por color, no mirando**: barre la fila del filete
  buscando sus valores RGB en cada captura. «Se ve bien» es exactamente el juicio que
  falla con una franja de 2 px en una miniatura.
- **Sin la imagen** (bloquéala en DevTools): debe verse el color de fondo, no blanco.

Comprueba también que el asset **llega al artefacto desplegado** (que el bundler lo
emitió, que no lo excluye un `.dockerignore` o equivalente) y que no rompiste las vistas
que compartían la hoja de estilos que tocaste.

---

## 9. No hagas

- No deformes el banner (`width:100%` + alto fijo sin `object-fit`).
- No superpongas texto sobre la zona de la marca.
- No recortes las franjas, filetes o elementos de identidad obligatorios sin redibujarlos.
- No pongas texto sobre el fondo sin verificar contraste AA **contra el color real** de
  esa zona (los banners suelen tener degradados o formas: el color no es uniforme).
- No dejes el banner y la navegación fijos a la vez.
- No metas la imagen en las pantallas de pre-pintado, login o error.
- No des por buena la maqueta sin haber mirado una captura a 390 px.

---

## Anexo — valores medidos de `banner3.jpg` (CONAF · UIA)

Verificados píxel a píxel; si trabajas con este asset, no los vuelvas a suponer.

⚠️ `banner3.jpg` **se rediseñó**: el asset vigente es un banner de cabecera web, no el
membrete de documento que había antes. Conserva el nombre de archivo, así que **el nombre
no te avisa de nada**: si heredas un CSS escrito contra el membrete, sus números están
todos mal. Los valores del asset viejo van al final, para poder leer el historial.

### Asset vigente — banner de cabecera (17,13:1)

- **3032 × 177 px**, JPEG, razón **17,1299:1**, **50 KB** (50 055 bytes exactos).
- **Sin artefacto de borde**: en las columnas de **fondo**, `y=0`, `y=1` e `y=2` son
  idénticas, y también las tres últimas filas. No hay que recortar nada antes de
  usarlo. Tampoco hace falta reoptimizar: 50 KB en una petición cacheada no justifica
  el paso extra (§6), y reencodear un JPEG solo añade pérdida generacional.
  ⚠️ **Pero en las columnas del filete la fila 0 SÍ está lavada**, por *ringing* del
  JPEG en el borde del bloque: en `x=100` la fila 0 es `#365d98` (y la 1, `#0f69b5`);
  en `x=200` es `#b7393a` (y la 1, `#eb3d49`). No es una raya visible ni cambia
  ninguna decisión de maqueta, pero tiene una consecuencia práctica: **si verificas el
  filete por color, mídelo en `y=2`, nunca en `y=0`** — ahí darías por perdido un
  filete que está intacto.
- **Filete BICOLOR, solo en el borde SUPERIOR** (el membrete lo llevaba arriba y abajo):
  tramo estable del azul en `x = 88`–`167` y del rojo en `x = 176`–`279`, adyacentes, en
  `y = 1` a `14` (~8 % del alto); el filete entero, transiciones incluidas, va de `x = 64`
  a `287` (2,11 %–9,47 %). Los valores RGB dominantes son `#1068b2` y `#eb3b45`: cada banda
  varía un par de unidades por píxel, así que si los verificas por color hazlo con
  tolerancia, no por igualdad exacta.
  **No es la bandera de Chile**: no hay banda blanca entre los dos colores. Es un recurso
  decorativo, no un emblema nacional, así que **no hay obligación normativa de
  conservarlo intacto** — aunque sí conviene, por acabado.
  ⚠️ El brief original lo llamaba «franjas tricolor (azul/rojo)», internamente
  contradictorio, y una versión anterior de este documento lo dio por «azul/blanco/rojo,
  bandera de Chile». **Ambas afirmaciones eran falsas**, y esa premisa falsa fue la que
  blindó el asset contra cualquier recorte durante toda la discusión. Es el ejemplo
  exacto de por qué el §1 dice medir en vez de heredar.
- **El campo NO es un solo verde**, aunque a simple vista lo parezca: `#15301d` bajo la
  marca y `#064928` a la derecha, con una **transición diagonal** entre `x = 744` y `x = 863`.
  Barriendo columna por columna, la primera uniformemente `#064928` **en las 177 filas** es la
  **864**, y lo sigue siendo hasta la **2743**.
  ⚠️ Una versión anterior de este anexo daba **858** y **2744**. Estaban mal: las columnas
  850–863 todavía varían entre `#054b29` y `#0a4728` según la fila, y la 2744 ya trae el
  micro-ruido del remate. Seis píxeles no cambian ninguna decisión de maqueta, pero un anexo
  que se anuncia como medido píxel a píxel no puede llevar números aproximados.
- **Remate decorativo** de formas orgánicas en verde claro desde `x = 2744` hasta el borde
  (`#5e8f19`, `#368627`, `#388429`…). **Esto es la diferencia práctica con el membrete**:
  el borde derecho ya **no** es verde plano, así que un recorte con relleno de color
  sólido no «no pierde nada» — se come el remate. Zona segura para cortar sin costura:
  **`864 ≤ x ≤ 2743`**.
- **Marca** (isotipo CONAF + logotipo UIA con tres líneas de texto) hasta `x = 540`: el
  **17,8 % izquierdo**, contra el 30 % del membrete. Todo lo demás es sacrificable.
- **Colores**: campo izquierdo `#15301d`, campo principal `#064928`, acento del remate
  `#5e8f19`, marca en blanco. Contraste con blanco (WCAG 2.1): `#15301d` → **14,27:1**,
  `#064928` → **10,55:1** (ambos AAA), pero **`#5e8f19` → 3,88:1: NO alcanza AA** (4,5:1)
  para texto normal. Es el color del remate derecho, que es donde suele querer ponerse el
  título del módulo o las acciones. Si pones texto ahí, o lo mantienes dentro de la zona
  `#064928`, o usas texto grande (AA large exige 3:1), o le pones un fondo propio.
- **Maqueta en uso**: opción A con piso (§3), `--razon-banner: 17.1299` y
  `--alto-minimo: 68px`. Cruce en **1164,83 px** de viewport.
- **Altos medidos sobre el render** del Consolidador Previred, no calculados en el aire
  —barriendo el PNG capturado columna por columna, en tema claro y oscuro—:

  | viewport | alto pintado | esperado | columna del asset en el borde derecho |
  |---|---|---|---|
  | 1920 | **112 px** | 112,08 | 3032 (sin recorte) |
  | 1366 | **80 px** | 79,74 | 3032 (sin recorte) |
  | 1165 | **68 px** | 68,01 | 3032 (justo en el cruce) |
  | 768 | **68 px** | 68,00 | 1999 (dentro de la zona segura) |
  | 390 | **68 px** | 68,00 | 1015 (dentro de la zona segura) |

  El filete azul+rojo está **íntegro en los cinco anchos y en los dos temas** (barrido de
  la fila `y=2` buscando sus RGB); el remate derecho se ve por encima del cruce y lo
  recorta el piso por debajo, que es el precio aceptado.
- **Límite inferior**: por debajo de **332 px** de viewport (864 × 68 × 17,1299 / 3032) el
  borde derecho deja de caer en la zona uniforme y aterriza en la transición diagonal
  `#15301d` → `#064928`, o sea que se vería una costura. 390 px es el ancho mínimo
  realista, así que queda fuera del rango que importa — pero conviene tenerlo escrito.
- **Móvil**: a 68 px de alto en una pantalla de 390 px, la marca completa —incluidas las
  tres líneas «UNIDAD DE / INFORMACIÓN / Y ANÁLISIS»— **sigue siendo legible** (ampliada
  ×4 sobre la captura, por vecino más cercano); no hace falta el respaldo con solo el
  isotipo.
- **Isotipo CONAF, para derivar un favicon**: copa en `x = 105`–`189`, `y = 51`–`99`;
  tronco en `x = 134`–`157`, `y = 100`–`125`; la palabra «conaf» arranca en `x ≈ 155` y
  su «f» baja hasta `y = 135`. El árbol y la palabra **se solapan en horizontal**, así que
  ningún recorte rectangular los separa: hay que tapar la palabra con el verde de fondo
  *antes* de reducir (taparla después deja el borde de las letras mezclado con el blanco).
  Caja que funciona: recortar `x = 105`–`190`, `y = 51`–`127` y tapar `x = 153`–`190`,
  `y = 97`–`127`. Mirados a 32 px ampliados ×8, la copa sola es una mancha, la marca
  completa queda diminuta dentro del cuadrado y el isotipo UIA es ilegible; el árbol
  entero con la palabra tapada es el único que se lee.

### Asset anterior — membrete de documento (10,39:1), ya no en uso

Se conserva por qué la maqueta vieja era como era; **no** describe el archivo actual.

- **3033 × 292 px**, razón **10,39:1**.
- **La fila `y=0` era un artefacto claro del JPEG** a todo lo ancho —`rgb(137,155,141)` a
  la izquierda, `rgb(193,209,199)` a la derecha— sobre un fondo que en `y=1` ya era
  `rgb(10,64,38)`. Había que recortar a `(0, 1, 3033, 292)`. Recortado y reoptimizado a
  `quality=90`: 82 KB → 42 KB.
- Filete bicolor **arriba y abajo**, de ~15 px (5,1 % del alto), en `x = 4,32 %`–`16,82 %`.
- Campo bitono `#0b4024` / `#064928` con transición entre `x ≈ 1101` y `x ≈ 1237`; primera
  columna uniforme, la **1237**. Borde derecho verde plano, sin remate: por eso el recorte
  horizontal con relleno sólido no costaba nada.
- Marca hasta `x ≈ 1028` (34 %).
- Alto con la opción A: **131 px a 1366, 185 px a 1920** — inaceptable, y la razón de que
  se recortara en horizontal con un factor `1250/291 = 4,2955`.
