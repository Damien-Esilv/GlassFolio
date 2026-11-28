"""Woob → GlassFolio conversion: the fields the BoursoBank PEA test of 23/11/2026 validated."""

from woob.capabilities.bank import Account

from glassfolio_woob.normalize import dec, normalize_account, normalize_holdings, normalize_investment

from .conftest import account, investment


def test_decimals_are_plain_strings():
    from decimal import Decimal

    assert dec(Decimal("1E-8")) == "0.00000001"
    assert dec(Decimal("12.3400")) == "12.34"
    assert dec(Decimal("-0")) == "0"


def test_security_line_keeps_isin_quantity_and_unit_cost():
    line, warning = normalize_investment(
        investment("FR0011869353", "Amundi PEA Monde", quantity="10", unitprice="42.15", unitvalue="45", valuation="450"), "EUR"
    )
    assert warning is None
    assert line == {
        "kind": "security", "isin": "FR0011869353", "code": "FR0011869353", "symbol": None, "name": "Amundi PEA Monde",
        "quantity": "10", "avgCost": "42.15", "unitValue": "45", "currency": "EUR", "marketValue": "450",
    }


def test_isin_is_recognised_without_code_type():
    line, _ = normalize_investment(investment("IE00B4L5Y983", "iShares Core MSCI World", quantity="1", valuation="90", code_type=None), "EUR")
    assert line["isin"] == "IE00B4L5Y983"
    line, _ = normalize_investment(investment("QS0002005324", "Fonds", quantity="1", valuation="90", code_type="AMF"), "EUR")
    assert line["isin"] is None


def test_foreign_currency_uses_the_original_unit_cost():
    line, _ = normalize_investment(
        investment("US0378331005", "Apple", quantity="2", unitprice="150", unitvalue="180", valuation="330",
                   original_currency="USD", original_unitprice="170"), "EUR"
    )
    assert line["currency"] == "USD"
    assert line["avgCost"] == "170"


def test_liquidity_line_becomes_cash():
    line, _ = normalize_investment(investment("XX-liquidity", "Liquidités", valuation="12.34", code_type=None), "EUR")
    assert line == {"kind": "cash", "name": "Liquidités", "currency": "EUR", "quantity": "12.34", "marketValue": "12.34"}


def test_euro_fund_has_its_value_as_quantity():
    line, _ = normalize_investment(investment("FDE", "Fonds en euros", valuation="5000.12", code_type=None), "EUR")
    assert line["kind"] == "euro_fund"
    assert line["quantity"] == "5000.12"


def test_missing_quantity_is_estimated_from_value():
    line, warning = normalize_investment(investment("FR0011869353", "ETF", unitvalue="50", valuation="500"), "EUR")
    assert line["quantity"] == "10"
    assert warning == "quantity_estimated"


def test_account_types_and_wrappers():
    assert normalize_account(account("1", Account.TYPE_PEA, "PEA"))["wrapper"] == "PEA"
    assert normalize_account(account("2", Account.TYPE_PEA, "PEA-PME"))["wrapper"] == "PEA_PME"
    assert normalize_account(account("3", Account.TYPE_MARKET, "CTO"))["wrapper"] == "CTO"
    assert normalize_account(account("4", Account.TYPE_LIFE_INSURANCE, "AV"))["wrapper"] == "ASSURANCE_VIE"
    assert normalize_account(account("5", Account.TYPE_LIVRET_A, "Livret A"))["type"] == "savings"
    assert normalize_account(account("6", Account.TYPE_CHECKING, "CC"))["kind"] == "cash"
    assert normalize_account(account("7", Account.TYPE_LOAN, "Prêt")) is None
    assert normalize_account(account("8", Account.TYPE_CARD, "Carte")) is None


def test_cash_account_balance_and_negative_balance():
    held = normalize_holdings(account("cc", Account.TYPE_CHECKING, "CC", "100.5"), None)
    assert held["holdings"] == [{"kind": "cash", "name": "CC", "currency": "EUR", "quantity": "100.5", "marketValue": "100.5"}]
    overdrawn = normalize_holdings(account("cc", Account.TYPE_CHECKING, "CC", "-10"), None)
    assert overdrawn["holdings"] == [{"kind": "cash", "name": "CC", "currency": "EUR", "quantity": "-10", "marketValue": "-10"}]
    assert overdrawn["warnings"] == ["negative_balance"]


def test_investment_account_without_positions_writes_nothing():
    held = normalize_holdings(account("pea", Account.TYPE_PEA, "PEA", "1000"), None)
    assert held["holdings"] == [] and held["warnings"] == ["positions_unavailable"]
