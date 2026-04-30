"""Composition root.

All wiring (DI) happens here. Routes import `get_container()` to reach deps.
Keeping this in one place makes it trivial to swap implementations in tests.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .champgraph import ChampGraphLocalExecutor, ChampGraphService, GraphitiClient
from .champmail.nodes import ChampmailLocalExecutor
from .champmail.rendering import TemplateRenderer, UnsubscribeTokens
from .champmail.scheduling import CadenceJob
from .champmail.services import CadenceService
from .champmail.transport import (
    EmeliaTransport,
    MailTransport,
    MailTransportFactory,
    StubTransport,
)
from .credentials import CredentialService, FernetCrypto, SqlCredentialResolver
from .database import get_session_factory, get_settings
from .drivers import ChampVoiceDriver, LakebPulseDriver, ToolNodeExecutor
from .expressions import SimpleExpressionEvaluator
from .llm import LLMProvider, OpenRouterProvider
from .nodes import (
    ChampmailReplyClassifierExecutor,
    CodeExecutor,
    CronTriggerExecutor,
    CsvUploadExecutor,
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
    # ChampMail inline
    mail_transport: MailTransport
    mail_transport_factory: MailTransportFactory
    mail_renderer: TemplateRenderer
    unsubscribe_tokens: UnsubscribeTokens
    emelia_default_sender_ids: list[str]
    emelia_webhook_secret: str
    cadence_job: CadenceJob
    # ChampGraph dispatcher (prospect-CRUD local, graph + AI campaign via Graphiti)
    champgraph: ChampGraphService

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

    # Tool drivers (HTTP-backed). Champmail and champgraph are no longer here —
    # they're inline modules dispatched via ChampmailLocalExecutor / the
    # ChampGraphService respectively (registered below).
    drivers = {
        "champvoice":   ChampVoiceDriver(""),  # calls ElevenLabs directly; no gateway needed
        "lakeb2b_pulse": LakebPulseDriver("https://b2b-pulse.up.railway.app"),
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
        CsvUploadExecutor(),
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

    # ChampMail inline — Emelia transport (or Stub if no API key, so dev/CI never break)
    if settings.emelia_api_key:
        mail_transport: MailTransport = EmeliaTransport(api_key=settings.emelia_api_key)
    else:
        mail_transport = StubTransport()
    mail_renderer = TemplateRenderer()
    mail_transport_factory = MailTransportFactory(default_transport=mail_transport, crypto=crypto)
    unsubscribe_secret = settings.champmail_unsubscribe_secret or settings.fernet_key or "dev-secret-do-not-use"
    unsubscribe_tokens = UnsubscribeTokens(secret=unsubscribe_secret)
    sender_ids = [s.strip() for s in (settings.emelia_default_sender_ids or "").split(",") if s.strip()]

    cadence_service = CadenceService(
        session_factory, mail_transport, mail_renderer,
        unsubscribe_tokens=unsubscribe_tokens,
        unsubscribe_base_url=settings.public_base_url,
        transport_factory=mail_transport_factory,
    )
    cadence_job = CadenceJob(cron.scheduler, cadence_service, interval_seconds=60)

    # Register the inline ChampMail node executor — replaces the old HTTP-based
    # ChampmailDriver. Same `kind: champmail`, identical config schema, but now
    # runs against local services instead of the external VPS.
    registry.register(ChampmailLocalExecutor(
        mail_transport, mail_renderer, transport_factory=mail_transport_factory,
    ))

    # ChampGraph dispatcher — prospect actions hit local Postgres,
    # graph/intel/campaign actions hit Graphiti (BlueOcean VPS). Empty URL =
    # graph actions return {"available": false} instead of crashing.
    graphiti_client = GraphitiClient(
        base_url=settings.champgraph_url,
        api_key=settings.champgraph_api_key,
    )
    champgraph = ChampGraphService(session_factory, graphiti_client)
    registry.register(ChampGraphLocalExecutor(champgraph))

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
        champgraph=champgraph,
        mail_transport=mail_transport,
        mail_transport_factory=mail_transport_factory,
        mail_renderer=mail_renderer,
        unsubscribe_tokens=unsubscribe_tokens,
        emelia_default_sender_ids=sender_ids,
        emelia_webhook_secret=settings.emelia_webhook_secret,
        cadence_job=cadence_job,
    )
