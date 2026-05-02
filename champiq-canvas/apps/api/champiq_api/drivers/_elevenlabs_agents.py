"""ElevenLabs agent friendly-name → UUID resolver.

Why this exists
---------------
ElevenLabs's API only accepts opaque agent IDs (shape `agent_<32hex>`). On the
canvas (and in chat) users naturally refer to agents by their human name —
"leadqualifier", "Champ Qualifier", "sales-agent". Without a translation
layer the runtime raises `Document with id leadqualifier not found` and the
user has no path to resolve it without copy-pasting the UUID from the
ElevenLabs dashboard every time.

This module owns one responsibility: given a name (friendly OR UUID),
return the UUID. Everything else — the driver's HTTP calls, the
credential schema, the chat prompt — stays unchanged.

SOLID notes
-----------
- **Single responsibility**: just name resolution. No HTTP for outbound
  calls; no credential persistence. The driver still owns those.
- **Open / closed**: adding new resolution rules (e.g. fuzzy match) means
  adding one method here, not touching the driver.
- **Dependency inversion**: the resolver takes its HTTP client as a
  dependency injection at call time — unit tests pass a stub.
- **Liskov**: workflows that pass a real UUID continue to work
  byte-for-byte the same. The resolver is a no-op fast-path for them.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

EL_BASE = "https://api.elevenlabs.io/v1"

# ElevenLabs agent IDs are shaped `agent_<32 hex chars>`. Anything matching
# this regex is assumed to be a real UUID and skips the resolver entirely
# (fast path — never hits ElevenLabs's API).
_AGENT_UUID_RE = re.compile(r"^agent_[a-z0-9]{20,64}$")

# Cache TTL — ElevenLabs agent lists rarely change. 5 minutes is long
# enough to avoid hammering the API on a busy workflow, short enough that
# a newly-created agent is discoverable within minutes.
_DEFAULT_TTL_SECONDS = 300.0


@dataclass(frozen=True)
class _CacheEntry:
    """One entry in the per-API-key cache: name->id map plus expiry timestamp."""
    by_name: dict[str, str] = field(default_factory=dict)  # lowercased friendly name -> agent_id
    by_id: dict[str, str] = field(default_factory=dict)    # agent_id -> raw display name (for diagnostics)
    expires_at: float = 0.0

    def is_fresh(self, now: float) -> bool:
        return now < self.expires_at


def is_real_agent_id(value: str | None) -> bool:
    """Cheap regex check — matches the `agent_<hex>` UUID shape. Used as the
    fast-path: if a workflow already passes a UUID, we never call ElevenLabs.
    """
    if not value or not isinstance(value, str):
        return False
    return _AGENT_UUID_RE.match(value.strip()) is not None


class ElevenLabsAgentResolver:
    """Translate friendly-name → ElevenLabs agent UUID, with per-API-key cache.

    Usage:
        resolver = ElevenLabsAgentResolver()
        agent_id = await resolver.resolve("leadqualifier", api_key=...)
        # agent_id is now "agent_3501kf4e3ak0eqkrxg1rttttk881"

    Resolution rules (in order):
      1. If the value already matches `agent_<hex>` UUID shape → return as-is.
      2. Look up against ElevenLabs's `/v1/convai/agents` list — case-
         insensitive exact match on the agent's `name` field. Hyphen and
         underscore variants of the name are also accepted (lead-qualifier
         and lead_qualifier both match "lead qualifier").
      3. Raise a clear ValueError listing every available agent.
    """

    def __init__(self, ttl_seconds: float = _DEFAULT_TTL_SECONDS) -> None:
        self._ttl = float(ttl_seconds)
        # cache key is the API key itself (different keys see different agent
        # lists). Stored in-process — never persisted.
        self._cache: dict[str, _CacheEntry] = {}

    # -- Public API ----------------------------------------------------------

    async def resolve(
        self,
        value: str,
        *,
        api_key: str,
        http_client_factory: Any = None,
    ) -> str:
        """Translate `value` (friendly name or UUID) into an ElevenLabs agent UUID.

        `http_client_factory`: optional override for tests. When None, uses
        `httpx.AsyncClient` directly.
        """
        if not value or not value.strip():
            raise ValueError(
                "ChampVoice: agent_id resolved to empty. Set agent_id on the "
                "ChampVoice credential or pass it explicitly in the node's inputs."
            )
        v = value.strip()

        # Fast path: already a UUID
        if is_real_agent_id(v):
            return v

        # Slow path: fetch agent list and look up by name
        entry = await self._ensure_cache(api_key, http_client_factory=http_client_factory)
        normalized = self._normalize(v)
        agent_id = entry.by_name.get(normalized)
        if agent_id:
            return agent_id

        # Build a useful error
        names = sorted({raw_name for raw_name in entry.by_id.values()})
        raise ValueError(
            f"ChampVoice: no ElevenLabs agent matches {value!r}. "
            f"Either the agent doesn't exist in this account, or it has a "
            f"different display name. Available agents on this account: "
            f"{names}. You can also paste the raw `agent_<hex>` ID directly."
        )

    def invalidate(self, api_key: str | None = None) -> None:
        """Drop the cache for one API key (or all if None). Call after the user
        adds/renames an agent in the ElevenLabs dashboard if they want
        immediate refresh instead of waiting up to TTL.
        """
        if api_key is None:
            self._cache.clear()
        else:
            self._cache.pop(api_key, None)

    async def list_friendly_names(
        self,
        *,
        api_key: str,
        http_client_factory: Any = None,
    ) -> list[str]:
        """Return the list of agent display names available to this API key.
        Used by chat to augment the SYSTEM_PROMPT with the user's actual
        agent inventory so the LLM picks correct names.
        """
        entry = await self._ensure_cache(api_key, http_client_factory=http_client_factory)
        return sorted({raw for raw in entry.by_id.values()})

    # -- Internals -----------------------------------------------------------

    @staticmethod
    def _normalize(name: str) -> str:
        """Lowercase + collapse hyphens/underscores/spaces to a single space."""
        n = name.strip().lower()
        n = re.sub(r"[\-_]+", " ", n)
        n = re.sub(r"\s+", " ", n)
        return n

    async def _ensure_cache(
        self,
        api_key: str,
        *,
        http_client_factory: Any = None,
    ) -> _CacheEntry:
        now = time.time()
        cached = self._cache.get(api_key)
        if cached is not None and cached.is_fresh(now):
            return cached

        agents = await self._fetch_agents(api_key, http_client_factory=http_client_factory)
        by_name: dict[str, str] = {}
        by_id: dict[str, str] = {}
        for a in agents:
            agent_id = (a.get("agent_id") or a.get("id") or "").strip()
            raw_name = (a.get("name") or "").strip()
            if not agent_id:
                continue
            by_id[agent_id] = raw_name
            if raw_name:
                # Index by normalized full name and by each whitespace-stripped variant
                by_name[self._normalize(raw_name)] = agent_id
                # Also index by the agent_id itself so the lookup is tolerant
                # of someone passing the UUID without the regex match (very
                # defensive — should never trigger thanks to the fast path).
                by_name[agent_id.lower()] = agent_id

        entry = _CacheEntry(by_name=by_name, by_id=by_id, expires_at=now + self._ttl)
        self._cache[api_key] = entry
        return entry

    async def _fetch_agents(
        self,
        api_key: str,
        *,
        http_client_factory: Any = None,
    ) -> list[dict[str, Any]]:
        """One HTTP call to `GET /v1/convai/agents`. Returns the raw list."""
        client_factory = http_client_factory or (lambda: httpx.AsyncClient(timeout=10.0))
        async with client_factory() as client:
            r = await client.get(
                f"{EL_BASE}/convai/agents",
                headers={"xi-api-key": api_key},
            )
        if r.status_code != 200:
            raise RuntimeError(
                f"ChampVoice: failed to list ElevenLabs agents (HTTP {r.status_code}: "
                f"{r.text[:200]})."
            )
        body = r.json() or {}
        # ElevenLabs returns {"agents": [...]} — be tolerant of older shapes.
        return body.get("agents") or body.get("data") or []
