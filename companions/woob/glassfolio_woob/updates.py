"""Where the worker's bank modules come from (TGLA-241).

- "verified" (default): the modules shipped with GlassFolio, at the Woob commit GlassFolio tested
  (woob-source.json, bumped every week by a reviewed pull request).
- "latest" (advanced, opt-in, with a warning in the app): the bank modules of Woob's latest commit, downloaded
  from gitlab.com. Code GlassFolio has not checked then runs with the user's bank credentials: the user chose it.

The latest modules are laid out over the verified ones: a module that does not load in the latest version (it
needs a newer Woob core, or a package that is not shipped) keeps its verified version. The download is limited
to gitlab.com over HTTPS, its size is capped, and only `modules/<name>/` files of the archive are extracted
(no absolute path, no `..`, no link).

The choice is a setting of this machine (`<data>/modules.json`), not of the vault: it describes installed code.
"""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from .catalog import bank_module_closure

GITLAB_HOST = "gitlab.com"
COMMIT_API = "https://gitlab.com/api/v4/projects/woob%2Fwoob/repository/commits/master"
ARCHIVE_URL = "https://gitlab.com/woob/woob/-/archive/{sha}/woob-{sha}.tar.gz"
MAX_ARCHIVE_BYTES = 60 * 1024 * 1024
MAX_EXTRACTED_BYTES = 120 * 1024 * 1024
DOWNLOAD_TIMEOUT_S = 60
REFRESH_AFTER_S = 24 * 3600
CHANNELS = ("verified", "latest")


class UpdateError(Exception):
    """A failed update: the verified modules stay in use."""


class _GitLabOnly(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to gitlab.com over HTTPS."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        parts = urlsplit(newurl)
        if parts.scheme != "https" or parts.hostname != GITLAB_HOST:
            raise UpdateError("redirect outside gitlab.com")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url: str) -> bytes:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != GITLAB_HOST:
        raise UpdateError("only gitlab.com over HTTPS")
    opener = urllib.request.build_opener(_GitLabOnly())
    request = urllib.request.Request(url, headers={"User-Agent": "glassfolio-woob"})
    with opener.open(request, timeout=DOWNLOAD_TIMEOUT_S) as response:
        data = response.read(MAX_ARCHIVE_BYTES + 1)
    if len(data) > MAX_ARCHIVE_BYTES:
        raise UpdateError("archive too large")
    return data


def latest_commit(fetch: Callable[[str], bytes] = _open) -> tuple[str, str]:
    """(sha, ISO date) of Woob's master branch."""
    data = json.loads(fetch(COMMIT_API))
    sha = str(data.get("id", ""))
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise UpdateError("unexpected commit id")
    return sha, str(data.get("committed_date", ""))


def extract_modules(archive: bytes, destination: Path) -> Path:
    """Extracts `<root>/modules/**` of a Woob source archive, refusing anything that could escape."""
    modules_root = destination / "modules"
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            parts = Path(member.name).parts
            if len(parts) < 3 or parts[1] != "modules":
                continue
            if member.name.startswith("/") or ".." in parts:
                raise UpdateError("unsafe path in archive")
            if not (member.isfile() or member.isdir()):
                raise UpdateError("link or special file in archive")
            target = modules_root.joinpath(*parts[2:])
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            total += member.size
            if total > MAX_EXTRACTED_BYTES:
                raise UpdateError("archive too large")
            target.parent.mkdir(parents=True, exist_ok=True)
            source = tar.extractfile(member)
            if source is None:
                raise UpdateError("unreadable file in archive")
            with source, open(target, "wb") as handle:
                shutil.copyfileobj(source, handle)
    if not modules_root.is_dir():
        raise UpdateError("no modules in archive")
    return modules_root


def loadable_banks(modules_dir: Path) -> list[str]:
    """Bank modules that load from `modules_dir`, checked in a child process (a broken module stays out of ours)."""
    result = subprocess.run(
        [sys.executable, "-I", "-B", "-m", "glassfolio_woob.updates", "check", str(modules_dir)],
        capture_output=True, text=True, timeout=300, check=False,
    )
    if result.returncode != 0:
        raise UpdateError("module check failed")
    return json.loads(result.stdout or "[]")


def _check(modules_dir: str) -> None:
    import logging

    logging.disable(logging.CRITICAL)
    from woob.core.woob import WoobBase

    from .catalog import candidate_bank_modules, describe_banks

    loader = WoobBase(modules_path=modules_dir).modules_loader
    print(json.dumps([bank["module"] for bank in describe_banks(loader, candidate_bank_modules(modules_dir))]))


class ModuleSource:
    """The setting and the files of the "latest" modules, under `<data>/`."""

    def __init__(self, data_dir: Path, verified_modules: Path, fetch: Callable[[str], bytes] = _open,
                 check: Callable[[Path], list[str]] = loadable_banks, clock: Callable[[], float] = time.time) -> None:
        self.data_dir = data_dir
        self.verified_modules = verified_modules
        self.setting_file = data_dir / "modules.json"
        self.latest_dir = data_dir / "modules-latest"
        self._fetch = fetch
        self._check = check
        self._clock = clock

    # ---------------------------------------------------------------- setting

    def read(self) -> dict[str, Any]:
        try:
            setting = json.loads(self.setting_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            setting = {}
        if setting.get("channel") not in CHANNELS:
            setting = {"channel": "verified"}
        return setting

    def _write(self, setting: dict[str, Any]) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.setting_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(setting), encoding="utf-8")
        os.replace(temporary, self.setting_file)

    def active_modules(self) -> Path:
        """The modules folder to load: the latest layout when chosen and present, else the verified one."""
        setting = self.read()
        current = setting.get("path")
        if setting["channel"] == "latest" and current and (self.latest_dir / current).is_dir():
            return self.latest_dir / current
        return self.verified_modules

    def describe(self) -> dict[str, Any]:
        setting = self.read()
        active = self.active_modules()
        return {
            "channel": setting["channel"],
            "active": "latest" if active != self.verified_modules else "verified",
            "commit": setting.get("commit") if active != self.verified_modules else None,
            "commitDate": setting.get("commitDate") if active != self.verified_modules else None,
            "updatedAt": setting.get("updatedAt"),
            "keptVerified": setting.get("keptVerified", []) if active != self.verified_modules else [],
            "lastError": setting.get("lastError"),
        }

    def set_channel(self, channel: str) -> dict[str, Any]:
        if channel not in CHANNELS:
            raise UpdateError("unknown channel")
        setting = self.read()
        setting["channel"] = channel
        setting.pop("lastError", None)
        self._write(setting)
        return setting

    def is_stale(self) -> bool:
        setting = self.read()
        if setting["channel"] != "latest":
            return False
        updated = setting.get("updatedAtEpoch") or 0
        return self._clock() - float(updated) > REFRESH_AFTER_S

    # ---------------------------------------------------------------- update

    def update(self) -> dict[str, Any]:
        """Downloads Woob's latest bank modules and lays them over the verified ones. Keeps the old layout on failure."""
        setting = self.read()
        try:
            sha, date = latest_commit(self._fetch)
            if setting.get("commit") == sha and setting.get("path") and (self.latest_dir / setting["path"]).is_dir():
                setting.update({"updatedAt": _now(), "updatedAtEpoch": self._clock()})
                setting.pop("lastError", None)
                self._write(setting)
                return setting
            self.latest_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=self.latest_dir) as staging:
                downloaded = extract_modules(self._fetch(ARCHIVE_URL.format(sha=sha)), Path(staging))
                layout = self.latest_dir / sha
                if layout.exists():
                    shutil.rmtree(layout)
                shutil.copytree(self.verified_modules, layout)
                for name in bank_module_closure(downloaded):
                    if (layout / name).exists():
                        shutil.rmtree(layout / name)
                    shutil.copytree(downloaded / name, layout / name)
            kept = self._keep_verified_where_broken(layout)
            previous = setting.get("path")
            setting.update({"commit": sha, "commitDate": date, "path": sha, "updatedAt": _now(),
                            "updatedAtEpoch": self._clock(), "keptVerified": kept})
            setting.pop("lastError", None)
            self._write(setting)
            if previous and previous != sha:
                shutil.rmtree(self.latest_dir / previous, ignore_errors=True)
            return setting
        except Exception as error:  # noqa: BLE001 - any failure keeps the modules in use
            setting["lastError"] = type(error).__name__ if not isinstance(error, UpdateError) else str(error)
            self._write(setting)
            raise UpdateError(setting["lastError"]) from None

    def _keep_verified_where_broken(self, layout: Path) -> list[str]:
        """Bank modules that load in the verified version but not in the latest one get their verified version back."""
        verified = set(self._check(self.verified_modules))
        broken = sorted(verified - set(self._check(layout)))
        for name in broken:
            shutil.rmtree(layout / name, ignore_errors=True)
            shutil.copytree(self.verified_modules / name, layout / name)
        return broken


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "check":
        _check(sys.argv[2])
    else:
        raise SystemExit("usage: python -m glassfolio_woob.updates check <modules dir>")
