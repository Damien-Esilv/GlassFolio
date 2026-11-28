"""Bank sessions through Woob (TGLA-236).

Rules this file enforces:
- Credentials arrive with each request and are never written anywhere: Woob only gets them as backend
  parameters, in memory. What is saved is the Woob session (cookies, trusted device), one YAML file per
  connection in a 0700 folder, so the bank does not ask for a code at every sync.
- Only ``login`` (a click of the user) may trigger a two-factor challenge. Every other call runs with
  ``request_information = None``: Woob then refuses to start a challenge, and a challenge raised anyway
  (Fortuneo checks nothing before sending its SMS) is reported as ``reauth_required``.
- A bank is not hammered: positions are kept 15 minutes, a connection opens at most 10 bank sessions a
  day, and one call at a time per connection.
- Nothing is logged: no credential, no answer from the bank.
"""

from __future__ import annotations

import base64
import json
import os
import re
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .catalog import candidate_bank_modules, describe_banks
from .updates import ModuleSource, UpdateError
from .normalize import normalize_account, normalize_holdings, normalize_transaction


KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
CHALLENGE_TTL_S = 10 * 60
POSITIONS_TTL_S = 15 * 60
DAILY_SESSIONS = 10
#: Operations read per account and per sync, at most (a year of a busy account is a few thousand)
HISTORY_MAX_OPERATIONS = 5000
COMING_MAX_OPERATIONS = 300
#: Banks usually list newest first; after this many operations older than the start day in a row, stop reading
HISTORY_OLDER_STOP = 40
ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_FIELD_LENGTH = 256


class WorkerError(Exception):
    """An error the app understands: ``code`` is stable, ``message`` is safe to show (no secret)."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message


@dataclass
class Pending:
    """A two-factor challenge waiting for the user's answer, with the live Woob backend that raised it."""

    key: str
    backend: Any
    kind: str  # "code" | "app"
    field_id: str | None
    created: float


@dataclass
class KeyState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    day: str = ""
    sessions: int = 0
    positions: tuple[float, list[dict[str, Any]]] | None = None
    #: First day of the operations kept with `positions` (None: positions read without history)
    history_since: str | None = None


#: Images a bank may show for its code (Crédit Mutuel and CIC's Digipass): small, and of a type a browser draws safely
CHALLENGE_IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif")
CHALLENGE_IMAGE_MAX_BYTES = 256 * 1024


def challenge_image(mime_type: Any, data: Any) -> str | None:
    """The image of an ImageQuestion as a data URL, or None when it is not a small PNG, JPEG or GIF."""
    if mime_type not in CHALLENGE_IMAGE_TYPES or not isinstance(data, bytes) or not 0 < len(data) <= CHALLENGE_IMAGE_MAX_BYTES:
        return None
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"


def secrets_of(backend: Any = None, credentials: dict[str, str] | None = None) -> list[str]:
    """Every value the user typed for this bank (from the form, or from the live backend's configuration)."""
    values = list((credentials or {}).values())
    config = getattr(backend, "config", None)
    for field in (config.values() if hasattr(config, "values") else []):
        try:
            value = field.get()
        except Exception:  # noqa: BLE001 - a transient field may hold anything
            continue
        if isinstance(value, str):
            values.append(value)
    return [value for value in values if isinstance(value, str) and len(value.strip()) >= 3]


def map_error(error: BaseException, interactive: bool, secrets: list[str] | None = None) -> WorkerError:
    """Woob exception → stable error code, with the bank's message where it helps the user.

    A bank module may put what the user typed in its message: a message quoting any credential is dropped.
    """
    mapped = _map_error(error, interactive)
    if mapped.message and any(secret.strip().lower() in mapped.message.lower() for secret in secrets or []):
        return WorkerError(mapped.code)
    return mapped


def where(error: BaseException) -> str:
    """Where a bank module failed, safe to show: the error type, the module file and line, never a value.

    The deepest frame outside Python, its site-packages and this worker is the bank module's own code.
    """
    import traceback

    place = None
    for frame, lineno in traceback.walk_tb(error.__traceback__):
        filename = frame.f_code.co_filename.replace("\\", "/")
        if "site-packages" in filename or "/glassfolio_woob/" in filename or re.search(r"/lib/python3[.\d]*/", filename):
            continue
        parts = filename.split("/")
        place = f"{'/'.join(parts[-2:])}:{lineno} {frame.f_code.co_name}"
    return f"{type(error).__name__} · {place}" if place else type(error).__name__


def _http_detail(error: BaseException) -> str:
    """HTTP status and host of a failed request (never its path or query, which may carry tokens)."""
    from urllib.parse import urlparse

    response = getattr(error, "response", None)
    request = getattr(error, "request", None) or getattr(response, "request", None)
    host = urlparse(getattr(request, "url", "") or "").hostname or ""
    status = getattr(response, "status_code", None)
    label = f"HTTP {status}" if status else type(error).__name__
    return f"{label} · {host}" if host else label


def _map_error(error: BaseException, interactive: bool) -> WorkerError:
    from woob.core.modules import ModuleLoadError
    from woob.exceptions import (
        ActionNeeded,
        AppValidationCancelled,
        AppValidationExpired,
        BrowserIncorrectPassword,
        BrowserInteraction,
        BrowserUnavailable,
        BrowserUserBanned,
        CaptchaQuestion,
        NeedInteractive,
    )

    from woob.tools.backend import Module

    if isinstance(error, WorkerError):
        return error
    if isinstance(error, Module.ConfigError):
        # A value the bank module refuses before any connection (e.g. a letter in a numeric password). Only the
        # field's name is kept: Woob's message may quote the value.
        bad_fields = list(getattr(error, "bad_fields", ()) or ())
        return WorkerError("invalid_format", str(bad_fields[0]) if bad_fields else "")
    if isinstance(error, NeedInteractive) or (isinstance(error, BrowserInteraction) and not interactive):
        return WorkerError("reauth_required")
    if isinstance(error, BrowserUserBanned):
        return WorkerError("account_locked")
    if isinstance(error, BrowserIncorrectPassword):
        # The bank's own words when the module gives some ("no client area for this account type")
        return WorkerError("auth_failed", str(error).strip()[:300])
    if isinstance(error, (AppValidationCancelled, AppValidationExpired)):
        return WorkerError("validation_refused")
    if isinstance(error, CaptchaQuestion):
        return WorkerError("action_needed", "captcha")
    if isinstance(error, ActionNeeded):
        return WorkerError("action_needed", str(error)[:300])
    if isinstance(error, ModuleLoadError):
        return WorkerError("unsupported_bank")
    if isinstance(error, BrowserUnavailable):
        # An HTTP answer (Woob's ServerError is both): its status and host, then where the module gave up.
        # Otherwise the bank's words when the module gives some, else where the module gave up.
        if getattr(error, "response", None) is not None:
            return WorkerError("bank_unavailable", f"{_http_detail(error)} · {where(error)}"[:300])
        return WorkerError("bank_unavailable", (str(error).strip() or where(error))[:300])
    try:
        import requests

        if isinstance(error, requests.RequestException):
            return WorkerError("bank_unavailable", _http_detail(error)[:300])
    except ImportError:  # pragma: no cover - requests ships with woob
        pass
    # Most often the bank changed its site and the module no longer understands it
    return WorkerError("unknown", where(error)[:300])


def _today() -> str:
    return date.today().isoformat()


class WoobService:
    """One instance per worker process. Thread-safe: each connection key has its own lock."""

    def __init__(
        self,
        modules_path: str | Path,
        data_dir: str | Path,
        woob_factory: Callable[[str], Any] | None = None,
        banks_provider: Callable[[], list[dict[str, Any]]] | None = None,
        module_source: ModuleSource | None = None,
        restart: Callable[[], None] | None = None,
        clock: Callable[[], float] = time.time,
        today: Callable[[], str] = _today,
    ) -> None:
        self.modules_path = str(modules_path)
        self.sessions_dir = Path(data_dir) / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.sessions_dir, 0o700)
        self._woob_factory = woob_factory
        self._banks_provider = banks_provider
        self._module_source = module_source
        self._restart = restart or (lambda: None)
        self._banks: dict[str, dict[str, Any]] | None = None
        self._woob: Any = None
        self._clock = clock
        self._today = today
        self._keys: dict[str, KeyState] = {}
        self._pending: dict[str, Pending] = {}
        self._guard = threading.Lock()

    # ---------------------------------------------------------------- helpers

    def _get_woob(self) -> Any:
        if self._woob is None:
            if self._woob_factory:
                self._woob = self._woob_factory(self.modules_path)
            else:
                from woob.core.woob import WoobBase

                self._woob = WoobBase(modules_path=self.modules_path)
        return self._woob

    def _state(self, key: str) -> KeyState:
        with self._guard:
            return self._keys.setdefault(key, KeyState())

    def _session_path(self, key: str) -> Path:
        return self.sessions_dir / f"{key}.storage"

    @staticmethod
    def _key(params: dict[str, Any]) -> str:
        key = params.get("key")
        if not isinstance(key, str) or not KEY_PATTERN.match(key):
            raise WorkerError("invalid_request", "key")
        return key

    def _bank_index(self) -> dict[str, dict[str, Any]]:
        """The banks this worker offers: every shipped bank module that loads (computed once, a few seconds)."""
        with self._guard:
            if self._banks is None:
                if self._banks_provider:
                    banks = self._banks_provider()
                else:
                    loader = self._get_woob().modules_loader
                    banks = describe_banks(loader, candidate_bank_modules(self.modules_path))
                self._banks = {bank["module"]: bank for bank in banks}
            return self._banks

    def _bank(self, params: dict[str, Any]) -> dict[str, Any]:
        module = params.get("module")
        bank = self._bank_index().get(module) if isinstance(module, str) else None
        if bank is None:
            raise WorkerError("unsupported_bank")
        return bank

    @staticmethod
    def _credentials(bank: dict[str, Any], params: dict[str, Any]) -> dict[str, str]:
        """The bank form's values, checked against the module's own fields (Woob checks formats again)."""
        raw = params.get("credentials")
        if not isinstance(raw, dict):
            raise WorkerError("invalid_request", "credentials")
        known = {spec["id"] for spec in bank["fields"]}
        if any(name not in known for name in raw):
            raise WorkerError("invalid_request", "unknown_field")
        values: dict[str, str] = {}
        for spec in bank["fields"]:
            value = raw.get(spec["id"])
            if value is None or (isinstance(value, str) and not value.strip()):
                if spec["required"]:
                    raise WorkerError("invalid_request", spec["id"])
                continue
            if not isinstance(value, str) or len(value) > MAX_FIELD_LENGTH:
                raise WorkerError("invalid_request", spec["id"])
            value = value.strip()
            if spec["kind"] == "select" and value not in {choice["value"] for choice in spec["choices"] or []}:
                raise WorkerError("invalid_request", spec["id"])
            if spec["kind"] == "date" and not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
                # Woob date values accept ISO dates whatever their display format
                raise WorkerError("invalid_request", spec["id"])
            if spec["kind"] != "date" and spec.get("regexp") and not re.match(spec["regexp"], value):
                # The module's own pattern, checked before any connection (Woob would refuse it the same way)
                raise WorkerError("invalid_format", spec["id"])
            values[spec["id"]] = value
        return values

    def _count_session(self, state: KeyState) -> None:
        today = self._today()
        if state.day != today:
            state.day, state.sessions = today, 0
        if state.sessions >= DAILY_SESSIONS:
            raise WorkerError("rate_limited")
        state.sessions += 1

    def _build(self, key: str, bank: dict[str, Any], credentials: dict[str, str], interactive: bool) -> Any:
        from woob.tools.storage import StandardStorage

        storage = StandardStorage(str(self._session_path(key)))
        backend = self._get_woob().build_backend(bank["module"], params=credentials, storage=storage, name=key)
        if "request_information" in backend.config:
            backend.config["request_information"].set({} if interactive else None)
        return backend

    def _close(self, key: str, backend: Any, save: bool) -> None:
        try:
            if save:
                backend.deinit()
        finally:
            path = self._session_path(key)
            if path.exists():
                os.chmod(path, 0o600)

    def _accounts(self, backend: Any) -> list[Any]:
        return list(backend.iter_accounts())

    def _expire_challenges(self) -> None:
        now = self._clock()
        with self._guard:
            for challenge_id in [cid for cid, item in self._pending.items() if now - item.created > CHALLENGE_TTL_S]:
                del self._pending[challenge_id]

    def _question(self, key: str, backend: Any, error: BaseException) -> dict[str, Any]:
        """Keeps the backend alive and describes the challenge to the app."""
        from woob.exceptions import BrowserQuestion, DecoupledValidation, ImageQuestion

        image = None
        if isinstance(error, BrowserQuestion):
            # No bank module of Woob asks for two values at once: the first field takes the code
            field_ids = [value.id for value in error.fields]
            kind, field_id = "code", (field_ids[0] if field_ids else None)
            message = getattr(error, "message", "") or (error.fields[0].label if error.fields else "")
            if isinstance(error, ImageQuestion):
                image = challenge_image(error.image_mime_type, error.image_data)
        elif isinstance(error, DecoupledValidation):
            kind, field_id, message = "app", None, error.message
        else:  # pragma: no cover - callers only pass the two kinds above
            raise WorkerError("unknown")
        challenge_id = secrets.token_hex(16)
        with self._guard:
            self._pending[challenge_id] = Pending(key, backend, kind, field_id, self._clock())
        return {
            "state": "challenge",
            "challengeId": challenge_id,
            "kind": kind,
            "medium": getattr(error, "medium_type", None),
            "mediumLabel": getattr(error, "medium_label", None),
            "message": (message or "")[:300],
            "image": image,
        }

    def _connected(self, key: str, backend: Any, accounts: list[Any]) -> dict[str, Any]:
        self._close(key, backend, save=True)
        listed = [item for item in (normalize_account(account) for account in accounts) if item]
        return {"state": "connected", "accounts": listed}

    def _try_login(self, key: str, backend: Any, credentials: dict[str, str] | None = None) -> dict[str, Any]:
        from woob.exceptions import BrowserQuestion, DecoupledValidation

        try:
            return self._connected(key, backend, self._accounts(backend))
        except (BrowserQuestion, DecoupledValidation) as error:
            return self._question(key, backend, error)
        except Exception as error:  # noqa: BLE001 - every failure becomes a stable code
            raise map_error(error, interactive=True, secrets=secrets_of(backend, credentials)) from None

    # ---------------------------------------------------------------- commands

    def status(self, _params: dict[str, Any] | None = None) -> dict[str, Any]:
        import woob

        verified = self._module_source.verified_modules if self._module_source else Path(self.modules_path)
        source_file = verified.parent / "woob-source.json"
        commit = date = None
        if source_file.exists():
            pin = json.loads(source_file.read_text(encoding="utf-8"))
            commit, date = pin.get("commit"), pin.get("date")
        banks = sorted(self._bank_index().values(), key=lambda bank: bank["name"].lower())
        modules = self._module_source.describe() if self._module_source else {"channel": "verified", "active": "verified"}
        return {"worker": __version__, "woob": woob.__version__, "commit": commit, "commitDate": date, "banks": banks, "modules": modules}

    # ------------------------------------------------- module source (TGLA-241)

    def _source(self) -> ModuleSource:
        if self._module_source is None:
            raise WorkerError("unavailable", "module source")
        return self._module_source

    def modules(self, _params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._source().describe()

    def set_modules(self, params: dict[str, Any]) -> dict[str, Any]:
        """Verified modules (default) or Woob's latest ones (the app asked the user to accept the risk first)."""
        channel = params.get("channel")
        if channel not in ("verified", "latest"):
            raise WorkerError("invalid_request", "channel")
        source = self._source()
        before = source.active_modules()
        source.set_channel(channel)
        if channel == "latest":
            try:
                source.update()
            except UpdateError as error:
                raise WorkerError("update_failed", str(error)[:120]) from None
        if source.active_modules() != before:
            self._restart()
        return {**source.describe(), "restarting": source.active_modules() != before}

    def update_modules(self, _params: dict[str, Any] | None = None) -> dict[str, Any]:
        source = self._source()
        if source.read()["channel"] != "latest":
            raise WorkerError("invalid_request", "channel")
        before = source.active_modules()
        try:
            source.update()
        except UpdateError as error:
            raise WorkerError("update_failed", str(error)[:120]) from None
        if source.active_modules() != before:
            self._restart()
        return {**source.describe(), "restarting": source.active_modules() != before}

    def login(self, params: dict[str, Any]) -> dict[str, Any]:
        """Opens a bank session, interactively: may answer with a challenge the user must complete."""
        key, bank = self._key(params), self._bank(params)
        credentials = self._credentials(bank, params)
        state = self._state(key)
        if not state.lock.acquire(blocking=False):
            raise WorkerError("busy")
        try:
            self._count_session(state)
            state.positions = None
            try:
                backend = self._build(key, bank, credentials, interactive=True)
            except Exception as error:  # noqa: BLE001
                raise map_error(error, interactive=True, secrets=secrets_of(credentials=credentials)) from None
            return self._try_login(key, backend, credentials)
        finally:
            state.lock.release()

    def answer(self, params: dict[str, Any]) -> dict[str, Any]:
        """Continues a login with the code the user typed, or after they validated in their bank's app."""
        self._expire_challenges()
        challenge_id = params.get("challengeId")
        with self._guard:
            pending = self._pending.pop(challenge_id, None) if isinstance(challenge_id, str) else None
        if pending is None:
            raise WorkerError("challenge_expired")
        state = self._state(pending.key)
        if not state.lock.acquire(blocking=False):
            raise WorkerError("busy")
        try:
            config = pending.backend.config
            if pending.kind == "code":
                value = params.get("value")
                if not isinstance(value, str) or not value.strip() or len(value) > 64 or not pending.field_id:
                    raise WorkerError("invalid_request", "value")
                config[pending.field_id].set(value.strip())
            elif "resume" in config:
                config["resume"].set(True)
            return self._try_login(pending.key, pending.backend)
        finally:
            state.lock.release()

    def accounts(self, params: dict[str, Any]) -> dict[str, Any]:
        """The bank's accounts, without any two-factor challenge (needs a valid session)."""
        result = self.holdings({**params, "accountIds": []})
        return {"accounts": [{k: v for k, v in account.items() if k not in ("holdings", "warnings")} for account in result["accounts"]]}

    def holdings(self, params: dict[str, Any]) -> dict[str, Any]:
        """Positions and balances of the bank's accounts, non-interactively. Kept 15 minutes."""
        key, bank = self._key(params), self._bank(params)
        credentials = self._credentials(bank, params)
        wanted = params.get("accountIds")
        wanted_ids = set(wanted) if isinstance(wanted, list) and wanted else None
        only_list = isinstance(wanted, list) and len(wanted) == 0

        history = params.get("history")
        since = history.get("since") if isinstance(history, dict) else None
        if since is not None and not (isinstance(since, str) and ISO_DAY.match(since)):
            raise WorkerError("invalid_request", "history.since")

        state = self._state(key)
        if not state.lock.acquire(blocking=False):
            raise WorkerError("busy")
        try:
            now = self._clock()
            # A cached read serves a history request only when it already covers the days asked for
            covers = since is None or (state.history_since is not None and state.history_since <= since)
            if state.positions and now - state.positions[0] < POSITIONS_TTL_S and covers:
                return {"accounts": self._select(state.positions[1], wanted_ids), "cached": True}

            self._count_session(state)
            backend = None
            try:
                backend = self._build(key, bank, credentials, interactive=False)
                synced: list[dict[str, Any]] = []
                from woob.capabilities.bank import Account
                from woob.capabilities.bank.wealth import CapBankWealth

                cards: list[Any] = []
                for account in self._accounts(backend):
                    listed = normalize_account(account)
                    if listed is None:
                        # A deferred-debit card is not synced itself: its payments go to its checking account
                        if since is not None and not only_list and getattr(account, "type", None) == Account.TYPE_CARD:
                            cards.append(account)
                        continue
                    investments = None
                    reads_positions = not only_list and (wanted_ids is None or listed["id"] in wanted_ids)
                    if reads_positions and listed["kind"] == "investment" and isinstance(backend, CapBankWealth):
                        investments = list(backend.iter_investment(account))
                    entry = normalize_holdings(account, investments if reads_positions else [])
                    if since is not None and reads_positions and listed["kind"] == "cash":
                        entry.update(self._operations(backend, account, since))
                    synced.append(entry)
                if cards:
                    self._card_operations(backend, cards, synced, since)
                self._close(key, backend, save=True)
            except Exception as error:  # noqa: BLE001
                if backend is not None:
                    self._close(key, backend, save=False)
                raise map_error(error, interactive=False, secrets=secrets_of(backend, credentials)) from None

            if not only_list and wanted_ids is None:
                state.positions = (now, synced)
                state.history_since = since
            return {"accounts": self._select(synced, wanted_ids), "cached": False}
        finally:
            state.lock.release()

    @staticmethod
    def _operations(backend: Any, account: Any, since: str) -> dict[str, Any]:
        """Operations since `since` and the coming ones of a checking or savings account (TGLA-254).

        Read in the session of the balances (one bank session per sync). A bank that refuses the history (strong
        authentication beyond 90 days, a broken page) only adds a warning: the balances still sync."""
        warnings: list[str] = []
        seen: dict[str, int] = {}
        transactions: list[dict[str, Any]] = []
        history_ok = True
        try:
            older = 0
            for operation in backend.iter_history(account):
                item = normalize_transaction(operation, seen)
                if item is None:
                    continue
                if item["date"] < since:
                    older += 1
                    if older >= HISTORY_OLDER_STOP:
                        break
                    continue
                older = 0
                transactions.append(item)
                if len(transactions) >= HISTORY_MAX_OPERATIONS:
                    warnings.append("history_truncated")
                    break
        except NotImplementedError:
            history_ok = False
            warnings.append("history_unavailable")
        except Exception:  # noqa: BLE001 — never let the history break the balances
            history_ok = False
            warnings.append("history_failed")

        coming: list[dict[str, Any]] = []
        try:
            coming_seen: dict[str, int] = {}
            for index, operation in enumerate(backend.iter_coming(account)):
                if index >= COMING_MAX_OPERATIONS:
                    break
                item = normalize_transaction(operation, coming_seen)
                if item is not None:
                    coming.append(item)
        except NotImplementedError:
            pass
        except Exception:  # noqa: BLE001
            warnings.append("coming_failed")

        result: dict[str, Any] = {"transactions": transactions if history_ok else None, "coming": coming}
        if warnings:
            result["historyWarnings"] = warnings
        return result

    @staticmethod
    def _card_operations(backend: Any, cards: list[Any], synced: list[dict[str, Any]], since: str) -> None:
        """The payments of deferred-debit cards, added to their checking account (TGLA-254): the checking account
        only shows their monthly total. A card whose payments cannot be read only adds a warning."""
        accounts = {entry["id"]: entry for entry in synced if entry.get("kind") == "cash" and isinstance(entry.get("transactions"), list)}
        for card in cards:
            parent = getattr(card, "parent", None)
            parent_id = str(getattr(parent, "id", "") or "") if parent is not None else ""
            entry = accounts.get(parent_id)
            if entry is None:
                continue
            seen: dict[str, int] = {}
            payments: list[dict[str, Any]] = []
            try:
                older = 0
                for operation in backend.iter_history(card):
                    item = normalize_transaction(operation, seen)
                    if item is None:
                        continue
                    if item["date"] < since:
                        older += 1
                        if older >= HISTORY_OLDER_STOP:
                            break
                        continue
                    older = 0
                    item["id"] = f"card-{card.id}-{item['id']}"
                    item["type"] = "deferred_card"
                    payments.append(item)
                    if len(payments) >= HISTORY_MAX_OPERATIONS:
                        break
            except Exception:  # noqa: BLE001 — never let a card break the balances
                entry.setdefault("historyWarnings", []).append("card_history_failed")
                continue
            entry.setdefault("cardTransactions", []).extend(payments)

    @staticmethod
    def _select(accounts: list[dict[str, Any]], wanted_ids: set[str] | None) -> list[dict[str, Any]]:
        return [account for account in accounts if wanted_ids is None or account["id"] in wanted_ids]

    def forget(self, params: dict[str, Any]) -> dict[str, Any]:
        """Deletes the saved bank session of a connection (when the user removes it)."""
        key = self._key(params)
        with self._guard:
            self._keys.pop(key, None)
            for challenge_id in [cid for cid, item in self._pending.items() if item.key == key]:
                del self._pending[challenge_id]
        self._session_path(key).unlink(missing_ok=True)
        return {"forgotten": True}

    COMMANDS = ("status", "login", "answer", "accounts", "holdings", "forget", "modules", "set_modules", "update_modules")

    def dispatch(self, command: str, params: dict[str, Any]) -> dict[str, Any]:
        if command not in self.COMMANDS:
            raise WorkerError("invalid_request", "cmd")
        handler: Callable[[dict[str, Any]], dict[str, Any]] = getattr(self, command)
        return handler(params)
