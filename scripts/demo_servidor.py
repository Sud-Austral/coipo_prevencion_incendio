# -*- coding: utf-8 -*-
"""Servidor estático local para las capturas: sirve la compilación del visor con datos ficticios.

El visor no tiene backend ni base de datos. Este servidor solo entrega archivos, con
soporte de Range (los .pmtiles se leen por rangos), y escucha SOLO en 127.0.0.1.

    python scripts/demo_servidor.py <raiz> <puerto>

<raiz> contiene la carpeta coipo_prevencion_incendio/ (el base de Vite) con data/ ficticia.
"""
import http.server
import os
import re
import sys

for _f in (sys.stdout, sys.stderr):
    _f.reconfigure(encoding="utf-8")


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".geojson": "application/geo+json", ".pmtiles": "application/octet-stream",
                      ".js": "text/javascript", ".mjs": "text/javascript"}

    def send_head(self):
        rango = self.headers.get("Range")
        ruta = self.translate_path(self.path)
        if not rango or not os.path.isfile(ruta):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rango)
        tam = os.path.getsize(ruta)
        ini = int(m.group(1)) if m.group(1) else max(0, tam - int(m.group(2)))
        fin = int(m.group(2)) if m.group(1) and m.group(2) else tam - 1
        fin = min(fin, tam - 1)
        f = open(ruta, "rb")
        f.seek(ini)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(ruta))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (ini, fin, tam))
        self.send_header("Content-Length", str(fin - ini + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._resto = fin - ini + 1
        return f

    def copyfile(self, origen, destino):
        resto = getattr(self, "_resto", None)
        if resto is None:
            return super().copyfile(origen, destino)
        self._resto = None
        while resto > 0:
            trozo = origen.read(min(65536, resto))
            if not trozo:
                break
            destino.write(trozo)
            resto -= len(trozo)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    raiz, puerto = sys.argv[1], int(sys.argv[2])
    print("Base de datos: NINGUNA (el visor es estático; no hay backend). Sirviendo", raiz,
          "en http://127.0.0.1:%d" % puerto, flush=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", puerto),
                                          lambda *a, **k: Manejador(*a, directory=raiz, **k))
    srv.serve_forever()
