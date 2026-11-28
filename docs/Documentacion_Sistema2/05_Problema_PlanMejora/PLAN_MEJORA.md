# Plan de mejora · Visor de Prevención de Incendios Forestales (CONAF)

Generado el 2026-11-15. El plan PROPONE; no modifica código de la aplicación. Los esfuerzos son estimaciones, no mediciones.

## P-001 · Datos versionados desfasados del código de infraestructura crítica (Media)

- **Causa raíz:** El último commit de datos (c9c8960, 2026-09-16 10:48 UTC) es anterior al cambio de ETL/build_infra_puntos.py (c0ce757, 2026-09-16 10:08 -0300). Quien use «npm run datos» o el repositorio como fuente recibe un contrato viejo.
- **Solución propuesta:** Volver a ejecutar el workflow de despliegue para que commitee las capas del ETL actual.
- **Alternativas descartadas:** Corregir el manifest a mano: CLAUDE.md §2 dice que su único productor válido es Actions.
- **Pasos:**
  1. Disparar «ETL y despliegue a GitHub Pages» (workflow_dispatch o un cambio en ETL/).
  2. Comprobar que el commit «datos: capas del ETL <fecha>» trae capas.infra_puntos.familias.
  3. Correr verify:priorizacion (C19) contra los datos nuevos.
- **Prueba que lo demuestra (debe verse roja antes del arreglo):** C19 de frontend/scripts/verify-priorizacion.mjs con VERIFY_DATOS apuntando al manifest viejo debe ponerse roja; con el nuevo, verde.
- **Criterio de aceptación:** manifest.json versionado con «familias» y con cobertura nacional de infraestructura.
- **Riesgos y efectos colaterales:** El commit de datos es grande (~370 MB en public/data); no commitear mientras corren mutantes (CLAUDE.md §3).
- **Dependencias y quién decide:** Ninguna. Decide: mantenedor del repositorio.
- **Esfuerzo:** 1-2 h (estimación)

## P-002 · Sin canal de aviso cívico ni de contacto en un visor público (Media)

- **Causa raíz:** Decisión deliberada: cualquier teléfono o canal debe venir autorizado por la Unidad de Información y Análisis.
- **Solución propuesta:** Obtener el texto autorizado y asignarlo a las constantes.
- **Alternativas descartadas:** Poner un teléfono genérico: atribuiría a CONAF un mensaje que no ha emitido.
- **Pasos:**
  1. Pedir a la Unidad de Información y Análisis el texto y el canal autorizados.
  2. Asignarlos en config.js.
  3. Ajustar B28 si cambian las superficies de aviso.
- **Prueba que lo demuestra (debe verse roja antes del arreglo):** Una aserción del arnés del panel que exija el texto autorizado; debe verse roja con null.
- **Criterio de aceptación:** El visor muestra el aviso autorizado en las superficies definidas.
- **Riesgos y efectos colaterales:** Ninguno técnico; riesgo institucional si el texto no está autorizado.
- **Dependencias y quién decide:** ¿Quién autoriza el texto y el canal? (pregunta abierta a la Unidad de Información y Análisis).
- **Esfuerzo:** 2 h de desarrollo, más el plazo de la decisión (estimación)

## P-003 · Build local (frontend/dist) más viejo que el código fuente (Baja)

- **Causa raíz:** dist/ no se versiona y no se reconstruye solo antes de los arneses.
- **Solución propuesta:** Que cada verify-*.mjs compare la fecha de dist con la de src y se niegue a medir un build viejo.
- **Alternativas descartadas:** Reconstruir siempre dentro del arnés: alarga cada corrida y oculta errores de build.
- **Pasos:**
  1. Añadir en cada verify-*.mjs una comprobación de mtime de dist/index.html contra src/**.
  2. Salir con código distinto de 0 y un mensaje claro.
- **Prueba que lo demuestra (debe verse roja antes del arreglo):** Tocar src/App.jsx y correr verify:banner: debe fallar antes de medir.
- **Criterio de aceptación:** Ningún arnés mide un dist anterior al código.
- **Riesgos y efectos colaterales:** Falsos positivos si sólo cambió un comentario; aceptable.
- **Dependencias y quién decide:** Ninguna.
- **Esfuerzo:** 1-2 h (estimación)

## P-004 · Ruta del intérprete de Python en CLAUDE.md no corresponde a esta estación (Baja)

- **Causa raíz:** La nota se escribió en otra estación de trabajo.
- **Solución propuesta:** Escribir la regla general (usar el intérprete real, no el alias de WindowsApps) y dejar las rutas como ejemplos por estación.
- **Alternativas descartadas:** Reemplazar una ruta por otra: volvería a quedar desfasada.
- **Pasos:**
  1. Editar CLAUDE.md §3.
- **Prueba que lo demuestra (debe verse roja antes del arreglo):** No aplica (documentación).
- **Criterio de aceptación:** La nota no depende de un perfil concreto.
- **Riesgos y efectos colaterales:** Ninguno.
- **Dependencias y quién decide:** Ninguna.
- **Esfuerzo:** 15 min (estimación)

## Hoja de ruta

| Fase | Problemas |
|---|---|
| Inmediato | P-001, P-004 |
| Corto plazo | P-002, P-003 |
| Mediano plazo | — |

## Resumen

| Problema | Fase | Esfuerzo | Responsable |
|---|---|---|---|
| P-001 | Inmediato | 1-2 h (estimación) | [POR VALIDAR] mantenedor o unidad que decida |
| P-002 | Corto plazo | 2 h de desarrollo, más el plazo de la decisión (estimación) | [POR VALIDAR] mantenedor o unidad que decida |
| P-003 | Corto plazo | 1-2 h (estimación) | [POR VALIDAR] mantenedor o unidad que decida |
| P-004 | Inmediato | 15 min (estimación) | [POR VALIDAR] mantenedor o unidad que decida |
