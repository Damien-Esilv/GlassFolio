"""The stdio worker and the HTTP server speak the same protocol; the HTTP server wants its token."""

import io
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from glassfolio_woob.http_server import make_handler
from glassfolio_woob.protocol import handle
from glassfolio_woob.worker import serve_stdio

from .conftest import request


def test_protocol_wraps_results_and_errors(make_service):
    service, _ = make_service()
    ok = handle(service, json.dumps({"id": "1", "cmd": "holdings", "params": request()}))
    assert ok["id"] == "1" and ok["ok"] is True
    bad = handle(service, json.dumps({"id": "2", "cmd": "rm -rf", "params": {}}))
    assert bad == {"id": "2", "ok": False, "error": {"code": "invalid_request", "message": "cmd"}}
    assert handle(service, "{not json")["error"]["code"] == "invalid_request"
    assert handle(service, "x" * 70_000)["error"]["code"] == "invalid_request"


def test_stdio_answers_each_line_with_its_id(make_service):
    service, _ = make_service()
    stdin = io.StringIO(
        json.dumps({"id": "a", "cmd": "holdings", "params": request()}) + "\n\n"
        + json.dumps({"id": "b", "cmd": "forget", "params": {"key": "conn-1"}}) + "\n"
    )
    stdout = io.StringIO()
    serve_stdio(service, stdin, stdout)
    answers = {item["id"]: item for item in map(json.loads, stdout.getvalue().splitlines())}
    assert answers["a"]["ok"] and answers["b"]["result"] == {"forgotten": True}


def test_http_requires_the_token(make_service):
    service, _ = make_service()
    token = "t" * 40
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(service, token))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        body = json.dumps({"id": "1", "cmd": "forget", "params": {"key": "conn-1"}}).encode()
        try:
            urllib.request.urlopen(urllib.request.Request(f"{url}/rpc", data=body, method="POST"))
            raise AssertionError("expected 401")
        except urllib.error.HTTPError as error:
            assert error.code == 401
        answer = urllib.request.urlopen(urllib.request.Request(
            f"{url}/rpc", data=body, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        ))
        assert json.loads(answer.read())["ok"] is True
        assert json.loads(urllib.request.urlopen(f"{url}/health").read()) == {"ok": True}
    finally:
        server.shutdown()
