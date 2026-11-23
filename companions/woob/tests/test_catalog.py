"""Every bank Woob can read (TGLA-240), checked on the real shipped modules (npm run woob:setup / CI)."""

import os
from pathlib import Path

import pytest

from glassfolio_woob.catalog import bank_module_closure, candidate_bank_modules, describe_banks

ROOT = Path(__file__).resolve().parents[3]
MODULES = Path(os.environ.get("GLASSFOLIO_WOOB_MODULES") or ROOT / ".woob-runtime" / "woob-modules")

pytestmark = pytest.mark.skipif(not MODULES.is_dir(), reason="no Woob runtime: run npm run woob:setup")


@pytest.fixture(scope="module")
def banks():
    from woob.core.woob import WoobBase

    loader = WoobBase(modules_path=str(MODULES)).modules_loader
    return {bank["module"]: bank for bank in describe_banks(loader, candidate_bank_modules(MODULES))}


def test_ships_every_bank_module():
    assert len(candidate_bank_modules(MODULES)) >= 85
    assert {"boursorama", "fortuneo", "cragr", "bnp", "creditmutuel", "banquepopulaire"} <= set(candidate_bank_modules(MODULES))


def test_offers_the_banks_that_load(banks):
    assert len(banks) >= 80
    assert banks["boursorama"]["positions"] is True
    # La Banque Postale imports Selenium and falls back to its classic login: offered. The modules pinned to
    # Selenium < 4.1.4 (urllib3 1.x) cannot load with the shipped packages: left out
    assert "bp" in banks
    for module in candidate_bank_modules(MODULES):
        requirements = MODULES / module / "requirements.txt"
        if requirements.exists() and "selenium<4.1.4" in requirements.read_text():
            assert module not in banks


def test_forms_come_from_each_module(banks):
    bourso = {field["id"]: field for field in banks["boursorama"]["fields"]}
    assert bourso["login"]["kind"] == "text" and bourso["password"]["kind"] == "password"
    assert "code" not in bourso and "request_information" not in bourso and "resume" not in bourso
    cragr = {field["id"]: field for field in banks["cragr"]["fields"]}
    assert any(field["kind"] == "select" and len(field["choices"]) > 10 for field in cragr.values())
    bnp = {field["id"]: field for field in banks["bnp"]["fields"]}
    assert bnp["login"]["required"] and bnp["password"]["required"]
    bforbank = {field["id"]: field for field in banks["bforbank"]["fields"]}
    assert bforbank["birthdate"]["kind"] == "date"


def test_closure_of_a_source_tree(tmp_path):
    for name, body in {
        "abank": "from woob.capabilities.bank import CapBank\nimport woob_modules.helper",
        "helper": "x = 1",
        "recipes": "from woob.capabilities.recipe import CapRecipe",
    }.items():
        (tmp_path / name).mkdir()
        (tmp_path / name / "module.py").write_text(body)
    assert bank_module_closure(tmp_path) == ["abank", "helper"]
