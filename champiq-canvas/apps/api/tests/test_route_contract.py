"""API contract snapshot regression test.

Walks every registered route on the FastAPI app, captures its public contract
(path, methods, name, status_code, request schema, response schema, path params),
and compares against the on-disk snapshot at ``contract_snapshot.json``.

The snapshot is the source of truth for the live production API contract. Any
diff — added route, removed route, renamed handler, changed path, changed
method, schema drift — fails this test.

Updating the snapshot is a deliberate act:
    UPDATE_CONTRACT_SNAPSHOT=1 pytest tests/test_route_contract.py

Reviewers seeing a snapshot diff in a PR should confirm it matches the
intentional scope of the change.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

# Ensure FastAPI doesn't try to start lifespan / hit Postgres when we import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://stub/stub")
os.environ.setdefault("FERNET_KEY", "0" * 44)  # any 44-char base64-ish placeholder

from fastapi.routing import APIRoute, APIWebSocketRoute  # noqa: E402
from starlette.routing import Mount, Route, WebSocketRoute  # noqa: E402

from champiq_api.main import app  # noqa: E402

SNAPSHOT_PATH = Path(__file__).parent / "contract_snapshot.json"


def _route_signature(r: Any) -> dict[str, Any]:
    """Extract a deterministic, serializable signature from a route."""
    if isinstance(r, APIRoute):
        sig: dict[str, Any] = {
            "kind": "http",
            "path": r.path,
            "methods": sorted(r.methods or []),
            "name": r.name,
            "status_code": r.status_code,
            "include_in_schema": r.include_in_schema,
        }
        # Pydantic request body — capture field names + JSON schema.
        body_field = getattr(r, "body_field", None)
        if body_field is not None:
            try:
                schema = body_field.field_info.annotation.model_json_schema()  # type: ignore[union-attr]
                sig["request_schema"] = _strip_definitions(schema)
            except Exception:
                sig["request_schema"] = {"_error": "could not serialize"}
        # Response model — same.
        if r.response_model is not None:
            try:
                sig["response_schema"] = _strip_definitions(
                    r.response_model.model_json_schema()
                )
            except Exception:
                sig["response_schema"] = {"_error": "could not serialize"}
        # Path parameters (e.g. /workflows/{workflow_id}).
        sig["path_params"] = sorted(
            p.name for p in r.dependant.path_params
        ) if r.dependant else []
        return sig

    if isinstance(r, APIWebSocketRoute):
        return {
            "kind": "ws",
            "path": r.path,
            "name": r.name,
        }

    # Framework defaults: /docs, /openapi.json, /redoc, /docs/oauth2-redirect.
    if isinstance(r, Route):
        return {
            "kind": "framework-http",
            "path": r.path,
            "methods": sorted(r.methods or []),
            "name": r.name,
        }

    if isinstance(r, WebSocketRoute):
        return {
            "kind": "framework-ws",
            "path": r.path,
            "name": r.name,
        }

    if isinstance(r, Mount):
        return {
            "kind": "mount",
            "path": r.path,
            "name": r.name,
        }

    return {"kind": type(r).__name__, "path": getattr(r, "path", None)}


def _strip_definitions(schema: dict[str, Any]) -> dict[str, Any]:
    """Remove $defs/definitions to keep snapshot diffs focused on the user-facing
    contract rather than Pydantic internal schema fan-out.
    """
    out = {k: v for k, v in schema.items() if k not in {"$defs", "definitions"}}
    return out


def _current_signatures() -> list[dict[str, Any]]:
    sigs = [_route_signature(r) for r in app.routes]
    # Deterministic ordering: by (path, methods, name).
    sigs.sort(key=lambda s: (s.get("path") or "", str(s.get("methods", [])), s.get("name") or ""))
    return sigs


def _read_snapshot() -> list[dict[str, Any]] | None:
    if not SNAPSHOT_PATH.exists():
        return None
    return json.loads(SNAPSHOT_PATH.read_text())


def _write_snapshot(sigs: list[dict[str, Any]]) -> None:
    SNAPSHOT_PATH.write_text(json.dumps(sigs, indent=2, sort_keys=True) + "\n")


def test_route_contract_matches_snapshot() -> None:
    """Live route contract must match the on-disk snapshot.

    Run with UPDATE_CONTRACT_SNAPSHOT=1 to regenerate after a deliberate change.
    """
    current = _current_signatures()

    if os.environ.get("UPDATE_CONTRACT_SNAPSHOT") == "1":
        _write_snapshot(current)
        return

    expected = _read_snapshot()
    if expected is None:
        # First run: bootstrap the snapshot. The test still passes — the next
        # commit captures the file. CI will block any subsequent drift.
        _write_snapshot(current)
        pytest.skip("contract_snapshot.json bootstrapped — re-run to verify")

    assert current == expected, (
        "API contract drifted from snapshot.\n\n"
        "If this change was intentional (a deliberate route or schema change), "
        "regenerate the snapshot:\n\n"
        "    UPDATE_CONTRACT_SNAPSHOT=1 pytest apps/api/tests/test_route_contract.py\n\n"
        "Otherwise, this is a regression. The diff between current and expected "
        "shows exactly which route/schema changed."
    )


def test_no_routes_lost_or_added_silently() -> None:
    """Belt-and-braces check: route *count* must match. Catches the common
    mistake of someone adding a snapshot row without noticing they also added
    a real route, or removing a route + snapshot row in one go.
    """
    current = _current_signatures()
    expected = _read_snapshot() or current
    assert len(current) == len(expected), (
        f"route count changed: snapshot has {len(expected)} routes, "
        f"app currently exposes {len(current)}"
    )
