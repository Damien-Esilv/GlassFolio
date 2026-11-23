"""Woob's latest bank modules, opt-in (TGLA-241): gitlab.com only, safe extraction, broken modules keep their
verified version, a failed update keeps what works, and the worker restarts only when the modules change."""

import io
import json
import tarfile
from pathlib import Path

import pytest

from glassfolio_woob.updates import ModuleSource, UpdateError, _open, extract_modules

SHA = "a" * 40
BANK = "from woob.capabilities.bank import CapBank\n"


def archive(files: dict[str, str], extra: list[tarfile.TarInfo] | None = None) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, body in files.items():
            data = body.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        for info in extra or []:
            tar.addfile(info)
    return buffer.getvalue()


def verified_modules(root: Path) -> Path:
    modules = root / "verified"
    for name, body in {"abank": BANK + "VERSION = 'verified'", "bbank": BANK + "VERSION = 'verified'"}.items():
        (modules / name).mkdir(parents=True)
        (modules / name / "module.py").write_text(body)
    return modules


def gitlab(files: dict[str, str]):
    calls: list[str] = []

    def fetch(url: str) -> bytes:
        calls.append(url)
        if "/api/v4/" in url:
            return json.dumps({"id": SHA, "committed_date": "2026-11-27T10:00:00+01:00"}).encode()
        return archive(files)

    return fetch, calls


def test_extracts_only_module_files(tmp_path):
    data = archive({
        f"woob-{SHA}/modules/abank/module.py": BANK,
        f"woob-{SHA}/README.rst": "ignored",
        f"woob-{SHA}/woob/__init__.py": "ignored",
    })
    modules = extract_modules(data, tmp_path)
    assert [p.relative_to(tmp_path).as_posix() for p in sorted(tmp_path.rglob("*.py"))] == ["modules/abank/module.py"]
    assert modules == tmp_path / "modules"


@pytest.mark.parametrize("member", ["../escape", "x/modules/../../escape"])
def test_refuses_paths_that_escape(tmp_path, member):
    with pytest.raises(UpdateError):
        extract_modules(archive({f"woob-{SHA}/modules/a/x.py": "", f"woob-{SHA}/modules/{member}": "boom"} if member.startswith("..") else {member: "boom"}), tmp_path)


def test_refuses_links(tmp_path):
    link = tarfile.TarInfo(f"woob-{SHA}/modules/abank/evil")
    link.type = tarfile.SYMTYPE
    link.linkname = "/etc/passwd"
    with pytest.raises(UpdateError):
        extract_modules(archive({}, [link]), tmp_path)


def test_downloads_only_from_gitlab():
    with pytest.raises(UpdateError):
        _open("https://example.com/woob.tar.gz")
    with pytest.raises(UpdateError):
        _open("http://gitlab.com/woob/woob.tar.gz")


def test_verified_by_default_and_latest_layout_on_request(tmp_path):
    fetch, calls = gitlab({f"woob-{SHA}/modules/abank/module.py": BANK + "VERSION = 'latest'"})
    source = ModuleSource(tmp_path / "data", verified_modules(tmp_path), fetch=fetch, check=lambda path: ["abank", "bbank"])
    assert source.read()["channel"] == "verified"
    assert source.active_modules() == tmp_path / "verified"

    source.set_channel("latest")
    source.update()
    active = source.active_modules()
    assert active == tmp_path / "data" / "modules-latest" / SHA
    assert "latest" in (active / "abank" / "module.py").read_text()
    # A module the latest commit does not change keeps its verified version
    assert "verified" in (active / "bbank" / "module.py").read_text()
    assert source.describe()["commit"] == SHA
    assert calls[1] == f"https://gitlab.com/woob/woob/-/archive/{SHA}/woob-{SHA}.tar.gz"


def test_a_module_broken_in_the_latest_version_keeps_its_verified_one(tmp_path):
    fetch, _ = gitlab({f"woob-{SHA}/modules/abank/module.py": BANK + "VERSION = 'latest'",
                       f"woob-{SHA}/modules/bbank/module.py": BANK + "VERSION = 'needs a newer woob'"})

    def check(path: Path) -> list[str]:
        return ["abank", "bbank"] if path.name == "verified" else ["abank"]

    source = ModuleSource(tmp_path / "data", verified_modules(tmp_path), fetch=fetch, check=check)
    source.set_channel("latest")
    source.update()
    active = source.active_modules()
    assert "latest" in (active / "abank" / "module.py").read_text()
    assert "verified" in (active / "bbank" / "module.py").read_text()
    assert source.describe()["keptVerified"] == ["bbank"]


def test_a_failed_update_keeps_the_modules_in_use(tmp_path):
    def fetch(url: str) -> bytes:
        raise OSError("network down")

    source = ModuleSource(tmp_path / "data", verified_modules(tmp_path), fetch=fetch, check=lambda path: [])
    source.set_channel("latest")
    with pytest.raises(UpdateError):
        source.update()
    assert source.active_modules() == tmp_path / "verified"
    assert source.describe()["lastError"] == "OSError"


def test_stale_after_a_day(tmp_path):
    now = [1_000_000.0]
    fetch, _ = gitlab({f"woob-{SHA}/modules/abank/module.py": BANK})
    source = ModuleSource(tmp_path / "data", verified_modules(tmp_path), fetch=fetch, check=lambda path: ["abank", "bbank"], clock=lambda: now[0])
    assert source.is_stale() is False  # verified modules are never refreshed at run time
    source.set_channel("latest")
    source.update()
    assert source.is_stale() is False
    now[0] += 24 * 3600 + 1
    assert source.is_stale() is True


def test_the_worker_restarts_only_when_the_modules_change(tmp_path):
    from glassfolio_woob.service import WoobService, WorkerError

    fetch, _ = gitlab({f"woob-{SHA}/modules/abank/module.py": BANK + "VERSION = 'latest'"})
    source = ModuleSource(tmp_path / "data", verified_modules(tmp_path), fetch=fetch, check=lambda path: ["abank", "bbank"])
    restarts: list[int] = []
    service = WoobService(tmp_path / "verified", tmp_path / "data", module_source=source, restart=lambda: restarts.append(1),
                          banks_provider=lambda: [])
    with pytest.raises(WorkerError):
        service.update_modules({})  # only once the latest modules were chosen
    assert service.set_modules({"channel": "latest"})["restarting"] is True
    assert service.update_modules({})["restarting"] is False  # same commit: nothing to reload
    assert service.set_modules({"channel": "verified"})["active"] == "verified"
    assert restarts == [1, 1]
    with pytest.raises(WorkerError):
        service.set_modules({"channel": "nightly"})


def test_a_running_worker_refreshes_latest_modules_every_day():
    # GlassFolio may stay open for days: the daily refresh must not wait for the next start
    import threading

    from glassfolio_woob.__main__ import keep_latest_fresh

    refreshed = threading.Event()

    class Source:
        def is_stale(self) -> bool:
            return True

    class Service:
        def update_modules(self, _params=None):
            refreshed.set()
            return {}

    stop = threading.Event()
    thread = keep_latest_fresh(Service(), Source(), interval=0.01, stop=stop)
    try:
        assert refreshed.wait(2)
    finally:
        stop.set()
        thread.join(1)
