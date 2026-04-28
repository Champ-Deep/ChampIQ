"""Signed unsubscribe tokens — HMAC over the prospect ID + timestamp.

Tokens are stateless: we don't store them, we just verify the signature.
Recipients click → handler decodes → identifies prospect → marks unsubscribed.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Optional


class UnsubscribeTokens:
    def __init__(self, secret: str) -> None:
        if not secret:
            raise ValueError("UnsubscribeTokens: secret is required")
        self._secret = secret.encode()

    def issue(self, prospect_id: int) -> str:
        ts = int(time.time())
        payload = f"{prospect_id}.{ts}".encode()
        sig = hmac.new(self._secret, payload, hashlib.sha256).digest()[:12]
        return base64.urlsafe_b64encode(payload + b"." + sig).decode().rstrip("=")

    def verify(self, token: str, *, max_age_seconds: int = 60 * 60 * 24 * 365) -> Optional[int]:
        try:
            padded = token + "=" * (-len(token) % 4)
            raw = base64.urlsafe_b64decode(padded)
            payload, sig = raw.rsplit(b".", 1)
        except Exception:
            return None
        expected = hmac.new(self._secret, payload, hashlib.sha256).digest()[:12]
        if not hmac.compare_digest(expected, sig):
            return None
        try:
            pid_str, ts_str = payload.decode().split(".")
            pid, ts = int(pid_str), int(ts_str)
        except Exception:
            return None
        if max_age_seconds and (time.time() - ts) > max_age_seconds:
            return None
        return pid
