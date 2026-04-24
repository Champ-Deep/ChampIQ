"""LLM abstraction.

Kept minimal on purpose — just `complete(messages, ...)`. This is the seam
that lets us swap OpenRouter for Anthropic/OpenAI/Ollama later without
touching chat or node code.

Dependency Inversion: callers (chat router, LLM node) accept an LLMProvider.
Open/Closed: add a provider by implementing this ABC; no edits elsewhere.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal, Sequence


Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class LLMMessage:
    role: Role
    content: str


@dataclass
class LLMResponse:
    text: str
    model: str
    raw: dict | None = None


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> LLMResponse: ...
