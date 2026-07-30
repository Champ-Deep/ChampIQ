"""Manifests must stay in step with the drivers that execute them.

A manifest is what the canvas palette shows and what the chat system prompt
offers. A driver is what actually runs. When they drift, the failure is silent
and lands on the user: an action appears in the UI, gets wired into a DAG, and
fails at runtime with "unknown action".

`test_champgraph_manifest.py` already guards champgraph this way. This module
generalises it to every manifest with an HTTP driver behind it.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from champiq_api.drivers.champmail import ChampMailDriver
from champiq_api.drivers.champoracle import ChampOracleDriver
from champiq_api.drivers.harbinger import HarbingerDriver
from champiq_api.drivers.lakestream import LakeStreamDriver

MANIFESTS = Path(__file__).resolve().parents[3] / "manifests"

#: manifest filename -> driver whose `actions` must cover it.
#: inboxkit.manifest.json deliberately declares tool_id "champmail": its routes
#: are ChampMail admin routes, so they dispatch through the existing driver and
#: credential rather than needing a second of each. The separate file exists to
#: give the palette its own group.
DRIVER_FOR_MANIFEST = {
    "champmail.manifest.json": ChampMailDriver,
    "inboxkit.manifest.json": ChampMailDriver,
    "lakestream.manifest.json": LakeStreamDriver,
    "harbinger.manifest.json": HarbingerDriver,
    "champoracle.manifest.json": ChampOracleDriver,
}


def _load(name: str) -> dict:
    return json.loads((MANIFESTS / name).read_text())


def _manifest_names() -> list[str]:
    return sorted(p.name for p in MANIFESTS.glob("*.manifest.json"))


def _tool_manifest_names() -> list[str]:
    """Manifests that describe an external tool.

    `system.manifest.json` is the odd one out: it declares `nodes` (the built-in
    control-flow primitives — if/loop/wait/code) rather than `actions` against a
    remote service, so the action-shaped assertions below do not apply to it.
    """
    return [n for n in _manifest_names() if "actions" in _load(n)]


# --- every manifest is at least well-formed --------------------------------


@pytest.mark.parametrize("name", _manifest_names())
def test_manifest_is_valid_json_with_required_fields(name: str):
    d = _load(name)
    for field in ("manifest_version", "tool_id", "name"):
        assert field in d, f"{name} is missing {field!r}"
    # A manifest describes either remote actions or built-in nodes, never neither.
    assert "actions" in d or "nodes" in d, (
        f"{name} declares neither 'actions' nor 'nodes'"
    )


@pytest.mark.parametrize("name", _tool_manifest_names())
def test_action_ids_are_unique_within_a_manifest(name: str):
    ids = [a["id"] for a in _load(name)["actions"]]
    assert len(ids) == len(set(ids)), f"{name} has duplicate action ids"


@pytest.mark.parametrize("name", _tool_manifest_names())
def test_every_action_has_a_description_and_input_schema(name: str):
    """The description is what the chat agent reads to decide whether an action
    fits. An action without one is effectively invisible to it — it will sit in
    the palette and never be chosen."""
    for action in _load(name)["actions"]:
        assert action.get("label"), f"{name}:{action['id']} has no label"
        assert action.get("input_schema"), f"{name}:{action['id']} has no input_schema"
        assert action.get("description"), (
            f"{name}:{action['id']} has no description — the chat agent "
            "cannot tell when to use it"
        )


# --- manifests must not advertise what the driver cannot run ---------------


@pytest.mark.parametrize("name", sorted(DRIVER_FOR_MANIFEST))
def test_manifest_advertises_nothing_the_driver_lacks(name: str):
    """The failure this prevents: an action shows in the palette, a user wires
    it into a DAG, and it dies at runtime."""
    driver = DRIVER_FOR_MANIFEST[name]
    declared = {a["id"] for a in _load(name)["actions"]}
    implemented = set(driver.actions)
    missing = declared - implemented
    assert not missing, (
        f"{name} advertises actions {sorted(missing)} that "
        f"{driver.__name__} cannot execute"
    )


def test_champmail_and_inboxkit_manifests_do_not_overlap():
    """Two manifests share tool_id 'champmail'. If both listed the same action
    it would appear twice in the palette with no way to tell them apart."""
    champmail = {a["id"] for a in _load("champmail.manifest.json")["actions"]}
    inboxkit = {a["id"] for a in _load("inboxkit.manifest.json")["actions"]}
    overlap = champmail & inboxkit
    assert not overlap, f"actions declared in both manifests: {sorted(overlap)}"


# --- coverage the orchestration story depends on ---------------------------


def test_champmail_manifest_covers_sequences_and_suppressions():
    """Signal-triggered outreach is enrolment plus halt-on-reply plus
    suppression. Sending alone is not enough to build it."""
    ids = {a["id"] for a in _load("champmail.manifest.json")["actions"]}
    for required in (
        "enroll_sequence", "pause_sequence", "suppress", "check_suppression",
    ):
        assert required in ids, f"champmail manifest is missing {required}"


def test_inboxkit_manifest_covers_the_byod_flow():
    ids = {a["id"] for a in _load("inboxkit.manifest.json")["actions"]}
    for required in (
        "inboxkit_connect_domain", "inboxkit_domain_records",
        "inboxkit_verify_domain", "inboxkit_buy_mailboxes",
        "inboxkit_set_webhook",
    ):
        assert required in ids, f"inboxkit manifest is missing {required}"


def test_lakestream_manifest_exposes_the_hiring_signal():
    """A new ATS posting is the highest-leverage outreach trigger available.
    If it is not a DAG node it stays a script somebody remembers to run."""
    ids = {a["id"] for a in _load("lakestream.manifest.json")["actions"]}
    assert "fetch_jobs_batch" in ids
    assert "fetch_jobs" in ids


def test_no_module_regresses_to_zero_actions():
    """Guards against a manifest being emptied or a driver losing its actions."""
    for name in _tool_manifest_names():
        assert len(_load(name)["actions"]) > 0, f"{name} declares no actions"


def test_harbinger_manifest_covers_enrichment_and_discovery():
    """Without these the SENSE stage was read-only from the orchestrator: a DAG
    could read qualified prospects but could not create any."""
    ids = {a["id"] for a in _load("harbinger.manifest.json")["actions"]}
    for required in ("discover", "enrich_waterfall", "enrich_batch", "enrich_contact"):
        assert required in ids, f"harbinger manifest is missing {required}"


def test_champoracle_manifest_covers_the_simulation_loop():
    """Simulate, read the result, and interrogate it — a simulation you cannot
    query is just a report nobody reads."""
    ids = {a["id"] for a in _load("champoracle.manifest.json")["actions"]}
    for required in ("simulate_campaign", "get_campaign", "get_report", "ask_campaign"):
        assert required in ids, f"champoracle manifest is missing {required}"
