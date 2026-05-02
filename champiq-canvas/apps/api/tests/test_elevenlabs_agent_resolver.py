"""Contract tests for ElevenLabsAgentResolver.

The resolver translates `inputs.agent_id` (which may be a friendly name like
"leadqualifier" or "Champ Qualifier") into the opaque ElevenLabs UUID
(`agent_<32hex>`). Workflows that already pass a UUID must continue to
work byte-for-byte the same.
"""
from __future__ import annotations

import asyncio
import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://stub/stub")
os.environ.setdefault("FERNET_KEY", "0" * 44)

from champiq_api.drivers._elevenlabs_agents import (  # noqa: E402
    ElevenLabsAgentResolver,
    is_real_agent_id,
)


# ----------------------------------------------------------------- fast path


def test_real_agent_id_recognised() -> None:
    assert is_real_agent_id("agent_3501kf4e3ak0eqkrxg1rttttk881")
    assert is_real_agent_id("agent_8801kn4q5ebafkws9d0wbf34yxhj")


def test_friendly_names_not_treated_as_agent_id() -> None:
    assert not is_real_agent_id("leadqualifier")
    assert not is_real_agent_id("Champ Qualifier")
    assert not is_real_agent_id("agent_short")  # too short
    assert not is_real_agent_id("")
    assert not is_real_agent_id(None)


# ------------------------------------------------------------- normalisation


def test_normalise_lowercases_and_collapses_separators() -> None:
    r = ElevenLabsAgentResolver()
    assert r._normalize("Champ Qualifier") == "champ qualifier"
    assert r._normalize("Lead-Qualifier") == "lead qualifier"
    assert r._normalize("lead_qualifier") == "lead qualifier"
    assert r._normalize("  Lead  Qualifier  ") == "lead qualifier"
    assert r._normalize("LEADQUALIFIER") == "leadqualifier"


# ----------------------------------------------------------- cached resolution


class _FakeHttpResponse:
    def __init__(self, status_code: int, body: dict) -> None:
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self) -> dict:
        return self._body


class _FakeHttpClient:
    """Minimal stand-in for httpx.AsyncClient. Records every GET so tests
    can assert how many ElevenLabs calls were made."""
    def __init__(self, agents: list[dict]) -> None:
        self._agents = agents
        self.get_calls: list[str] = []

    async def __aenter__(self) -> "_FakeHttpClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> _FakeHttpResponse:
        self.get_calls.append(url)
        return _FakeHttpResponse(200, {"agents": self._agents})


def _agents_fixture() -> list[dict]:
    return [
        {"agent_id": "agent_3501kf4e3ak0eqkrxg1rttttk881", "name": "Champ Qualifier"},
        {"agent_id": "agent_8801kn4q5ebafkws9d0wbf34yxhj", "name": "Screening agent"},
        {"agent_id": "agent_8201kgpnc604f3cbj8969e3xdshq", "name": "CYC Goa - Sales Agent"},
    ]


def _resolver_with_fake_http() -> tuple[ElevenLabsAgentResolver, _FakeHttpClient]:
    fake = _FakeHttpClient(_agents_fixture())
    r = ElevenLabsAgentResolver()
    return r, fake


@pytest.mark.asyncio
async def test_uuid_fast_path_skips_http() -> None:
    """Real UUIDs never hit ElevenLabs — fast path."""
    r, fake = _resolver_with_fake_http()
    out = await r.resolve(
        "agent_3501kf4e3ak0eqkrxg1rttttk881",
        api_key="k1",
        http_client_factory=lambda: fake,
    )
    assert out == "agent_3501kf4e3ak0eqkrxg1rttttk881"
    assert len(fake.get_calls) == 0, "UUID fast path should not hit network"


@pytest.mark.asyncio
async def test_resolves_exact_friendly_name() -> None:
    r, fake = _resolver_with_fake_http()
    out = await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake)
    assert out == "agent_3501kf4e3ak0eqkrxg1rttttk881"


@pytest.mark.asyncio
async def test_resolves_case_insensitive() -> None:
    r, fake = _resolver_with_fake_http()
    out = await r.resolve("champ qualifier", api_key="k1", http_client_factory=lambda: fake)
    assert out == "agent_3501kf4e3ak0eqkrxg1rttttk881"
    out2 = await r.resolve("CHAMP QUALIFIER", api_key="k1", http_client_factory=lambda: fake)
    assert out2 == "agent_3501kf4e3ak0eqkrxg1rttttk881"


@pytest.mark.asyncio
async def test_resolves_hyphen_underscore_variants() -> None:
    r, fake = _resolver_with_fake_http()
    out1 = await r.resolve("champ-qualifier", api_key="k1", http_client_factory=lambda: fake)
    out2 = await r.resolve("champ_qualifier", api_key="k1", http_client_factory=lambda: fake)
    assert out1 == out2 == "agent_3501kf4e3ak0eqkrxg1rttttk881"


@pytest.mark.asyncio
async def test_resolves_multi_word_with_hyphens() -> None:
    """`CYC Goa - Sales Agent` must be findable via friendly name."""
    r, fake = _resolver_with_fake_http()
    out = await r.resolve("CYC Goa - Sales Agent", api_key="k1", http_client_factory=lambda: fake)
    assert out == "agent_8201kgpnc604f3cbj8969e3xdshq"


@pytest.mark.asyncio
async def test_unknown_name_raises_with_available_list() -> None:
    r, fake = _resolver_with_fake_http()
    with pytest.raises(ValueError) as exc:
        await r.resolve("nonexistent", api_key="k1", http_client_factory=lambda: fake)
    msg = str(exc.value)
    # Error must list the available agents so the user can fix it without
    # opening ElevenLabs.
    assert "Champ Qualifier" in msg
    assert "Screening agent" in msg


@pytest.mark.asyncio
async def test_cache_avoids_redundant_http_calls() -> None:
    r, fake = _resolver_with_fake_http()
    await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake)
    await r.resolve("Screening agent", api_key="k1", http_client_factory=lambda: fake)
    await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake)
    # All three resolutions hit the same API key — only one HTTP fetch.
    assert len(fake.get_calls) == 1, f"expected 1 HTTP call, got {len(fake.get_calls)}"


@pytest.mark.asyncio
async def test_different_api_keys_have_separate_caches() -> None:
    r = ElevenLabsAgentResolver()
    fake_k1 = _FakeHttpClient(_agents_fixture())
    fake_k2 = _FakeHttpClient([{"agent_id": "agent_xxxxxxxxxxxxxxxxxxxxxxxx", "name": "Other"}])

    out1 = await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake_k1)
    assert out1 == "agent_3501kf4e3ak0eqkrxg1rttttk881"

    out2 = await r.resolve("Other", api_key="k2", http_client_factory=lambda: fake_k2)
    assert out2 == "agent_xxxxxxxxxxxxxxxxxxxxxxxx"


@pytest.mark.asyncio
async def test_invalidate_clears_cache() -> None:
    r, fake = _resolver_with_fake_http()
    await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake)
    r.invalidate("k1")
    await r.resolve("Champ Qualifier", api_key="k1", http_client_factory=lambda: fake)
    assert len(fake.get_calls) == 2, "after invalidate the next resolve should re-fetch"


@pytest.mark.asyncio
async def test_empty_value_raises_clearly() -> None:
    r, fake = _resolver_with_fake_http()
    with pytest.raises(ValueError) as exc:
        await r.resolve("", api_key="k1", http_client_factory=lambda: fake)
    assert "agent_id" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_list_friendly_names() -> None:
    r, fake = _resolver_with_fake_http()
    names = await r.list_friendly_names(api_key="k1", http_client_factory=lambda: fake)
    assert "Champ Qualifier" in names
    assert "Screening agent" in names
    # Sorted alphabetically for deterministic output
    assert names == sorted(names)
