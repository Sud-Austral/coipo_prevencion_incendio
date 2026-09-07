# Lo que se construyo

## Que hace, en dos parrafos

Permite convertir el material que entregan las regiones —planillas de calculo,
capas de sistema de informacion geografica y archivos de puntos y recorridos—
en un conjunto acotado de capas listas para mostrarse en un mapa, y permite
consultar ese resultado en un visor. La conversion tiene un unico punto de
entrada que corre las capas en paralelo, escribe un indice de lo producido y
verifica el resultado al terminar [ETL/run.py], [ETL/verify.py]. Cada capa
tiene su propio proceso: incendios [ETL/build_incendios.py], obras de
prevencion planificadas [ETL/build_oecv.py] y verificadas
[ETL/build_verificado.py], puntos [ETL/build_puntos.py], recorridos
[ETL/build_rutas.py], red vial [ETL/build_redvial.py] e indicadores
[ETL/build_kpis.py].

Permite ver esas capas sobre un mapa, encenderlas y apagarlas, filtrar,
consultar la ficha de un elemento, leer indicadores y descargar lo que se esta
viendo. El visor lee primero el indice de lo publicado y despues cada archivo
que ese indice nombre [frontend/src/hooks/useDatos.js:15],
[frontend/src/hooks/useDatos.js:54], y aparte los indicadores
[frontend/src/hooks/useDatos.js:97]. La ficha de un elemento
[frontend/src/components/ModalFicha.jsx], [frontend/src/fichas.js], el panel de
indicadores [frontend/src/components/PanelIndicadores.jsx],
[frontend/src/indicadores.js] y la seccion de descargas
[frontend/src/components/SeccionDescargas.jsx], [frontend/src/descargas.js] son
capacidades separadas dentro de la misma pantalla [frontend/src/App.jsx].

## Capacidades, una por una

[INFERIDO] Lee formatos de escritorio sin depender de una herramienta
instalada: hay lectores propios para capas geograficas [ETL/shp_reader.py] y
para archivos de mapas comprimidos o no [ETL/kml_reader.py], y lee planillas de
calculo con la libreria declarada para eso [ETL/requirements.txt:4].

[INFERIDO] Corrige y unifica coordenadas: hay un modulo dedicado a la
proyeccion, a validar que un punto caiga dentro del pais y a calcular largos
[ETL/geo.py], apoyado en la libreria de proyecciones declarada
[ETL/requirements.txt:1] y en la de geometrias [ETL/requirements.txt:2].

[INFERIDO] Normaliza el contenido que llega escrito de cualquier manera:
funciones para limpiar texto, decidir si un valor es nulo, interpretar
coordenadas, y normalizar fecha, hora y mes [ETL/build_incendios.py].

[INFERIDO] Publica un indice de lo que produjo, y ese indice es lo que manda:
el proceso lo escribe [ETL/gj_io.py], [frontend/public/data/manifest.json] y
tanto el visor [frontend/src/hooks/useDatos.js:15] como el guion que baja las
capas ya publicadas [frontend/scripts/descargar-datos.mjs] leen de ahi en vez
de tener una lista fija.

[INFERIDO] Entrega las capas pesadas en teselas y las livianas en formato
plano, y cae a formato plano cuando la herramienta de teselado no esta
disponible, anotandolo en el indice [ETL/tiles.py],
[frontend/public/data/rutas.pmtiles], [frontend/public/data/redvial.pmtiles],
[frontend/public/data/incendios.geojson]. El README advierte de forma explicita
que una corrida local en Windows produce el resultado degradado y no debe
versionarse [README.md].

[INFERIDO] Verifica lo producido antes de darlo por bueno, incluido un cruce
espacial [ETL/verify.py], y verifica tambien la interfaz comparando contra
capturas a distintos anchos y en tema claro y oscuro
[frontend/scripts/verify-banner.mjs], [frontend/scripts/verify-panel.mjs],
[frontend/.verificacion/informe.html].

[INFERIDO] Permite descargar lo que se esta viendo, con separador y marca de
codificacion definidos a proposito [frontend/src/descargas.js], y armar una
imagen del mapa [frontend/src/mapaPNG.js] y un informe
[frontend/src/informe.js].

[INFERIDO] Recuerda el estado de la vista: hay un modulo que codifica la vista
en la direccion [frontend/src/urlState.js] y otro que guarda preferencias
[frontend/src/preferencias.js]. Eso permite compartir una vista tal como quedo.

[INFERIDO] Muestra de cuando es la imagen de fondo consultando un servicio
externo [frontend/src/hooks/useFechaImagen.js:80],
[frontend/src/components/EtiquetaImagen.jsx]. Cual es ese servicio y quien
responde por el es [PENDIENTE].

[INFERIDO] Se adapta al ancho de la pantalla con cortes definidos como
constantes [frontend/src/config.js] y con un panel que se pliega
[frontend/src/components/PanelLateral.jsx],
[frontend/src/components/Tirador.jsx].

[INFERIDO] Aparte del visor hay una via de analisis: un cuaderno que se
construye desde codigo [analisis/construir_notebook.py],
[analisis/analisis_incendios.ipynb] y un modulo que lee las capas publicadas y
exige que el contrato con el proceso no se haya desfasado
[analisis/leer_capas.py]. Ese modulo declara errores propios para contrato
desfasado, datos ausentes y paleta incompleta, y detecta archivos huerfanos, lo
que indica que la verificacion de coherencia es parte del proposito y no un
accesorio.

## Roles: quien ve que

[INFERIDO] No hay roles. No se detectaron guards, decoradores de autorizacion,
middleware ni tabla de permisos, y no hay ninguna ruta de servidor: las cuatro
llamadas registradas son las que el propio visor hace para leer archivos
[frontend/src/hooks/useDatos.js:15], [frontend/src/hooks/useDatos.js:54],
[frontend/src/hooks/useDatos.js:97], [frontend/src/hooks/useFechaImagen.js:80].
El README lo dice de forma directa: todo se sirve como archivos estaticos
[README.md].

[INFERIDO] La unica distincion de comportamiento en el codigo no es por
persona sino por ambiente: hay una bifurcacion segun si se esta en desarrollo
[frontend/src/App.jsx:871].

[PENDIENTE] Quien puede ver el visor. Si esta publicado abierto, la respuesta
es todo el mundo, y esa es una decision del negocio que ningun archivo del
repositorio consigna.

[PENDIENTE] Quien puede modificar los insumos y quien autoriza una nueva
publicacion. Tecnicamente lo dispara un cambio en el repositorio
[.github/workflows/deploy.yml], pero quien tiene esa facultad no consta.

## De donde salen los datos

[INFERIDO] La fuente son los archivos entregados por region, guardados en el
propio repositorio: capas geograficas
[INSUMO_INCENDIO/Despliegue territorial/Consolidado/Rutas_Maule_25-26_Conaf.dbf],
planillas de calculo
[INSUMO_INCENDIO/OECV 2025 - 2026/OECV 2025-2026.xlsx],
[INSUMO_INCENDIO/OECV 2025 - 2026/13.- Los Ríos/Verificado/Detalle OECVs Temporada 2025-2026.xlsx],
y una capa vial entregada como archivo aparte
[INSUMO_INCENDIO/Red-vial_MOP_2024/Red-vial_MOP_2024.json], consumida por el
proceso de red vial [ETL/build_redvial.py].

[INFERIDO] Hay tambien una planilla consolidada de investigacion de causas
[INSUMO_INCENDIO/BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx], que por su
ubicacion es insumo del proceso de incendios [ETL/build_incendios.py]. Que sea
esa exactamente la que se lee es [PENDIENTE]: la evidencia no incluye la
configuracion de rutas [ETL/cfg.py].

[INFERIDO] El material grafico del encabezado viene de una carpeta propia
[INSUMO_GRAFICO/README.md], [INSUMO_GRAFICO/implementacion_banner.md] y termina
incorporado al visor [frontend/src/assets/banner-conaf-incendios.jpg],
[frontend/src/components/Banner.jsx].

[PENDIENTE] Quien es dueno de cada fuente: quien entrega las capas por region,
quien la planilla de investigacion y quien la capa vial. Ningun archivo lo
dice, y deducirlo del nombre de la carpeta seria inventarlo.

## Que no hace

Solo se afirman ausencias que el extractor busco de forma exhaustiva, y van
marcadas igual.

[INFERIDO] No tiene servidor propio ni base de datos: no hay ninguna ruta de
servidor en la evidencia y la lista de tablas detectadas esta vacia. El README
lo declara como aplicacion sin backend [README.md].

[INFERIDO] No permite editar los datos desde la pantalla: las cuatro llamadas
detectadas son de lectura de archivos
[frontend/src/hooks/useDatos.js:15], [frontend/src/hooks/useDatos.js:54],
[frontend/src/hooks/useDatos.js:97], [frontend/src/hooks/useFechaImagen.js:80].
Lo que cambia el resultado es cambiar el insumo y volver a correr el proceso.

[INFERIDO] No hay autenticacion: no se detecto ninguna variable de entorno de
credenciales; las tres registradas son la ruta base de publicacion
[frontend/vite.config.js:7], la raiz de datos del analisis
[analisis/leer_capas.py:254] y la marca de ambiente de desarrollo
[frontend/src/App.jsx:871].

[INFERIDO] El proceso no consulta ningun servicio externo para producir las
capas: los modulos de construccion se apoyan solo en lectores de archivo
[ETL/shp_reader.py], [ETL/kml_reader.py] y en el modulo geografico
[ETL/geo.py]. La unica llamada externa del proyecto ocurre en el visor y es
para saber la fecha de la imagen de fondo
[frontend/src/hooks/useFechaImagen.js:80].

## Iteraciones

[INFERIDO] La publicacion esta automatizada y se dispara con los cambios: hay
un unico flujo de trabajo que reconstruye las capas y las publica
[.github/workflows/deploy.yml], y el README explica que los datos generados se
versionan en la rama principal y quedan ademas como artefacto descargable por
un plazo acotado [README.md].

[INFERIDO] Hay dos generaciones de verificacion visual conviviendo: las
capturas guardadas junto al material grafico
[INSUMO_GRAFICO/verificacion/captura-banner-1366.png],
[INSUMO_GRAFICO/verificacion/medidas.json] y las que produce el guion actual
[frontend/.verificacion/captura-banner-1366-dark.png]. La segunda distingue
tema claro y oscuro y la primera no, lo que sugiere en que orden aparecieron.

[INFERIDO] El proceso de analisis dejo salidas fechadas y con procedencia
declarada [analisis/salidas/procedencia.json],
[analisis/salidas/incendios_tablas.json], lo que indica que hubo al menos una
corrida cuyo resultado se conservo.

[PENDIENTE] No hay CHANGELOG ni migraciones numeradas en la evidencia, asi que
la historia de versiones no se puede reconstruir desde aca.
