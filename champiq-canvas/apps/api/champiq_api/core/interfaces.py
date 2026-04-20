"""Interfaces (Dependency Inversion) for orchestrator subsystems.

Each Protocol describes a single responsibility. The orchestrator depends on
these, not on concrete classes — so Redis can be swapped for in-memory, Fernet
for Vault, Anthropic for OpenAI, without touching orchestration logic.
"""
from __future__ import annotations

from abc import abstractmethod
from typing import Any, AsyncIterator, Awaitable, Callable, Optional, Protocol, runtime_checkable


# --- Credentials ---------------------------------------------------------

@runtime_checkable
class CredentialResolver(Protocol):
    """Looks up a credential record and returns decrypted data."""

    async def resolve(self, name: str) -> dict[str, Any]: ...


# --- Expressions ---------------------------------------------------------

@runtime_checkable
class ExpressionEvaluator(Protocol):
    """Evaluates `{{ expr }}` strings against a runtime context."""

    def evaluate(self, value: Any, context: dict[str, Any]) -> Any: ...


# --- Event bus (pub/sub) -------------------------------------------------

@runtime_checkable
class EventBus(Protocol):
    async def publish(self, topic: str, payload: dict[str, Any]) -> None: ...

    async def subscribe(self, topic: str) -> AsyncIterator[dict[str, Any]]: ...


# --- Job queue -----------------------------------------------------------

@runtime_checkable
class JobQueue(Protocol):
    """Enqueues background work. Implementations may be Redis/Celery or
    in-process (for dev + tests)."""

    async def enqueue(
        self, kind: str, payload: dict[str, Any], *, delay_seconds: int = 0
    ) -> str: ...

    async def register_handler(
        self, kind: str, handler: Callable[[dict[str, Any]], Awaitable[None]]
    ) -> None: ...


# --- Node execution ------------------------------------------------------

class NodeContext:
    """Everything a node executor needs at runtime. Passed by reference so
    executors stay pure — no hidden globals.
    """

    def __init__(
        self,
        *,
        execution_id: str,
        node_id: str,
        node_kind: str,
        config: dict[str, Any],
        input: dict[str, Any],
        upstream: dict[str, dict[str, Any]],
        trigger: dict[str, Any],
        credentials: CredentialResolver,
        expressions: ExpressionEvaluator,
        events: EventBus,
        emit: Callable[[str, dict[str, Any]], Awaitable[None]],
    ) -> None:
        self.execution_id = execution_id
        self.node_id = node_id
        self.node_kind = node_kind
        self.config = config
        self.input = input
        self.upstream = upstream
        self.trigger = trigger
        self.credentials = credentials
        self.expressions = expressions
        self.events = events
        self.emit = emit

    def render(self, value: Any) -> Any:
        return self.expressions.evaluate(value, self.expression_context())

    def expression_context(self) -> dict[str, Any]:
        return {
            "node": self.upstream,
            "prev": self.input,
            "trigger": self.trigger,
            "execution_id": self.execution_id,
        }


class NodeResult:
    """Outcome of executing a node.

    `output` — data made available to downstream nodes.
    `branches` — optional named outputs (for If/Switch). Empty = default branch.
    """

    __slots__ = ("output", "branches")

    def __init__(
        self,
        output: dict[str, Any] | None = None,
        branches: list[str] | None = None,
    ) -> None:
        self.output = output or {}
        self.branches = branches or []


@runtime_checkable
class NodeExecutor(Protocol):
    """Strategy: executes ONE node kind. Registered in the NodeRegistry."""

    kind: str

    @abstractmethod
    async def execute(self, ctx: NodeContext) -> NodeResult: ...


# --- Tool drivers (a NodeExecutor with extras) ---------------------------

@runtime_checkable
class ToolDriver(Protocol):
    """Driver for an external tool (Champmail, ChampGraph, Pulse, ...).

    Responsible for mapping a canvas action to an HTTP call, and for turning
    incoming webhooks into canonical events on the bus.
    """

    tool_id: str

    async def invoke(
        self,
        action: str,
        inputs: dict[str, Any],
        credentials: dict[str, Any],
    ) -> dict[str, Any]: ...

    def parse_webhook(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Return {event, data} or None if this webhook is unrecognized."""
        ...
