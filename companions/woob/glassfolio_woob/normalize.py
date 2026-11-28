"""Woob objects → the JSON GlassFolio reads (TGLA-236).

Decimals travel as plain strings ("12.3456", never scientific notation): Woob computes in Decimal and
the app does its own rounding. Nothing here talks to a bank; every function is pure.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from woob.capabilities.bank import Account, Transaction
from woob.capabilities.base import empty
from woob.tools.capabilities.bank.investments import is_isin_valid

T = Account

#: Woob account type → GlassFolio account type, tax wrapper and what to read on it.
#: "investment": positions (iter_investment); "cash": the balance; absent: skipped (debts, cards).
ACCOUNT_TYPES: dict[Any, tuple[str, str | None, str]] = {
    T.TYPE_CHECKING: ("checking", None, "cash"),
    T.TYPE_JOINT: ("checking", None, "cash"),
    T.TYPE_SAVINGS: ("savings", "LIVRET", "cash"),
    T.TYPE_DEPOSIT: ("savings", "LIVRET", "cash"),
    T.TYPE_LIVRET_A: ("savings", "LIVRET", "cash"),
    T.TYPE_LIVRET_B: ("savings", "LIVRET", "cash"),
    T.TYPE_LDDS: ("savings", "LIVRET", "cash"),
    T.TYPE_PEL: ("savings", "LIVRET", "cash"),
    T.TYPE_CEL: ("savings", "LIVRET", "cash"),
    T.TYPE_CSL: ("savings", "LIVRET", "cash"),
    T.TYPE_CAT: ("savings", "LIVRET", "cash"),
    T.TYPE_MARKET: ("investment", "CTO", "investment"),
    T.TYPE_PEA: ("investment", "PEA", "investment"),
    T.TYPE_LIFE_INSURANCE: ("investment", "ASSURANCE_VIE", "investment"),
    T.TYPE_CAPITALISATION: ("investment", "ASSURANCE_VIE", "investment"),
    T.TYPE_PER: ("investment", "PER", "investment"),
    T.TYPE_PERP: ("investment", "PER", "investment"),
    T.TYPE_PERCO: ("investment", "PER", "investment"),
    T.TYPE_MADELIN: ("investment", "PER", "investment"),
    T.TYPE_RSP: ("investment", "PER", "investment"),
    T.TYPE_PEE: ("investment", "OTHER", "investment"),
    T.TYPE_REAL_ESTATE: ("investment", "OTHER", "investment"),
    T.TYPE_CROWDLENDING: ("investment", "OTHER", "investment"),
    T.TYPE_UNKNOWN: ("other", None, "cash"),
}

LIQUIDITY_CODE = "XX-liquidity"


def dec(value: Any) -> str | None:
    """A Decimal (or number) as a plain string, or None when Woob has no value."""
    if empty(value):
        return None
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    text = format(number.normalize(), "f")
    return "0" if text in ("-0", "") else text


def text(value: Any) -> str | None:
    return None if empty(value) else str(value).strip() or None


def account_currency(account: Any) -> str:
    return (text(getattr(account, "currency", None)) or "EUR").upper()


def account_kind(account: Any) -> tuple[str, str | None, str] | None:
    """(GlassFolio type, wrapper, "investment" | "cash"), or None for an account not synced."""
    mapped = ACCOUNT_TYPES.get(getattr(account, "type", T.TYPE_UNKNOWN))
    if mapped is None:
        return None
    gf_type, wrapper, kind = mapped
    label = (text(getattr(account, "label", None)) or "").upper()
    if wrapper == "PEA" and "PME" in label:
        wrapper = "PEA_PME"
    return gf_type, wrapper, kind


def normalize_account(account: Any) -> dict[str, Any] | None:
    """One bank account as the app lists it, or None for debts and cards."""
    kind = account_kind(account)
    if kind is None:
        return None
    gf_type, wrapper, read = kind
    return {
        "id": str(account.id),
        "label": text(getattr(account, "label", None)) or str(account.id),
        "type": gf_type,
        "wrapper": wrapper,
        "kind": read,
        "currency": account_currency(account),
        "balance": dec(getattr(account, "balance", None)),
    }


def isin_of(investment: Any) -> str | None:
    code = text(getattr(investment, "code", None))
    if not code:
        return None
    code = code.upper()
    code_type = (text(getattr(investment, "code_type", None)) or "").upper()
    if code_type == "ISIN" or is_isin_valid(code):
        return code
    return None


def normalize_investment(investment: Any, currency: str) -> tuple[dict[str, Any] | None, str | None]:
    """One line of a portfolio, plus an optional warning code. (None, warning) skips the line."""
    code = text(getattr(investment, "code", None)) or ""
    label = text(getattr(investment, "label", None)) or code or "?"
    valuation = dec(getattr(investment, "valuation", None))

    if code == LIQUIDITY_CODE:
        if valuation is None:
            return None, "liquidity_without_value"
        return {"kind": "cash", "name": label, "currency": currency, "quantity": valuation, "marketValue": valuation}, None

    original = (text(getattr(investment, "original_currency", None)) or "").upper()
    line_currency = original or currency
    quantity = dec(getattr(investment, "quantity", None))
    unit_value = dec(getattr(investment, "original_unitvalue", None) if original else None) or dec(
        getattr(investment, "unitvalue", None)
    )
    avg_cost = dec(getattr(investment, "original_unitprice", None) if original else None) or dec(
        getattr(investment, "unitprice", None)
    )
    isin = isin_of(investment)

    # Euro fund of a life insurance: no quantity, no unit price, only a value that grows with interest
    if quantity is None and unit_value is None:
        if valuation is None:
            return None, "line_without_value"
        return {
            "kind": "euro_fund",
            "code": code or None,
            "name": label,
            "currency": currency,
            "quantity": valuation,
            "marketValue": valuation,
        }, None

    warning = None
    if quantity is None and unit_value and valuation:
        quantity = dec(Decimal(valuation) / Decimal(unit_value))
        warning = "quantity_estimated"
    if quantity is None:
        return None, "line_without_quantity"

    return {
        "kind": "security",
        "isin": isin,
        "code": code or None,
        "symbol": text(getattr(investment, "stock_symbol", None)),
        "name": label,
        "quantity": quantity,
        "avgCost": avg_cost,
        "unitValue": unit_value,
        "currency": line_currency,
        "marketValue": valuation,
    }, warning


def normalize_holdings(account: Any, investments: list[Any] | None) -> dict[str, Any]:
    """An account with its lines: the positions of an investment account, or its balance as cash."""
    listed = normalize_account(account)
    if listed is None:
        raise ValueError("account not synced")
    currency = listed["currency"]
    holdings: list[dict[str, Any]] = []
    warnings: list[str] = []

    if listed["kind"] == "investment":
        if investments is None:
            # The bank module cannot list positions: nothing is written, rather than a wrong cash line
            warnings.append("positions_unavailable")
        for investment in investments or []:
            line, warning = normalize_investment(investment, currency)
            if line:
                holdings.append(line)
            if warning:
                warnings.append(warning)
    elif listed["balance"] is not None:
        # An overdrawn checking account keeps its negative balance (the app reconciles it with the operations); the
        # warning tells a sync without operations to leave it alone
        holdings.append({"kind": "cash", "name": listed["label"], "currency": currency, "quantity": listed["balance"], "marketValue": listed["balance"]})
        if Decimal(listed["balance"]) < 0:
            warnings.append("negative_balance")

    return {**listed, "holdings": holdings, "warnings": warnings}


#: Woob operation type → a stable lower-case name ("card", "transfer", "withdrawal", "loan_payment"…), read from
#: the TYPE_* constants so a new Woob type is named without a release.
TRANSACTION_TYPES: dict[Any, str] = {
    getattr(Transaction, name): name[len("TYPE_"):].lower() for name in dir(Transaction) if name.startswith("TYPE_")
}


def day_of(value: Any) -> str | None:
    """A Woob date or datetime as YYYY-MM-DD, or None."""
    if empty(value):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def normalize_transaction(transaction: Any, seen: dict[str, int]) -> dict[str, Any] | None:
    """One bank operation (TGLA-254). `seen` counts identical operations of the same read, so two coffees at the
    same price on the same day keep two distinct ids. Woob ids are often empty: the id then comes from the
    operation date, the amount and the raw label, stable from one read to the next."""
    booked = day_of(transaction.date)
    operated = day_of(transaction.rdate)
    amount = dec(transaction.amount)
    if not (operated or booked) or amount is None:
        return None
    raw = text(transaction.raw) or text(transaction.label) or ""
    label = text(transaction.label) or raw
    native = text(getattr(transaction, "id", None))
    base = native or "h" + hashlib.sha256(f"{operated or booked}|{amount}|{raw}".encode()).hexdigest()[:20]
    count = seen.get(base, 0)
    seen[base] = count + 1
    kind = transaction.type if not empty(transaction.type) else None
    return {
        "id": base if count == 0 else f"{base}-{count}",
        # The day the operation was made (card payment day), else the booking day: matches a CSV "date opération"
        "date": operated or booked,
        "bookingDate": booked,
        "valueDate": day_of(transaction.vdate),
        "amount": amount,
        "label": label,
        "raw": raw,
        "type": TRANSACTION_TYPES.get(kind, "unknown"),
        "category": text(transaction.category),
    }
