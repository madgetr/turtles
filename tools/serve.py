"""Dev server for Turtle: static files with caching disabled, so phones
always load the latest JS. Usage: python tools/serve.py [port]"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5200
print(f"Turtle on http://localhost:{port}")
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
