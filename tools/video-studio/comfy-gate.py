"""
comfy-gate.py - lets only the Custom Holidays dashboard use ComfyUI on this PC.

ComfyUI has no password of its own. This small gate sits in front of it (port 8189) and only
passes on requests that carry this PC's dashboard key. The public address (Tailscale Funnel or
ngrok) points at the gate, never straight at ComfyUI.

The key is made the first time this runs and saved next to this file as dashboard-key.txt.
Put the same key on Render as COMFY_KEY.
"""
import hmac
import http.server
import json
import os
import secrets
import socketserver
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(HERE, "dashboard-key.txt")
COMFY = os.environ.get("COMFY_LOCAL", "http://127.0.0.1:8188")
PORT = int(os.environ.get("GATE_PORT", "8189"))

if not os.path.exists(KEY_FILE):
    with open(KEY_FILE, "w") as f:
        f.write(secrets.token_urlsafe(32))
with open(KEY_FILE) as f:
    KEY = f.read().strip()

SKIP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
        "transfer-encoding", "upgrade", "host", "x-ch-key", "content-length", "ngrok-skip-browser-warning"}


class Gate(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle(self):
        if not hmac.compare_digest(self.headers.get("X-CH-Key", ""), KEY):
            return self._reply(401, {"error": "not allowed"})
        length = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(length) if length else None
        req = urllib.request.Request(COMFY + self.path, data=data, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in SKIP:
                req.add_header(k, v)
        try:
            resp = urllib.request.urlopen(req, timeout=900)
            code, headers, body = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            code, headers, body = e.code, e.headers, e.read()
        except Exception as e:
            return self._reply(502, {"error": f"ComfyUI isn't running on this PC ({type(e).__name__})"})
        self.send_response(code)
        for k, v in headers.items():
            if k.lower() not in SKIP:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = do_PUT = do_DELETE = _handle


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print("Custom Holidays video studio gate")
    print(f"  Passing dashboard requests to ComfyUI at {COMFY}")
    print(f"  Listening on http://127.0.0.1:{PORT}")
    print(f"  Dashboard key (put on Render as COMFY_KEY): {KEY}")
    sys.stdout.flush()
    Server(("127.0.0.1", PORT), Gate).serve_forever()
