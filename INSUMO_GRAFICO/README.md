# INSUMO_GRAFICO — material gráfico del visor de prevención de incendios

Procedencia del material gráfico: el asset recibido, lo que se derivó de él, y la evidencia de
que la maqueta quedó bien. Es a lo gráfico lo que `INSUMO_INCENDIO/` es a los datos.

⚠️ **Tocar esta carpeta no despliega nada.** `deploy.yml` solo dispara con cambios en
`INSUMO_INCENDIO/`, `ETL/`, `frontend/` y el propio workflow, y ningún script del build lee de
aquí. Lo que llega al sitio son las **copias** dentro de `frontend/`.

⚠️ **`banner3.jpg` se rediseñó conservando el nombre de archivo.** El asset actual es un banner
de cabecera web (17,13:1); el anterior era un membrete de documento (10,39:1). **El nombre no te
avisa de nada**: si heredas un CSS o unas medidas escritas contra el membrete, sus números están
todos mal. Por eso la copia que usa la app se llama `banner-conaf-uia.jpg`.

## Qué hay aquí

| Archivo | Qué es |
| --- | --- |
| `banner3.jpg` | **Original recibido, intacto.** 3032 × 177, 50 055 B. Es la procedencia; no se toca. |
| `implementacion_banner.md` | Prompt reutilizable para integrar un banner institucional en cualquier stack, con el anexo de medidas de este asset. Portable: sirve para otros proyectos tal cual. |
| `derivados/banner-conaf-uia.jpg` | Copia byte a byte del original (mismo SHA-256), con el nombre que usa la app. Sin recortar ni reoptimizar: no hay artefacto de borde, y reencodear 50 KB solo añade pérdida generacional. |
| `derivados/favicon-32.png` | 32 × 32. Isotipo CONAF recortado del banner sobre `#064928`. |
| `derivados/apple-touch-icon-180.png` | 180 × 180, mismo recorte. |
| `verificacion/` | Capturas aceptadas de `npm run verify:banner` **de esta app**: los cinco anchos en tema claro y oscuro, la marca ampliada ×4 a 390 px, el caso sin imagen y la pantalla de error. Línea base visual. |

## Dónde vive cada cosa en el proyecto

| Qué | Dónde |
| --- | --- |
| El asset que compila Vite | `frontend/src/assets/banner-conaf-uia.jpg` (importado desde JS: hash de contenido y `base` resuelta sola) |
| El componente | `frontend/src/components/Banner.jsx` |
| Los números de la maqueta | `frontend/src/index.css` → `--razon-banner`, `--alto-minimo-banner`, `--verde-institucional` |
| La decisión de paleta, escrita | comentario de los tokens en `index.css` y del bloque `.banner` en `frontend/src/App.css` |
| Los iconos que se publican | `frontend/public/favicon-32.png`, `frontend/public/apple-touch-icon-180.png` |
| Cómo se verifica | `frontend/scripts/verify-banner.mjs` (`npm run verify:banner`), y el job `verificar-banner` de `deploy.yml`, que bloquea el despliegue |

No hay script de regeneración de iconos: los PNG derivados ya existen, la caja de recorte está
más abajo, y ese script correría una vez cada vez que cambie el asset, o sea casi nunca.

## Medidas, en una tabla

Verificadas píxel a píxel sobre `banner3.jpg`. Si el asset cambia, **hay que volver a medirlas**.

| Dato | Valor |
| --- | --- |
| Tamaño y razón | 3032 × 177, **17,1299:1**, 50 055 B |
| Campo izquierdo | `#15301d` |
| Campo principal | `#064928` |
| Transición diagonal entre ambos | x 744–863 |
| Filete, **solo en el borde superior**, filas y 1–14 | azul `#1068b2` estable en x 88–167, rojo `#eb3b45` en x 176–279; las transiciones ocupan 64–87, 168–175 y 280–287 |
| Fila y = 0 | **lavada por *ringing* del JPEG solo en las columnas del filete**. Si verificas el filete por color, mídelo en y = 2 |
| **Zona segura para cortar sin costura** | **864 ≤ x ≤ 2743** |
| Remate decorativo derecho | desde x = 2744; al menos cuatro verdes (`#388429`, `#368529`, `#629d1c`, `#5e8f19`) |
| Marca (isotipo + logotipo UIA) | x 105–541 (17,9 % izquierdo) |
| Contraste con blanco | `#15301d` 14,26:1 · `#064928` 10,55:1 (AAA) · `#388429` 4,67:1 · `#5e8f19` 3,88:1 · `#629d1c` 3,30:1 — **los dos últimos no alcanzan AA**: no pongas texto sobre el remate |
| Recorte del favicon | x 105–190, y 51–127, tapando x 153–190 / y 97–127 con `#064928` **antes** de reducir |

## La maqueta, y lo que cuesta

Opción A del §3 de `implementacion_banner.md`: proporción natural con piso de altura. Sin
`object-fit` y sin recorte vertical, así que el filete sobrevive en cualquier ancho.

| viewport | alto pintado | columna del asset en el borde derecho |
| ---: | ---: | --- |
| 1920 | 112 px | 3032 (sin recorte) |
| 1366 | 80 px | 3032 |
| 1165 | 68 px | 3032 (el cruce, en 1164,83) |
| 768 | 68 px | 1999 (zona segura) |
| 390 | 68 px | 1015 (zona segura) |

Medido sobre las capturas de `verificacion/`, no calculado en el aire. **Coste aceptado:** el
alto crece con la ventana. Por debajo de **332 px** de viewport el borde derecho abandonaría la
zona uniforme y se vería costura; queda fuera del rango realista.

A 68 px en una pantalla de 390 px la marca completa —incluidas las tres líneas «UNIDAD DE /
INFORMACIÓN / Y ANÁLISIS»— **sigue siendo legible**: ver `captura-banner-390-marca-x4.png`.

## Si el banner cambia

1. Reemplazar `banner3.jpg` y **volver a medirlo** (§1 de `implementacion_banner.md`; en Windows
   sin Python, con .NET `System.Drawing` + `LockBits`).
2. Copiarlo a `frontend/src/assets/banner-conaf-uia.jpg` y a `derivados/`.
3. Actualizar `--razon-banner` y `--alto-minimo-banner` en `frontend/src/index.css`, **los
   atributos `width`/`height` del `<img>` en `Banner.jsx`** (de ellos depende que el navegador
   reserve el alto antes de decodificar, y con eso que Leaflet mida bien el mapa) y las
   constantes de `frontend/scripts/verify-banner.mjs`.
4. Rehacer los iconos con la caja de recorte de la tabla.
5. `npm run verify:banner`, **mirar** `captura-banner-390-marca-x4.png`, y recopiar las capturas
   aceptadas a `verificacion/`.
