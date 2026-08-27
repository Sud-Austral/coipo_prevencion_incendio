# analisis/ — lector Python y notebook

Lee en pandas **exactamente lo que el visor pinta**: las capas de
`frontend/public/data`. `leer_capas.py` es la contraparte en Python de
`frontend/src/App.jsx` + `hooks/useDatos.js` —mismo contrato, mismos
vocabularios, mismos centinelas— y `analisis_incendios.ipynb` lo usa sin
reimplementar nada.

```bash
cd frontend && npm run datos          # 1. traer la capa publicada (~35 MB)
python analisis/leer_capas.py         # 2. resumen + 37 chequeos de reconciliación
```

En este equipo `python` a secas es el stub del Microsoft Store y falla con
exit 49. El intérprete real es `C:\ProgramData\anaconda3\python.exe`.

```python
import sys; sys.path.insert(0, "analisis")
from leer_capas import cargar, leer_manifest, agrupar

man = leer_manifest()      # valida el contrato ANTES de tocar un byte
df  = cargar()             # 14.705 filas x 42 columnas
```

## Qué hace distinto a un `json.load` a mano

**Afirma la generación del esquema.** No hay ningún campo de versión —ni en el
manifest ni en el ETL—, así que se afirma con el conjunto de campos codificados.
Un manifest de otra generación **revienta nombrando los campos que faltan**, en
vez de devolver un DataFrame plausible al que le falten columnas. Es un fallo
real que este repo tuvo: el snapshot en disco era del 2026-08-07 con 7 campos
codificados mientras el ETL ya emitía 12.

**Valida contra lo publicado en cada carga.** Bytes en disco contra
`manifest.bytes` (el visor lo enseña al usuario pero nunca lo contrasta), número
de features, bbox, códigos dentro de rango y `tabla[código] == etiqueta` fila a
fila. `reconciliar()` añade el cruce con `kpis.json`, `km_por_region` y la
constante `KM_OFICIAL_NACIONAL` de `ETL/build_oecv.py`. Hoy: **37/37 cuadran.**

**Desactiva las cuatro trampas**, todas medidas sobre este dataset:

| | |
|---|---|
| `float32` | El formato es JSON de texto, así que el riesgo lo pone el lector. Sumar `superficie_ha` en `f32` mueve el total 0,05 ha sobre 666.197,20. Todo entra en `float64` y se comprueba que ninguna columna quedó en `f32`. |
| Centinelas | `'Sin registro'` y compañía sobreviven como **etiqueta** dentro de las tablas: 74 filas en `provincia`, 67 en `comuna` y 1.219 en `jefe_brigada` (8,29 %). Se traducen a `NA` por igualdad exacta, nunca por subcadena. `'Sin informe'` y `oecv.tipo == 'Sin determinar'` **no** se tocan: son datos. |
| Etiquetas repetidas | Cada dimensión sale dos veces, `<campo>` y `<campo>_cod`. **Ojo: `_cod` NO es un código oficial** —es la posición en una tabla ordenada por frecuencia, que cambia entre corridas—. Los códigos citables son `causa_codigo` y `causa_general_codigo`. |
| `groupby` | Descarta los `NA` por defecto: un `groupby('inv_inicio')` pierde 4.890 filas (33,25 %) sin decir nada. `agrupar()` los conserva y avisa con la cifra exacta. |

**Reporta lo que no puede arreglar.** Fechas fuera del rango de
`datetime64[ns]` (3 filas de `inv_fin` con año 0203), 4 fechas posteriores a la
corrida del ETL, 24 investigaciones que terminan antes de empezar, y las 35
comunas repartidas en 76 códigos por variantes de mayúsculas (2.450 filas,
16,7 %). Nada de eso se corrige: corregir una fecha es inventar un dato.

**Lee la paleta del visor**, no elige colores. `COLOR_CAUSA` es Okabe-Ito y
`COLOR_OECV` es simbología oficial del Memo N° 3045/2025; `paleta_del_visor()`
las extrae de `frontend/src/config.js` y **falla ruidosamente** si alguna clase
presente en los datos no tiene color.

## Lo que no se puede leer desde aquí

`rutas` y `redvial` son PMTiles con `--drop-densest-as-needed`: sus 5.278 y
13.964 features son cifras del manifest, **no filas recuperables**.
`meta_teselas()` devuelve sus metadatos y su header, y lo dice. Para tenerlas
como features hay que regenerarlas:
`python ETL/run.py --layers redvial --no-tiles --out <carpeta_aparte>`, nunca
sobre `frontend/public/data`.

## Ejecutar el notebook

```powershell
$env:PYTHONUTF8 = "1"
& "C:\ProgramData\anaconda3\python.exe" -m jupyter nbconvert `
    --to notebook --execute --inplace `
    --ExecutePreprocessor.timeout=900 `
    --ExecutePreprocessor.kernel_name=python3 `
    analisis\analisis_incendios.ipynb
```

`PYTHONUTF8=1` no es opcional: sin él un `print` con `→` o `Ñ` muere con
`UnicodeEncodeError` en cp1252.

Y **«0 errores» no basta**: hay que abrir las figuras. Dos fallos que pasaron el
`0 errores` mientras se construía esto y que sólo se ven mirando —quedan aquí
para que nadie los repita—:

- **`orden_dibujo` contradecía su propio docstring** y devolvía la tabla
  invertida, así que la clase más rara quedaba *debajo* de la mayoritaria:
  `Naturales` (96) enterrada bajo `Negligentes` (8.730). El mapa insinuaba que
  no existía.
- **`tight_layout` colapsó el mapa nacional** a una franja de 1194×211 px. Con
  un aspecto fijo, un país de 38° de latitud y la leyenda fuera del eje,
  matplotlib avisa «the left and right margins cannot be made large enough» y el
  backend inline recorta a eso. Los márgenes van a mano.

## Salidas

`analisis/salidas/` (en `.gitignore`) recibe `incendios.parquet`,
`incendios.csv` y `procedencia.json`. Ese último **no es decorativo**: sin las
tablas del manifest al lado, un archivo con columnas `<campo>_cod` es
indescifrable en otra corrida del ETL, porque el índice es posicional.
