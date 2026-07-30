"""There must be exactly one canvas send path, and it must be ChampMail.

Background
----------
`ChampmailLocalExecutor` (champmail/nodes/champmail_node.py) reimplements
ChampMail inside ChampIQ and sends via **Emelia**, a different vendor. It was
once registered for canvas nodes of kind "champmail", overriding
`ToolNodeExecutor(ChampMailDriver)` and bypassing ChampMail's `/api/v1/send`
entirely — and with it mailbox rotation, per-mailbox daily caps, suppression
checks, Message-ID correlation and the whole InboxKit path.

That override was removed in the 2026-07-27 consolidation. The class still
exists, which means the regression is one `registry.register(...)` line away.
These tests are the guard.
"""
from __future__ import annotations

import inspect

from champiq_api.drivers.champmail import ChampMailDriver


def _build_registry():
    """Build the real container and return its NodeRegistry.

    A valid Fernet key is required to construct it at all, so one is generated
    here rather than depending on the developer's environment — the point of
    these tests is what gets *registered*, not how the box is configured.
    """
    import os

    from cryptography.fernet import Fernet

    os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())

    from champiq_api.container import get_container

    return get_container().registry


# --- the registered executor must be the HTTP driver ----------------------


def test_champmail_node_kind_resolves_to_the_http_driver():
    """The canvas node must reach ChampMail over HTTP, not a local send engine."""
    registry = _build_registry()
    executor = registry.get("champmail")

    driver = getattr(executor, "driver", None) or getattr(executor, "_driver", None)
    assert driver is not None, (
        f"champmail resolved to {type(executor).__name__}, which exposes no HTTP "
        "driver — a local executor has been registered again"
    )
    assert isinstance(driver, ChampMailDriver), (
        f"champmail driver is {type(driver).__name__}, expected ChampMailDriver"
    )


def test_local_emelia_executor_is_not_registered():
    """The specific regression: re-registering the local executor silently
    reroutes every canvas send to Emelia."""
    from champiq_api.champmail.nodes.champmail_node import ChampmailLocalExecutor

    registry = _build_registry()
    executor = registry.get("champmail")
    assert not isinstance(executor, ChampmailLocalExecutor), (
        "ChampmailLocalExecutor is registered again — canvas sends now bypass "
        "ChampMail's rotation, daily caps, suppression checks and Message-ID "
        "generation, and leave via Emelia instead"
    )


def test_local_executor_carries_its_do_not_register_warning():
    """The file is kept for reference, so the warning has to stay with it."""
    from champiq_api.champmail.nodes import champmail_node

    assert "DO NOT REGISTER" in (champmail_node.__doc__ or ""), (
        "the do-not-register warning has been removed from champmail_node.py"
    )


# --- the driver must cover what orchestration actually needs --------------


def test_driver_routes_sends_at_champmails_real_send_api():
    assert ChampMailDriver.actions["send"]["path"] == "/api/v1/send"
    assert ChampMailDriver.actions["send_batch"]["path"] == "/api/v1/send/batch"


def test_driver_exposes_sequence_actions():
    """Signal-triggered outreach is enrolment, not one-off sends. Without these
    a DAG can email someone but cannot start or stop a cadence."""
    for action in ("enroll_sequence", "pause_sequence", "resume_sequence"):
        assert action in ChampMailDriver.actions, f"{action} missing from the driver"


def test_driver_exposes_suppression_actions():
    """A reply or unsubscribe handler that cannot suppress is not a handler."""
    for action in ("suppress", "check_suppression"):
        assert action in ChampMailDriver.actions, f"{action} missing from the driver"


def test_driver_exposes_inboxkit_provisioning():
    """Standing up sending capacity should be a workflow, not a manual sequence
    of curl calls."""
    for action in (
        "inboxkit_connect_domain",
        "inboxkit_verify_domain",
        "inboxkit_buy_mailboxes",
        "inboxkit_status",
    ):
        assert action in ChampMailDriver.actions, f"{action} missing from the driver"


def test_every_action_declares_method_path_and_auth():
    for name, spec in ChampMailDriver.actions.items():
        assert spec.get("method") in ("GET", "POST", "PUT", "PATCH", "DELETE"), name
        assert str(spec.get("path", "")).startswith("/api/v1/"), name
        assert spec.get("auth") == "bearer", f"{name} must require auth"


def test_no_action_path_collides_on_method_and_path():
    seen: dict[tuple[str, str], str] = {}
    for name, spec in ChampMailDriver.actions.items():
        key = (spec["method"], spec["path"])
        assert key not in seen, f"{name} duplicates {seen[key]}"
        seen[key] = name


# --- the remaining second path, documented rather than asserted away ------


def test_cadence_service_still_uses_the_local_transport():
    """Not a bug being fixed here — a known second send path, pinned so it
    cannot drift unnoticed.

    ChampIQ's CadenceService drives its own enrolments and sends through
    MailTransport (Emelia), while ChampMail has its own sequence engine. Two
    sequence engines, two transports. The canvas path is consolidated; this one
    is not, and the decision (retire ChampIQ's cadence, or keep it as a
    deliberately separate channel) is still open.

    When it IS resolved, this test should fail — that is the point.
    """
    from champiq_api.champmail.services import cadence_service

    src = inspect.getsource(cadence_service)
    assert "MailTransport" in src, (
        "CadenceService no longer uses MailTransport — if the second send path "
        "was intentionally retired, delete this test and note it in the "
        "container.py consolidation comment"
    )
