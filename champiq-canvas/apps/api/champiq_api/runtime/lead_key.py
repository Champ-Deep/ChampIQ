"""Deterministic lead correlation key.

The problem
-----------
A single lead journey — ChampSet/Harbinger discovery, enrichment, signal match,
qualification, outreach, reply — passes through four stores that each identify
the lead differently:

  Redis stream    ordered event log        (no lead identity at all)
  Cham_Graph      semantic lead knowledge  account_name + email on episodes
  Harbinger DB    structured records       people.id UUID, work_email indexed
  ChampMail DB    send records             prospect UUID + email

Every piece of one lead's history is already on the bus. What is missing is a
key that lets you *join* them, so "show me everything that happened to this
lead" is currently unanswerable even though nothing is lost.

Why derived rather than assigned
--------------------------------
The obvious fix is to mint a `lead_id` UUID at first touch and propagate it. That
needs a registry, a lookup on every event, and a coordination point every
producer must reach before it can emit — which makes the bus depend on a
database being up.

Instead the key is **derived** from data every producer already has:

    lead_key = "<account>:<normalised email>"

Because it is a pure function of its inputs, four services compute the identical
key with no shared state, no registry, and no network call. Harbinger can stamp
it at discovery and ChampMail can recompute it at send time without either
knowing the other exists.

It is also human-readable on purpose. `acme:jane@example.com` in a log line or a
`XRANGE` dump is immediately meaningful; an opaque UUID needs a lookup to mean
anything, and debugging a distributed event flow is exactly when you cannot
afford that.

What this does NOT do
---------------------
It does not make the stream a system of record. Per the suite's precedence rule,
Cham_Graph remains the source of truth for lead *knowledge* and the enriched
store for structured records; the stream is an ordered log bounded by its 100k
maxlen. The key is what lets a reader fan out across all three and assemble one
view — it replaces the need for a fourth store rather than adding one.
"""
from __future__ import annotations

import re
from typing import Optional

#: Providers that ignore dots in the local part. Gmail is the notable one —
#: jane.doe@gmail.com and janedoe@gmail.com are the same mailbox, so treating
#: them as two leads would double-count and double-contact the same person.
#: This is NOT true generally: many providers treat dots as significant, so the
#: rule is applied per-domain rather than blanket.
_DOT_INSENSITIVE_DOMAINS = frozenset({"gmail.com", "googlemail.com"})

#: Domains that are aliases of each other for identity purposes.
_DOMAIN_ALIASES = {"googlemail.com": "gmail.com"}

_ACCOUNT_SAFE = re.compile(r"[^a-z0-9._-]+")


class LeadKeyError(ValueError):
    """Raised when a lead key cannot be derived from the given inputs."""


def normalise_email(raw: str) -> str:
    """Return a canonical form of an email address for identity purposes.

    Rules, in order:
      1. strip surrounding whitespace and any `Display Name <addr>` wrapper
      2. lower-case the whole address
      3. drop a `+tag` suffix from the local part
      4. drop dots in the local part **only** for dot-insensitive providers
      5. resolve domain aliases (googlemail.com -> gmail.com)

    Step 2 lower-cases the local part, which RFC 5321 technically permits to be
    case-sensitive. No mail provider in practice treats it that way, and the
    alternative — `Jane@x.com` and `jane@x.com` as two separate leads — is a far
    more likely and more damaging error than the theoretical one.

    Step 3 is applied to every domain. Plus-addressing is not universal, but a
    prospect reached at `jane+newsletter@` and `jane@` is one person, and
    treating them as two means contacting them twice.
    """
    if not raw or not raw.strip():
        raise LeadKeyError("email is empty")

    address = raw.strip()

    # `Jane Doe <jane@example.com>` -> `jane@example.com`
    if "<" in address and ">" in address:
        start = address.rindex("<") + 1
        end = address.rindex(">")
        address = address[start:end].strip()

    address = address.lower()

    if address.count("@") != 1:
        raise LeadKeyError(f"not a single-address email: {raw!r}")

    local, domain = address.split("@")
    if not local or not domain or "." not in domain:
        raise LeadKeyError(f"malformed email: {raw!r}")

    domain = _DOMAIN_ALIASES.get(domain, domain)

    if "+" in local:
        local = local.split("+", 1)[0]
        if not local:
            raise LeadKeyError(f"email has no local part before '+': {raw!r}")

    if domain in _DOT_INSENSITIVE_DOMAINS:
        local = local.replace(".", "")
        if not local:
            raise LeadKeyError(f"email local part is only dots: {raw!r}")

    return f"{local}@{domain}"


def normalise_account(raw: Optional[str]) -> str:
    """Canonical form of the account/client scope.

    Defaults to "default" to match what graph_writeback already does when an
    event carries no account — see `_email_hook_payload`, which falls back to
    "default" for `account_name`. Keeping the same fallback means keys derived
    here line up with episodes already in the graph rather than silently
    partitioning into a parallel namespace.
    """
    account = (raw or "").strip().lower()
    if not account:
        return "default"
    account = _ACCOUNT_SAFE.sub("-", account).strip("-")
    return account or "default"


def lead_key(email: str, account: Optional[str] = None) -> str:
    """Derive the correlation key for one lead.

    >>> lead_key("Jane.Doe+promo@GMAIL.com", "Acme Corp")
    'acme-corp:janedoe@gmail.com'
    """
    return f"{normalise_account(account)}:{normalise_email(email)}"


def company_key(domain: str, account: Optional[str] = None) -> str:
    """Correlation key for a company, for events that have no person yet.

    Discovery and enrichment often fire before any contact is known — a company
    is imported, a hiring signal matches — and those events still belong to the
    same journey. Prefixed `co:` so a company key can never collide with a
    person key.
    """
    if not domain or not domain.strip():
        raise LeadKeyError("domain is empty")
    host = domain.strip().lower()
    host = re.sub(r"^https?://", "", host)
    host = host.split("/")[0].split("?")[0]
    if host.startswith("www."):
        host = host[4:]
    if "@" in host:  # someone passed an email
        host = host.split("@", 1)[1]
    if not host or "." not in host:
        raise LeadKeyError(f"malformed domain: {domain!r}")
    return f"{normalise_account(account)}:co:{host}"


# --- event helpers ---------------------------------------------------------

#: Payload fields that may carry the lead's email, most specific first. Mirrors
#: the `_field()` lookups already used in graph_writeback so a payload that
#: works there works here.
_EMAIL_FIELDS = (
    "lead_email",
    "prospect_email",
    "to_address",
    "to_email",
    "recipient",
    "email",
    "contact_email",
)

#: Fields carrying the company domain, for pre-contact events.
_DOMAIN_FIELDS = ("company_domain", "domain", "website", "company_website")

_ACCOUNT_FIELDS = ("account_name", "account", "client", "client_name")

#: The key under which the correlation key travels on an event.
LEAD_KEY_FIELD = "lead_key"


def _first_present(payload: dict, names: tuple[str, ...]) -> Optional[str]:
    for name in names:
        value = payload.get(name)
        if isinstance(value, str) and value.strip():
            return value
    return None


def derive_from_payload(payload: dict, *, inbound: bool = False) -> Optional[str]:
    """Best-effort correlation key for an arbitrary event payload.

    Returns None rather than raising when no identity can be found — an event
    that cannot be attributed to a lead must still reach its consumers. Silent
    non-attribution is recoverable; a crashed publisher is not.

    `inbound=True` reads the *from* address instead of the *to* address. On a
    reply or a bounce the lead is the sender, so the default would otherwise
    attribute the event to our own mailbox.
    """
    if isinstance(payload.get(LEAD_KEY_FIELD), str) and payload[LEAD_KEY_FIELD]:
        return payload[LEAD_KEY_FIELD]  # already stamped upstream — never re-derive

    account = _first_present(payload, _ACCOUNT_FIELDS)

    if inbound:
        email = _first_present(payload, ("from_address", "from_email", "sender"))
        if email:
            try:
                return lead_key(email, account)
            except LeadKeyError:
                pass

    email = _first_present(payload, _EMAIL_FIELDS)
    if email:
        try:
            return lead_key(email, account)
        except LeadKeyError:
            pass

    company_domain = _first_present(payload, _DOMAIN_FIELDS)
    if company_domain:
        try:
            return company_key(company_domain, account)
        except LeadKeyError:
            pass

    return None


#: Topics where the lead is the sender rather than the recipient.
INBOUND_TOPICS = frozenset({"email.replied", "email.bounced", "email.unsubscribed"})


def stamp(topic: str, payload: dict) -> dict:
    """Return `payload` with `lead_key` filled in when it can be derived.

    Non-mutating, and never overwrites a key an upstream producer already set —
    the first service to identify the lead wins, so a key assigned at discovery
    survives all the way to the reply.
    """
    if payload.get(LEAD_KEY_FIELD):
        return payload
    derived = derive_from_payload(payload, inbound=topic in INBOUND_TOPICS)
    if derived is None:
        return payload
    return {**payload, LEAD_KEY_FIELD: derived}
