"""HTTP transport, for the optional Docker container (TGLA-239).

POST /rpc with the same JSON as the stdio worker and ``Authorization: Bearer <GLASSFOLIO_WOOB_TOKEN>``;
GET /health without token. Listens on 127.0.0.1 unless GLASSFOLIO_WOOB_IN_CONTAINER=1, where Compose
keeps the port on its internal network (never published).
"""

from __future__ import annotations

import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .protocol import MAX_REQUEST_BYTES, handle
from .service import WoobService

MIN_TOKEN_LENGTH = 32


def make_handler(service: WoobService, token: str) -> type[BaseHTTPRequestHandler]:
    expected = f"Bearer {token}".encode()

    class Handler(BaseHTTPRequestHandler):
        server_version = "glassfolio-woob"
        sys_version = ""

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - silence: no request is logged
            return

        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send(200, {"ok": True})
            else:
                self._send(404, {"ok": False})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/rpc":
                self._send(404, {"ok": False})
                return
            given = (self.headers.get("Authorization") or "").encode()
            if not hmac.compare_digest(given, expected):
                self._send(401, {"ok": False, "error": {"code": "unauthorized", "message": ""}})
                return
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send(413, {"ok": False, "error": {"code": "invalid_request", "message": "too_large"}})
                return
            self._send(200, handle(service, self.rfile.read(length)))

    return Handler


def serve_http(service: WoobService, token: str, host: str, port: int) -> None:
    if len(token) < MIN_TOKEN_LENGTH:
        raise SystemExit("GLASSFOLIO_WOOB_TOKEN must hold at least 32 characters")
    server = ThreadingHTTPServer((host, port), make_handler(service, token))
    server.serve_forever()
