# Problemas abiertos · Visor de Prevención de Incendios Forestales (CONAF)

Generado el 2026-11-15 desde `_generador/datos_doc.py`. Los ids son estables entre versiones.

## Criterio de gravedad

| Gravedad | Criterio |
|---|---|
| Crítica | Impide usar el visor o muestra una cifra falsa como verdadera. |
| Alta | Una funcionalidad principal falla o induce a error sin aviso. |
| Media | Falla parcial, inconsistencia entre datos y código, o riesgo de que aparezca una de las anteriores. |
| Baja | Molestia, documentación desfasada o riesgo de desarrollo, sin efecto en lo publicado. |

## Abiertos

| Id | Título | Gravedad | Rol o módulo | Evidencia | Certeza | Estado |
|---|---|---|---|---|---|---|
| P-001 | Datos versionados desfasados del código de infraestructura crítica | Media | Vista Riesgo / frontend/public/data | frontend/public/data/manifest.json (generado 2026-09-16T10:40:30): capas.infra_puntos sin «familias» ni «tablas», 696 elementos de 3 comunas; ETL/build_infra_puntos.py:319 publica «familias»; App.jsx:582-587 las lee; config.js:385-394 no tiene color para «escuelas_prep». | Verificado en el código y en el manifest versionado; el efecto en pantalla con esos datos NO lo comprobé. | Abierto |
| P-002 | Sin canal de aviso cívico ni de contacto en un visor público | Media | Visor (todas las vistas) | frontend/src/config.js:613 (AVISO_CIVICO = null) y 625 (CONTACTO = null); DECISIONES.md §Ñ. | Verificado en el código. | Abierto (decisión pendiente) |
| P-003 | Build local (frontend/dist) más viejo que el código fuente | Baja | Herramientas de desarrollo | frontend/dist/index.html del 2026-10-23 17:58; frontend/src/App.jsx modificado después (find -newer). Los arneses sirven dist tal como está (CLAUDE.md §3). | Observado (fechas de archivo). | Abierto |
| P-004 | Ruta del intérprete de Python en CLAUDE.md no corresponde a esta estación | Baja | Documentación del repositorio | CLAUDE.md §3 cita un python.exe bajo el perfil de otro usuario; en esta estación el intérprete real es C:\ProgramData\anaconda3\python.exe. | Observado (la ruta citada no existe aquí). | Abierto |

## Cerrados

Ninguno (primera versión del paquete).
