#!/usr/bin/env python3
"""Serve this folder so the browser can fetch the assets (file:// blocks that).

    python3 serve.py          then open http://localhost:8000/
"""
import http.server, socketserver, sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript'})
with socketserver.ThreadingTCPServer(('', port), handler) as httpd:
    print('SuperTuxKart reproduction: http://localhost:%d/' % port)
    httpd.serve_forever()
