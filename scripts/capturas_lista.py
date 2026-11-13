# -*- coding: utf-8 -*-
"""Recorrido fijo de capturas (nombres de docgen/imagenes.py), contra la demo con datos ficticios.

Lo importa scripts/capturar_pantallas.py. Cada paso: navegar, actuar y fotografiar.
"""
import json
import os

# Un incendio FICTICIO de la demo (scripts/demo_datos.py, semilla fija): «Predio Ficticio 194».
PUNTO = (-37.39287, -72.1923)


def _clic_centro_mapa(p):
    r = p.js("""(() => { const m=document.querySelector('.leaflet-container').getBoundingClientRect();
      return [m.left+m.width/2, m.top+m.height/2] })()""")
    for t in ("mousePressed", "mouseReleased"):
        p.cmd("Input.dispatchMouseEvent", type=t, x=r[0], y=r[1], button="left", clickCount=1)
    p.esperar(2.5)


def _cerrar_cartel(p, clic):
    try:
        clic(p, "button", "Entendido", 1.5)
    except RuntimeError:
        pass


def recorrer(p, u, d, clic):
    lat, lon = PUNTO
    # 01 Pantalla de llegada, con el cartel de contexto
    p.ir(u, 10)
    p.foto(d, "01-vis-visor.png")
    _cerrar_cartel(p, clic)

    # 01b Filtro Temporada abierto
    clic(p, "button", "Temporada")
    p.foto(d, "01b-vis-filtro-temporada.png")
    p.ir(u, 8); _cerrar_cartel(p, clic)

    # 01c Territorio
    clic(p, "button", "Territorio")
    p.foto(d, "01c-vis-territorio.png")
    p.ir(u, 8); _cerrar_cartel(p, clic)

    # 01d Capas
    clic(p, "button", "Capas")
    p.foto(d, "01d-vis-capas.png")
    p.ir(u, 8); _cerrar_cartel(p, clic)

    # 01e Mapa base
    clic(p, "button", "Mapa base")
    p.foto(d, "01e-vis-mapa-base.png")

    # 02 Ficha de un incendio
    p.ir(u + "?lat=%.5f&lon=%.5f&z=14" % (lat, lon), 10)
    _cerrar_cartel(p, clic)
    _clic_centro_mapa(p)
    p.foto(d, "02-vis-ficha.png")

    # 03 Descargar
    p.ir(u, 8); _cerrar_cartel(p, clic)
    clic(p, "button", "Descargar")
    p.foto(d, "03-vis-descargar.png")

    # 04 Compartir
    p.ir(u, 8); _cerrar_cartel(p, clic)
    clic(p, "button", "Compartir")
    p.foto(d, "04-vis-compartir.png")

    # 05 Información
    p.ir(u, 8); _cerrar_cartel(p, clic)
    clic(p, "button", "Información")
    p.foto(d, "05-vis-informacion.png")

    # 06 Riesgo, sin comuna
    p.ir(u + "?vista=riesgo", 10)
    p.foto(d, "06-vis-riesgo.png")

    # 06b Riesgo de una comuna (Concepción, clases sorteadas en la demo)
    ok = p.js("""(() => { const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='08101'));
      if(!s) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'08101');
      s.dispatchEvent(new Event('change',{bubbles:true})); return true })()""")
    print("   selector de comuna:", ok)
    p.esperar(10)
    p.foto(d, "06b-vis-riesgo-comuna.png")

    # 07 Líneas eléctricas
    p.ir(u + "lineas-electricas.html", 10)
    p.foto(d, "07-vis-lineas-electricas.png")

    # 08 Tema oscuro de la pantalla de llegada
    p.cmd("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": "dark"}])
    p.ir(u, 10)
    _cerrar_cartel(p, clic)
    p.foto(d, "08-vis-visor-oscuro.png")
    p.cmd("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": "light"}])
