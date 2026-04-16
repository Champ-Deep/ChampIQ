#!/usr/bin/env python3
"""Fake champgraph CLI stub for Phase 1.

TODO(Hemang): replace this entire file with the real champgraph binary installation.
Expected real binary behavior:
  - Reads JSON payload from stdin with keys: industry, role, company_size
  - Calls the ChampGraph API and returns a list of matching prospects.
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
