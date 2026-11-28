"""Fake Woob backends: the worker is tested on real Woob objects (Account, Investment, exceptions)
without any network call."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Callable

import pytest
from datetime import date
from woob.capabilities.bank import Account, Transaction
from woob.capabilities.bank.wealth import CapBankWealth, Investment
from woob.capabilities.base import NotAvailable

from glassfolio_woob.service import WoobService


class FakeValue:
    def __init__(self, value: Any = None) -> None:
        self.value = value

    def set(self, value: Any) -> None:
        self.value = value

    def get(self) -> Any:
        return self.value


def account(id: str, type: Any, label: str, balance: str | None = None, currency: str = "EUR") -> Account:
    item = Account(id)
    item.type = type
    item.label = label
    item.currency = currency
    item.balance = Decimal(balance) if balance is not None else NotAvailable
    return item


def investment(code: str | None, label: str, quantity: str | None = None, unitprice: str | None = None,
               unitvalue: str | None = None, valuation: str | None = None, code_type: str | None = "ISIN",
               original_currency: str | None = None, original_unitprice: str | None = None) -> Investment:
    item = Investment()
    item.code = code if code is not None else NotAvailable
    item.code_type = code_type if code_type is not None else NotAvailable
    item.label = label
    item.quantity = Decimal(quantity) if quantity is not None else NotAvailable
    item.unitprice = Decimal(unitprice) if unitprice is not None else NotAvailable
    item.unitvalue = Decimal(unitvalue) if unitvalue is not None else NotAvailable
    item.valuation = Decimal(valuation) if valuation is not None else NotAvailable
    item.original_currency = original_currency or NotAvailable
    item.original_unitprice = Decimal(original_unitprice) if original_unitprice is not None else NotAvailable
    item.original_unitvalue = NotAvailable
    return item


def operation(day: str, amount: str, raw: str, type: Any = Transaction.TYPE_CARD, category: str | None = None,
              rday: str | None = None, id: str | None = None) -> Transaction:
    item = Transaction()
    item.id = id or ""
    item.date = date.fromisoformat(day)
    item.rdate = date.fromisoformat(rday) if rday else NotAvailable
    item.vdate = NotAvailable
    item.amount = Decimal(amount)
    item.raw = raw
    item.label = raw.title()
    item.type = type
    item.category = category if category is not None else NotAvailable
    return item


class FakeBackend(CapBankWealth):
    """Scripted bank: ``login`` is a list of steps (exceptions to raise, then success)."""

    def __init__(self, accounts: list[Account], investments: dict[str, list[Investment]], steps: list[BaseException] | None = None,
                 history: dict[str, Any] | None = None, coming: dict[str, Any] | None = None) -> None:
        self.config = {"request_information": FakeValue(), "code": FakeValue(), "resume": FakeValue()}
        self._accounts = accounts
        self._investments = investments
        self._history = history or {}
        self._coming = coming or {}
        self.steps = list(steps or [])
        self.calls: list[str] = []
        self.saved = False

    def iter_accounts(self):  # type: ignore[override]
        self.calls.append("iter_accounts")
        if self.steps:
            raise self.steps.pop(0)
        return iter(self._accounts)

    def iter_investment(self, account):  # type: ignore[override]
        self.calls.append(f"iter_investment:{account.id}")
        return iter(self._investments.get(account.id, []))

    def _scripted(self, table: dict[str, Any], account: Any) -> Any:
        found = table.get(account.id, [])
        if isinstance(found, BaseException):
            raise found
        return iter(found)

    def iter_history(self, account):  # type: ignore[override]
        self.calls.append(f"iter_history:{account.id}")
        return self._scripted(self._history, account)

    def iter_coming(self, account):  # type: ignore[override]
        self.calls.append(f"iter_coming:{account.id}")
        return self._scripted(self._coming, account)

    def deinit(self) -> None:
        self.saved = True


class FakeWoob:
    def __init__(self, make: Callable[[], FakeBackend]) -> None:
        self.make = make
        self.built: list[tuple[str, dict[str, str], str]] = []
        self.backends: list[FakeBackend] = []

    def build_backend(self, module: str, params: dict[str, str], storage: Any, name: str) -> FakeBackend:
        self.built.append((module, dict(params), name))
        backend = self.make()
        self.backends.append(backend)
        return backend


PEA_ACCOUNTS = [
    account("pea-1", Account.TYPE_PEA, "PEA Damien", "12000.50"),
    account("cc-1", Account.TYPE_CHECKING, "Compte courant", "1543.20"),
    account("la-1", Account.TYPE_LIVRET_A, "Livret A", "22950"),
    account("loan-1", Account.TYPE_LOAN, "Prêt immo", "-120000"),
]
PEA_LINES = {
    "pea-1": [
        investment("FR0011869353", "Amundi PEA Monde", quantity="10", unitprice="42.15", unitvalue="45", valuation="450"),
        investment("XX-liquidity", "Liquidités", valuation="12.34", code_type=None),
    ]
}


@pytest.fixture
def make_service(tmp_path) -> Callable[..., tuple[WoobService, FakeWoob]]:
    def build(steps: list[BaseException] | None = None, clock: Callable[[], float] = lambda: 1000.0,
              history: dict[str, Any] | None = None, coming: dict[str, Any] | None = None,
              accounts: list[Account] | None = None) -> tuple[WoobService, FakeWoob]:
        fake = FakeWoob(lambda: FakeBackend(accounts or PEA_ACCOUNTS, PEA_LINES, steps, history, coming))
        service = WoobService(tmp_path / "modules", tmp_path / "data", woob_factory=lambda _path: fake, clock=clock,
                              banks_provider=lambda: FAKE_BANKS)
        return service, fake

    return build


CREDENTIALS = {"login": "12345678", "password": "secret-Passw0rd"}

def _field(field_id: str, kind: str, required: bool = True, choices: list[str] | None = None,
           regexp: str | None = None) -> dict[str, Any]:
    return {"id": field_id, "label": field_id, "kind": kind, "required": required, "default": None,
            "choices": [{"value": c, "label": c.upper()} for c in choices] if choices else None, "regexp": regexp}


#: What the catalog describes for a few banks (the real catalog is tested on real modules in test_catalog.py)
FAKE_BANKS = [
    {"module": "boursorama", "name": "Boursorama", "positions": True,
     "fields": [_field("login", "text"), _field("password", "password"), _field("identity", "text", required=False)]},
    {"module": "fortuneo", "name": "Fortuneo", "positions": True, "fields": [_field("login", "text"), _field("password", "password")]},
    {"module": "bforbank", "name": "BforBank", "positions": True,
     "fields": [_field("login", "text"), _field("password", "password"), _field("birthdate", "date")]},
    {"module": "cragr", "name": "Crédit Agricole", "positions": False,
     "fields": [_field("website", "select", choices=["www.ca-paris.fr", "www.ca-cmds.fr"]), _field("login", "text"), _field("password", "password")]},
    # As Woob describes it: a password of digits only, an optional user id of up to 8 capitals or digits
    {"module": "caissedepargne", "name": "Caisse d'Épargne", "positions": True,
     "fields": [_field("login", "text"), _field("password", "password", regexp=r"^\d+$"),
                _field("nuser", "text", required=False, regexp=r"^[A-Z0-9]{0,8}$")]},
]


def request(**overrides: Any) -> dict[str, Any]:
    return {"key": "conn-1", "module": "boursorama", "credentials": dict(CREDENTIALS), **overrides}
