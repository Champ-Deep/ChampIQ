"""Registry of NodeExecutors (open/closed: add new kinds without edits here)."""
from __future__ import annotations

from ..core.interfaces import NodeExecutor


class NodeRegistry:
    def __init__(self) -> None:
        self._executors: dict[str, NodeExecutor] = {}

    def register(self, executor: NodeExecutor) -> None:
        if not getattr(executor, "kind", None):
            raise ValueError("NodeExecutor must define `kind`")
        self._executors[executor.kind] = executor

    def get(self, kind: str) -> NodeExecutor:
        executor = self._executors.get(kind)
        if executor is None:
            raise KeyError(f"No executor registered for node kind {kind!r}")
        return executor

    def kinds(self) -> list[str]:
        return sorted(self._executors.keys())
