"""Stdio transport: one JSON request per line on stdin, one JSON response per line on stdout (TGLA-236).

Started by the GlassFolio local server (server/woobBridge.mjs) and stopped with it. Requests run in a
small thread pool so a slow bank does not block the others; responses carry the request id.
"""

from __future__ import annotations

import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TextIO

from .protocol import handle
from .service import WoobService


_in_flight = 0
_idle = threading.Condition()


def _started() -> None:
    global _in_flight
    with _idle:
        _in_flight += 1


def when_idle(action: Callable[[], None]) -> None:
    """Runs `action` once no request is in progress any more (a restart never cuts a bank session short)."""

    def wait_then_run() -> None:
        # Lets the answer that asked for the restart reach the app first
        time.sleep(1)
        with _idle:
            _idle.wait_for(lambda: _in_flight == 0, timeout=300)
        action()

    threading.Thread(target=wait_then_run, daemon=True).start()


def serve_stdio(service: WoobService, stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    write_lock = threading.Lock()

    def answer(line: str) -> None:
        global _in_flight
        try:
            response = handle(service, line)
            with write_lock:
                stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
                stdout.flush()
        finally:
            with _idle:
                _in_flight -= 1
                _idle.notify_all()

    with ThreadPoolExecutor(max_workers=4) as pool:
        for line in stdin:
            if line.strip():
                _started()
                pool.submit(answer, line)
