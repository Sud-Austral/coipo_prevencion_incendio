# -*- coding: utf-8 -*-
"""Copia FICTICIA de frontend/public/data para las capturas de docs/Documentacion_Sistema2.

El visor es estático: no hay backend ni base de datos. Lo que muestra son los archivos de
frontend/public/data, que traen nombres reales (jefe de brigada, investigador, predios,
responsables). Para capturar pantallas sin datos de personas reales, este script escribe
en una carpeta FUERA del repositorio una copia con:

- incendios: 1 de cada 6, coordenadas desplazadas al azar, temporada, grupo de causa,
  superficie y fechas al azar; predios, jefes de brigada e investigadores de fantasía;
- derivados (bbdd_uad_completa, lineas_electricas): las mismas sustituciones;
- puntos stand-by, infraestructura y OECV: nombres, responsables y operadores de fantasía;
- riesgo: las comunas de COMUNAS_RIESGO con la clase sorteada; las demás no se copian;
- kpis.json: cada cifra multiplicada por un factor al azar.

Las teselas .pmtiles (rutas, red vial y manchas de riesgo por región) se copian tal cual:
son cartografía, no traen personas.

    python scripts/demo_datos.py <carpeta_salida>

No escribe nada dentro del repositorio. Semilla fija: la salida es reproducible.
"""
import json
import os
import random
import shutil
import sys

for _f in (sys.stdout, sys.stderr):
    _f.reconfigure(encoding="utf-8")

ORIGEN = os.path.join("frontend", "public", "data")
COMUNAS_RIESGO = ["08101", "08102", "09101"]   # Concepción, Coronel, Temuco
R = random.Random(20261113)


def leer(nombre):
    with open(os.path.join(ORIGEN, nombre), encoding="utf-8") as f:
        return json.load(f)


def escribir(destino, nombre, obj):
    ruta = os.path.join(destino, nombre)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def mover(coord, dx, dy):
    if isinstance(coord[0], (int, float)):
        return [round(coord[0] + dx, 5), round(coord[1] + dy, 5)]
    return [mover(c, dx, dy) for c in coord]


def fecha_al_azar(temporada):
    a = int(temporada[:4])
    mes = R.choice([11, 12, 1, 2, 3])
    anio = a if mes >= 11 else a + 1
    return "%04d-%02d-%02d" % (anio, mes, R.randint(1, 28))


def main(destino):
    if os.path.abspath(destino).lower().startswith(os.path.abspath(".").lower() + os.sep):
        sys.exit("La salida debe quedar FUERA del repositorio.")
    os.makedirs(destino, exist_ok=True)
    m = leer("manifest.json")
    capas = m["capas"]

    # ---------------------------------------------------------------- incendios
    inc = capas["incendios"]
    tablas = inc["tablas"]
    tablas["jefe_brigada"] = ["Brigadista Ficticio %02d" % (i + 1) for i in range(len(tablas["jefe_brigada"]))]
    tablas["investigado_por"] = ["Investigador Ficticio %02d" % (i + 1) for i in range(len(tablas["investigado_por"]))]
    gj = leer("incendios.geojson")
    nuevos, por_id = [], {}
    for i, f in enumerate(gj["features"]):
        if i % 6:
            continue
        p = dict(f["properties"])
        dx, dy = R.uniform(-0.15, 0.15), R.uniform(-0.15, 0.15)
        for k in ("temporada", "causa_grupo", "jefe_brigada", "investigado_por", "mes_investigacion"):
            p[k] = R.randrange(len(tablas[k]))
        p["superficie_ha"] = round(R.choice([0.01, 0.1, 0.5, 1, 2, 5, 20, 80]) * R.uniform(0.5, 1.5), 2)
        p["nombre"] = "Predio Ficticio %d" % p["id"]
        p["n_incendio"] = "F-%d" % p["id"]
        p["inicio_r20"] = fecha_al_azar(tablas["temporada"][p["temporada"]])
        p["hora_r20"] = "%02d:%02d" % (R.randint(10, 19), R.randrange(0, 60, 5))
        p["informe"] = "Sin informe"
        if isinstance(p.get("utm_x"), (int, float)):
            p["utm_x"] = int(p["utm_x"] + dx * 90000)
        if isinstance(p.get("utm_y"), (int, float)):
            p["utm_y"] = int(p["utm_y"] + dy * 111000)
        g = {"type": "Point", "coordinates": mover(f["geometry"]["coordinates"], dx, dy)}
        nuevos.append({"type": "Feature", "geometry": g, "properties": p})
        por_id[p["id"]] = (g, p)
    gj["features"] = nuevos
    escribir(destino, "incendios.geojson", gj)
    for campo in inc["dominios"]:
        cuenta = {}
        for f in nuevos:
            v = f["properties"].get(campo)
            cuenta[v] = cuenta.get(v, 0) + 1
        inc["dominios"][campo] = [{"i": i, "v": tablas[campo][i], "n": cuenta.get(i, 0)}
                                  for i in range(len(tablas[campo]))]
    inc["features"] = inc["vertices"] = len(nuevos)

    # ---------------------------------------------------------------- derivados
    for nombre in ("bbdd_uad_completa", "lineas_electricas"):
        d = leer(nombre + ".geojson")
        salida = []
        for f in d["features"]:
            if f["properties"].get("ID") not in por_id:
                continue
            g, p = por_id[f["properties"]["ID"]]
            q = dict(f["properties"])
            q["Nombre"] = p["nombre"]
            q["N° Incendio"] = p["n_incendio"]
            q["jefe brigada****"] = tablas["jefe_brigada"][p["jefe_brigada"]]
            q["Investigado por"] = tablas["investigado_por"][p["investigado_por"]]
            q["Temporada"] = tablas["temporada"][p["temporada"]]
            q["Inicio R20"] = p["inicio_r20"]
            q["Hora R20"] = p["hora_r20"]
            q["Superficie"] = p["superficie_ha"]
            q["Informe"] = "Sin informe"
            q["lon"], q["lat"] = g["coordinates"]
            salida.append({"type": "Feature", "geometry": g, "properties": q})
        d["features"] = salida
        escribir(destino, nombre + ".geojson", d)
        if nombre in m.get("derivados", {}):
            m["derivados"][nombre]["features"] = len(salida)

    # ---------------------------------------------------------------- puntos, infra, oecv
    d = leer("puntos_standby.geojson")
    for i, f in enumerate(d["features"], 1):
        f["properties"].update(nombre="Punto Ficticio %d" % i, descripcion="Camino de demostración %d" % i,
                               responsable="Brigada Ficticia-%d" % (i % 9 + 1))
        f["geometry"]["coordinates"] = mover(f["geometry"]["coordinates"], R.uniform(-.1, .1), R.uniform(-.1, .1))
    escribir(destino, "puntos_standby.geojson", d)

    d = leer("infra_puntos.geojson")
    for i, f in enumerate(d["features"], 1):
        f["properties"].update(nombre="Establecimiento Ficticio %d" % i, operador="Operador Ficticio")
        f["geometry"]["coordinates"] = mover(f["geometry"]["coordinates"], R.uniform(-.05, .05), R.uniform(-.05, .05))
    escribir(destino, "infra_puntos.geojson", d)

    for nombre in ("oecv", "oecv_verificado"):
        d = leer(nombre + ".geojson")
        for i, f in enumerate(d["features"], 1):
            f["properties"]["nombre"] = "Obra Ficticia %d" % i
            f["geometry"]["coordinates"] = mover(f["geometry"]["coordinates"], R.uniform(-.05, .05), R.uniform(-.05, .05))
        escribir(destino, nombre + ".geojson", d)

    # ---------------------------------------------------------------- riesgo
    clases = [c["clase"] for c in capas["riesgo"]["clases"]]
    for cut in COMUNAS_RIESGO:
        parte = capas["riesgo"]["partes"][cut]
        d = leer(parte["archivo"])
        conteo = {}
        for f in d["features"]:
            nivel = R.choices(range(5), weights=[3, 3, 2, 2, 1])[0]
            f["properties"].update(clase=clases[nivel], nivel_medio=round(nivel + R.uniform(-.4, .4), 2),
                                   pct_alto=round(R.uniform(0, 100) if nivel >= 3 else 0, 1))
            conteo[clases[nivel]] = conteo.get(clases[nivel], 0) + 1
        escribir(destino, parte["archivo"], d)
        parte["clases"] = conteo
        if "atributos" in parte:
            at = leer(parte["atributos"]["archivo"])
            ic = at["campos"].index("clase")
            por_mancha = {f["properties"]["mancha_id"]: f["properties"]["clase"] for f in d["features"]}
            for fila in at["filas"]:
                fila[ic] = por_mancha.get(fila[0], fila[ic])
            escribir(destino, parte["atributos"]["archivo"], at)
    os.makedirs(os.path.join(destino, "riesgo", "teselas"), exist_ok=True)
    for t in os.listdir(os.path.join(ORIGEN, "riesgo", "teselas")):
        shutil.copyfile(os.path.join(ORIGEN, "riesgo", "teselas", t), os.path.join(destino, "riesgo", "teselas", t))
    for t in ("rutas.pmtiles", "redvial.pmtiles"):
        shutil.copyfile(os.path.join(ORIGEN, t), os.path.join(destino, t))

    # ---------------------------------------------------------------- kpis
    def escalar(o):
        if isinstance(o, dict):
            return {k: escalar(v) for k, v in o.items()}
        if isinstance(o, (int, float)) and not isinstance(o, bool):
            return round(o * R.uniform(0.3, 0.9), 1)
        return o
    k = escalar(leer("kpis.json"))
    if "oecv" in k and k["oecv"].get("km_planificados"):
        k["oecv"]["avance_pct"] = round(100 * k["oecv"]["km_reportados"] / k["oecv"]["km_planificados"], 1)
    escribir(destino, "kpis.json", k)

    m["generado"] = "DEMO FICTICIA (scripts/demo_datos.py)"
    escribir(destino, "manifest.json", m)
    print("Datos ficticios en", os.path.abspath(destino), "· incendios:", len(nuevos))


if __name__ == "__main__":
    main(sys.argv[1])
