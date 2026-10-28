# Línea base de lo publicado — coipo_prevencion_incendio

> Generado el 2026-10-26 con la metodología «Mejorar una app ya publicada» (objetivo 527, versión con banda de ruido
> y hallazgos preexistentes). Solo lectura sobre lo publicado (GET). **Archivo nuevo, sin commit.**

## 1. Identificación
| | |
|---|---|
| Repositorio | coipo_prevencion_incendio |
| Rama local / commit local | main / bf0b49f |
| Árbol de trabajo | 3 archivos sin commitear (`frontend/package.json`, `frontend/package-lock.json` modificados; `HUSKY_AUDIT.md` sin seguimiento). No se tocaron. |
| Sembrada (`.semilla`) | no |
| Qué es | Visor de Prevención de Incendios Forestales: React + Leaflet solo-frontend más un ETL en Python, todo estático (README.md:1-5). |

## 2. Entorno y evidencia del dominio
| Entorno | Dominio | Evidencia (archivo:línea) |
|---|---|---|
| producción (GitHub Pages) | sud-austral.github.io/coipo_prevencion_incendio | `README.md:7`, `CLAUDE.md:13` |

## 3. CI y despliegue (gh run list)
```
ETL y despliegue a GitHub Pages | push | main | completed failure | 2d34239
Run README Maintainer | push | main | completed success | d828f2e
Run README Maintainer | push | main | completed success | 6be645d
ETL y despliegue a GitHub Pages | push | main | completed failure | 6be645d
Run README Maintainer | push | main | completed success | 225b405
```
Commit publicado: sin /health (estático) · coincide con la rama: no lo comprobé. Los dos últimos despliegues (2d34239, 6be645d) terminaron en **failure**; local 3 commits detrás de origin/main.

## 4. Funcionalidad medida (2 pasadas × 5 repeticiones, solo GET)
```
base: https://sud-austral.github.io/coipo_prevencion_incendio | commit publicado: None | sin /openapi.json (estado 404)
salud                              404            9379 B  med   0.03s  ruido 0.001s  estable=True
salud_detalle                      404            9379 B  med   0.03s  ruido 0.002s  estable=True
raiz                               200            7025 B  med   0.03s  ruido 0.002s  estable=True
INVALIDA_ruta                      404            9379 B  med  0.027s  ruido   0.0s  estable=True
INVALIDA_api                       404            9379 B  med  0.038s  ruido 0.008s  estable=True
```

Hallazgos de la medición:
- La raíz responde 200 (7025 B); `/health`, `/health/detalle` y rutas inexistentes dan el mismo 404 de GitHub Pages (9379 B): sitio estático, sin API.
- Con el despliegue en rojo no se sabe qué commit sirve Pages.

## 5. Hallazgos preexistentes (lo raro que ya existía) y si es por diseño
| Hallazgo | ¿Por diseño? | Fuente |
|---|---|---|
| Últimos 2 runs «ETL y despliegue a GitHub Pages» en failure | no lo comprobé (no leí los logs) | `gh run list` |
| /health 404 | sí, sitio estático sin backend | `README.md:3-4` |

## 6. Interfaz
No medida en esta pasada.

## 7. Defectos simples corregidos (sin commit)
Ninguno aplicado.

Defectos vistos y NO corregidos (con motivo): ninguno visto que cumpla la definición de «simple». El workflow en rojo no se toca (los workflows no son «simples»).

## 8. No lo comprobé
- Causa del fallo del workflow.
- Qué versión sirve Pages.
