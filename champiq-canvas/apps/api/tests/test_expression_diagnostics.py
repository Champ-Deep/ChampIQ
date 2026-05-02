"""Contract tests for ExpressionDiagnostics + ExpressionErrorTranslator.

These pin the authoring-mistake detection rules so future changes to the
engine can't silently regress what the user sees on the canvas.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://stub/stub")
os.environ.setdefault("FERNET_KEY", "0" * 44)

from champiq_api.expressions import (  # noqa: E402
    ExpressionDiagnostics,
    ExpressionErrorTranslator,
    SimpleExpressionEvaluator,
)


# -------------------------------------------------------------- diagnostics


def test_clean_wrapped_expression_passes() -> None:
    assert ExpressionDiagnostics.inspect("{{ prev.email }}") is None
    assert ExpressionDiagnostics.inspect("Hello {{ item.first_name }}!") is None
    assert ExpressionDiagnostics.inspect("plain string with no expressions") is None


def test_bare_expression_is_flagged() -> None:
    """The exact failure mode the user hit: `trigger-manual-upload.payload.items`
    written without {{ }} brackets. Must produce an error pointing at the wrap.
    """
    w = ExpressionDiagnostics.inspect("trigger.payload.items")
    assert w is not None
    assert w.severity == "error"
    assert "unwrapped expression" in w.message.lower()
    assert w.suggestion is not None
    assert "{{" in w.suggestion and "}}" in w.suggestion


def test_bare_dot_chain_with_item_is_flagged() -> None:
    w = ExpressionDiagnostics.inspect("item.email")
    assert w is not None
    assert w.severity == "error"


def test_bare_prev_dot_chain_is_flagged() -> None:
    w = ExpressionDiagnostics.inspect("prev.records")
    assert w is not None
    assert w.severity == "error"


def test_hyphenated_id_inside_wrapper_is_flagged() -> None:
    """`{{ trigger-manual-upload.payload.items }}` — hyphens parse as subtraction.
    Must point at the offending id and suggest bracket access.
    """
    w = ExpressionDiagnostics.inspect("{{ trigger-manual-upload.payload.items }}")
    assert w is not None
    assert w.severity == "error"
    assert "trigger-manual-upload" in w.message
    assert w.suggestion is not None
    assert "node[" in w.suggestion or "prev" in w.suggestion


def test_clean_bracket_access_passes() -> None:
    """The fix the diagnostics suggests must itself pass."""
    assert ExpressionDiagnostics.inspect(
        "{{ node['trigger-manual-upload'].output.items }}"
    ) is None


def test_mismatched_braces_is_flagged() -> None:
    w = ExpressionDiagnostics.inspect("{{ prev.email }")
    assert w is not None
    assert w.severity == "error"
    assert "mismatched" in w.message.lower() or "bracket" in w.message.lower()


def test_empty_expression_is_flagged() -> None:
    w = ExpressionDiagnostics.inspect("hello {{   }} world")
    assert w is not None
    assert w.severity == "error"
    assert "empty" in w.message.lower()


def test_non_string_input_returns_none() -> None:
    """Diagnostics must not crash on non-string input — the evaluator
    recursively renders dicts and lists, but for those it never calls inspect."""
    assert ExpressionDiagnostics.inspect(42) is None  # type: ignore[arg-type]
    assert ExpressionDiagnostics.inspect(None) is None  # type: ignore[arg-type]


def test_string_with_unrelated_dots_passes() -> None:
    """Plain strings with dots that don't match a root name must not trigger a
    false positive (e.g. URLs, domains, version strings)."""
    assert ExpressionDiagnostics.inspect("https://example.com/foo.bar") is None
    assert ExpressionDiagnostics.inspect("v1.2.3") is None
    assert ExpressionDiagnostics.inspect("john.doe@example.com") is None


# -------------------------------------------------------------- translator


def test_translator_suggests_bracket_access_for_hyphen_ids() -> None:
    """When simpleeval fails because a hyphenated identifier was treated as
    subtraction, the translator must produce a suggestion that points at
    bracket access.
    """
    err = NameError("'manual' is not defined")
    out = ExpressionErrorTranslator.translate("trigger-manual-upload.payload.items", err)
    msg = str(out)
    assert "trigger-manual-upload" in msg
    assert "hyphen" in msg.lower() or "subtraction" in msg.lower()
    assert "node[" in msg or "prev" in msg


def test_translator_suggests_prev_for_item_outside_loop() -> None:
    err = NameError("name 'item' is not defined")
    out = ExpressionErrorTranslator.translate("item.email", err)
    msg = str(out)
    assert "item" in msg
    assert "loop" in msg.lower()
    assert "prev" in msg or "trigger" in msg


def test_translator_falls_through_unknown_errors() -> None:
    """For errors we have no specific suggestion for, the original message
    must still be surfaced (not swallowed)."""
    err = TypeError("can't multiply str by str")
    out = ExpressionErrorTranslator.translate("'a' * 'b'", err)
    msg = str(out)
    assert "'a' * 'b'" in msg
    assert "can't multiply" in msg


# -------------------------------------------------------------- end-to-end through evaluator


def test_evaluator_raises_clear_error_on_bare_expression() -> None:
    """End-to-end: a bare expression hitting the evaluator surfaces the
    diagnostic message, not silent fall-through."""
    ev = SimpleExpressionEvaluator()
    with pytest.raises(ValueError) as exc:
        ev.evaluate("trigger.payload.items", {"trigger": {"payload": {"items": [1, 2]}}})
    assert "unwrapped expression" in str(exc.value).lower()


def test_evaluator_raises_clear_error_on_hyphen_id() -> None:
    """End-to-end: hyphen-id inside {{ }} is caught by static diagnostics
    BEFORE it reaches simpleeval, so the error points at bracket access."""
    ev = SimpleExpressionEvaluator()
    with pytest.raises(ValueError) as exc:
        ev.evaluate("{{ trigger-manual-upload.payload.items }}", {})
    msg = str(exc.value)
    assert "trigger-manual-upload" in msg
    assert "node[" in msg or "prev" in msg


def test_evaluator_clean_expressions_still_work() -> None:
    """Liskov: every previously-correct expression must still evaluate."""
    ev = SimpleExpressionEvaluator()
    assert ev.evaluate("{{ prev.email }}", {"prev": {"email": "a@b.c"}}) == "a@b.c"
    assert ev.evaluate("Hi {{ item.first_name }}!", {"item": {"first_name": "Hemang"}}) == "Hi Hemang!"
    assert ev.evaluate(
        "{{ node['trigger-manual-upload'].output.items }}",
        {"node": {"trigger-manual-upload": {"output": {"items": [1, 2, 3]}}}},
    ) == [1, 2, 3]


def test_evaluator_recurses_into_dicts_and_lists_unchanged() -> None:
    """Diagnostics only run on string leaves — composite values keep
    being rendered recursively."""
    ev = SimpleExpressionEvaluator()
    out = ev.evaluate(
        {"x": "{{ prev.a }}", "y": ["{{ prev.b }}", 42]},
        {"prev": {"a": 1, "b": 2}},
    )
    assert out == {"x": 1, "y": [2, 42]}
