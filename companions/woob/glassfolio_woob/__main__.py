"""``python -m glassfolio_woob worker | serve | status`` (TGLA-236).

Environment:
- GLASSFOLIO_WOOB_MODULES: folder of the Woob bank modules (default: <python prefix>/../woob-modules)
- GLASSFOLIO_WOOB_DATA: where bank sessions are kept (default: ~/.glassfolio/woob)
- serve only: GLASSFOLIO_WOOB_TOKEN (or GLASSFOLIO_WOOB_TOKEN_FILE, created on first start),
  GLASSFOLIO_WOOB_PORT (47832), GLASSFOLIO_WOOB_IN_CONTAINER
"""

from __future__ import annotations

import argparse
import json
import logging
import threading
import os
import secrets
import sys
from pathlib import Path

from .service import WoobService
from .updates import ModuleSource, UpdateError


def default_modules_path() -> Path:
    for candidate in (Path(sys.prefix).parent / "woob-modules", Path(sys.prefix) / "woob-modules"):
        if candidate.is_dir():
            return candidate
    return Path(sys.prefix).parent / "woob-modules"


def load_or_create_token(path: str | None) -> str:
    """Shared secret of the Docker container, written once to a volume only the GlassFolio server reads."""
    if not path:
        return ""
    token_file = Path(path)
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        token = secrets.token_hex(32)
        handle.write(token)
    return token


def restart_soon() -> None:
    """Starts the worker again with the same command, to load another set of bank modules (TGLA-241)."""
    from .worker import when_idle

    when_idle(lambda: os.execv(sys.executable, sys.orig_argv))


def build_service() -> WoobService:
    os.umask(0o077)
    # Woob logs pages and parameters at debug level: keep only errors, and they go to stderr only
    logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
    verified = Path(os.environ.get("GLASSFOLIO_WOOB_MODULES") or default_modules_path())
    data = Path(os.environ.get("GLASSFOLIO_WOOB_DATA") or Path.home() / ".glassfolio" / "woob")
    source = ModuleSource(data, verified)
    if source.is_stale():
        # Woob's latest modules were chosen and are over a day old: refresh them before loading (failure keeps them)
        try:
            source.update()
        except UpdateError:
            pass
    service = WoobService(source.active_modules(), data, module_source=source, restart=restart_soon)
    keep_latest_fresh(service, source)
    return service


#: How often a running worker checks whether Woob's latest modules are due for their daily refresh
FRESHNESS_CHECK_S = 3600


def keep_latest_fresh(service: WoobService, source: ModuleSource, interval: float = FRESHNESS_CHECK_S,
                      stop: threading.Event | None = None) -> threading.Thread:
    """GlassFolio may stay open for days: with Woob's latest modules chosen, they are refreshed every day while it
    runs, not only at start. A failed download keeps the modules in use; new modules load once the worker is idle."""

    stopped = stop or threading.Event()

    def loop() -> None:
        while not stopped.wait(interval):
            if source.is_stale():
                try:
                    service.update_modules()
                except Exception:  # noqa: BLE001 - the error is recorded in the module source, shown in the settings
                    pass

    thread = threading.Thread(target=loop, name="woob-latest-refresh", daemon=True)
    thread.start()
    return thread


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="glassfolio_woob")
    parser.add_argument("command", choices=["worker", "serve", "status"])
    args = parser.parse_args(argv)
    service = build_service()
    if args.command == "status":
        print(json.dumps(service.status()))
    elif args.command == "worker":
        from .worker import serve_stdio

        serve_stdio(service)
    else:
        from .http_server import serve_http

        in_container = os.environ.get("GLASSFOLIO_WOOB_IN_CONTAINER") == "1"
        serve_http(
            service,
            token=os.environ.get("GLASSFOLIO_WOOB_TOKEN") or load_or_create_token(os.environ.get("GLASSFOLIO_WOOB_TOKEN_FILE")),
            host="0.0.0.0" if in_container else "127.0.0.1",  # noqa: S104 - container network only, see docstring
            port=int(os.environ.get("GLASSFOLIO_WOOB_PORT") or 47832),
        )


if __name__ == "__main__":
    main()
