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
STATE_PATH = ROOT / "data" / "tournament-state.json"
EMPTY_STATE = {
    "playersText": "",
    "rounds": [],
    "currentPairings": [],
}


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

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        return json.loads(raw_body.decode("utf-8"))

    def read_tournament_state(self):
        if not STATE_PATH.exists():
            return dict(EMPTY_STATE)
        with STATE_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return {
            "playersText": str(payload.get("playersText") or ""),
            "rounds": payload.get("rounds") if isinstance(payload.get("rounds"), list) else [],
            "currentPairings": payload.get("currentPairings") if isinstance(payload.get("currentPairings"), list) else [],
        }

    def write_tournament_state(self, payload):
        state = {
            "playersText": str(payload.get("playersText") or ""),
            "rounds": payload.get("rounds") if isinstance(payload.get("rounds"), list) else [],
            "currentPairings": payload.get("currentPairings") if isinstance(payload.get("currentPairings"), list) else [],
        }
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = STATE_PATH.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
        tmp_path.replace(STATE_PATH)
        return state

    def is_referee_request(self):
        expected = os.getenv("REFEREE_PASSWORD", "11")
        return self.headers.get("X-Referee-Password") == expected

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
        if path == "/api/state":
            try:
                self.send_json(200, {
                    "success": True,
                    "state": self.read_tournament_state(),
                })
            except Exception as exc:
                self.send_json(500, {"success": False, "error": str(exc)})
            return
        if path == "/":
            self.path = "/pairing.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            if not self.is_referee_request():
                self.send_json(403, {"success": False, "error": "Rozhodčí není přihlášen."})
                return
            try:
                payload = self.read_json_body()
                state = self.write_tournament_state(payload)
                self.send_json(200, {"success": True, "state": state})
            except json.JSONDecodeError:
                self.send_json(400, {"success": False, "error": "Neplatný JSON."})
            except Exception as exc:
                self.send_json(500, {"success": False, "error": str(exc)})
            return

        if path != "/api/pairings":
            self.send_json(404, {"success": False, "error": "Unknown endpoint."})
            return

        try:
            payload = self.read_json_body()
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
