"""Trigger-node executors.

Triggers are special: they don't do external work when executed, they just
hand the trigger payload forward as output so downstream nodes can read it.
The actual trigger *listening* lives in champiq_api.triggers (scheduler,
webhook receiver, event subscriber).
"""
from __future__ import annotations

from ..core.interfaces import NodeContext, NodeExecutor, NodeResult


class _PassthroughTrigger(NodeExecutor):
    kind = ""

    async def execute(self, ctx: NodeContext) -> NodeResult:
        return NodeResult(output={"payload": ctx.trigger})


class ManualTriggerExecutor(_PassthroughTrigger):
    kind = "trigger.manual"


class WebhookTriggerExecutor(_PassthroughTrigger):
    kind = "trigger.webhook"


class EventTriggerExecutor(_PassthroughTrigger):
    kind = "trigger.event"


class CronTriggerExecutor(_PassthroughTrigger):
    kind = "trigger.cron"
