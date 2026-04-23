"""Composition root.

All wiring (DI) happens here. Routes import `get_container()` to reach deps.
Keeping this in one place makes it trivial to swap implementations in tests.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .credentials import CredentialService, FernetCrypto, SqlCredentialResolver
from .database import get_session_factory, get_settings
from .drivers import ChampGraphDriver, ChampmailDriver, ChampVoiceDriver, LakebPulseDriver, ToolNodeExecutor
from .expressions import SimpleExpressionEvaluator
from .llm import LLMProvider, OpenRouterProvider
from .nodes import (
    ChampmailReplyClassifierExecutor,
    CodeExecutor,
    CronTriggerExecutor,
    EventTriggerExecutor,
    HttpExecutor,
    IfExecutor,
    LLMExecutor,
    LoopExecutor,
    ManualTriggerExecutor,
    MergeExecutor,
    SetExecutor,
    SplitExecutor,
    SwitchExecutor,
    WaitExecutor,
    WebhookTriggerExecutor,
)
from .runtime import NodeRegistry, Orchestrator, build_event_bus, build_job_queue
from .triggers import CronScheduler, EventTriggerListener


@dataclass
class Container:
    crypto: FernetCrypto
    registry: NodeRegistry
    orchestrator: Orchestrator
    event_bus: Any
    expressions: SimpleExpressionEvaluator
    credential_resolver: SqlCredentialResolver
    cron: CronScheduler
    event_listener: EventTriggerListener
    drivers: dict[str, Any]
    llm: LLMProvider

    def credential_service(self) -> CredentialService:
        from .database import get_session_factory
        # Intentionally creates a service per call; caller commits.
        factory = get_session_factory()
        return CredentialService(factory(), self.crypto)


@lru_cache
def get_container() -> Container:
    settings = get_settings()
    crypto = FernetCrypto(settings.fernet_key)
    session_factory = get_session_factory()
    credential_resolver = SqlCredentialResolver(session_factory, crypto)
    expressions = SimpleExpressionEvaluator()
    event_bus = build_event_bus(settings.redis_url)

    registry = NodeRegistry()

    # Tool drivers.
    drivers = {
        "champmail":    ChampmailDriver(settings.champmail_base_url),
        "champgraph":   ChampGraphDriver(settings.champgraph_base_url),
        # ChampVoice gateway URL is the fallback; credentials["gateway_url"] overrides at runtime
        "champvoice":   ChampVoiceDriver(settings.champvoice_gateway_url),
        "lakeb2b_pulse": LakebPulseDriver(settings.lakeb2b_base_url),
    }
    for driver in drivers.values():
        registry.register(ToolNodeExecutor(driver))

    # Built-in nodes.
    for executor in (
        IfExecutor(),
        SwitchExecutor(),
        SetExecutor(),
        MergeExecutor(),
        SplitExecutor(),
        LoopExecutor(),
        WaitExecutor(),
        HttpExecutor(),
        CodeExecutor(),
        LLMExecutor(),
        ChampmailReplyClassifierExecutor(),
        ManualTriggerExecutor(),
        WebhookTriggerExecutor(),
        EventTriggerExecutor(),
        CronTriggerExecutor(),
    ):
        registry.register(executor)

    orchestrator = Orchestrator(
        session_factory=session_factory,
        registry=registry,
        credentials=credential_resolver,
        expressions=expressions,
        events=event_bus,
    )

    cron = CronScheduler(session_factory, orchestrator)
    event_listener = EventTriggerListener(session_factory, event_bus, orchestrator)

    llm: LLMProvider = OpenRouterProvider(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_model=settings.openrouter_model,
        referrer=settings.openrouter_referrer,
        app_title=settings.openrouter_app_title,
    )

    return Container(
        crypto=crypto,
        registry=registry,
        orchestrator=orchestrator,
        event_bus=event_bus,
        expressions=expressions,
        credential_resolver=credential_resolver,
        cron=cron,
        event_listener=event_listener,
        drivers=drivers,
        llm=llm,
    )
