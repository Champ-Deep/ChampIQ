"""Lead correlation key.

The key exists so one lead's journey — discovery, enrichment, signal, outreach,
reply — can be joined across four stores that each identify leads differently.
Because it is *derived* rather than assigned, four services must compute the
identical string with no shared state. These tests pin that determinism and the
normalisation edge cases where a naive implementation silently splits one lead
into two (and therefore contacts them twice) or merges two into one.
"""
from __future__ import annotations

import asyncio

import fakeredis.aioredis
import pytest

from champiq_api.runtime.bus import RedisEventBus
from champiq_api.runtime.lead_key import (
    LEAD_KEY_FIELD,
    LeadKeyError,
    company_key,
    derive_from_payload,
    lead_key,
    normalise_account,
    normalise_email,
    stamp,
)


# --- determinism: the whole premise ---------------------------------------


def test_same_inputs_always_give_the_same_key():
    """No registry, no coordination — four services must agree independently."""
    assert lead_key("jane@example.com", "acme") == lead_key("jane@example.com", "acme")


def test_key_is_human_readable():
    """Debugging a distributed event flow is exactly when an opaque UUID costs
    you a lookup you cannot afford."""
    assert lead_key("jane@example.com", "acme") == "acme:jane@example.com"


# --- normalisation that prevents double-contacting -------------------------


def test_case_differences_are_one_lead():
    assert normalise_email("Jane@Example.COM") == "jane@example.com"


def test_display_name_wrapper_is_stripped():
    assert normalise_email("Jane Doe <jane@example.com>") == "jane@example.com"


def test_plus_tag_is_one_lead():
    """jane+newsletter@ and jane@ are one person. Treating them as two means
    mailing them twice."""
    assert normalise_email("jane+newsletter@example.com") == "jane@example.com"


def test_gmail_dots_are_one_lead():
    """Gmail ignores dots — jane.doe@gmail.com IS janedoe@gmail.com."""
    assert normalise_email("jane.doe@gmail.com") == normalise_email("janedoe@gmail.com")


def test_dots_are_significant_outside_gmail():
    """The dot rule is per-provider. Applying it everywhere would MERGE two
    genuinely different people at providers that treat dots as significant —
    a worse error than splitting one."""
    assert normalise_email("jane.doe@example.com") == "jane.doe@example.com"
    assert normalise_email("jane.doe@example.com") != normalise_email(
        "janedoe@example.com"
    )


def test_googlemail_and_gmail_are_the_same_provider():
    assert normalise_email("jane@googlemail.com") == "jane@gmail.com"


def test_combined_gmail_normalisation():
    assert lead_key("Jane.Doe+promo@GMAIL.com", "Acme Corp") == (
        "acme-corp:janedoe@gmail.com"
    )


# --- rejection -------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    ["", "   ", "not-an-email", "@example.com", "jane@", "jane@nodot", "a@b@c.com"],
)
def test_malformed_addresses_are_rejected(bad: str):
    with pytest.raises(LeadKeyError):
        normalise_email(bad)


def test_plus_at_start_of_local_part_is_rejected():
    """`+tag@example.com` has no local part once the tag is stripped — that must
    error rather than produce the key `:@example.com`."""
    with pytest.raises(LeadKeyError):
        normalise_email("+tag@example.com")


def test_gmail_address_of_only_dots_is_rejected():
    with pytest.raises(LeadKeyError):
        normalise_email("...@gmail.com")


# --- account scoping -------------------------------------------------------


def test_same_person_under_different_clients_is_different_leads():
    """Multi-tenant safety: one client's outreach history must never leak into
    another's view of the same person."""
    assert lead_key("jane@example.com", "acme") != lead_key("jane@example.com", "globex")


def test_missing_account_matches_graph_writeback_fallback():
    """graph_writeback defaults account_name to "default". Diverging here would
    silently partition keys into a namespace the graph never uses."""
    assert normalise_account(None) == "default"
    assert normalise_account("") == "default"
    assert lead_key("jane@example.com") == "default:jane@example.com"


def test_account_is_slugified():
    assert normalise_account("Acme Corp, Inc.") == "acme-corp-inc."


# --- company keys ----------------------------------------------------------


def test_company_key_normalises_urls():
    assert company_key("https://www.Example.com/careers") == "default:co:example.com"


def test_company_key_cannot_collide_with_a_person_key():
    """`co:` prefix. Without it a company and a person could produce the same
    string and merge two unrelated journeys."""
    assert company_key("example.com", "acme") == "acme:co:example.com"
    assert company_key("example.com", "acme") != lead_key("jane@example.com", "acme")


def test_company_key_accepts_an_email_and_takes_its_domain():
    assert company_key("jane@example.com") == "default:co:example.com"


# --- payload derivation ----------------------------------------------------


def test_outbound_event_attributes_to_the_recipient():
    payload = {"to_address": "jane@example.com", "from_address": "us@ours.com"}
    assert derive_from_payload(payload) == "default:jane@example.com"


def test_inbound_event_attributes_to_the_sender():
    """On a reply the lead is the SENDER. Defaulting to `to_address` would
    attribute every reply to our own mailbox and collapse all leads into one."""
    payload = {"from_address": "jane@example.com", "to_address": "us@ours.com"}
    assert derive_from_payload(payload, inbound=True) == "default:jane@example.com"


def test_reply_topic_is_treated_as_inbound_by_stamp():
    stamped = stamp(
        "email.replied", {"from_address": "jane@example.com", "to_address": "us@ours.com"}
    )
    assert stamped[LEAD_KEY_FIELD] == "default:jane@example.com"


def test_sent_topic_is_treated_as_outbound_by_stamp():
    stamped = stamp(
        "email.sent", {"from_address": "us@ours.com", "to_address": "jane@example.com"}
    )
    assert stamped[LEAD_KEY_FIELD] == "default:jane@example.com"


def test_pre_contact_event_falls_back_to_the_company():
    """Discovery and hiring signals fire before any contact is known, and still
    belong to the same journey."""
    payload = {"company_domain": "example.com", "account": "acme"}
    assert derive_from_payload(payload) == "acme:co:example.com"


def test_an_upstream_key_is_never_overwritten():
    """First service to identify the lead wins, so a key assigned at discovery
    survives to the reply even after enrichment finds a better address."""
    payload = {LEAD_KEY_FIELD: "acme:original@x.com", "to_address": "other@y.com"}
    assert stamp("email.sent", payload)[LEAD_KEY_FIELD] == "acme:original@x.com"


def test_unattributable_event_passes_through_unchanged():
    """An event with no identity must still reach its consumers. Silent
    non-attribution is recoverable; a crashed publisher is not."""
    payload = {"some": "data"}
    assert stamp("execution.started", payload) == payload
    assert derive_from_payload(payload) is None


def test_malformed_email_in_payload_does_not_raise():
    assert derive_from_payload({"to_address": "garbage"}) is None


def test_stamp_does_not_mutate_the_caller_payload():
    payload = {"to_address": "jane@example.com"}
    stamp("email.sent", payload)
    assert LEAD_KEY_FIELD not in payload


# --- end-to-end over the real stream --------------------------------------


def _bus() -> RedisEventBus:
    bus = RedisEventBus.__new__(RedisEventBus)
    bus._redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    bus._stream = "champiq:events:leadtest"
    bus._maxlen = 1000
    return bus


@pytest.mark.asyncio
async def test_one_lead_journey_is_reassembled_in_order():
    """The point of the whole module: ChampSet/Harbinger discovery through to
    reply, read back as one ordered journey."""
    bus = _bus()
    account = "acme"

    await bus.publish("signal.matched", {"company_domain": "example.com", "account": account})
    await bus.publish(
        "prospect.qualified", {"lead_key": f"{account}:jane@example.com", "score": 0.8}
    )
    await bus.publish(
        "email.sent",
        {"to_address": "jane@example.com", "from_address": "us@ours.com", "account": account},
    )
    await bus.publish(
        "email.replied",
        {"from_address": "Jane <JANE@example.com>", "to_address": "us@ours.com",
         "account": account},
    )
    # A different lead's traffic interleaved — must not appear.
    await bus.publish(
        "email.sent",
        {"to_address": "bob@other.com", "from_address": "us@ours.com", "account": account},
    )

    history = await bus.lead_history(f"{account}:jane@example.com")

    assert [e["topic"] for e in history] == [
        "prospect.qualified",
        "email.sent",
        "email.replied",
    ]
    assert all("bob@other.com" not in str(e) for e in history)


@pytest.mark.asyncio
async def test_company_stage_and_person_stage_are_separate_keys():
    """Pre-contact events key on the company; they are joined to the person
    downstream, not silently merged by the stream."""
    bus = _bus()
    await bus.publish("signal.matched", {"company_domain": "example.com", "account": "acme"})

    assert len(await bus.lead_history("acme:co:example.com")) == 1
    assert await bus.lead_history("acme:jane@example.com") == []


@pytest.mark.asyncio
async def test_lead_history_is_empty_for_an_unknown_lead():
    bus = _bus()
    await bus.publish("email.sent", {"to_address": "jane@example.com"})
    assert await bus.lead_history("default:nobody@nowhere.com") == []


@pytest.mark.asyncio
async def test_unattributable_events_do_not_break_history_scanning():
    bus = _bus()
    await bus.publish("execution.started", {"run_id": 1})
    await bus.publish("email.sent", {"to_address": "jane@example.com"})
    await bus.publish("execution.finished", {"run_id": 1})

    history = await bus.lead_history("default:jane@example.com")
    assert [e["topic"] for e in history] == ["email.sent"]
