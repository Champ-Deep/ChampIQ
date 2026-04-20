"""Expression engine.

Syntax:
    {{ expr }}            -> expression is evaluated and REPLACES the enclosing string
                             (entire value is the placeholder -> keeps original type)
    "hello {{ name }}"    -> interpolation (string concatenation)

Inside the expression, the following names are bound:
    node               dict of {node_id: {"output": ..., "input": ...}} for upstream nodes
    prev               shortcut for input of the direct predecessor
    trigger            the trigger payload (webhook body / event data)
    execution_id       the current execution's id

Nested dicts/lists are recursively evaluated.
"""
from __future__ import annotations

import re
from typing import Any

from simpleeval import EvalWithCompoundTypes, InvalidExpression

_EXPR_RE = re.compile(r"\{\{\s*(.+?)\s*\}\}")
_WHOLE_EXPR_RE = re.compile(r"^\s*\{\{\s*(.+?)\s*\}\}\s*$")


def _safe_get(obj: Any, key: Any) -> Any:
    """Indexing that never raises — returns None on miss. Friendlier in expressions."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    if isinstance(obj, (list, tuple)):
        try:
            return obj[int(key)]
        except (IndexError, ValueError, TypeError):
            return None
    return getattr(obj, str(key), None)


class _DotDict(dict):
    """Dict that supports both `d["k"]` and `d.k` — so expressions can say
    `node.Champmail.output.prospect.email` instead of bracket soup.
    """

    def __getattr__(self, item: str) -> Any:
        value = self.get(item)
        return _wrap(value)

    def __getitem__(self, item: Any) -> Any:
        return _wrap(super().get(item))


def _wrap(value: Any) -> Any:
    if isinstance(value, dict) and not isinstance(value, _DotDict):
        return _DotDict(value)
    if isinstance(value, list):
        return [_wrap(v) for v in value]
    return value


class SimpleExpressionEvaluator:
    """Sandboxed expression evaluator.

    Uses `simpleeval` — disallows attribute access to builtins, imports, and
    dunder names. No eval()/exec(). Binds a minimal name table.
    """

    def __init__(self) -> None:
        self._functions = {
            "len": len,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
            "lower": lambda s: str(s).lower() if s is not None else "",
            "upper": lambda s: str(s).upper() if s is not None else "",
            "strip": lambda s: str(s).strip() if s is not None else "",
            "default": lambda v, fallback: fallback if v in (None, "", []) else v,
            "get": _safe_get,
        }

    def evaluate(self, value: Any, context: dict[str, Any]) -> Any:
        return self._render(value, self._build_names(context))

    # -- internals --------------------------------------------------------

    def _build_names(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "node": _wrap(context.get("node", {})),
            "prev": _wrap(context.get("prev", {})),
            "trigger": _wrap(context.get("trigger", {})),
            "execution_id": context.get("execution_id"),
        }

    def _render(self, value: Any, names: dict[str, Any]) -> Any:
        if isinstance(value, str):
            return self._render_str(value, names)
        if isinstance(value, dict):
            return {k: self._render(v, names) for k, v in value.items()}
        if isinstance(value, list):
            return [self._render(v, names) for v in value]
        return value

    def _render_str(self, raw: str, names: dict[str, Any]) -> Any:
        whole = _WHOLE_EXPR_RE.match(raw)
        if whole is not None:
            return self._eval(whole.group(1), names)

        def repl(match: re.Match[str]) -> str:
            result = self._eval(match.group(1), names)
            return "" if result is None else str(result)

        return _EXPR_RE.sub(repl, raw)

    def _eval(self, expr: str, names: dict[str, Any]) -> Any:
        evaluator = EvalWithCompoundTypes(names=names, functions=self._functions)
        try:
            return evaluator.eval(expr)
        except InvalidExpression as err:
            raise ValueError(f"Invalid expression {expr!r}: {err}") from err
        except Exception as err:  # attribute misses on None etc.
            raise ValueError(f"Expression error {expr!r}: {err}") from err
