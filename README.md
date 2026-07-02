# Jsonaut

JSON repair & validation built for AI agents as the customer. Send possibly-malformed JSON (LLM tool-call output, another agent's message, a flaky upstream), get back parsed, schema-valid JSON.

- **Free tier:** deterministic repair — trailing commas, single quotes, truncation, markdown code fences, comments, Python literals — plus JSON Schema validation with type coercion (string→number, defaults, stripping hallucinated fields). Rate-limited per IP.
- **Paid tier:** LLM-fallback repair for inputs the deterministic pass can't fix. $0.01/call, **charged only on success**, paid autonomously per-call via x402 (USDC on Base) — no accounts, no signup.

Business context, market research, and the full 3-day plan live in [IDEA.md](IDEA.md) and [PLAN.md](PLAN.md).

## Quickstart

```bash
npm install
npm test          # 27 tests: repair battery, schema coercion, HTTP API, MCP protocol
npm run dev       # http://localhost:8787 — demo page + API + MCP endpoint
```

Try it:

```bash
curl -s -X POST http://localhost:8787/v1/repair \
  -H "content-type: application/json" \
  -d "{\"input\": \"{'name': 'alice', 'count': '42',}\", \"schema\": {\"type\":\"object\",\"properties\":{\"count\":{\"type\":\"number\"}}}}"
```

```json
{
  "valid": true,
  "repaired": { "name": "alice", "count": 42 },
  "method": "deterministic-repair",
  "changes": ["repaired JSON syntax (jsonrepair)", "$.count: coerced string \"42\" to number"]
}
```

## API

| Route | What it does |
|---|---|
| `POST /v1/repair` | Repair + optional schema validation/coercion. Body: `{input, schema?, allow_llm_fallback?}` |
| `POST /v1/validate` | Validate only, no repair. Body: `{input, schema}` |
| `POST /mcp` | MCP server (Streamable HTTP, stateless). Tools: `repair_json`, `validate_json` |
| `GET /` | Interactive demo page |
| `GET /llms.txt` | Agent-readable capability + pricing description |
| `GET /openapi.yaml` | OpenAPI 3.1 spec |

Response `method` values: `direct` (was already valid), `deterministic-repair` (free fix), `llm-repair` (paid fix), `failed`. `changes[]` lists every modification so callers can audit what was done to their data.

## Using it from an agent (MCP)

```bash
claude mcp add --transport http jsonaut https://YOUR-DEPLOYMENT/mcp
```

Or in any MCP client config:

```json
{ "mcpServers": { "jsonaut": { "type": "http", "url": "https://YOUR-DEPLOYMENT/mcp" } } }
```

For the paid tier, clients pay via x402 and retry with the `X-PAYMENT` header (the payment receipt). No accounts or API keys — agents pay per call.

## Payment flow (x402)

1. Agent calls `/v1/repair` with `allow_llm_fallback: true`; deterministic repair fails.
2. Server responds `402` with an x402 `accepts` array (USDC on Base, amount = `PRICE_USD`).
3. Agent pays and retries with the `X-PAYMENT` header; server verifies via the facilitator, runs the LLM repair, and settles **only if the repair succeeds**.

## Configuration

| Env var | Purpose | Required for |
|---|---|---|
| `OPENROUTER_API_KEY` | Enables the paid LLM-fallback tier (via OpenRouter; free model by default) | Paid tier |
| `OPENROUTER_MODEL` | Override the model (default `meta-llama/llama-3.3-70b-instruct:free`) | — |
| `X402_PAY_TO` | Wallet address on Base receiving USDC | x402 rail |
| `X402_NETWORK` | `base` or `base-sepolia` (default `base`) | x402 rail |
| `FACILITATOR_URL` | x402 facilitator for verify/settle | x402 rail |
| `FREE_DAILY_LIMIT` | Free calls per IP per day (default 100) | — |
| `PRICE_USD` | Paid-tier price (default 0.01) | — |
| `DEV_ALLOW_FREE_LLM` | `true` opens the paid tier for local dev only | — |

Local dev secrets go in a `.dev.vars` file (git-ignored) or your shell env.

## Deployment (Cloudflare Workers)

```bash
npx wrangler login
npx wrangler kv namespace create KV      # then paste the id into wrangler.toml
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

The same codebase runs on Node for local dev (`npm run dev`) and on Workers in production — storage falls back to in-memory when no KV binding exists.

## Project structure

```
src/core/      pipeline.ts (repair engine) · coerce.ts (schema coercion) · llm.ts (paid tier)
src/http/      app.ts (routes) · payment.ts (x402 rail) · ratelimit.ts · demo.ts · billing.ts (parked, unused)
src/mcp/       server.ts (stateless Streamable HTTP MCP server)
src/worker.ts  Cloudflare Workers entry
src/dev.ts     Node dev entry
test/          full battery: broken-JSON cases, coercion, HTTP, MCP protocol
```

## Known limitations (MVP)

- Schema coercion does not resolve `$ref` or `oneOf`/`anyOf` branches.
- x402 verification requires an external facilitator (`FACILITATOR_URL`); there is no on-chain verification built in.
- Free-tier rate limiting is approximate under high concurrency (KV read-modify-write).
