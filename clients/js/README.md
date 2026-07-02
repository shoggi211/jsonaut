# jsonaut (JS/TS client)

Local-first JSON repair for AI-agent output. Tries to fix malformed JSON **offline** (via `jsonrepair`); only calls the [Jsonaut](https://jsonaut.jsonaut-shaurya.workers.dev) API for the hard cases or when you need JSON Schema enforcement.

```bash
npm install jsonaut
```

```ts
import { repairJson } from "jsonaut";

// Offline, free, zero network — handles most breakage.
const a = await repairJson("{'ok': True, 'items': [1, 2,],}");
// { valid: true, repaired: { ok: true, items: [1, 2] }, method: "local-repair" }

// With a schema, the API validates + coerces (string→number, defaults, etc.).
const b = await repairJson('{"count": "42"}', {
  schema: { type: "object", properties: { count: { type: "number" } } },
});
// { valid: true, repaired: { count: 42 }, method: "deterministic-repair" }

// Hard cases (prose → JSON) via the paid LLM tier (x402):
const c = await repairJson("the user alice is 30 and active", {
  schema: { type: "object", properties: { name: {type:"string"}, age: {type:"number"}, active: {type:"boolean"} } },
  allowLlmFallback: true,
  headers: { "X-PAYMENT": "<x402 payment header>" },
});
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `schema` | — | JSON Schema to validate/coerce against (server-side) |
| `allowRemote` | `true` | Allow calling the hosted API when local repair can't finish |
| `allowLlmFallback` | `false` | Permit the paid LLM tier (needs `X-PAYMENT`) |
| `apiUrl` | hosted | Override the API base URL (self-host friendly) |
| `headers` | `{}` | Extra headers, e.g. `X-PAYMENT` for x402 |

## Use as a LangChain output parser (sketch)

```ts
import { repairJson } from "jsonaut";

async function parse(raw: string, schema?: object) {
  const r = await repairJson(raw, { schema });
  if (!r.valid) throw new Error("could not repair model output: " + (r.errors ?? []).join("; "));
  return r.repaired;
}
```
