"""pytest configuration — silence warnings, ensure repo root on sys.path."""
import sys
from pathlib import Path

# Make `from champiq_api...` importable regardless of how pytest is invoked.
_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))
