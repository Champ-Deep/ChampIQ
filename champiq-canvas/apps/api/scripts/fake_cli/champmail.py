#!/usr/bin/env python3
"""Fake champmail CLI stub for Phase 1.

TODO(Hemang): replace this entire file with the real champmail binary installation.
Expected real binary behavior:
  - Reads JSON payload from stdin with keys: prospects[], subject, template_id, daily_limit
  - Queues emails via the Champmail API.
  - Returns JSON: {"job_id": "<real-id>", "accepted": true}
"""
import sys
import json
import time
import uuid


def main():
    payload = json.loads(sys.stdin.read())
    time.sleep(0.5)
    print(json.dumps({"job_id": f"fake-{uuid.uuid4().hex[:8]}", "accepted": True}))


if __name__ == "__main__":
    main()
