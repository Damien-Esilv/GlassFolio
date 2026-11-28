"""Bank operations of checking and savings accounts (TGLA-254): read in the session of the balances, stable ids,
the start day honoured, the coming ones kept apart, and a refused history never breaking the balances."""

from __future__ import annotations

from woob.capabilities.bank import Account, Transaction
from woob.exceptions import BrowserUnavailable

from glassfolio_woob.normalize import normalize_transaction, TRANSACTION_TYPES

from .conftest import operation, request

HISTORY = {
    "cc-1": [
        operation("2026-03-12", "-42.80", "CARTE 11/03 CARREFOUR CITY", category="Alimentation", rday="2026-03-11"),
        operation("2026-03-10", "3250", "VIR SEPA RECU ACME SALAIRE", type=Transaction.TYPE_TRANSFER, id="bank-77"),
        operation("2026-03-05", "-3.20", "CARTE CAFE", rday="2026-03-04"),
        operation("2026-03-05", "-3.20", "CARTE CAFE", rday="2026-03-04"),
        operation("2025-01-02", "-950", "PRLV LOYER"),
    ],
    "la-1": [operation("2026-01-02", "68.40", "INTERETS CREDITEURS", type=Transaction.TYPE_BANK)],
}
COMING = {"cc-1": [operation("2026-03-30", "-79", "PRLV SEPA EDF", type=Transaction.TYPE_ORDER)]}


def test_normalize_transaction_keeps_the_operation_day_and_a_stable_id():
    seen: dict[str, int] = {}
    first = normalize_transaction(HISTORY["cc-1"][0], seen)
    assert first == {
        "id": first["id"], "date": "2026-03-11", "bookingDate": "2026-03-12", "valueDate": None, "amount": "-42.8",
        "label": "Carte 11/03 Carrefour City", "raw": "CARTE 11/03 CARREFOUR CITY", "type": "card", "category": "Alimentation",
    }
    assert first["id"].startswith("h")
    # Same operation read again later: same id; two identical coffees: two ids
    assert normalize_transaction(HISTORY["cc-1"][0], {})["id"] == first["id"]
    coffees = [normalize_transaction(op, seen)["id"] for op in HISTORY["cc-1"][2:4]]
    assert coffees[1] == f"{coffees[0]}-1"
    assert normalize_transaction(HISTORY["cc-1"][1], seen)["id"] == "bank-77"
    assert TRANSACTION_TYPES[Transaction.TYPE_LOAN_PAYMENT] == "loan_payment"


def test_holdings_with_history_reads_operations_of_cash_accounts_only(make_service):
    service, fake = make_service(history=HISTORY, coming=COMING)
    result = service.holdings(request(history={"since": "2025-06-01"}))
    by_id = {a["id"]: a for a in result["accounts"]}
    assert [op["raw"] for op in by_id["cc-1"]["transactions"]] == [
        "CARTE 11/03 CARREFOUR CITY", "VIR SEPA RECU ACME SALAIRE", "CARTE CAFE", "CARTE CAFE",
    ]
    assert [op["raw"] for op in by_id["cc-1"]["coming"]] == ["PRLV SEPA EDF"]
    assert by_id["la-1"]["transactions"][0]["amount"] == "68.4"
    assert "transactions" not in by_id["pea-1"]
    calls = fake.backends[0].calls
    assert "iter_history:pea-1" not in calls and "iter_history:cc-1" in calls
    # One bank session for balances, positions and operations
    assert len(fake.backends) == 1


def test_a_cached_read_without_history_does_not_answer_a_history_request(make_service):
    service, fake = make_service(history=HISTORY)
    service.holdings(request())
    assert service.holdings(request(history={"since": "2026-01-01"}))["cached"] is False
    # Now cached with operations since 2026-01-01: a later start day is covered, an earlier one is not
    assert service.holdings(request(history={"since": "2026-02-01"}))["cached"] is True
    assert service.holdings(request(history={"since": "2025-01-01"}))["cached"] is False
    assert len(fake.backends) == 3


def test_a_refused_history_never_breaks_the_balances(make_service):
    service, _ = make_service(history={"cc-1": BrowserUnavailable("down")}, coming={"cc-1": NotImplementedError()})
    by_id = {a["id"]: a for a in service.holdings(request(history={"since": "2025-06-01"}))["accounts"]}
    assert by_id["cc-1"]["transactions"] is None
    assert by_id["cc-1"]["historyWarnings"] == ["history_failed"]
    assert by_id["cc-1"]["coming"] == []
    assert by_id["cc-1"]["holdings"][0]["quantity"] == "1543.2"


def test_a_malformed_start_day_is_refused(make_service):
    service, _ = make_service()
    try:
        service.holdings(request(history={"since": "next week"}))
    except Exception as error:  # noqa: BLE001
        assert getattr(error, "code", "") == "invalid_request"
    else:
        raise AssertionError("expected invalid_request")


def test_deferred_card_payments_go_to_their_checking_account(make_service):
    from .conftest import PEA_ACCOUNTS, account
    card = account("card-1", Account.TYPE_CARD, "Visa différée")
    card.parent = PEA_ACCOUNTS[1]
    history = {
        **HISTORY,
        "card-1": [operation("2026-03-10", "-42.00", "CARTE 08/03 FNAC", type=Transaction.TYPE_DEFERRED_CARD, rday="2026-03-08"),
                   operation("2026-03-10", "-9.90", "CARTE 09/03 CINEMA", type=Transaction.TYPE_DEFERRED_CARD, rday="2026-03-09")],
    }
    service, _ = make_service(history=history, accounts=[*PEA_ACCOUNTS, card])
    by_id = {a["id"]: a for a in service.holdings(request(history={"since": "2025-06-01"}))["accounts"]}
    assert "card-1" not in by_id
    payments = by_id["cc-1"]["cardTransactions"]
    assert [(p["date"], p["amount"], p["type"]) for p in payments] == [("2026-03-08", "-42", "deferred_card"), ("2026-03-09", "-9.9", "deferred_card")]
    assert all(p["id"].startswith("card-card-1-") for p in payments)


def test_a_card_that_cannot_be_read_only_warns(make_service):
    from .conftest import PEA_ACCOUNTS, account
    card = account("card-1", Account.TYPE_CARD, "Visa différée")
    card.parent = PEA_ACCOUNTS[1]
    service, _ = make_service(history={**HISTORY, "card-1": BrowserUnavailable("down")}, accounts=[*PEA_ACCOUNTS, card])
    by_id = {a["id"]: a for a in service.holdings(request(history={"since": "2025-06-01"}))["accounts"]}
    assert "cardTransactions" not in by_id["cc-1"]
    assert by_id["cc-1"]["historyWarnings"] == ["card_history_failed"]
    assert len(by_id["cc-1"]["transactions"]) == 4
