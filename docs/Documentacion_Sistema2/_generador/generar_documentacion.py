# -*- coding: utf-8 -*-
"""Genera el paquete Documentacion_Sistema2 (DOCX, XLSX, MD y TXT) desde datos_doc.py.

Uso (desde cualquier carpeta):
    python generar_documentacion.py <raiz_salida> <carpeta_imagenes> <fecha AAAA-MM-DD>

<raiz_salida> es RAIZ_DOC (docs/Documentacion_Sistema2) o una copia en el scratchpad.
Las listas de pasos se escriben con su número como texto: así cada ficha empieza en 1
sin depender de la numeración automática de Word.
"""
import os
import re
import shutil
import sys
import unicodedata

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos_doc as D  # noqa: E402

RAIZ, IMAGENES, FECHA = sys.argv[1], sys.argv[2], sys.argv[3]
AZUL = RGBColor(0x0B, 0x4F, 0x2E)
FUNC = {f["nombre"]: f for f in D.F}


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


# ----------------------------------------------------------------------------- docx base
def nuevo(titulo, subtitulo):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.59), Cm(27.94)
    for lado in ("left_margin", "right_margin"):
        setattr(sec, lado, Cm(2.2))
    sec.top_margin = sec.bottom_margin = Cm(2)
    est = doc.styles["Normal"]
    est.font.name = "Calibri"
    est.font.size = Pt(10.5)
    for n, t in (("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11.5)):
        doc.styles[n].font.color.rgb = AZUL
        doc.styles[n].font.size = Pt(t)
    pie = sec.footer.paragraphs[0]
    pie.text = f"{D.SISTEMA} · {titulo} · versión {D.VERSION} · {FECHA}"
    pie.runs[0].font.size = Pt(8)
    p = doc.add_paragraph()
    p.add_run(D.SISTEMA).bold = True
    doc.add_paragraph().add_run(titulo).font.size = Pt(24)
    doc.add_paragraph(subtitulo)
    doc.add_paragraph(f"Versión {D.VERSION} · generado el {FECHA} desde docs/Documentacion_Sistema2/_generador.")
    doc.add_paragraph("Las capturas usan datos FICTICIOS servidos en local sin red; ningún registro corresponde a un incendio real.")
    p = doc.add_paragraph()
    r = p.add_run("Índice")
    r.bold = True
    r.font.size = Pt(16)
    r.font.color.rgb = AZUL
    indice(doc)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    return doc


def indice(doc):
    p = doc.add_paragraph()
    r = p.add_run()
    for tipo, texto in (("begin", None), (None, 'TOC \\o "1-2" \\h \\z \\u'), ("separate", None), (None, None), ("end", None)):
        if tipo:
            e = OxmlElement("w:fldChar")
            e.set(qn("w:fldCharType"), tipo)
            r._r.append(e)
        elif texto:
            e = OxmlElement("w:instrText")
            e.set(qn("xml:space"), "preserve")
            e.text = texto
            r._r.append(e)
        else:
            t = OxmlElement("w:t")
            t.text = "Actualizar campo (F9)"
            r._r.append(t)


def tabla(doc, cab, filas, anchos=None):
    t = doc.add_table(rows=1, cols=len(cab))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, c in enumerate(cab):
        celda = t.rows[0].cells[i]
        celda.text = ""
        celda.paragraphs[0].add_run(str(c)).bold = True
        sombra = OxmlElement("w:shd")
        sombra.set(qn("w:fill"), "DCEBE2")
        celda._tc.get_or_add_tcPr().append(sombra)
    for f in filas:
        cs = t.add_row().cells
        for i, v in enumerate(f):
            cs[i].text = "" if v is None else str(v)
    for fila in t.rows:
        for c in fila.cells:
            for p in c.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(9)
    if anchos:
        for fila in t.rows:
            for i, a in enumerate(anchos):
                fila.cells[i].width = Cm(a)
    doc.add_paragraph()
    return t


def lista(doc, items, numerada=False):
    for i, it in enumerate(items, 1):
        if numerada:
            p = doc.add_paragraph(f"{i}. {it}")
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.first_line_indent = Cm(-0.5)
        else:
            doc.add_paragraph(it, style="List Bullet")


def imagen(doc, nombre):
    ruta = os.path.join(IMAGENES, nombre)
    if not os.path.exists(ruta):
        doc.add_paragraph(f"[CAPTURA FALTANTE: {nombre}]")
        return
    doc.add_picture(ruta, width=Cm(16))
    p = doc.add_paragraph(f"Figura: {D.CAPTURAS[nombre]} ({nombre})")
    p.runs[0].italic = True
    p.runs[0].font.size = Pt(9)


def control_cambios(doc):
    doc.add_heading("Control de cambios", level=1)
    tabla(doc, ["Versión", "Fecha", "Cambio"], [[D.VERSION, FECHA, "Primera versión del paquete, generada desde el código actual."]], [2, 3, 11])


def guardar(doc, rel):
    ruta = os.path.join(RAIZ, rel)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    doc.save(ruta)
    return ruta


# ----------------------------------------------------------------------------- cobertura
def cobertura():
    casos_por_func = {}
    for c in D.C:
        casos_por_func.setdefault(sin_tildes(c["traz"][1]), []).append(c["id"])
    filas = []
    for f in D.F:
        ids = casos_por_func.get(sin_tildes(f["nombre"]), [])
        filas.append([f["nombre"], ", ".join(ids) or "SIN CASO", "Sí" if ids else "No"])
    return filas


# ----------------------------------------------------------------------------- 00 análisis
def analisis():
    doc = nuevo("Análisis del sistema", "Roles, permisos, reglas, estados, hallazgos y cobertura.")
    control_cambios(doc)
    doc.add_heading("Qué cambió desde la versión anterior", level=1)
    tabla(doc, ["Fecha", "Cambio", "Dónde está el detalle"], D.CAMBIOS_VN, [3, 9, 4])
    doc.add_heading("Qué es el sistema", level=1)
    doc.add_paragraph(
        "Visor web público de prevención de incendios forestales de CONAF. Es una aplicación React de sólo "
        "frontend, servida como archivos estáticos en GitHub Pages, más un ETL en Python que convierte los "
        "insumos (Excel de la UAD, shapefiles, KMZ y el modelo de riesgo) en GeoJSON y PMTiles. El ETL corre en "
        "GitHub Actions, verifica lo publicado y commitea las capas en frontend/public/data/. No hay base de "
        "datos ni API propia: el contrato es frontend/public/data/manifest.json.")
    tabla(doc, ["Pieza", "Qué hace", "Dónde"], [
        ["ETL", "Lee insumos, reproyecta, simplifica y publica capas + manifest; verifica D1-D27", "ETL/run.py, ETL/build_*.py, ETL/verify.py"],
        ["Visor", "Vistas Incendios y Riesgo, paneles, fichas, indicadores, descargas", "frontend/src/App.jsx y components/"],
        ["Líneas eléctricas", "Página aparte con calor, subcausas y horas", "frontend/lineas-electricas.html, src/electrico/"],
        ["Despliegue", "ETL, controles negativos, build, arneses visuales y publicación", ".github/workflows/deploy.yml"],
    ], [3, 8, 5])
    doc.add_heading("Autenticación", level=2)
    doc.add_paragraph(
        "Verificado leyendo el código: no hay autenticación. No existe inicio de sesión, token, cookie ni llamada a "
        "un proveedor de identidad; el único almacenamiento local es la disposición de paneles (preferencias.js, "
        "clave coipo.disposicion). Todo lo publicado es descargable por cualquiera, también el GeoJSON completo.")
    doc.add_heading("Roles", level=1)
    tabla(doc, ["Rol", "Quién es", "Cómo entra", "Manual"], [[D.ROL["nombre"], D.ROL["resumen"], "Dirección pública, sin credenciales", "01_Manuales/Manual_Usuario.docx"]], [2.5, 7, 3.5, 3])
    doc.add_heading("Roles que NO se documentan", level=2)
    tabla(doc, ["Rol", "Motivo"], D.ROLES_NO_DOCUMENTADOS, [4, 12])
    doc.add_heading("Matriz de permisos por acción", level=1)
    doc.add_paragraph("Con un solo rol y sin servidor de aplicación, la matriz es trivial: el Usuario puede todo lo que la interfaz ofrece y nada puede modificar datos. No hay acción que el servidor deniegue, porque no hay servidor que decida.")
    tabla(doc, ["Acción", "Usuario", "Quién lo hace cumplir"],
          [[f["nombre"], "Sí", "Nadie: sitio estático"] for f in D.F] + [["Modificar o cargar datos", "No", "No existe la función; los datos los publica Actions"]], [8, 2, 6])
    doc.add_heading("Estados de la interfaz", level=1)
    doc.add_paragraph("No hay estados de negocio (no hay trámites ni registros que cambien). Los estados que importan son los de carga:")
    tabla(doc, ["Estado", "Qué ve el usuario", "Dónde"], [
        ["Cargando datos", "Paneles con «Cargando indicadores…» o «cargando…» por capa", "PanelIndicadores.jsx:215; ControlesPanel.jsx:146"],
        ["Error de datos", "«No pudimos cargar los datos del visor» con «Reintentar»", "App.jsx:1178-1200"],
        ["Error de una capa", "Botón «Reintentar» en la fila de la capa", "ControlesPanel.jsx:163"],
        ["Sin resultados", "«Ningún incendio investigado cumple los filtros actuales.»", "PanelIndicadores.jsx:248"],
        ["Riesgo sin teselas", "«Esta publicación no trae las teselas de riesgo…»", "PanelRiesgo.jsx:216"],
    ], [3.5, 7, 5.5])
    doc.add_heading("Reglas", level=1)
    tabla(doc, ["Id", "Nombre", "Descripción", "Dónde vive"], D.REGLAS, [1.5, 4, 6.5, 4])
    doc.add_heading("Recursos que consume el visor", level=1)
    doc.add_paragraph("No hay API: el visor lee archivos estáticos. Todos son públicos.")
    tabla(doc, ["Método", "Recurso", "Para qué", "Quién puede"], D.ENDPOINTS, [2.2, 5, 6, 2.8])
    doc.add_heading("Hallazgos", level=1)
    doc.add_paragraph("Detalle, causa y plan en 05_Problema_PlanMejora. Criterio de gravedad:")
    tabla(doc, ["Gravedad", "Criterio"], D.CRITERIO_GRAVEDAD, [3, 13])
    tabla(doc, ["Id", "Título", "Gravedad", "Certeza", "Estado"],
          [[p["id"], p["titulo"], p["gravedad"], p["certeza"], p["estado"]] for p in D.PROBLEMAS], [1.5, 5.5, 1.8, 5, 2.2])
    doc.add_heading("Hallazgos que salen de mirar las capturas", level=2)
    doc.add_paragraph(
        "Ninguno es un defecto de la aplicación. Se anotan para no confundirlos: la página de líneas eléctricas es "
        "oscura también con el sistema en tema claro, y es deliberado (electrico.css:8-11, color-scheme: dark); "
        "el fondo de mapa liso de todas las capturas es la tesela de reemplazo del entorno sin red, no un fallo "
        "del mapa base; el contenido de «Vista del punto» es un simulacro local por la misma razón.")
    doc.add_heading("Cobertura calculada", level=1)
    filas = cobertura()
    n_cub = sum(1 for f in filas if f[2] == "Sí")
    doc.add_paragraph(f"Funcionalidades del manual: {len(filas)}; con al menos un caso de uso: {n_cub} "
                      f"({round(100 * n_cub / len(filas))} %). El cruce compara nombres sin tildes.")
    tabla(doc, ["Funcionalidad", "Casos", "Cubierta"], filas, [7, 7, 2])
    return guardar(doc, "00_Analisis/Analisis_Sistema.docx"), n_cub, len(filas)


# ----------------------------------------------------------------------------- 01 manual
def manual():
    R = D.ROL
    doc = nuevo(f"Manual de usuario · {R['nombre']}", R["resumen"])
    control_cambios(doc)
    doc.add_heading("Novedades de la versión " + D.VERSION, level=1)
    tabla(doc, ["Qué cambió", "Qué significa para usted"], D.NOVEDADES_POR_ROL[R["clave"]], [6, 10])
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph(R["objetivo"])
    doc.add_heading("Alcance", level=2)
    lista(doc, R["alcance"])
    doc.add_heading("Fuera de alcance", level=2)
    lista(doc, R["fuera_alcance"])
    doc.add_heading("Requisitos", level=1)
    lista(doc, R["requisitos"])
    doc.add_heading("Inicio de sesión", level=1)
    doc.add_paragraph(R["acceso"])
    lista(doc, D.F[0]["pasos"], numerada=True)
    imagen(doc, "01_inicio.png")
    doc.add_heading("La pantalla", level=1)
    tabla(doc, ["Zona", "Qué contiene"], R["interfaz"], [4, 12])
    imagen(doc, "02_visor_paneles.png")
    doc.add_heading("Funcionalidades", level=1)
    puestas = {"01_inicio.png", "02_visor_paneles.png"}
    for i, f in enumerate(D.F[1:], 2):
        doc.add_heading(f"{i}. {f['nombre']}", level=2)
        doc.add_paragraph().add_run("Objetivo: ").bold = True
        doc.paragraphs[-1].add_run(f["objetivo"])
        if f["precondiciones"]:
            doc.add_paragraph().add_run("Antes de empezar").bold = True
            lista(doc, f["precondiciones"])
        doc.add_paragraph().add_run("Pasos").bold = True
        lista(doc, f["pasos"], numerada=True)
        doc.add_paragraph().add_run("Resultado: ").bold = True
        doc.paragraphs[-1].add_run(f["resultado"])
        if f["validaciones"]:
            doc.add_paragraph().add_run("Validaciones").bold = True
            lista(doc, f["validaciones"])
        if f["errores"]:
            doc.add_paragraph().add_run("Mensajes de error").bold = True
            lista(doc, f["errores"])
        if f["consideraciones"]:
            doc.add_paragraph().add_run("Para tener en cuenta").bold = True
            lista(doc, f["consideraciones"])
        if f["nombre"] in D.CAMPOS:
            tabla(doc, ["Campo", "Obligatorio", "Regla", "Notas"], D.CAMPOS[f["nombre"]], [3.5, 2.2, 5.5, 4.8])
        for im in f["imagenes"]:
            if im not in puestas:
                imagen(doc, im)
                puestas.add(im)
    doc.add_heading("Errores frecuentes", level=1)
    tabla(doc, ["Situación", "Qué hacer"], R["errores_frecuentes"], [6, 10])
    doc.add_heading("Buenas prácticas", level=1)
    lista(doc, R["buenas_practicas"])
    doc.add_heading("Preguntas frecuentes", level=1)
    for q, a in R["faq"]:
        doc.add_paragraph().add_run(q).bold = True
        doc.add_paragraph(a)
    return guardar(doc, f"01_Manuales/Manual_{R['archivo']}.docx")


# ----------------------------------------------------------------------------- 02 casos
def casos():
    doc = nuevo(f"Casos de uso · {D.ROL['nombre']}", "Un caso por interacción del rol, con flujo, alternativas, excepciones y trazabilidad.")
    control_cambios(doc)
    doc.add_heading("Resumen", level=1)
    tabla(doc, ["Id", "Caso", "Funcionalidad"], [[c["id"], c["nombre"], c["traz"][1]] for c in D.C], [2, 7, 7])
    for c in D.C:
        doc.add_heading(f"{c['id']} · {c['nombre']}", level=1)
        tabla(doc, ["Campo", "Contenido"], [
            ["Objetivo", c["objetivo"]], ["Descripción", c["descripcion"]], ["Actor principal", "Usuario"],
            ["Actores secundarios", c["secundarios"]], ["Permisos", c["permisos"]],
            ["Precondiciones", "; ".join(c["precondiciones"]) or "Ninguna"], ["Entradas", "; ".join(c["entradas"])],
            ["Resultado esperado", c["resultado"]], ["Reglas", ", ".join(c["rn"]) or "—"], ["Datos de prueba", c["datos"]],
            ["Trazabilidad", f"Módulo {c['traz'][0]} · {c['traz'][1]} · pantalla {c['traz'][2]} · {c['traz'][3]} · {c['traz'][4]}"],
            ["Cómo verificarlo", c["verifica"]],
        ], [4, 12])
        doc.add_paragraph().add_run("Flujo principal").bold = True
        lista(doc, c["flujo"], numerada=True)
        if c["fa"]:
            doc.add_paragraph().add_run("Flujos alternativos").bold = True
            lista(doc, c["fa"])
        if c["fe"]:
            doc.add_paragraph().add_run("Flujos de excepción").bold = True
            lista(doc, c["fe"])
    return guardar(doc, f"02_Casos_de_Uso/Casos_de_Uso_{D.ROL['archivo']}.docx")


# ----------------------------------------------------------------------------- 03 QA
def qa():
    doc = nuevo("Checklist de QA", "Una ficha por caso de uso, más pruebas negativas, de concurrencia y de identidad. Todas parten en NOT TESTED.")
    control_cambios(doc)
    doc.add_heading("Cómo usar este checklist", level=1)
    doc.add_paragraph("Ejecute cada ficha en el sitio publicado o en una copia local, NUNCA cambiando datos de producción. "
                      "Anote fecha, navegador, resultado obtenido y estado: OK, FALLA o BLOQUEADO.")
    for c in D.C:
        doc.add_heading(f"Ficha {c['id']} · {c['nombre']}", level=2)
        tabla(doc, ["Campo", "Valor"], [["Precondiciones", "; ".join(c["precondiciones"]) or "Ninguna"],
                                        ["Datos", c["datos"]], ["Resultado esperado", c["resultado"]],
                                        ["Verificación", c["verifica"]], ["Estado", "NOT TESTED"],
                                        ["Resultado obtenido", ""], ["Probado por / fecha / navegador", ""]], [5, 11])
        doc.add_paragraph().add_run("Pasos").bold = True
        lista(doc, c["flujo"], numerada=True)
    doc.add_heading("Pruebas negativas, de concurrencia y de identidad", level=1)
    tabla(doc, ["Id", "Tipo", "Prueba", "Esperado", "Estado"], [p + ["NOT TESTED"] for p in D.PRUEBAS_EXTRA], [1.5, 2.5, 5, 5, 2])
    return guardar(doc, "03_QA/Checklist_QA.docx")


# ----------------------------------------------------------------------------- 04 trazabilidad
def xlsx():
    wb = Workbook()
    hojas = [
        ("Trazabilidad", ["Caso", "Nombre", "Módulo", "Funcionalidad", "Pantalla", "Componente", "Recursos", "Reglas"],
         [[c["id"], c["nombre"], *c["traz"], ", ".join(c["rn"])] for c in D.C]),
        ("Checklist", ["Caso", "Nombre", "Resultado esperado", "Estado", "Resultado obtenido", "Fecha", "Probador"],
         [[c["id"], c["nombre"], c["resultado"], "NOT TESTED", "", "", ""] for c in D.C] +
         [[p[0], p[2], p[3], "NOT TESTED", "", "", ""] for p in D.PRUEBAS_EXTRA]),
        ("Permisos", ["Acción", "Usuario", "Quién lo hace cumplir"], [[f["nombre"], "Sí", "Sitio estático"] for f in D.F]),
        ("Reglas", ["Id", "Nombre", "Descripción", "Dónde vive"], D.REGLAS),
        ("Hallazgos", ["Id", "Título", "Gravedad", "Módulo", "Evidencia", "Certeza", "Estado"],
         [[p["id"], p["titulo"], p["gravedad"], p["modulo"], p["evidencia"], p["certeza"], p["estado"]] for p in D.PROBLEMAS]),
        ("Capturas", ["Archivo", "Qué muestra", "Funcionalidades"],
         [[k, v, ", ".join(f["nombre"] for f in D.F if k in f["imagenes"])] for k, v in D.CAPTURAS.items()]),
        ("Cobertura", ["Funcionalidad", "Casos", "Cubierta"], cobertura()),
    ]
    wb.remove(wb.active)
    for nombre, cab, filas in hojas:
        ws = wb.create_sheet(nombre)
        ws.append(cab)
        for f in filas:
            ws.append(f)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="0B4F2E")
        for col in ws.columns:
            ancho = min(60, max(10, max(len(str(c.value or "")) for c in col) + 2))
            ws.column_dimensions[col[0].column_letter].width = ancho
            for c in col[1:]:
                c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "B2"
        ws.auto_filter.ref = ws.dimensions
    ruta = os.path.join(RAIZ, "04_Trazabilidad", "Trazabilidad.xlsx")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    wb.save(ruta)
    return ruta


# ----------------------------------------------------------------------------- 05 problemas y plan
def problemas_md():
    d = os.path.join(RAIZ, "05_Problema_PlanMejora")
    os.makedirs(d, exist_ok=True)
    L = [f"# Problemas abiertos · {D.SISTEMA}", "", f"Generado el {FECHA} desde `_generador/datos_doc.py`. Los ids son estables entre versiones.", "",
         "## Criterio de gravedad", "", "| Gravedad | Criterio |", "|---|---|"]
    L += [f"| {a} | {b} |" for a, b in D.CRITERIO_GRAVEDAD]
    L += ["", "## Abiertos", "", "| Id | Título | Gravedad | Rol o módulo | Evidencia | Certeza | Estado |", "|---|---|---|---|---|---|---|"]
    L += [f"| {p['id']} | {p['titulo']} | {p['gravedad']} | {p['modulo']} | {p['evidencia']} | {p['certeza']} | {p['estado']} |" for p in D.PROBLEMAS]
    L += ["", "## Cerrados", "", "Ninguno (primera versión del paquete).", ""]
    open(os.path.join(d, "PROBLEMAS.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L))
    orden = {"Crítica": 0, "Alta": 1, "Media": 2, "Baja": 3}
    P = sorted(D.PROBLEMAS, key=lambda p: orden[p["gravedad"]])
    L = [f"# Plan de mejora · {D.SISTEMA}", "", f"Generado el {FECHA}. El plan PROPONE; no modifica código de la aplicación. "
         "Los esfuerzos son estimaciones, no mediciones.", ""]
    for p in P:
        L += [f"## {p['id']} · {p['titulo']} ({p['gravedad']})", "",
              f"- **Causa raíz:** {p['causa']}", f"- **Solución propuesta:** {p['solucion']}",
              f"- **Alternativas descartadas:** {p['descartadas']}", "- **Pasos:**"]
        L += [f"  {i}. {s}" for i, s in enumerate(p["pasos"], 1)]
        L += [f"- **Prueba que lo demuestra (debe verse roja antes del arreglo):** {p['prueba']}",
              f"- **Criterio de aceptación:** {p['aceptacion']}", f"- **Riesgos y efectos colaterales:** {p['riesgos']}",
              f"- **Dependencias y quién decide:** {p['dependencias']}", f"- **Esfuerzo:** {p['esfuerzo']}", ""]
    L += ["## Hoja de ruta", "", "| Fase | Problemas |", "|---|---|"]
    for fase in ("Inmediato", "Corto plazo", "Mediano plazo"):
        L.append(f"| {fase} | {', '.join(p['id'] for p in P if p['fase'] == fase) or '—'} |")
    L += ["", "## Resumen", "", "| Problema | Fase | Esfuerzo | Responsable |", "|---|---|---|---|"]
    L += [f"| {p['id']} | {p['fase']} | {p['esfuerzo']} | [POR VALIDAR] mantenedor o unidad que decida |" for p in P]
    open(os.path.join(d, "PLAN_MEJORA.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")


# ----------------------------------------------------------------------------- guion y capturas del video
GUION = (
    "Este es el visor de prevención de incendios forestales de CONAF. Es público: se abre con su dirección y no "
    "pide usuario ni contraseña. No muestra incendios activos: cada punto es "
    "un incendio que ya ocurrió y que la UAD de CONAF investigó después. "
    "A la izquierda está el panel de control. Con el botón Territorio elige una región, una provincia o una comuna, "
    "y todas las cifras del visor pasan a ser de ese lugar. Con los filtros puede ver una temporada o un grupo de "
    "causa, y en Capas decide qué se dibuja. Un clic en un punto abre su ficha. A la derecha, los indicadores resumen lo filtrado. En la pestaña Riesgo elige una comuna y ve "
    "el nivel de riesgo de cada área junto a la infraestructura crítica. También puede descargar los datos o "
    "compartir la vista, y en Información ver de qué fuentes sale cada capa y quién la publica."
)
CAPTURAS_VIDEO = ["01_inicio.png", "03_territorio.png", "05_filtro_region.png", "06_filtro_temporada.png", "07_capas.png",
                  "09_ficha_incendio.png", "11_indicadores.png", "17_riesgo_comuna.png", "13_descargas.png", "14_compartir.png"]


def video():
    d = os.path.join(RAIZ, "01_Manuales")
    a = D.ROL["archivo"]
    open(os.path.join(d, f"{a}_guion.txt"), "w", encoding="utf-8", newline="\n").write(GUION + "\n")
    open(os.path.join(d, f"{a}_capturas.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(CAPTURAS_VIDEO) + "\n")
    return len(GUION.split())


# ----------------------------------------------------------------------------- main
if __name__ == "__main__":
    os.makedirs(RAIZ, exist_ok=True)
    dest_img = os.path.join(RAIZ, "_imagenes")
    if os.path.abspath(dest_img) != os.path.abspath(IMAGENES):
        os.makedirs(dest_img, exist_ok=True)
        for n in D.CAPTURAS:
            shutil.copy2(os.path.join(IMAGENES, n), dest_img)
    _, n_cub, n_func = analisis()
    manual()
    casos()
    qa()
    xlsx()
    problemas_md()
    palabras = video()
    print(f"ok: {n_func} funcionalidades, {len(D.C)} casos, {len(D.REGLAS)} reglas, {len(D.PROBLEMAS)} problemas, "
          f"cobertura {n_cub}/{n_func}, guion {palabras} palabras")
