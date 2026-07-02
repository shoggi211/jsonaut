# jsonaut (Python client)

Local-first JSON repair for AI-agent output. Fixes malformed JSON **offline**, and only calls the [Jsonaut](https://jsonaut.jsonaut-shaurya.workers.dev) API for the hard cases or JSON Schema enforcement.

```bash
pip install jsonaut          # strict local parse + API fallback
pip install "jsonaut[local]" # adds offline repair of malformed JSON
```

```python
from jsonaut import repair_json

# Offline (with the [local] extra): trailing commas, quotes, python literals...
repair_json("{'ok': True, 'items': [1, 2,],}")
# {'valid': True, 'repaired': {'ok': True, 'items': [1, 2]}, 'method': 'local-repair', 'changes': []}

# With a schema, the API validates + coerces:
repair_json('{"count": "42"}', schema={"type": "object", "properties": {"count": {"type": "number"}}})
# {'valid': True, 'repaired': {'count': 42}, 'method': 'deterministic-repair', ...}

# Hard cases via the paid LLM tier (x402):
repair_json(
    "the user alice is 30 and active",
    schema={"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "number"}, "active": {"type": "boolean"}}},
    allow_llm_fallback=True,
    headers={"X-PAYMENT": "<x402 payment header>"},
)
```

Pass `raise_on_fail=True` to raise `RepairError` instead of returning `{"valid": False, ...}`.

| Arg | Default | Meaning |
|---|---|---|
| `schema` | `None` | JSON Schema to validate/coerce against (server-side) |
| `allow_remote` | `True` | Allow calling the hosted API when local repair can't finish |
| `allow_llm_fallback` | `False` | Permit the paid LLM tier (needs `X-PAYMENT`) |
| `api_url` | hosted | Override the API base URL |
| `headers` | `None` | Extra headers, e.g. `X-PAYMENT` for x402 |
