#!/usr/bin/env python3
"""Fake champvoice CLI stub for Phase 1.

TODO(Hemang): replace this entire file with the real champvoice binary installation.
Expected real binary behavior:
  - Reads JSON payload from stdin with keys: prospects[], script_id, call_window, max_calls
  - Initiates voice calls via the ChampVoice API.
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
