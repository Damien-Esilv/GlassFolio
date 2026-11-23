"""Every bank Woob can read (TGLA-240).

Build time (no Woob import, plain text scan of the Woob source):
    python catalog.py closure <woob source>/modules
prints the bank modules (their module.py declares CapBank) and the modules they import, one per line.
The three runtime builders ship exactly these (scripts/woob-setup.mjs, desktop/scripts/prepare-woob-runtime.mjs,
docker/woob.Dockerfile).

Run time: `describe_banks` loads each bank module and describes its credential form from the module's own
CONFIG, so a new bank in Woob needs no code here. Modules that do not load (a missing package, such as the
ones that drive a real browser through Selenium) are simply not offered.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

BANK_CAPABILITY = re.compile(r"\bCapBank(Wealth)?\b")
MODULE_IMPORT = re.compile(r"woob_modules\.([a-z0-9_]+)")
#: Configuration values never shown in the form: Woob's two-factor answers and internal switches.
HIDDEN_FIELDS = {"request_information", "resume", "code", "otp", "sms_code", "email_code"}


def bank_module_closure(modules_dir: str | os.PathLike[str]) -> list[str]:
    """Bank modules of a Woob source tree, plus the modules they import (sorted)."""
    root = Path(modules_dir)
    names = sorted(p.name for p in root.iterdir() if (p / "module.py").is_file())
    stack = [name for name in names if BANK_CAPABILITY.search((root / name / "module.py").read_text(encoding="utf-8"))]
    seen: set[str] = set()
    while stack:
        name = stack.pop()
        if name in seen or not (root / name).is_dir():
            continue
        seen.add(name)
        for file in (root / name).rglob("*.py"):
            stack.extend(MODULE_IMPORT.findall(file.read_text(encoding="utf-8", errors="ignore")))
    return sorted(seen)


def candidate_bank_modules(modules_dir: str | os.PathLike[str]) -> list[str]:
    """Shipped modules whose module.py declares a bank capability (confirmed by loading them)."""
    root = Path(modules_dir)
    if not root.is_dir():
        return []
    return sorted(
        p.name for p in root.iterdir()
        if (p / "module.py").is_file() and BANK_CAPABILITY.search((p / "module.py").read_text(encoding="utf-8"))
    )


def describe_field(value: Any) -> dict[str, Any] | None:
    """One configuration value of a module as a form field, or None when the user never fills it."""
    from woob.tools.value import ValueBackendPassword, ValueBool, ValueDate, ValueFloat, ValueInt, ValueTransient

    field_id = getattr(value, "id", "") or ""
    if not field_id or field_id.startswith("_") or field_id in HIDDEN_FIELDS:
        return None
    if isinstance(value, ValueTransient) or getattr(value, "transient", False):
        return None

    choices = getattr(value, "choices", None)
    if isinstance(value, ValueBool):
        kind = "bool"
    elif isinstance(value, ValueDate):
        kind = "date"
    elif isinstance(value, (ValueInt, ValueFloat)):
        kind = "number"
    elif choices:
        kind = "select"
    elif isinstance(value, ValueBackendPassword):
        kind = "password" if getattr(value, "masked", True) else "text"
    else:
        kind = "text"

    default = getattr(value, "default", None)
    required = bool(getattr(value, "required", False)) and default in (None, "")
    # Some modules give their identifier and password an empty default, which Woob then calls optional
    if isinstance(value, ValueBackendPassword) and field_id in ("login", "password"):
        required = True
    return {
        "id": field_id,
        # The app marks optional fields itself: a module's own "(optional)" would be said twice
        "label": re.sub(r"\s*\((optional|optionnel|facultatif)\)\s*$", "", str(value.label or value.description or field_id), flags=re.I),
        "kind": kind,
        "required": required,
        "default": None if default is None else str(default),
        "choices": [{"value": str(key), "label": str(label)} for key, label in choices.items()] if kind == "select" else None,
        "regexp": getattr(value, "regexp", None),
    }


def describe_banks(loader: Any, module_names: list[str]) -> list[dict[str, Any]]:
    """Banks among `module_names` that load here, with their name and credential form."""
    from woob.capabilities.bank import CapBank
    from woob.capabilities.bank.wealth import CapBankWealth
    from woob.core.modules import ModuleLoadError

    banks = []
    for name in module_names:
        try:
            loaded = loader.get_or_load_module(name)
        except (ModuleLoadError, ImportError, SyntaxError):
            continue
        klass = loaded.klass
        if not issubclass(klass, CapBank):
            continue
        fields = [field for field in (describe_field(value) for value in loaded.config.values()) if field]
        banks.append({
            "module": name,
            "name": str(loaded.description or name),
            "positions": issubclass(klass, CapBankWealth),
            "fields": fields,
        })
    return sorted(banks, key=lambda bank: bank["name"].lower())


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "closure":
        print("\n".join(bank_module_closure(sys.argv[2])))
    else:
        raise SystemExit("usage: catalog.py closure <woob source>/modules")
