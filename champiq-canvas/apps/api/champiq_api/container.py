"""Composition root.

All wiring (DI) happens here. Routes import `get_container()` to reach deps.
Keeping this in one place makes it trivial to swap implementations in tests.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .champgraph import ChampGraphLocalExecutor, ChampGraphService, GraphitiClient
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
from .drivers import (
    ChampMailDriver,
    ChampVoiceDriver,
    HarbingerDriver,
    LakebPulseDriver,
    LakeStreamDriver,
    ToolNodeExecutor,
)
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
from .triggers import CronScheduler, EventTriggerListener, GraphWritebackConsumer, LedgerConsumer
from .triggers.janitor import Janitor


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
    # Event consumers (SUGGESTIONS 2.1 + 4.1): async graph write-back + run ledger
    graph_writeback: GraphWritebackConsumer
    ledger: LedgerConsumer
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
    # Background persistence janitor — see triggers/janitor.py
    janitor: "Any"
    # Durable Postgres-backed job queue (SUGGESTIONS 4.3)
    job_queue: "Any"

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

    # Tool drivers (HTTP-backed). champgraph stays inline via ChampGraphService
    # (registered below). champmail's driver now owns the real send path too
    # (2026-07-27 consolidation — see the removed ChampmailLocalExecutor
    # registration below), and champvoice proxies to the champiq-voice gateway
    # instead of calling ElevenLabs directly (same consolidation).
    drivers = {
        "champvoice":   ChampVoiceDriver(settings.champvoice_gateway_url),
        "lakeb2b_pulse": LakebPulseDriver("https://b2b-pulse.up.railway.app"),
        # * SENSE stage front door + webhook ingress for prospect.qualified /
        # * signal.matched (SUGGESTIONS 2.2). Empty URL = pull actions fail loud,
        # * webhooks still parse (ingress is the important half locally).
        "harbinger":    HarbingerDriver(settings.harbinger_url),
        # * real-ChampMail webhook ingress for email.sent/bounced/opened/clicked
        # * (SUGGESTIONS 2.2 pattern; 2026-07-23 finding #7 fix).
        "champmail":    ChampMailDriver(settings.champmail_base_url),
        # * Scraping/enrichment + ATS job-board ingestion. Without this the
        # * front of the funnel was not orchestratable at all — companies
        # * only entered the system via the e2e bridge scripts, run by hand.
        "lakestream":   LakeStreamDriver(settings.lakestream_base_url),
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

    # * ChampmailLocalExecutor used to be registered here for canvas nodes of
    # * kind "champmail", overriding the ToolNodeExecutor(ChampMailDriver)
    # * registered above in the drivers loop — it fired sends straight at
    # * Emelia from canvas nodes, bypassing ChampMail's real auth+suppression-
    # * checked /api/v1/send entirely (orphaned migration debris, not a
    # * deliberate fallback). Removing the override restores the driver as the
    # * canvas-node path for "champmail": every send now goes through
    # * ChampMailDriver -> ChampMail's real send API (2026-07-27 consolidation).
    # * mail_transport/mail_renderer/mail_transport_factory stay wired below —
    # * CadenceService's scheduled sequence sends are a separate, legitimate
    # * path, not a canvas-node bypass.

    # ChampGraph dispatcher — prospect actions hit local Postgres,
    # graph/intel/campaign actions hit Graphiti (BlueOcean VPS). Empty URL =
    # graph actions return {"available": false} instead of crashing.
    graphiti_client = GraphitiClient(
        base_url=settings.champgraph_url,
        api_key=settings.champgraph_api_key,
    )
    champgraph = ChampGraphService(session_factory, graphiti_client)
    registry.register(ChampGraphLocalExecutor(champgraph))

    # Event consumers: every channel event lands in the graph (async, off the
    # hot path) and in the run ledger. Siblings of EventTriggerListener.
    # Bounced/unsubscribed also enforce suppression in ChampMail (4.6).
    graph_writeback = GraphWritebackConsumer(
        event_bus,
        champgraph,
        champmail_base_url=settings.champmail_base_url,
        champmail_bearer_token=settings.champmail_bearer_token,
        session_factory=session_factory,  # prospect_lifecycle transitions (item 1)
    )
    ledger = LedgerConsumer(event_bus, session_factory)

    # Persistence janitor — pins one job to the cron scheduler (we don't want
    # a second AsyncIOScheduler in the process).
    janitor = Janitor(session_factory, cron.scheduler)

    # Durable job queue (SUGGESTIONS 4.3) — Postgres-backed, SELECT ... FOR
    # UPDATE SKIP LOCKED. Replaces the in-memory asyncio queue that dropped
    # every pending job on restart. No callers exist yet (build_job_queue was
    # imported but never invoked before this change); wired here so it's ready
    # to use with the same enqueue/register_handler interface.
    job_queue = build_job_queue(session_factory)

    return Container(
        crypto=crypto,
        registry=registry,
        orchestrator=orchestrator,
        event_bus=event_bus,
        expressions=expressions,
        credential_resolver=credential_resolver,
        cron=cron,
        event_listener=event_listener,
        graph_writeback=graph_writeback,
        ledger=ledger,
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
        janitor=janitor,
        job_queue=job_queue,
    )
