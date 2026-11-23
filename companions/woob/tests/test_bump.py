"""Weekly bump check (TGLA-241): a new package or a version the lock does not satisfy stops the bump."""

import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("bump", Path(__file__).resolve().parents[1] / "tools" / "bump.py")
bump = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bump)  # type: ignore[union-attr]

LOCK = "lxml==6.1.3 \\\n    --hash=sha256:" + "a" * 64 + "\nrequests==2.34.2 \\\n    --hash=sha256:" + "b" * 64 + "\nselenium==4.54.0 \\\n    --hash=sha256:" + "c" * 64 + "\n"


def tree(tmp_path: Path, woob_deps: list[str], module_requirements: str) -> Path:
    (tmp_path / "src" / "modules" / "abank").mkdir(parents=True)
    (tmp_path / "src" / "pyproject.toml").write_text("[project]\ndependencies = [" + ", ".join(f'"{d}"' for d in woob_deps) + "]\n")
    (tmp_path / "src" / "modules" / "abank" / "module.py").write_text("from woob.capabilities.bank import CapBank")
    (tmp_path / "src" / "modules" / "abank" / "requirements.txt").write_text(module_requirements)
    (tmp_path / "requirements.in").write_text("lxml\nrequests\nselenium\n")
    (tmp_path / "requirements.lock").write_text(LOCK)
    return tmp_path


def run(root: Path) -> None:
    bump.check(str(root / "src"), str(root / "requirements.in"), str(root / "requirements.lock"))


def test_passes_when_the_lock_covers_everything(tmp_path, capsys):
    run(tree(tmp_path, ["lxml", "requests >= 2.0"], "woob ~= 3.5\nselenium<4.1.4\njwt\n"))
    assert "is in the lock" in capsys.readouterr().out


@pytest.mark.parametrize("deps, module, expected", [
    (["lxml", "pydantic"], "", "pydantic"),
    (["lxml", "requests >= 3"], "", "the lock has 2.34.2"),
    (["lxml"], "cryptography\n", "cryptography"),
])
def test_stops_on_a_missing_package_or_version(tmp_path, capsys, deps, module, expected):
    with pytest.raises(SystemExit):
        run(tree(tmp_path, deps, module))
    assert expected in capsys.readouterr().out


def test_pin_refuses_what_is_not_a_commit(tmp_path):
    with pytest.raises(SystemExit):
        bump.pin(str(tmp_path / "x.json"), "master")
