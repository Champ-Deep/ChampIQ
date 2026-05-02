"""File upload endpoint — parses CSV/Excel prospect files into JSON records.

The frontend sends a multipart/form-data POST with a file field. The response
is a JSON array of dicts ready to be fed as the `items` config of a Loop node.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile

log = logging.getLogger(__name__)
router = APIRouter()

_MAX_ROWS = 10_000
_MAX_FILE_MB = 10


def _parse_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")  # strip BOM if present
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, Any]] = []
    for i, row in enumerate(reader):
        if i >= _MAX_ROWS:
            break
        # csv.DictReader returns None for missing columns (short rows) and
        # also yields rows of all-None for trailing blank lines. Coerce to ""
        # and skip rows where every value is blank.
        cleaned = {
            k.strip(): (v.strip() if isinstance(v, str) else "")
            for k, v in row.items()
            if k
        }
        if any(cleaned.values()):
            rows.append(cleaned)
    return rows


def _parse_excel(content: bytes) -> list[dict[str, Any]]:
    try:
        import openpyxl  # type: ignore[import]
    except ImportError:
        raise HTTPException(
            422,
            "openpyxl is not installed on this server. Upload a CSV file instead, "
            "or ask the admin to install openpyxl.",
        )
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(next(rows_iter))]
    except StopIteration:
        return []

    rows: list[dict[str, Any]] = []
    for i, row in enumerate(rows_iter):
        if i >= _MAX_ROWS:
            break
        # Cells past the header width are dropped silently; trailing all-blank
        # rows are skipped so an empty bottom of the sheet doesn't create
        # phantom records.
        cleaned: dict[str, Any] = {}
        for j, v in enumerate(row):
            if j >= len(headers):
                break
            cleaned[headers[j]] = str(v).strip() if v is not None else ""
        if any(cleaned.values()):
            rows.append(cleaned)
    wb.close()
    return rows


@router.post("/uploads/prospects")
async def upload_prospects(file: UploadFile) -> dict[str, Any]:
    """Parse a CSV or Excel file and return rows as JSON.

    Returns:
        { "records": [...], "count": N, "columns": [...] }
    """
    if file.size and file.size > _MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {_MAX_FILE_MB} MB)")

    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".csv") or (file.content_type or "").startswith("text/"):
        records = _parse_csv(content)
    elif filename.endswith((".xlsx", ".xls")):
        records = _parse_excel(content)
    else:
        # Try CSV as fallback
        try:
            records = _parse_csv(content)
        except Exception:
            raise HTTPException(422, "Unsupported file type. Upload a .csv or .xlsx file.")

    if not records:
        raise HTTPException(422, "No data rows found in file.")

    columns = list(records[0].keys()) if records else []
    return {"records": records, "count": len(records), "columns": columns}
