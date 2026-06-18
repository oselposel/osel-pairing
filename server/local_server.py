import argparse
import json
import os
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from bbp_bridge import BbpPairingError, generate_pairings, resolve_bbp_executable


ROOT = Path(__file__).resolve().parents[1]


class LocalPairingHandler(SimpleHTTPRequestHandler):
    server_version = "SachyUhPairingServer/1.0"

    def __init__(self, *args, root=None, bbp_executable=None, **kwargs):
        self.root = Path(root or ROOT)
        self.bbp_executable = bbp_executable
        super().__init__(*args, directory=str(self.root), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            try:
                executable = resolve_bbp_executable(self.root, self.bbp_executable)
                self.send_json(200, {
                    "ok": True,
                    "engine": str(executable),
                })
            except BbpPairingError as exc:
                self.send_json(503, {
                    "ok": False,
                    "error": str(exc),
                })
            return
        if path == "/":
            self.path = "/pairing.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/pairings":
            self.send_json(404, {"success": False, "error": "Unknown endpoint."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body.decode("utf-8"))
            result = generate_pairings(payload, self.root, self.bbp_executable)
            self.send_json(200, result)
        except json.JSONDecodeError:
            self.send_json(400, {"success": False, "error": "Invalid JSON payload."})
        except BbpPairingError as exc:
            self.send_json(422, {"success": False, "error": str(exc)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"success": False, "error": "bbpPairings timed out."})
        except Exception as exc:
            self.send_json(500, {"success": False, "error": str(exc)})


def parse_args():
    parser = argparse.ArgumentParser(description="Local Sachy UH pairing server.")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "3000")))
    parser.add_argument("--bbp", default=None, help="Path to bbpPairings executable.")
    return parser.parse_args()


def main():
    args = parse_args()
    handler = partial(
        LocalPairingHandler,
        root=ROOT,
        bbp_executable=args.bbp,
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Pairing GUI: http://{args.host}:{args.port}/pairing.html")
    print("Stop server with Ctrl+C.")
    server.serve_forever()


if __name__ == "__main__":
    main()
