"""Code node — sandboxed Python expressions.

Security posture: runs inside simpleeval, NOT Python `exec`. Users get arithmetic,
comparisons, comprehensions, and safe builtins. No imports, no file/network I/O.
For full Python, move this to a subprocess with resource limits; out of scope
for the initial cut.
"""
from __future__ import annotations

from typing import Any

from simpleeval import EvalWithCompoundTypes

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


_SAFE_FUNCTIONS: dict[str, Any] = {
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "min": min,
    "max": max,
    "sum": sum,
    "sorted": sorted,
    "any": any,
    "all": all,
    "range": range,
    "abs": abs,
    "round": round,
}


class CodeExecutor(NodeExecutor):
    kind = "code"

    async def execute(self, ctx: NodeContext) -> NodeResult:
        expression = ctx.config.get("expression", "prev")
        names = {
            "prev": ctx.input,
            "node": ctx.upstream,
            "trigger": ctx.trigger,
        }
        evaluator = EvalWithCompoundTypes(names=names, functions=_SAFE_FUNCTIONS)
        value = evaluator.eval(expression)
        if isinstance(value, dict):
            return NodeResult(output=value)
        return NodeResult(output={"value": value})
