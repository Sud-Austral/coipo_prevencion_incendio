# -*- coding: utf-8 -*-
"""Capturas de docs/Documentacion_Sistema2/_imagenes por CDP, contra la demo local.

Requiere la demo levantada: la compilación del visor con datos FICTICIOS
(scripts/demo_datos.py) servida por scripts/demo_servidor.py en 127.0.0.1.
Chrome arranca con perfil propio, sin poder resolver ningún nombre externo
(--host-resolver-rules) y con las teselas del mapa base respondidas por CDP con una
tesela lisa: nada sale de la máquina.

    python scripts/capturar_pantallas.py --url http://127.0.0.1:8871/coipo_prevencion_incendio/ \
        --perfil <carpeta vacía> --puerto-cdp 9361 [--explorar <carpeta>]

Imprime el PID de Chrome al arrancarlo y cierra SOLO ese árbol al terminar.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket

for _f in (sys.stdout, sys.stderr):
    _f.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docgen.comun import RAIZ_DOC  # noqa: E402

DIR = os.path.join(RAIZ_DOC, "_imagenes")
# PNG 1x1 gris claro: la tesela lisa con que se responde a todo mapa base externo.
def _png_liso(color=(0xEC, 0xEE, 0xEA), lado=256):
    import struct
    import zlib

    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos))
    filas = b"".join(b"\x00" + bytes(color) * lado for _ in range(lado))
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", lado, lado, 8, 2, 0, 0, 0))
            + trozo(b"IDAT", zlib.compress(filas)) + trozo(b"IEND", b""))


TESELA = base64.b64encode(_png_liso()).decode()


class Pestana:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=90, suppress_origin=True)
        self.n = 0
        self.externas = 0

    def _atender(self, m):
        if m.get("method") == "Fetch.requestPaused":
            p = m["params"]
            self.externas += 1
            self.ws.send(json.dumps({"id": 0, "method": "Fetch.fulfillRequest", "params": {
                "requestId": p["requestId"], "responseCode": 200,
                "responseHeaders": [{"name": "Content-Type", "value": "image/png"},
                                    {"name": "Access-Control-Allow-Origin", "value": "*"}],
                "body": TESELA}}))

    def cmd(self, metodo, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": metodo, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            self._atender(m)
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})

    def esperar(self, s):
        fin = time.time() + s
        self.ws.settimeout(0.3)
        while time.time() < fin:
            try:
                self._atender(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(90)

    def js(self, codigo):
        r = self.cmd("Runtime.evaluate", expression=codigo, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("text"))
        return r.get("result", {}).get("value")

    def ir(self, url, espera=6):
        self.cmd("Page.navigate", url=url)
        self.esperar(espera)

    def foto(self, carpeta, nombre):
        datos = self.cmd("Page.captureScreenshot", format="png")["data"]
        ruta = os.path.join(carpeta, nombre)
        with open(ruta, "wb") as f:
            f.write(base64.b64decode(datos))
        print("  ", ruta, flush=True)


def clic(p, selector, texto=None, espera=2.5):
    ok = p.js("""(() => { const b=[...document.querySelectorAll(%s)].filter(e=>e.offsetParent!==null)
      .find(e=>%s===null || e.textContent.trim().includes(%s)); if(!b) return false;
      b.click(); window.scrollTo(0,0); return true })()""" % (json.dumps(selector), json.dumps(texto), json.dumps(texto)))
    if not ok:
        raise RuntimeError("no encontré %s «%s»" % (selector, texto))
    p.esperar(espera)


def arrancar(chrome, perfil, puerto):
    proc = subprocess.Popen([chrome, "--headless=new", "--remote-debugging-port=%d" % puerto,
                             "--user-data-dir=" + perfil, "--window-size=1440,900", "--hide-scrollbars",
                             "--no-first-run", "--disable-background-networking",
                             "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"])
    print("PID_CHROME=%d (perfil %s)" % (proc.pid, perfil), flush=True)
    for _ in range(60):
        try:
            lista = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % puerto))
            ws = next(x["webSocketDebuggerUrl"] for x in lista if x["type"] == "page")
            break
        except Exception:
            time.sleep(0.5)
    p = Pestana(ws)
    p.cmd("Page.enable")
    p.cmd("Fetch.enable", patterns=[{"urlPattern": "http*://*.*/*", "requestStage": "Request"}])
    # Las del propio servidor (127.0.0.1) también calzan con el patrón; se dejan seguir.
    return proc, p


class PestanaLocal(Pestana):
    def _atender(self, m):
        if m.get("method") == "Fetch.requestPaused" and m["params"]["request"]["url"].startswith("http://127.0.0.1"):
            self.ws.send(json.dumps({"id": 0, "method": "Fetch.continueRequest",
                                     "params": {"requestId": m["params"]["requestId"]}}))
            return
        super()._atender(m)


def preparar(p, ancho=1440, alto=900, tema="light"):
    p.cmd("Emulation.setDeviceMetricsOverride", width=ancho, height=alto, deviceScaleFactor=1, mobile=False)
    p.cmd("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": tema}])


def explorar(p, u, carpeta):
    """Recorrido libre para conocer la interfaz: foto y texto visible de cada vista."""
    for nombre, url in (("inicio", u), ("riesgo", u + "?vista=riesgo"), ("electrico", u + "lineas-electricas.html")):
        p.ir(url, 10)
        p.foto(carpeta, "x-%s.png" % nombre)
        with open(os.path.join(carpeta, "x-%s.txt" % nombre), "w", encoding="utf-8") as f:
            f.write(p.js("document.body.innerText") or "")


def capturas(p, u):
    """Lista fija de capturas (la de docgen/imagenes.py), en el orden de las funcionalidades."""
    from capturas_lista import recorrer  # noqa: E402  (vive junto a este script)
    recorrer(p, u, DIR, clic)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    ap.add_argument("--perfil", required=True)
    ap.add_argument("--puerto-cdp", type=int, required=True)
    ap.add_argument("--explorar")
    a = ap.parse_args()
    if not a.url.startswith("http://127.0.0.1"):
        sys.exit("Solo contra la demo local (127.0.0.1).")
    proc, p0 = arrancar(a.chrome, a.perfil, a.puerto_cdp)
    p = PestanaLocal.__new__(PestanaLocal)
    p.__dict__.update(p0.__dict__)
    try:
        preparar(p)
        if a.explorar:
            os.makedirs(a.explorar, exist_ok=True)
            explorar(p, a.url, a.explorar)
        else:
            os.makedirs(DIR, exist_ok=True)
            capturas(p, a.url)
        print("Peticiones externas respondidas con tesela lisa:", p.externas)
    finally:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
        print("Cerrado PID_CHROME=%d y su árbol" % proc.pid)


if __name__ == "__main__":
    main()
