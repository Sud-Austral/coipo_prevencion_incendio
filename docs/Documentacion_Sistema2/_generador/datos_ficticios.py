# -*- coding: utf-8 -*-
"""Doble de datos para las capturas del manual: un `data/` COMPLETO y FICTICIO.

No lee nada de frontend/public/data ni de los INSUMO_*: arma desde cero un
manifest con la misma forma que publica el ETL (ETL/run.py), con nombres de
fantasia, cifras pequenas y semilla fija. Las regiones y comunas son nombres
geograficos publicos; ningun registro corresponde a un incendio real.

Incluye un escritor minimo de PMTiles v3 + MVT (sin dependencias) para que la
vista Riesgo tenga teselas que dibujar, igual que en produccion.

Uso:  python datos_ficticios.py <directorio_salida>
"""
import json
import math
import os
import random
import struct
import sys

R = random.Random(20261115)
SAL = sys.argv[1] if len(sys.argv) > 1 else "data"
os.makedirs(os.path.join(SAL, "riesgo", "atributos"), exist_ok=True)
os.makedirs(os.path.join(SAL, "riesgo", "teselas"), exist_ok=True)

REGIONES = {
    "O'Higgins": dict(caja=(-71.9, -34.9, -70.6, -34.0), cod="06",
                      prov={"Cachapoal": ["Rancagua", "Rengo"], "Colchagua": ["San Fernando", "Santa Cruz"]}),
    "Maule": dict(caja=(-72.4, -36.3, -70.8, -34.9), cod="07",
                  prov={"Talca": ["Talca", "San Clemente"], "Curicó": ["Curicó", "Molina"]}),
    "Biobío": dict(caja=(-73.3, -38.3, -71.5, -36.9), cod="08",
                   prov={"Biobío": ["Los Ángeles", "Mulchén"], "Concepción": ["Concepción", "Florida"]}),
}
TEMPORADAS = ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"]
GRUPOS = ["Negligentes", "Intencionales", "Accidentales", "Naturales", "Indeterminadas"]
CAUSAS = [  # (grupo, general, codigo general, especifica, codigo)
    ("Negligentes", "Otras quemas", "4.8", "Quema de basuras residencial o desechos vegetales", "4.8.1"),
    ("Negligentes", "Faenas agrícolas y pecuarias", "4.2", "Quema no avisada de desechos agrícolas", "4.2.1"),
    ("Negligentes", "Líneas eléctricas", "4.9", "contacto o proximidad con el tendido eléctrico", "4.9.1"),
    ("Negligentes", "Tránsito de personas", "4.1", "Uso de fuego por excursionistas", "4.1.2"),
    ("Intencionales", "Incendios intencionales", "2.1", "No se identifica la motivación", "2.1.1"),
    ("Accidentales", "Líneas eléctricas", "4.9", "Caída de conductor por viento", "4.9.4"),
    ("Accidentales", "Otras causas", "5.1", "Otras causas accidentales", "5.1.1"),
    ("Naturales", "Causas naturales", "6.1", "Rayo", "6.1.1"),
    ("Indeterminadas", "Causa no determinada", "9.1", "Sin antecedentes suficientes", "9.1.1"),
]
PESOS = [22, 14, 6, 8, 25, 4, 6, 2, 13]
MESES = ["Diciembre", "Enero", "Febrero", "Marzo"]


def caja_de(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)]


def guardar(nombre, obj):
    ruta = os.path.join(SAL, nombre)
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False)
    return os.path.getsize(ruta)


def fc(feats):
    return {"type": "FeatureCollection", "features": feats}


def dominio(valores, con_indice=None):
    cuenta = {}
    for v in valores:
        cuenta[v] = cuenta.get(v, 0) + 1
    out = []
    for v, n in sorted(cuenta.items(), key=lambda kv: -kv[1]):
        d = {"v": v, "n": n}
        if con_indice is not None:
            d = {"i": con_indice.index(v), "v": v, "n": n}
        out.append(d)
    return out


# ---------------------------------------------------------------- incendios
crudos = []
for i in range(260):
    reg = R.choice(list(REGIONES))
    info = REGIONES[reg]
    x0, y0, x1, y1 = info["caja"]
    prov = R.choice(list(info["prov"]))
    com = R.choice(info["prov"][prov])
    c = R.choices(CAUSAS, PESOS)[0]
    temp = R.choices(TEMPORADAS, [1, 2, 3, 4, 5])[0]
    ha = round(R.choice([0.1, 0.5, 1, 2, 3, 5, 8, 12, 20, 45, 80, 150, 600]) * R.uniform(0.6, 1.4), 2)
    anio = int(temp[:4]) + (0 if R.random() < 0.3 else 1)
    mes = R.choice([12, 1, 2, 3]) if anio > int(temp[:4]) else 12
    crudos.append(dict(
        lon=round(R.uniform(x0, x1), 5), lat=round(R.uniform(y0, y1), 5), region=reg, provincia=prov,
        comuna=com, temporada=temp, causa_grupo=c[0], causa_general=c[1], causa_general_codigo=c[2],
        causa_especifica=c[3], causa_codigo=c[4], superficie_ha=ha, n_incendio=str(100 + i),
        nombre=f"Sector Ficticio {i + 1}", jefe_brigada=c[4], mes_investigacion=R.choice(MESES),
        investigado_por="UAD", inicio_r20=f"{anio}-{mes:02d}-{R.randint(1, 28):02d}",
        hora_r20=f"{R.randint(10, 19):02d}:{R.randint(0, 59):02d}", id=i + 1))

COD = ["region", "provincia", "comuna", "temporada", "causa_grupo", "causa_general", "causa_especifica",
       "causa_general_codigo", "causa_codigo", "jefe_brigada", "investigado_por", "mes_investigacion"]
tablas = {}
for campo in COD:
    cuenta = {}
    for c in crudos:
        cuenta[c[campo]] = cuenta.get(c[campo], 0) + 1
    tablas[campo] = [v for v, _ in sorted(cuenta.items(), key=lambda kv: -kv[1])]
feats = []
for c in crudos:
    p = {"id": c["id"]}
    for campo in COD:
        p[campo] = tablas[campo].index(c[campo])
    p.update(superficie_ha=c["superficie_ha"], n_incendio=c["n_incendio"], nombre=c["nombre"],
             inicio_r20=c["inicio_r20"], hora_r20=c["hora_r20"], informe="Sin informe",
             utm_x=R.randint(250000, 350000), utm_y=R.randint(5800000, 6200000), utm_epsg=32719)
    feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [c["lon"], c["lat"]]},
                  "properties": p})
b_inc = guardar("incendios.geojson", fc(feats))
cap_incendios = {
    "titulo": "Incendios investigados (UAD)", "formato": "geojson", "geometria": "Point", "carga": "inmediata",
    "leidos": len(crudos), "descartados": 0, "filtros": ["temporada", "region", "provincia", "causa_grupo", "causa_general"],
    "codificados": COD, "tablas": tablas,
    "dominios": {campo: dominio([c[campo] for c in crudos], tablas[campo]) for campo in COD},
    "archivo": "incendios.geojson", "features": len(feats), "vertices": len(feats), "bytes": b_inc,
    "bbox": caja_de([(c["lon"], c["lat"]) for c in crudos]),
}

# ---------------------------------------------------------------- derivados (Excel UAD, cabeceras reales)
COLS = ["ID", "Región", "Provincia", "Comuna", "Temporada", "N° Incendio", "Nombre", "Causa investigada 2023",
        "Nombre causa específica 2023", "Causa general 2023", "Código causa general 2023", "Grupo causas 2023",
        "X", "Y", "Superficie", "jefe brigada****", "Mes investigación", "Investigado por", "Inicio R20",
        "Hora R20", "Fecha de inicio investigación", "Fecha finalización investigación", "Informe"]


def fila_excel(c):
    return {"ID": c["id"], "Región": c["region"], "Provincia": c["provincia"], "Comuna": c["comuna"],
            "Temporada": c["temporada"], "N° Incendio": c["n_incendio"], "Nombre": c["nombre"],
            "Causa investigada 2023": c["causa_codigo"], "Nombre causa específica 2023": c["causa_especifica"],
            "Causa general 2023": c["causa_general"], "Código causa general 2023": c["causa_general_codigo"],
            "Grupo causas 2023": c["causa_grupo"], "X": 0, "Y": 0, "Superficie": c["superficie_ha"],
            "jefe brigada****": c["jefe_brigada"], "Mes investigación": c["mes_investigacion"],
            "Investigado por": "UAD", "Inicio R20": c["inicio_r20"], "Hora R20": c["hora_r20"],
            "Fecha de inicio investigación": None, "Fecha finalización investigación": None,
            "Informe": "Sin informe", "lat": c["lat"], "lon": c["lon"], "utm_epsg": 32719}


derivados = {}
for clave, titulo, filtro in [("bbdd_uad_completa", "BBDD de investigación UAD, todas las columnas", None),
                              ("lineas_electricas", "Incendios por líneas eléctricas", "Líneas eléctricas")]:
    sel = [c for c in crudos if filtro is None or c["causa_general"] == filtro]
    fs = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [c["lon"], c["lat"]]},
           "properties": fila_excel(c)} for c in sel]
    b = guardar(clave + ".geojson", fc(fs))
    d = {"titulo": titulo, "archivo": clave + ".geojson", "formato": "geojson", "geometria": "Point",
         "fuente": "Planilla ficticia de demostración · Hoja 1", "columnas": COLS, "extra": ["lat", "lon", "utm_epsg"],
         "leidos": len(sel), "features": len(fs), "bytes": b, "vertices": len(fs),
         "bbox": caja_de([(c["lon"], c["lat"]) for c in sel]),
         "sin_coordenadas": {"n": 0, "ids": [], "por_region": {}}}
    if filtro:
        d["filtro"] = {"campo": "Causa general 2023", "valor": filtro}
    derivados[clave] = d


# ---------------------------------------------------------------- lineas (OECV, verificado, rutas, red vial)
def linea(reg, largo=0.08):
    x0, y0, x1, y1 = REGIONES[reg]["caja"]
    x, y = R.uniform(x0, x1), R.uniform(y0, y1)
    pts = [[round(x, 5), round(y, 5)]]
    ang = R.uniform(0, 6.28)
    for _ in range(5):
        ang += R.uniform(-0.5, 0.5)
        x += math.cos(ang) * largo / 5
        y += math.sin(ang) * largo / 5
        pts.append([round(x, 5), round(y, 5)])
    return pts


def km(pts):
    t = 0
    for a, b in zip(pts, pts[1:]):
        dx = (b[0] - a[0]) * 111.32 * math.cos(math.radians(a[1]))
        dy = (b[1] - a[1]) * 110.57
        t += math.hypot(dx, dy)
    return round(t, 3)


def capa_lineas(clave, titulo, n, props_fn, filtros, largo=0.08):
    fs = []
    for i in range(n):
        reg = R.choice(list(REGIONES))
        pts = linea(reg, largo)
        p = props_fn(i, reg)
        p["region"] = reg
        p["longitud_km"] = km(pts)
        fs.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts}, "properties": p})
    b = guardar(clave + ".geojson", fc(fs))
    todos = [pt for f in fs for pt in f["geometry"]["coordinates"]]
    cap = {"titulo": titulo, "formato": "geojson", "geometria": "LineString", "carga": "inmediata",
           "leidos": n, "filtros": filtros, "archivo": clave + ".geojson", "features": n,
           "vertices": len(todos), "bytes": b, "bbox": caja_de(todos),
           "dominios": {f: dominio([x["properties"][f] for x in fs]) for f in filtros}}
    return cap, fs


cap_oecv, f_oecv = capa_lineas(
    "oecv", "OECV — Obras de Eliminación de Combustible Vegetal", 45,
    lambda i, r: {"nombre": f"Cortafuego Demo {i + 1}", "tipo": R.choice(["Privado", "Fiscal", "Sin determinar"]),
                  "inst": R.choice(["CONAF", "MOP", "Municipio"])}, ["region", "tipo", "inst"])
cap_oecv["longitud_km"] = round(sum(f["properties"]["longitud_km"] for f in f_oecv), 1)
cap_oecv["km_por_region"] = {r: round(sum(f["properties"]["longitud_km"] for f in f_oecv if f["properties"]["region"] == r), 1)
                             for r in REGIONES}
cap_ver, f_ver = capa_lineas(
    "oecv_verificado", "OECV verificado en terreno", 12,
    lambda i, r: {"nombre": f"Tramo verificado {i + 1}", "inst": "CONAF", "origen": "carpeta ficticia"}, ["region"])
cap_ver["dominios"]["inst"] = dominio([f["properties"]["inst"] for f in f_ver])
cap_ver["longitud_km"] = round(sum(f["properties"]["longitud_km"] for f in f_ver), 1)
cap_rutas, _ = capa_lineas(
    "rutas", "Rutas de despliegue territorial (demostración)", 40,
    lambda i, r: {"nombre": f"Ruta Demo {i + 1}", "clasificacion": R.choice(["Camino Comunal", "Camino Regional"]),
                  "carpeta": R.choice(["Ripio", "Pavimento", "Tierra"]), "origen": "CONAF"},
    ["region", "clasificacion", "carpeta", "origen"], largo=0.25)
cap_red, _ = capa_lineas(
    "redvial", "Red vial (demostración)", 60,
    lambda i, r: {"rol": f"X-{100 + i}", "clasificacion": R.choice(["Camino Comunal", "Camino Regional"]),
                  "carpeta": R.choice(["Ripio", "Pavimento", "Suelo Natural"])},
    ["region", "clasificacion", "carpeta"], largo=0.35)

# ---------------------------------------------------------------- puntos stand-by
fs = []
for i in range(14):
    reg = R.choice(["Biobío", "Maule"])  # O'Higgins sin puntos a proposito: el indicador lo dice
    x0, y0, x1, y1 = REGIONES[reg]["caja"]
    fs.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(R.uniform(x0, x1), 5), round(R.uniform(y0, y1), 5)]},
               "properties": {"nombre": f"Cruce Ficticio {i + 1}", "descripcion": f"Ruta Demo {i + 1}",
                              "responsable": f"Brigada Demo-{i % 4 + 1}", "region": reg, "fuente": "kmz"}})
b = guardar("puntos_standby.geojson", fc(fs))
cap_standby = {"titulo": "Puntos stand-by", "formato": "geojson", "geometria": "Point", "carga": "inmediata",
               "descartados": 0, "filtros": ["region"], "dominios": {"region": dominio([f["properties"]["region"] for f in fs])},
               "archivo": "puntos_standby.geojson", "features": len(fs), "vertices": len(fs), "bytes": b,
               "bbox": caja_de([f["geometry"]["coordinates"] for f in fs])}

# ---------------------------------------------------------------- riesgo (2 comunas) + teselas
CLASES = [{"nivel": 0, "clase": "Muy Bajo", "desde": None, "hasta": 0.5},
          {"nivel": 1, "clase": "Bajo", "desde": 0.5, "hasta": 1.5},
          {"nivel": 2, "clase": "Medio", "desde": 1.5, "hasta": 2.5},
          {"nivel": 3, "clase": "Alto", "desde": 2.5, "hasta": 3.5},
          {"nivel": 4, "clase": "Muy Alto", "desde": 3.5, "hasta": None}]
COMUNAS_RIESGO = {"08305": ("Mulchén", "Biobío", (-72.45, -38.15, -71.7, -37.6)),
                  "07301": ("Curicó", "Maule", (-71.35, -35.1, -70.85, -34.85))}
paso = 0.045
partes, por_region, todas = {}, {}, []
for cut, (nom, reg, (x0, y0, x1, y1)) in COMUNAS_RIESGO.items():
    feats, filas, cuenta = [], [], {}
    fila_i = 0
    y = y0
    while y < y1:
        x = x0 + (paso / 2 if fila_i % 2 else 0)
        while x < x1:
            if R.random() < 0.55:
                cx, cy = x + R.uniform(-0.005, 0.005), y + R.uniform(-0.005, 0.005)
                rr = paso * R.uniform(0.35, 0.55)
                ring = [[round(cx + rr * math.cos(a * math.pi / 3), 6), round(cy + rr * 0.8 * math.sin(a * math.pi / 3), 6)] for a in range(6)]
                ring.append(ring[0])
                # gradiente suave oeste-este + ruido: manchas mas altas hacia la cordillera
                nm = max(0.0, min(4.4, (x - x0) / (x1 - x0) * 3.2 + R.gauss(0.4, 0.7)))
                nivel = 0 if nm < 0.5 else 1 if nm < 1.5 else 2 if nm < 2.5 else 3 if nm < 3.5 else 4
                clase = CLASES[nivel]["clase"]
                mid = f"{cut}-demo{len(feats):04d}"
                area = round(R.uniform(5, 260), 2)
                p = {"comuna": nom, "mancha_id": mid, "clase": clase, "nivel_medio": round(nm, 3),
                     "nivel_medio_min": round(max(0, nm - 0.3), 3), "nivel_medio_max": round(nm + 0.3, 3),
                     "pct_alto": round(R.uniform(0, 30), 1), "n_hexagonos": R.randint(1, 9), "area_ha": area}
                feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": p})
                filas.append([mid, clase, p["nivel_medio"], p["nivel_medio_min"], p["nivel_medio_max"],
                              p["pct_alto"], p["n_hexagonos"], area])
                cuenta[clase] = cuenta.get(clase, 0) + 1
                todas.append((cut, REGIONES[reg]["cod"], ring, mid, nivel, p["nivel_medio"]))
            x += paso
        y += paso * 0.87
        fila_i += 1
    b = guardar(f"riesgo/{cut}.geojson", fc(feats))
    ba = guardar(f"riesgo/atributos/{cut}.json", {"cut": cut, "comuna": nom, "campos": ["mancha_id", "clase", "nivel_medio",
                 "nivel_medio_min", "nivel_medio_max", "pct_alto", "n_hexagonos", "area_ha"], "filas": filas})
    partes[cut] = {"comuna": nom, "region": reg, "archivo": f"riesgo/{cut}.geojson", "features": len(feats),
                   "vertices": len(feats) * 7, "bytes": b, "bbox": [x0, y0, x1, y1], "clases": cuenta,
                   "atributos": {"archivo": f"riesgo/atributos/{cut}.json", "bytes": ba}, "alias": []}
    por_region.setdefault(reg, []).append(cut)


# --- MVT + PMTiles v3, minimo ------------------------------------------------
def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def campo(num, tipo, dato):
    if tipo == 0:
        return varint((num << 3) | 0) + varint(dato)
    if tipo == 1:
        return varint((num << 3) | 1) + struct.pack("<d", dato)
    return varint((num << 3) | 2) + varint(len(dato)) + dato


def zz(n):
    return (n << 1) ^ (n >> 31)


def lonlat_a_tesela(lon, lat, z, x, y, ext=4096):
    n = 2 ** z
    fx = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    fy = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return int(round((fx - x) * ext)), int(round((fy - y) * ext))


def tesela_mvt(z, x, y, polis):
    keys = ["mancha_id", "cut", "nivel", "nivel_medio"]
    valores, vidx, feats = [], {}, b""

    def val(v):
        clave = (type(v).__name__, v)
        if clave not in vidx:
            vidx[clave] = len(valores)
            if isinstance(v, str):
                valores.append(campo(1, 2, v.encode()))
            elif isinstance(v, int):
                valores.append(campo(5, 0, v))
            else:
                valores.append(campo(3, 1, float(v)))
        return vidx[clave]

    for fid, (cut, _, ring, mid, nivel, nm) in enumerate(polis):
        pts = [lonlat_a_tesela(a, b, z, x, y) for a, b in ring[:-1]]
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts.reverse()
        geo, cx, cy = [], 0, 0
        geo.append(1 | (1 << 3))
        geo += [zz(pts[0][0] - cx), zz(pts[0][1] - cy)]
        cx, cy = pts[0]
        geo.append(2 | ((len(pts) - 1) << 3))
        for px, py in pts[1:]:
            geo += [zz(px - cx), zz(py - cy)]
            cx, cy = px, py
        geo.append(7 | (1 << 3))
        tags = [0, val(mid), 1, val(cut), 2, val(nivel), 3, val(nm)]
        cuerpo = campo(1, 0, fid + 1) + campo(2, 2, b"".join(varint(t) for t in tags)) + campo(3, 0, 3) + \
            campo(4, 2, b"".join(varint(g) for g in geo))
        feats += campo(2, 2, cuerpo)
    capa = campo(15, 0, 2) + campo(1, 2, b"riesgo") + feats + b"".join(campo(3, 2, k.encode()) for k in keys) + \
        b"".join(campo(4, 2, v) for v in valores) + campo(5, 0, 4096)
    return campo(3, 2, capa)


def tileid(z, x, y):
    acc = (4 ** z - 1) // 3
    n = 1 << z
    d = 0
    s = n >> 1
    while s > 0:
        rx = 1 if (x & s) else 0
        ry = 1 if (y & s) else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x = n - 1 - x
                y = n - 1 - y
            x, y = y, x
        s >>= 1
    return acc + d


def tesela_de(lon, lat, z):
    n = 2 ** z
    s = math.sin(math.radians(lat))
    return int((lon + 180) / 360 * n), int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)


def escribir_pmtiles(ruta, polis, zmin=4, zmax=10):
    teselas = {}
    for z in range(zmin, zmax + 1):
        grupos = {}
        for p in polis:
            xs = [c[0] for c in p[2]]
            ys = [c[1] for c in p[2]]
            ax, ay = tesela_de(min(xs), max(ys), z)
            bx, by = tesela_de(max(xs), min(ys), z)
            for tx in range(ax, bx + 1):
                for ty in range(ay, by + 1):
                    grupos.setdefault((tx, ty), []).append(p)
        for (tx, ty), ps in grupos.items():
            teselas[tileid(z, tx, ty)] = tesela_mvt(z, tx, ty, ps)
    ids = sorted(teselas)
    datos, entradas, off = b"", [], 0
    for t in ids:
        entradas.append((t, off, len(teselas[t])))
        datos += teselas[t]
        off += len(teselas[t])
    d = varint(len(entradas))
    ult = 0
    for t, _, _ in entradas:
        d += varint(t - ult)
        ult = t
    d += b"".join(varint(1) for _ in entradas)
    d += b"".join(varint(n) for _, _, n in entradas)
    for i, (t, o, n) in enumerate(entradas):
        if i > 0 and o == entradas[i - 1][1] + entradas[i - 1][2]:
            d += varint(0)
        else:
            d += varint(o + 1)
    meta = json.dumps({"vector_layers": [{"id": "riesgo", "fields": {}}]}).encode()
    xs = [c[0] for p in polis for c in p[2]]
    ys = [c[1] for p in polis for c in p[2]]
    root_off = 127
    meta_off = root_off + len(d)
    data_off = meta_off + len(meta)
    cab = b"PMTiles" + bytes([3]) + struct.pack("<11Q", root_off, len(d), meta_off, len(meta), 0, 0, data_off,
                                                 len(datos), len(ids), len(ids), len(ids))
    cab += bytes([1, 1, 1, 1, zmin, zmax])
    cab += struct.pack("<4i", int(min(xs) * 1e7), int(min(ys) * 1e7), int(max(xs) * 1e7), int(max(ys) * 1e7))
    cab += bytes([zmin]) + struct.pack("<2i", int((min(xs) + max(xs)) / 2 * 1e7), int((min(ys) + max(ys)) / 2 * 1e7))
    assert len(cab) == 127
    with open(ruta, "wb") as f:
        f.write(cab + d + meta + datos)
    return os.path.getsize(ruta), [min(xs), min(ys), max(xs), max(ys)]


teselas_reg = {}
for reg, cuts in por_region.items():
    cod = REGIONES[reg]["cod"]
    polis = [p for p in todas if p[0] in cuts]
    b, bbox = escribir_pmtiles(os.path.join(SAL, "riesgo", "teselas", f"{cod}.pmtiles"), polis)
    teselas_reg[cod] = {"region": reg, "archivo": f"riesgo/teselas/{cod}.pmtiles", "bytes": b,
                        "manchas": len(polis), "bbox": [round(v, 5) for v in bbox]}

clases_todas = []
for cut in partes:
    for k, v in partes[cut]["clases"].items():
        clases_todas += [k] * v
cap_riesgo = {
    "titulo": "Riesgo de incendio forestal", "formato": "geojson", "particion": "comuna", "geometria": "Polygon",
    "carga": "por_comuna", "partes": partes,
    "teselas": {"formato": "pmtiles", "capa_mvt": "riesgo", "minzoom": 4, "maxzoom": 10, "gdal": "doble ficticio",
                "max_size": 500000, "regiones": teselas_reg, "avisos": {}},
    "regiones": [{"region": r, "comunas": c} for r, c in por_region.items()],
    "clases": CLASES,
    "dominios": {"clase": dominio(clases_todas), "region": [{"v": r, "n": sum(partes[c]["features"] for c in cs)} for r, cs in por_region.items()]},
    "fuente": {"modelo": "doble ficticio para documentación"},
    "features": len(todas), "vertices": len(todas) * 7, "bytes": 0, "bbox": [-72.45, -38.15, -70.85, -34.85],
}

# ---------------------------------------------------------------- infraestructura critica
FAM = {"educacion": "Establecimientos educacionales", "salud": "Servicios de salud",
       "antenas": "Antenas de telecomunicaciones", "subestaciones": "Subestaciones eléctricas",
       "ssr": "Servicios sanitarios rurales", "aeropuerto": "Red aeroportuaria"}
fs = []
for i in range(90):
    cut = R.choice(list(COMUNAS_RIESGO))
    x0, y0, x1, y1 = COMUNAS_RIESGO[cut][2]
    fam = R.choices(list(FAM), [30, 12, 25, 6, 8, 1])[0]
    fs.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(R.uniform(x0, x1), 5), round(R.uniform(y0, y1), 5)]},
               "properties": {"familia": fam, "cut": cut, "nombre": f"{FAM[fam].split()[0]} Demo {i + 1}",
                              "tipo": "Ficticio"}})
b = guardar("infra_puntos.geojson", fc(fs))
cap_infra = {"titulo": "Infraestructura crítica", "formato": "geojson", "geometria": "Point", "carga": "inmediata",
             "familias": FAM, "filtros": ["familia", "cut"], "codificados": [],
             "dominios": {"familia": dominio([f["properties"]["familia"] for f in fs]),
                          "cut": dominio([f["properties"]["cut"] for f in fs])},
             "archivo": "infra_puntos.geojson", "features": len(fs), "vertices": len(fs), "bytes": b,
             "bbox": caja_de([f["geometry"]["coordinates"] for f in fs])}

# ---------------------------------------------------------------- kpis + manifest
por_region_kpi = {}
for r in REGIONES:
    plan = cap_oecv["km_por_region"][r]
    rep = round(plan * {"Biobío": 0.7, "Maule": 1.05, "O'Higgins": 0.0}[r], 1)
    por_region_kpi[r] = {"Planificado": plan, "CONAF": round(plan * 0.4, 1), "MOP": round(plan * 0.6, 1), "reportado": rep}
tp = round(sum(v["Planificado"] for v in por_region_kpi.values()), 3)
tr = round(sum(v["reportado"] for v in por_region_kpi.values()), 3)
guardar("kpis.json", {"oecv": {"km_planificados": tp, "km_reportados": tr, "avance_pct": round(tr / tp * 100, 1),
                               "por_region": por_region_kpi}})
manifest = {"generado": "2026-11-15T12:00:00+0000", "simplify_m": 25.0, "precision": 5, "tippecanoe": None,
            "capas": {"incendios": cap_incendios, "oecv": cap_oecv, "oecv_verificado": cap_ver,
                      "puntos_standby": cap_standby, "redvial": cap_red, "infra_puntos": cap_infra,
                      "rutas": cap_rutas, "riesgo": cap_riesgo},
            "derivados": derivados, "kpis": "kpis.json"}
guardar("manifest.json", manifest)
print(f"datos ficticios en {SAL}: {len(crudos)} incendios, {len(todas)} areas de riesgo, "
      f"{len(f_oecv)} obras, {len(fs)} elementos de infraestructura")
