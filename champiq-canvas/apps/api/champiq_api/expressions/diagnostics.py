"""Pre-evaluation diagnostics + post-evaluation error translation.

Why a separate module
---------------------
The evaluator does ONE thing: render template strings against a name table.
Authoring-mistake detection (e.g. "you forgot the {{ }} brackets",
"you wrote a hyphenated node id without bracket access") is a separate
responsibility — a static lint of raw strings, no name resolution required.

Splitting the two:
  - keeps the evaluator small and Liskov-compatible with its prior API,
  - makes diagnostics testable as pure I/O (no DB, no contexts, no fixtures),
  - lets future callers (e.g. a /api/workflows/validate endpoint) reuse
    the linting logic without having to spin up a full evaluator.

Both classes are stateless and side-effect free. They never mutate the
input strings; they only report.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


# ---------------------------------------------------------------- patterns

# Tokens that scream "this is meant to be an expression": dotted access against
# one of our known root names. If we see these in a bare string (no {{ }}),
# the user almost certainly forgot to wrap it.
_ROOT_NAMES = ("trigger", "prev", "item", "node", "index", "execution_id")

# Detect a dotted-access chain rooted at one of our names — `prev.x`,
# `trigger.payload.items`, `item.email`, etc. Used to suggest wrapping
# bare strings.
_DOT_CHAIN_RE = re.compile(
    r"\b(?:" + "|".join(_ROOT_NAMES) + r")(?:\.[A-Za-z_][\w-]*)+\b"
)

# Inside an already-wrapped expression, detect a hyphenated identifier:
# `trigger-manual-upload.payload.items` — simpleeval parses the hyphens
# as subtraction, which fails cryptically with "'manual' is not defined".
# We surface a clear suggestion (bracket access via node['<id>']) instead.
_HYPHEN_ID_RE = re.compile(r"\b([A-Za-z_][\w]*(?:-[\w]+)+)(?=\.)")

# Mismatched braces — exactly one of {{ }} present. Catches typos like
# `{{ prev.email }` where the closing brace was forgotten.
_OPEN_RE = re.compile(r"\{\{")
_CLOSE_RE = re.compile(r"\}\}")

# A wrapped expression with an empty body: "{{ }}" or "{{   }}"
_EMPTY_EXPR_RE = re.compile(r"\{\{\s*\}\}")


# ---------------------------------------------------------------- types


@dataclass(frozen=True)
class ExpressionWarning:
    """One actionable finding from inspecting a raw template string.

    Always frozen — diagnostics are produced and consumed; never edited.

    Severity:
      - "error": the engine cannot proceed; raise before evaluation.
      - "warning": the engine can proceed but the result is almost certainly
                   not what the author intended. Logged but not raised.
                   (Reserved for future heuristics; nothing emits warning today.)
    """
    severity: Literal["error", "warning"]
    message: str
    suggestion: str | None = None
    offending_segment: str | None = None

    def to_value_error(self) -> ValueError:
        """Render as a ValueError with all the context a human needs to fix it."""
        parts = [self.message]
        if self.offending_segment:
            parts.append(f"  offending: {self.offending_segment!r}")
        if self.suggestion:
            parts.append(f"  suggestion: {self.suggestion}")
        return ValueError("\n".join(parts))


# ---------------------------------------------------------------- diagnostics


class ExpressionDiagnostics:
    """Static checks on a raw template string. Pure functions; no state.

    `inspect` returns the FIRST blocking issue it finds, or None if the
    string passes all checks. This keeps the surfaced error focused — once
    the author fixes the first problem, re-running surfaces the next.
    """

    @staticmethod
    def inspect(raw: str) -> ExpressionWarning | None:
        if not isinstance(raw, str):
            return None

        # 1. Mismatched braces. Catches `{{ prev.x }` and `{{ {{ prev }}`.
        opens = len(_OPEN_RE.findall(raw))
        closes = len(_CLOSE_RE.findall(raw))
        if opens != closes:
            return ExpressionWarning(
                severity="error",
                message=f"Mismatched expression brackets: {opens} '{{{{' vs {closes} '}}}}'",
                offending_segment=raw,
                suggestion=(
                    "Every '{{' must be paired with '}}'. "
                    "If you meant a literal brace, escape it as '{{{{ literal }}}}'."
                ),
            )

        # 2. Empty wrapper: "{{ }}". simpleeval would fail with a syntax error;
        #    catch it earlier with a clearer message.
        if _EMPTY_EXPR_RE.search(raw):
            return ExpressionWarning(
                severity="error",
                message="Empty expression: '{{ }}' has no body.",
                offending_segment=raw,
                suggestion="Put an expression inside the brackets, e.g. {{ prev.email }}.",
            )

        # 3. Bare expression: looks like a dotted chain rooted at a known name,
        #    but the string is not wrapped in {{ }} at all. The author almost
        #    certainly forgot the brackets.
        if opens == 0 and _DOT_CHAIN_RE.search(raw):
            match = _DOT_CHAIN_RE.search(raw)
            assert match is not None  # for type checker
            offending = match.group(0)
            return ExpressionWarning(
                severity="error",
                message=(
                    f"Looks like an unwrapped expression: {offending!r}. "
                    f"Bare strings are returned as literal text — they are not evaluated."
                ),
                offending_segment=raw,
                suggestion=(
                    f"Wrap it in '{{{{ ... }}}}': use '{{{{ {offending} }}}}' "
                    f"so the runtime evaluates it. "
                    "If you really want the literal text, prefix with '\\\\' to escape."
                ),
            )

        # 4. Inside an already-wrapped expression, detect a hyphenated identifier
        #    used as a dotted root. simpleeval parses hyphens as minus operators,
        #    so `trigger-manual-upload.payload.items` becomes
        #    `trigger - manual - upload.payload.items` and fails with
        #    "'manual' is not defined". Surface the real fix.
        if opens > 0:
            for expr_body in _all_expression_bodies(raw):
                hy = _HYPHEN_ID_RE.search(expr_body)
                if hy is not None:
                    bad = hy.group(1)
                    return ExpressionWarning(
                        severity="error",
                        message=(
                            f"Expression references {bad!r} — node IDs with hyphens "
                            f"cannot be used as bare names (the hyphens parse as "
                            f"subtraction)."
                        ),
                        offending_segment=expr_body.strip(),
                        suggestion=(
                            f"Use bracket access: '{{{{ node[{bad!r}].output.<field> }}}}'. "
                            f"Or, if the referenced node is the immediately-upstream node, "
                            f"use 'prev' instead — '{{{{ prev.<field> }}}}' works regardless "
                            f"of how the upstream node is named."
                        ),
                    )

        return None


def _all_expression_bodies(raw: str) -> list[str]:
    """Yield the inside of every {{ ... }} occurrence in `raw`. Pure helper."""
    return re.findall(r"\{\{\s*(.+?)\s*\}\}", raw)


# ---------------------------------------------------------------- error translation


class ExpressionErrorTranslator:
    """Translate cryptic simpleeval errors into actionable runtime errors.

    Pure functions; no state. The evaluator hands us the original expression
    body plus whatever simpleeval raised; we return a ValueError shaped the
    way a workflow author can act on.
    """

    @staticmethod
    def translate(expr: str, err: Exception) -> ValueError:
        msg = str(err)

        # NameError flavor: "'manual' is not defined".
        # If the raw expression contains hyphens, the most likely cause is the
        # hyphen-id-as-subtraction mistake. Repeat the suggestion the static
        # diagnostics would have given (defensive: a mistake might slip past
        # static inspection if someone bypasses it).
        if "is not defined" in msg and "-" in expr:
            hy = _HYPHEN_ID_RE.search(expr)
            if hy is not None:
                bad = hy.group(1)
                return ValueError(
                    f"Expression error in {expr!r}: {msg}\n"
                    f"  Likely cause: node id {bad!r} contains hyphens — simpleeval "
                    f"parses them as subtraction.\n"
                    f"  Suggestion: use bracket access — "
                    f"'{{{{ node[{bad!r}].output.<field> }}}}', or 'prev' if the "
                    f"hyphenated id refers to the immediately-upstream node."
                )

        # NameError flavor for `item` outside a loop body.
        if "is not defined" in msg and re.search(r"'item'", msg):
            return ValueError(
                f"Expression error in {expr!r}: {msg}\n"
                f"  'item' is only available inside a loop or split body. "
                f"Outside a loop, use 'prev' (the immediately-upstream output) "
                f"or 'trigger.payload.<field>' (the trigger data)."
            )

        # Generic fallback — preserve the original message but in the
        # consistent shape the evaluator emits.
        return ValueError(f"Expression error {expr!r}: {msg}")
