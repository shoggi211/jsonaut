"""Local-first JSON repair for AI-agent output.

Tries to fix malformed JSON offline (strict parse, then the optional
``json-repair`` package), and only calls the hosted Jsonaut API for the hard
cases or when JSON Schema enforcement is requested.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

__all__ = ["repair_json", "RepairError", "DEFAULT_API"]

DEFAULT_API = "https://jsonaut.jsonaut-shaurya.workers.dev"


class RepairError(Exception):
    """Raised by ``repair_json(..., raise_on_fail=True)`` when repair fails."""


def _local_repair(text: str):
    try:
        return json.loads(text), "direct"
    except Exception:
        pass
    try:
        from json_repair import repair_json as _rj  # optional: pip install "jsonaut[local]"
    except Exception:
        return None, None
    try:
        fixed = _rj(text)
        value = json.loads(fixed) if isinstance(fixed, str) else fixed
        return value, "local-repair"
    except Exception:
        return None, None


def repair_json(
    text: str,
    schema: Optional[Dict[str, Any]] = None,
    allow_remote: bool = True,
    allow_llm_fallback: bool = False,
    api_url: str = DEFAULT_API,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 30.0,
    raise_on_fail: bool = False,
) -> Dict[str, Any]:
    """Repair possibly-malformed JSON.

    With no ``schema``, repair is attempted fully offline first. Falls back to
    the hosted API when local repair fails, when a schema needs server-side
    validation/coercion, or when ``allow_llm_fallback`` is set (paid x402 tier).

    Returns a dict: ``{valid, repaired, method, changes, errors?}``.
    """
    if schema is None:
        value, method = _local_repair(text)
        if method is not None:
            return {"valid": True, "repaired": value, "method": method, "changes": []}
        if not allow_remote:
            return _fail("local repair failed and allow_remote=False", raise_on_fail)
    elif not allow_remote:
        return _fail("schema enforcement needs the API but allow_remote=False", raise_on_fail)

    payload = json.dumps(
        {"input": text, "schema": schema, "allow_llm_fallback": allow_llm_fallback}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{api_url}/v1/repair",
        data=payload,
        method="POST",
        headers={"content-type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        if e.code == 402:
            return _fail(f"payment required for the LLM tier (x402): {body}", raise_on_fail)
        return _fail(f"http {e.code}: {body}", raise_on_fail)
    except Exception as e:  # network, timeout, etc.
        return _fail(str(e), raise_on_fail)

    if raise_on_fail and not result.get("valid"):
        raise RepairError("; ".join(result.get("errors", []) or ["repair failed"]))
    return result


def _fail(msg: str, raise_on_fail: bool) -> Dict[str, Any]:
    if raise_on_fail:
        raise RepairError(msg)
    return {"valid": False, "repaired": None, "method": "failed", "changes": [], "errors": [msg]}
