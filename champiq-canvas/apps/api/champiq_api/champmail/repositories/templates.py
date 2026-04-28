from __future__ import annotations

import re
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMTemplate


_VAR_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}")


def extract_variables(*texts: str) -> list[str]:
    """Extract all `{{ var }}` names from Jinja-style strings, deduplicated, sorted."""
    seen: set[str] = set()
    for t in texts:
        if not t:
            continue
        for m in _VAR_RE.finditer(t):
            seen.add(m.group(1))
    return sorted(seen)


class TemplateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, template_id: int) -> Optional[CMTemplate]:
        return await self._session.get(CMTemplate, template_id)

    async def get_by_name(self, name: str) -> Optional[CMTemplate]:
        result = await self._session.execute(select(CMTemplate).where(CMTemplate.name == name))
        return result.scalar_one_or_none()

    async def list(self) -> list[CMTemplate]:
        stmt = select(CMTemplate).order_by(CMTemplate.updated_at.desc())
        return list((await self._session.execute(stmt)).scalars().all())

    async def create(self, **fields: Any) -> CMTemplate:
        fields["variables"] = extract_variables(
            fields.get("subject", ""),
            fields.get("body_html", ""),
            fields.get("body_text") or "",
        )
        row = CMTemplate(**fields)
        self._session.add(row)
        await self._session.flush()
        return row

    async def update(self, template_id: int, **fields: Any) -> Optional[CMTemplate]:
        row = await self.get(template_id)
        if row is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(row, k, v)
        # Re-extract variables on every content change
        row.variables = extract_variables(row.subject, row.body_html, row.body_text or "")
        await self._session.flush()
        return row

    async def delete(self, template_id: int) -> bool:
        row = await self.get(template_id)
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True
