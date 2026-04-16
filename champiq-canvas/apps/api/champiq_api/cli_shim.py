"""CLI invocation shim for ChampIQ tools.

For Phase 1, this shells out to fake_cli stub scripts.
TODO(Hemang): replace fake CLI paths with real binary paths once champgraph/champmail/champvoice CLIs are installed.
Expected CLI contract:
  - Binary reads JSON payload from stdin.
  - Binary writes JSON to stdout: {"job_id": "<id>", "accepted": true}
  - Exit code 0 = accepted, non-zero = error.
"""
import asyncio
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent.parent / "scripts" / "fake_cli"


async def invoke_tool_cli(tool_id: str, action: str, payload: dict) -> dict:
    """Invoke tool CLI binary with JSON payload via stdin."""
    script_path = SCRIPTS_DIR / f"{tool_id}.py"
    if not script_path.exists():
        # TODO(Hemang): when real binary is installed, use shutil.which(tool_id) here.
        return {"job_id": f"noop-{tool_id}", "accepted": False, "error": f"No CLI found for {tool_id}"}

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(script_path),
        "--action", action,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=json.dumps(payload).encode())

    if proc.returncode != 0:
        return {"job_id": "error", "accepted": False, "error": stderr.decode()}

    try:
        return json.loads(stdout.decode())
    except json.JSONDecodeError:
        return {"job_id": "error", "accepted": False, "error": "Invalid CLI JSON output"}
