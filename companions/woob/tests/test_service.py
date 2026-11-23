"""Bank sessions: two-factor only on login, never on a sync; limits; no secret anywhere."""

import json
import os
import stat

import pytest
from woob.exceptions import (
    ActionNeeded,
    AppValidation,
    BrowserIncorrectPassword,
    BrowserUnavailable,
    NeedInteractiveFor2FA,
    SentOTPQuestion,
)

from glassfolio_woob.service import DAILY_SESSIONS, WorkerError

from .conftest import CREDENTIALS, request


def test_login_without_challenge_lists_accounts_and_saves_the_session(make_service):
    service, fake = make_service()
    result = service.login(request())
    assert result["state"] == "connected"
    assert [a["id"] for a in result["accounts"]] == ["pea-1", "cc-1", "la-1"]  # the loan is skipped
    assert fake.backends[0].saved is True
    assert fake.backends[0].config["request_information"].get() == {}
    assert fake.built[0] == ("boursorama", CREDENTIALS, "conn-1")


def test_sms_code_challenge_then_answer(make_service):
    service, fake = make_service(steps=[SentOTPQuestion("code", medium_type="sms", medium_label="06 •• •• •• 12", message="Code reçu par SMS")])
    challenge = service.login(request())
    assert challenge["state"] == "challenge"
    assert challenge["kind"] == "code"
    assert challenge["mediumLabel"] == "06 •• •• •• 12"

    result = service.answer({"challengeId": challenge["challengeId"], "value": "123456"})
    assert result["state"] == "connected"
    assert fake.backends[0].config["code"].get() == "123456"
    # The challenge is single-use
    with pytest.raises(WorkerError) as error:
        service.answer({"challengeId": challenge["challengeId"], "value": "123456"})
    assert error.value.code == "challenge_expired"


def test_image_challenge_shows_the_bank_image_then_takes_the_code(make_service):
    # Crédit Mutuel / CIC Digipass: the user reads an image with the bank's device and types the code it gives
    from woob.exceptions import ImageQuestion

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    service, fake = make_service(steps=[ImageQuestion("code", "image/png", png, "Saisissez le code Digipass")])
    challenge = service.login(request())
    assert challenge["kind"] == "code"
    assert challenge["image"].startswith("data:image/png;base64,")
    assert service.answer({"challengeId": challenge["challengeId"], "value": "12345678"})["state"] == "connected"
    assert fake.backends[0].config["code"].get() == "12345678"


def test_image_challenge_never_relays_other_types_or_huge_images():
    from glassfolio_woob.service import CHALLENGE_IMAGE_MAX_BYTES, challenge_image

    assert challenge_image("image/svg+xml", b"<svg/>") is None
    assert challenge_image("text/html", b"<script>") is None
    assert challenge_image("image/png", b"\x00" * (CHALLENGE_IMAGE_MAX_BYTES + 1)) is None
    assert challenge_image("image/gif", b"GIF89a") == "data:image/gif;base64,R0lGODlh"


def test_app_validation_resumes(make_service):
    service, fake = make_service(steps=[AppValidation("Validez dans votre application")])
    challenge = service.login(request())
    assert challenge["kind"] == "app"
    result = service.answer({"challengeId": challenge["challengeId"]})
    assert result["state"] == "connected"
    assert fake.backends[0].config["resume"].get() is True


def test_challenge_expires_after_ten_minutes(make_service):
    now = [1000.0]
    service, _ = make_service(steps=[SentOTPQuestion("code")], clock=lambda: now[0])
    challenge = service.login(request())
    now[0] += 601
    with pytest.raises(WorkerError) as error:
        service.answer({"challengeId": challenge["challengeId"], "value": "1"})
    assert error.value.code == "challenge_expired"


def test_sync_is_never_interactive(make_service):
    service, fake = make_service(steps=[NeedInteractiveFor2FA()])
    with pytest.raises(WorkerError) as error:
        service.holdings(request())
    assert error.value.code == "reauth_required"
    assert fake.backends[0].config["request_information"].get() is None


def test_a_challenge_raised_during_a_sync_asks_for_a_new_login(make_service):
    # Fortuneo can reach its SMS page without checking it runs interactively
    service, _ = make_service(steps=[SentOTPQuestion("code")])
    with pytest.raises(WorkerError) as error:
        service.holdings(request(module="fortuneo"))
    assert error.value.code == "reauth_required"


@pytest.mark.parametrize("raised, code", [
    (BrowserIncorrectPassword(), "auth_failed"),
    (BrowserUnavailable(), "bank_unavailable"),
    (ActionNeeded("Acceptez les nouvelles CGU sur le site"), "action_needed"),
])
def test_bank_errors_become_stable_codes(make_service, raised, code):
    service, _ = make_service(steps=[raised])
    with pytest.raises(WorkerError) as error:
        service.login(request())
    assert error.value.code == code


def test_holdings_reads_positions_and_balances(make_service):
    service, fake = make_service()
    result = service.holdings(request())
    by_id = {a["id"]: a for a in result["accounts"]}
    assert [h["kind"] for h in by_id["pea-1"]["holdings"]] == ["security", "cash"]
    assert by_id["cc-1"]["holdings"][0]["quantity"] == "1543.2"
    assert by_id["la-1"]["wrapper"] == "LIVRET"
    assert "iter_investment:cc-1" not in fake.backends[0].calls


def test_positions_are_kept_fifteen_minutes(make_service):
    now = [1000.0]
    service, fake = make_service(clock=lambda: now[0])
    service.holdings(request())
    assert service.holdings(request())["cached"] is True
    assert len(fake.backends) == 1
    now[0] += 15 * 60 + 1
    assert service.holdings(request())["cached"] is False
    assert len(fake.backends) == 2


def test_daily_session_cap(make_service):
    service, _ = make_service()
    for _ in range(DAILY_SESSIONS):
        service.login(request())
    with pytest.raises(WorkerError) as error:
        service.login(request())
    assert error.value.code == "rate_limited"


def test_rejects_unknown_banks_keys_and_missing_credentials(make_service):
    service, _ = make_service()
    for bad, code in [
        (request(module="bnp"), "unsupported_bank"),
        (request(key="../../etc/passwd"), "invalid_request"),
        (request(credentials={"login": "1"}), "invalid_request"),
    ]:
        with pytest.raises(WorkerError) as error:
            service.login(bad)
        assert error.value.code == code


def test_dates_stay_iso_and_choices_are_checked(make_service):
    # Woob date values accept ISO dates whatever their display format
    service, fake = make_service()
    service.login(request(module="bforbank", credentials={"login": "1", "password": "1234", "birthdate": "1990-04-02"}))
    assert fake.built[0][1]["birthdate"] == "1990-04-02"
    service.login(request(module="cragr", credentials={"website": "www.ca-paris.fr", "login": "1", "password": "p"}))
    assert fake.built[1][1]["website"] == "www.ca-paris.fr"
    for bad in [
        {"website": "evil.example", "login": "1", "password": "p"},
        {"login": "1", "password": "p"},
        {"website": "www.ca-paris.fr", "login": "1", "password": "p", "extra": "x"},
    ]:
        with pytest.raises(WorkerError) as error:
            service.login(request(module="cragr", credentials=bad))
        assert error.value.code == "invalid_request"


def test_module_patterns_are_checked_before_any_connection(make_service):
    # Caisse d'Épargne's module only takes a numeric password: a letter never reaches Woob, and the error names
    # the field without ever quoting its value
    service, fake = make_service()
    with pytest.raises(WorkerError) as error:
        service.login(request(module="caissedepargne", credentials={"login": "1234567890", "password": "abc123"}))
    assert (error.value.code, error.value.message) == ("invalid_format", "password")
    assert fake.built == []
    service.login(request(module="caissedepargne", credentials={"login": "1234567890", "password": "12345678", "nuser": ""}))
    assert fake.built[0][1] == {"login": "1234567890", "password": "12345678"}


def test_woob_format_errors_and_bank_messages(make_service):
    from woob.exceptions import BrowserIncorrectPassword
    from woob.tools.backend import Module

    from glassfolio_woob.service import map_error

    refused = map_error(Module.ConfigError('Configuration error for field "password": Value "abc" does not match', bad_fields=["password"]), True)
    assert (refused.code, refused.message) == ("invalid_format", "password")
    assert "abc" not in str(refused)
    assert map_error(BrowserIncorrectPassword(), True).message == ""
    said = map_error(BrowserIncorrectPassword("L'espace client n'a pas été trouvé avec le type de compte renseigné."), True)
    assert (said.code, said.message) == ("auth_failed", "L'espace client n'a pas été trouvé avec le type de compte renseigné.")


def test_unavailable_and_unknown_errors_say_where_the_module_failed():
    # No log is kept (a module may print a bank page): the error itself must tell where it broke
    from woob.exceptions import BrowserUnavailable

    from glassfolio_woob.service import map_error

    namespace: dict = {}
    code = compile("def do_login():\n    raise BrowserUnavailable()\n", "/data/woob-modules/caissedepargne/browser.py", "exec")
    exec(code, {"BrowserUnavailable": BrowserUnavailable}, namespace)
    try:
        namespace["do_login"]()
    except BrowserUnavailable as error:
        mapped = map_error(error, True)
    assert (mapped.code, mapped.message) == ("bank_unavailable", "BrowserUnavailable · caissedepargne/browser.py:2 do_login")
    assert map_error(BrowserUnavailable("Site en maintenance"), True).message == "Site en maintenance"


def test_a_woob_server_error_names_the_status_host_and_module_line():
    # Woob's ServerError is a BrowserUnavailable: its message alone ("503 Server Error") hid which site failed
    import requests
    from woob.browser.exceptions import ServerError

    from glassfolio_woob.service import map_error

    response = requests.Response()
    response.status_code = 503
    response.request = requests.Request("GET", "https://www.caisse-epargne.fr/ria/pas/configuration/config.json?ts=1").prepare()
    mapped = map_error(ServerError("503 Server Error: Service Temporarily Unavailable", response=response), True)
    assert mapped.code == "bank_unavailable"
    assert mapped.message.startswith("HTTP 503 · www.caisse-epargne.fr · ServerError")
    assert "ts=1" not in mapped.message


def test_http_errors_name_the_status_and_host_never_the_path():
    import requests

    from glassfolio_woob.service import map_error

    response = requests.Response()
    response.status_code = 403
    response.request = requests.Request("GET", "https://www.caisse-epargne.fr/login?token=SECRET").prepare()
    mapped = map_error(requests.HTTPError(response=response), True)
    assert (mapped.code, mapped.message) == ("bank_unavailable", "HTTP 403 · www.caisse-epargne.fr")


def test_optional_fields_may_stay_empty(make_service):
    service, fake = make_service()
    service.login(request(credentials={"login": "1", "password": "p", "identity": ""}))
    assert fake.built[0][1] == {"login": "1", "password": "p"}


def test_status_lists_the_banks_with_their_forms(make_service):
    service, _ = make_service()
    status = service.status()
    assert [bank["module"] for bank in status["banks"]] == ["bforbank", "boursorama", "caissedepargne", "cragr", "fortuneo"]
    assert next(bank for bank in status["banks"] if bank["module"] == "cragr")["fields"][0]["kind"] == "select"


def test_sessions_folder_is_private_and_forget_removes_the_session(make_service, tmp_path):
    service, _ = make_service()
    assert stat.S_IMODE(os.stat(tmp_path / "data" / "sessions").st_mode) == 0o700
    session = tmp_path / "data" / "sessions" / "conn-1.storage"
    session.write_text("browser_state: {}")
    assert service.forget({"key": "conn-1"}) == {"forgotten": True}
    assert not session.exists()


def test_no_credential_in_any_answer(make_service):
    service, _ = make_service(steps=[BrowserIncorrectPassword("secret-Passw0rd refused")])
    with pytest.raises(WorkerError) as error:
        service.login(request())
    # A bank message that quotes what the user typed is dropped, the code stays
    assert error.value.code == "auth_failed"
    assert "secret-Passw0rd" not in error.value.message
    assert "secret-Passw0rd" not in str(error.value)
    service2, _ = make_service()
    assert "secret-Passw0rd" not in json.dumps(service2.holdings(request()))
