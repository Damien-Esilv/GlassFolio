"""One request → one response, the same for the stdio worker and the HTTP server (TGLA-236).

Request:  {"id": "<any string>", "cmd": "status" | "login" | "answer" | "accounts" | "holdings" | "forget", "params": {...}}
Response: {"id": ..., "ok": true, "result": {...}}  or  {"id": ..., "ok": false, "error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

import json
from typing import Any

from .service import WoobService, WorkerError

MAX_REQUEST_BYTES = 64 * 1024


def handle(service: WoobService, raw: str | bytes) -> dict[str, Any]:
    request_id: Any = None
    try:
        if len(raw) > MAX_REQUEST_BYTES:
            raise WorkerError("invalid_request", "too_large")
        message = json.loads(raw)
        if not isinstance(message, dict):
            raise WorkerError("invalid_request")
        request_id = message.get("id")
        command = message.get("cmd")
        params = message.get("params") or {}
        if not isinstance(command, str) or not isinstance(params, dict):
            raise WorkerError("invalid_request")
        return {"id": request_id, "ok": True, "result": service.dispatch(command, params)}
    except WorkerError as error:
        return {"id": request_id, "ok": False, "error": {"code": error.code, "message": error.message}}
    except json.JSONDecodeError:
        return {"id": request_id, "ok": False, "error": {"code": "invalid_request", "message": "json"}}
    except Exception as error:  # noqa: BLE001 - never crash the worker, never echo a secret
        return {"id": request_id, "ok": False, "error": {"code": "unknown", "message": type(error).__name__}}
