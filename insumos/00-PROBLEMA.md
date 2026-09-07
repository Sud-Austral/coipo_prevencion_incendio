# Problema que se deduce del codigo

Advertencia de metodo: este documento se escribe hacia atras, desde lo que hay
construido hacia lo que probablemente estaba roto. La cadena de inferencia es
debil y cada eslabon va marcado. Que exista un programa que ordena planillas y
mapas no prueba que el desorden fuera el problema que alguien pidio resolver.

## La inferencia central

[INFERIDO] El material de partida esta disperso y en formatos de escritorio.
La evidencia registra dentro de una sola carpeta de insumos cientos de archivos
repartidos en carpetas por region, en los que conviven planillas de calculo
[INSUMO_INCENDIO/OECV 2025 - 2026/OECV 2025-2026.xlsx], archivos de sistema de
informacion geografica con sus cinco o seis piezas por capa, y archivos de
puntos y recorridos exportados desde herramientas de mapas. Luego probablemente
habia un problema de consolidacion: cada region entregaba lo suyo, a su manera,
y no habia una vista unica.

[INFERIDO] Junto al material por region existe una version consolidada armada
aparte, con un archivo por region
[INSUMO_INCENDIO/Despliegue territorial/Consolidado/Rutas_Maule_25-26_Conaf.dbf],
[INSUMO_INCENDIO/OECV 2025 - 2026/COMPILADO/SHAPE/Compilado shape/Compilado_OECV_2025.dbf],
que convive con las carpetas numeradas de origen
[INSUMO_INCENDIO/OECV 2025 - 2026/9.- Maule/Planificado/Planificación OECV Region del Maule.xlsx].
Que la consolidacion exista como carpeta y no como resultado de un proceso es
compatible con que antes se armara a mano.

[INFERIDO] Que se haya tenido que escribir un inventario de los propios insumos
[INFORME_INSUMOS/Inventario_INSUMO_INCENDIO_2026-08-17.xlsx] y su version para
leer [INFORME_INSUMOS/Inventario_INSUMO_INCENDIO_2026-08-17.pdf] indica que
saber que habia dentro ya era en si mismo un trabajo. Ese es un sintoma del
problema, no la solucion.

[INFERIDO] El material recibido llega con acentos danados en el nombre y con
carpetas de correccion al lado del original
[INSUMO_INCENDIO/Despliegue territorial/11.- Biobío/Rutas_Correccion/Rutas_Biob+¡o_25-26_Conaf.dbf],
[INSUMO_INCENDIO/Despliegue territorial/11.- Biobío/Rutas_Correccion/Rutas_Biobio_25-26_Conaf.dbf].
Es un indicio de que pasa por varias manos y varias herramientas antes de
llegar.

## Quien sufre el problema

[PENDIENTE] No hay ningun rol en el codigo. No se detectaron guards,
decoradores de autorizacion, middleware ni tabla de permisos, y no hay ninguna
ruta de servidor: las unicas llamadas registradas son las que el propio visor
hace para leer sus datos [frontend/src/hooks/useDatos.js:15],
[frontend/src/hooks/useDatos.js:54], [frontend/src/hooks/useDatos.js:97]. Sin
control de acceso no hay roles que nombrar.

[INFERIDO] La unica division de trabajo visible es entre quien produce los
datos y quien los mira: el proceso de transformacion vive en [ETL/run.py] y el
visor en [frontend/src/App.jsx], y ambos se conectan por archivos publicados
[frontend/public/data/manifest.json]. Que existan dos oficios no dice quienes
los ejercen.

[PENDIENTE] Cuantas personas usan el visor y cuantas entregan insumos. La
cantidad de carpetas por region no es un dato de dotacion.

[PENDIENTE] Quien es el area duena del visor y quien la del material de origen.

## Como lo resolvian antes

[INFERIDO] A mano y en el escritorio. Los insumos incluyen planillas de calculo
por region
[INSUMO_INCENDIO/OECV 2025 - 2026/16.- Magallanes/Planificado/Detalle OECV Magallanes 2025-2026.xlsx],
proyectos y simbologia de programas de escritorio geografico
[INSUMO_INCENDIO/Despliegue territorial/15.- Aysén/Puntos_Aysen_25-26_Conaf/puntos santaby2526.qgz],
[INSUMO_INCENDIO/Despliegue territorial/6.- Valparaíso/Puntos_Valparaiso_25-26_Conaf/Puntos_Valparaíso_25-26_Conaf.lyrx],
fichas y actas en documentos de oficina
[INSUMO_INCENDIO/Despliegue territorial/8.- O_Higgins/Acta Reunión.docx], y
hasta carpetas comprimidas sin abrir
[INSUMO_INCENDIO/Despliegue territorial/7.- Metropolitana/Rutas_Metropolitana_25-26_Conaf.rar].
Ese es el estado en que llega el material, no el que produce el sistema.

[INFERIDO] El programa lee esos formatos de escritorio directamente, con
lectores propios escritos para el caso [ETL/shp_reader.py],
[ETL/kml_reader.py], lo que confirma que no habia una base de datos de la que
tomar los datos: habia archivos.

[PENDIENTE] Quien mantenia cada planilla, con que periodicidad y cuanto
tardaba en consolidarlas.

## Volumen

[INFERIDO] El orden de magnitud es de decenas de capas y de un material de
origen grande pero acotado: la evidencia registra 944 archivos en el
repositorio y la enorme mayoria son insumos, no codigo. El
proceso corre las capas en paralelo [ETL/run.py] y tiene un modo que simplifica
geometrias y otro que las convierte a teselas [ETL/tiles.py], dos senales de
que el volumen incomoda a un visor si se entrega en crudo.

[INFERIDO] La salida publicada son ocho archivos
[frontend/public/data/incendios.geojson], [frontend/public/data/oecv.geojson],
[frontend/public/data/oecv_verificado.geojson],
[frontend/public/data/puntos_standby.geojson],
[frontend/public/data/rutas.pmtiles], [frontend/public/data/redvial.pmtiles],
[frontend/public/data/kpis.json], [frontend/public/data/manifest.json]. Que dos
de ellos esten en formato de teselas y el resto no sugiere que esos dos son los
pesados.

[PENDIENTE] Cuantos registros hay en cada capa. Ningun archivo de la evidencia
entrega esa cifra y deducirla del tamano seria inventarla.

## Que pasa si no se hace nada

[PENDIENTE] El codigo no lo responde, sin excepcion. No se deduce de que el
visor exista.

## Quien decide que esta terminado

[PENDIENTE] No hay criterio de aceptacion del negocio en la evidencia. Hay
verificaciones tecnicas, y son bastante estrictas: una que revisa las capas
producidas [ETL/verify.py] y dos que revisan la interfaz contra capturas
[frontend/scripts/verify-banner.mjs], [frontend/scripts/verify-panel.mjs]. Pero
que esas verificaciones pasen es un criterio tecnico, no la conformidad de
quien encargo el trabajo.

## Marco normativo y datos sensibles

[VERIFICAR] Entre los insumos hay una planilla cuyo nombre la identifica como
base de datos de investigacion consolidada
[INSUMO_INCENDIO/BBDD INVESTIGACIÓN UAD CONSOLIDADA COMPLETA.xlsx]. La
evidencia no incluye su contenido ni sus columnas, de modo que no se puede
afirmar que contenga datos de personas, pero tampoco descartarlo. El
repositorio figura como publico en los metadatos de la evidencia y el visor se
publica en la web segun el propio README [README.md]. Esto lo cierra quien
corresponda en la revision juridica, no este documento.

[VERIFICAR] Entre los insumos hay actas de reunion y fichas en documentos de
oficina
[INSUMO_INCENDIO/Despliegue territorial/8.- O_Higgins/Acta Reunión.docx],
[INSUMO_INCENDIO/Despliegue territorial/13.- Los Ríos/Acta reunion Rutas 25-26.pdf],
[INSUMO_INCENDIO/Despliegue territorial/7.- Metropolitana/Actas reuniones/Acta reu 1.pdf].
Un acta suele consignar quienes asistieron. La evidencia no incluye el
contenido de esos archivos, asi que el patron y el conteo no estan
determinados; que un acta este versionada en un repositorio publico es una
revision pendiente y no una conclusion de este documento.

[VERIFICAR] Los datos de incendios que produce el proceso
[ETL/build_incendios.py] se publican con coordenadas
[frontend/public/data/incendios.geojson]. Si alguno de esos puntos permite
identificar un predio o una persona, la publicacion abierta requiere una
decision que no consta en ninguna parte de la evidencia.
