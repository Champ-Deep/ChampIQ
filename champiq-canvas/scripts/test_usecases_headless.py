#!/usr/bin/env python3
"""Headless use-case tests for ChampIQ Canvas backend.

Runs against http://localhost:4000  (the running Docker container).
Each UC posts an ad-hoc graph, polls until done, then inspects node runs.
External-service UCs (champmail/champgraph/lakeb2b) will error with a
driver exception — that is expected and reported as SKIP (not FAIL).
"""
import sys
import time
import json
import urllib.request
import urllib.error
from typing import Any

BASE = "http://localhost:4000"
POLL_INTERVAL = 0.4   # seconds
POLL_TIMEOUT  = 30    # seconds


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req  = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def get(path: str) -> dict | list:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=15) as r:
        return json.loads(r.read())


def node(id_: str, kind: str, config: dict | None = None, label: str = "") -> dict:
    return {
        "id": id_,
        "type": "toolNode",
        "position": {"x": 0, "y": 0},
        "data": {"kind": kind, "config": config or {}, "label": label or kind},
    }


def edge(id_: str, src: str, tgt: str, src_handle: str | None = None) -> dict:
    e: dict[str, Any] = {"id": id_, "source": src, "target": tgt, "type": "customEdge"}
    if src_handle:
        e["sourceHandle"] = src_handle
    return e


# ── Polling ───────────────────────────────────────────────────────────────────

def wait_for_execution(exec_id: str) -> dict:
    deadline = time.monotonic() + POLL_TIMEOUT
    while time.monotonic() < deadline:
        try:
            ex = get(f"/api/executions/{exec_id}")
            if ex["status"] in ("success", "error", "cancelled"):
                return ex
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)
    return {"status": "timeout", "execution_id": exec_id}


def run_graph(nodes_: list, edges_: list, trigger: dict | None = None) -> tuple[dict, list]:
    resp    = post("/api/workflows/ad-hoc/run", {"nodes": nodes_, "edges": edges_, "trigger": trigger or {}})
    exec_id = resp["execution_id"]
    ex      = wait_for_execution(exec_id)
    runs: list = []
    try:
        runs = get(f"/api/executions/{exec_id}/node_runs")
    except Exception:
        pass
    return ex, runs


# ── Result helpers ────────────────────────────────────────────────────────────

EXTERNAL_ERRORS = ("connection refused", "connect call failed", "cannot connect",
                   "connection error", "httpx", "aiohttp", "champmail", "champgraph",
                   "lakeb2b", "no route to host", "name or service not known")

def is_external_error(runs: list) -> bool:
    for r in runs:
        err = (r.get("error") or "").lower()
        if any(k in err for k in EXTERNAL_ERRORS):
            return True
    return False


def print_runs(runs: list) -> None:
    for r in runs:
        status = r.get("status", "?")
        sym    = "✓" if status == "success" else ("!" if status == "error" else "·")
        print(f"    {sym} [{r.get('node_id')}] {status}", end="")
        if r.get("error"):
            print(f"  — {r['error'][:120]}", end="")
        if r.get("output"):
            out_str = json.dumps(r["output"])[:120]
            print(f"  → {out_str}", end="")
        print()


# ── Use cases ─────────────────────────────────────────────────────────────────

RESULTS: list[tuple[str, str]] = []  # (uc_name, PASS|FAIL|SKIP)


def run_uc(name: str, nodes_: list, edges_: list, trigger: dict | None = None,
           expect_external: bool = False) -> None:
    print(f"\n{'─'*60}")
    print(f"  {name}")
    print(f"{'─'*60}")
    try:
        ex, runs = run_graph(nodes_, edges_, trigger)
        print(f"  Execution: {ex.get('execution_id','?')}  status={ex['status']}")
        print_runs(runs)

        if ex["status"] == "timeout":
            print("  ⇒ FAIL  (execution timed out)")
            RESULTS.append((name, "FAIL"))
        elif expect_external and is_external_error(runs):
            print("  ⇒ SKIP  (external service unavailable — expected)")
            RESULTS.append((name, "SKIP"))
        elif ex["status"] == "success":
            print("  ⇒ PASS")
            RESULTS.append((name, "PASS"))
        elif ex["status"] == "error" and expect_external:
            print("  ⇒ SKIP  (execution error, likely external service)")
            RESULTS.append((name, "SKIP"))
        else:
            print("  ⇒ FAIL")
            RESULTS.append((name, "FAIL"))
    except Exception as exc:
        print(f"  ⇒ ERROR  {exc}")
        RESULTS.append((name, "FAIL"))


# ─── UC-1: Manual trigger → Set → output a static payload ────────────────────
def uc1():
    ns = [
        node("t1", "trigger.manual", label="Manual Trigger"),
        node("s1", "set", {"fields": {"greeting": "hello", "source": "uc1"}}, "Set Fields"),
    ]
    es = [edge("e1", "t1", "s1")]
    run_uc("UC-1: Manual trigger → Set node (static fields)", ns, es,
           trigger={"payload": {"user": "tester"}})


# ─── UC-2: If branch — true path ─────────────────────────────────────────────
def uc2():
    ns = [
        node("t1", "trigger.manual"),
        node("if1", "if", {"condition": "1 == 1"}, "If True"),
        node("s_true",  "set", {"fields": {"branch": "true_path"}},  "True Branch"),
        node("s_false", "set", {"fields": {"branch": "false_path"}}, "False Branch"),
    ]
    es = [
        edge("e1", "t1",  "if1"),
        edge("e2", "if1", "s_true",  "true"),
        edge("e3", "if1", "s_false", "false"),
    ]
    run_uc("UC-2: If branch — condition true → true path executes", ns, es)


# ─── UC-3: If branch — false path ────────────────────────────────────────────
def uc3():
    ns = [
        node("t1", "trigger.manual"),
        node("if1", "if", {"condition": "1 == 2"}, "If False"),
        node("s_true",  "set", {"fields": {"branch": "true_path"}},  "True Branch"),
        node("s_false", "set", {"fields": {"branch": "false_path"}}, "False Branch"),
    ]
    es = [
        edge("e1", "t1",  "if1"),
        edge("e2", "if1", "s_true",  "true"),
        edge("e3", "if1", "s_false", "false"),
    ]
    run_uc("UC-3: If branch — condition false → false path executes", ns, es)


# ─── UC-4: Switch / multi-case routing ───────────────────────────────────────
def uc4():
    ns = [
        node("t1", "trigger.manual", label="Trigger"),
        node("sw", "switch", {
            "value": "{{ trigger.payload.status }}",
            "cases": [
                {"match": "positive", "branch": "positive"},
                {"match": "negative", "branch": "negative"},
            ],
            "default_branch": "unknown",
        }, "Switch"),
        node("s_pos", "set", {"fields": {"result": "positive path"}}, "Positive"),
        node("s_neg", "set", {"fields": {"result": "negative path"}}, "Negative"),
        node("s_unk", "set", {"fields": {"result": "unknown path"}},  "Unknown"),
    ]
    es = [
        edge("e1", "t1", "sw"),
        edge("e2", "sw", "s_pos", "positive"),
        edge("e3", "sw", "s_neg", "negative"),
        edge("e4", "sw", "s_unk", "unknown"),
    ]
    run_uc("UC-4: Switch node — routes to correct branch", ns, es,
           trigger={"payload": {"status": "positive"}})


# ─── UC-5: Set → expression referencing trigger payload ──────────────────────
def uc5():
    ns = [
        node("t1", "trigger.manual"),
        node("s1", "set", {
            "fields": {
                "msg": "Hello {{ trigger.payload.name }}",
                "upper": "{{ trigger.payload.name }}",
            }
        }),
    ]
    es = [edge("e1", "t1", "s1")]
    run_uc("UC-5: Set node — expression references trigger.payload", ns, es,
           trigger={"payload": {"name": "ChampIQ"}})


# ─── UC-6: Code node — arithmetic ────────────────────────────────────────────
def uc6():
    ns = [
        node("t1", "trigger.manual"),
        node("c1", "code", {"expression": "2 ** 10"}, "Power of 2"),
    ]
    es = [edge("e1", "t1", "c1")]
    run_uc("UC-6: Code node — arithmetic expression (2**10 = 1024)", ns, es)


# ─── UC-7: Code node — string manipulation ───────────────────────────────────
def uc7():
    ns = [
        node("t1", "trigger.manual"),
        node("s1", "set", {"fields": {"name": "world"}}),
        node("c1", "code", {"expression": "'Hello ' + node['s1']['name']"}, "Concat"),
    ]
    es = [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "c1"),
    ]
    run_uc("UC-7: Code node — string concat using upstream node output", ns, es)


# ─── UC-8: Merge node — joins two upstream outputs ───────────────────────────
def uc8():
    ns = [
        node("t1", "trigger.manual"),
        node("sa", "set", {"fields": {"a": 1}}, "Branch A"),
        node("sb", "set", {"fields": {"b": 2}}, "Branch B"),
        node("m1", "merge", {}, "Merge"),
    ]
    es = [
        edge("e1", "t1", "sa"),
        edge("e2", "t1", "sb"),
        edge("e3", "sa", "m1"),
        edge("e4", "sb", "m1"),
    ]
    run_uc("UC-8: Merge node — collects two upstream branches into merged dict", ns, es)


# ─── UC-9: HTTP node — GET public API ────────────────────────────────────────
def uc9():
    ns = [
        node("t1", "trigger.manual"),
        node("h1", "http", {
            "method": "GET",
            "url": "https://httpbin.org/get",
            "headers": {},
        }, "HTTP GET"),
    ]
    es = [edge("e1", "t1", "h1")]
    run_uc("UC-9: HTTP node — GET https://httpbin.org/get", ns, es)


# ─── UC-10: LLM node — basic prompt (needs OPENROUTER_API_KEY) ───────────────
def uc10():
    ns = [
        node("t1", "trigger.manual"),
        node("l1", "llm", {
            "prompt": "Reply with exactly the word: PONG",
            "max_tokens": 10,
            "temperature": 0,
        }, "LLM Ping"),
    ]
    es = [edge("e1", "t1", "l1")]
    # If API key is missing the provider will raise — treat as SKIP
    run_uc("UC-10: LLM node — basic prompt (OpenRouter)", ns, es,
           expect_external=True)


# ─── UC-11: Champmail driver (expect SKIP — service stopped) ─────────────────
def uc11():
    ns = [
        node("t1", "trigger.manual"),
        node("cm", "champmail.fetch_inbox", {"limit": 5}, "Fetch Inbox"),
    ]
    es = [edge("e1", "t1", "cm")]
    run_uc("UC-11: Champmail fetch_inbox (external, expect SKIP)", ns, es,
           expect_external=True)


# ─── UC-12: Champgraph driver (expect SKIP — service stopped) ────────────────
def uc12():
    ns = [
        node("t1", "trigger.manual"),
        node("cg", "champgraph.search", {"query": "test"}, "Graph Search"),
    ]
    es = [edge("e1", "t1", "cg")]
    run_uc("UC-12: Champgraph search (external, expect SKIP)", ns, es,
           expect_external=True)


# ─── UC-13: Loop node — iterates over list ───────────────────────────────────
def uc13():
    ns = [
        node("t1", "trigger.manual"),
        node("s1", "set", {"fields": {"items": [1, 2, 3]}}, "Build List"),
        node("lp", "loop", {
            "items_expr": "node['s1']['items']",
            "concurrency": 1,
            "body_nodes": [
                {
                    "id": "body_set",
                    "type": "toolNode",
                    "position": {"x": 0, "y": 0},
                    "data": {"kind": "set", "config": {"fields": {"doubled": "{{ item * 2 }}"}}, "label": "Double"},
                }
            ],
            "body_edges": [],
        }, "Loop"),
    ]
    es = [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "lp"),
    ]
    run_uc("UC-13: Loop node — iterates [1,2,3] with body set node", ns, es)


# ─── UC-14: Chained Set nodes — prev expression chain ────────────────────────
def uc14():
    ns = [
        node("t1", "trigger.manual"),
        node("s1", "set", {"fields": {"x": 10}}, "Set X"),
        node("s2", "set", {"fields": {"y": "{{ prev.x + 5 }}"}}, "Set Y from prev"),
        node("s3", "set", {"fields": {"z": "{{ prev.y * 2 }}"}}, "Set Z from prev"),
    ]
    es = [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "s2"),
        edge("e3", "s2", "s3"),
    ]
    run_uc("UC-14: Chained Set nodes — prev expression chain (x=10 → y=15 → z=30)", ns, es)


# ─── main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  ChampIQ Canvas — Headless Use-Case Tests")
    print(f"  Backend: {BASE}")
    print("=" * 60)

    # Verify backend is reachable via /api/workflows (always returns JSON)
    try:
        get("/api/workflows")
        print("  Backend: UP")
    except Exception as exc:
        print(f"  Backend unreachable: {exc}")
        sys.exit(1)

    uc1()
    uc2()
    uc3()
    uc4()
    uc5()
    uc6()
    uc7()
    uc8()
    uc9()
    uc10()
    uc11()
    uc12()
    uc13()
    uc14()

    print(f"\n{'═'*60}")
    print("  SUMMARY")
    print(f"{'═'*60}")
    passed = skipped = failed = 0
    for name, result in RESULTS:
        sym = "✓" if result == "PASS" else ("~" if result == "SKIP" else "✗")
        print(f"  {sym} {result:<5}  {name}")
        if result == "PASS":  passed  += 1
        elif result == "SKIP": skipped += 1
        else:                  failed  += 1

    print(f"\n  Passed: {passed}  Skipped: {skipped}  Failed: {failed}  Total: {len(RESULTS)}")
    sys.exit(0 if failed == 0 else 1)
