"""Drift guard for the champgraph node manifest (SUGGESTIONS 1.5).

Source-parsing, dependency-free: reads the frozensets out of service.py's text
instead of importing the app, so it runs anywhere (CI, fresh clone, no venv).
Both directions are asserted: the manifest must list exactly the implemented
surface plus the documented legacy aliases.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve()
API = ROOT.parents[1]  # apps/api
MANIFEST = API.parents[1] / "manifests" / "champgraph.manifest.json"
SERVICE = API / "champiq_api" / "champgraph" / "service.py"


def _frozenset_names(src: str, name: str) -> set[str]:
    block = re.search(name + r"[^=]*= frozenset\(\{(.*?)\}\)", src, re.S)
    assert block, f"{name} not found in service.py"
    return set(re.findall(r'"([a-z_]+)"', block.group(1)))


def _surface() -> tuple[set[str], set[str]]:
    src = SERVICE.read_text()
    implemented = (
        _frozenset_names(src, "PROSPECT_ACTIONS")
        | _frozenset_names(src, "GRAPH_ACTIONS")
        | _frozenset_names(src, "CAMPAIGN_ACTIONS")
    )
    alias_block = re.search(r"ACTION_ALIASES[^=]*= \{(.*?)\}", src, re.S)
    aliases = set(re.findall(r'"([a-z_]+)":', alias_block.group(1))) if alias_block else set()
    return implemented, aliases


def _manifest_action_ids() -> set[str]:
    return {a["id"] for a in json.loads(MANIFEST.read_text())["actions"]}


def test_manifest_covers_exactly_the_implemented_surface():
    implemented, aliases = _surface()
    advertised = _manifest_action_ids()

    fake = advertised - implemented - aliases
    assert not fake, f"manifest advertises actions the executor lacks: {sorted(fake)}"

    hidden = implemented - advertised
    assert not hidden, f"executor implements actions the manifest hides: {sorted(hidden)}"


def test_aliases_still_advertised_as_deprecated():
    _, aliases = _surface()
    data = {a["id"]: a for a in json.loads(MANIFEST.read_text())["actions"]}
    for alias in aliases:
        assert alias in data, f"legacy alias {alias} dropped from manifest"
        assert data[alias].get("deprecated") is True, f"{alias} must be marked deprecated"


if __name__ == "__main__":
    # * CI runs this file directly (no pytest needed): python3 test_champgraph_manifest.py
    test_manifest_covers_exactly_the_implemented_surface()
    test_aliases_still_advertised_as_deprecated()
    print("champgraph manifest drift guard: OK")
