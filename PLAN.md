# Jsonaut — 3-Day Build & Launch Plan

> **Build status (2026-07-02):** Core engine, HTTP API, MCP server, x402 payment
> gating, rate limiting, demo page, README, llms.txt, and OpenAPI spec are **built
> and verified** — 27/27 tests pass, all endpoints confirmed live locally
> (`npm run dev` → http://localhost:8787). Named **Jsonaut**; **x402-only** (the
> Stripe/fiat rail was dropped by decision — code parked in src/http/billing.ts).
> Remaining: Cloudflare deploy (needs your account), OPENROUTER_API_KEY secret
> (paid tier), Base wallet + facilitator URL (x402 rail), domain, and all Day 3
> distribution/marketing steps (require your sign-off before posting publicly).

**What it is:** A pay-per-call API + MCP server that repairs and validates malformed JSON from LLM/agent tool calls. Free deterministic repair, paid LLM-fallback repair for the hard cases, billed via x402 (agent-native, no signup). x402 is the only payment rail — no fiat/Stripe.

**Why it fits:** near-zero infra cost (no browser fleet, no data licensing), buildable by one person in 3 days, and the pitch is one sentence any agent-builder already understands — "your agent's JSON breaks sometimes, send it here first."

---

## Architecture

```
Agent
  │
  ├─ HTTP POST /repair            (plain REST)
  └─ MCP tool: repair_json        (Streamable HTTP transport, hosted)
        │
        ▼
  1. JSON.parse attempt
  2. jsonrepair (trailing commas, single quotes, truncation, code-fence stripping, comments)
  3. ajv schema validation + type coercion (if caller passes a JSON Schema)
  4. [PAID] LLM-fallback repair (LLM via OpenRouter, free-tier model) — only if steps 1–3 still fail
        │
        ▼
  Response: { valid, repaired, method, changes[] }
```

**Stack**
- TypeScript, deployed on Cloudflare Workers (Hono framework) — free tier, scales to zero, no server to manage
- `jsonrepair` (deterministic repair), `ajv` (schema validation)
- OpenRouter (OpenAI-compatible API) for the paid fallback tier, default free model, swappable via OPENROUTER_MODEL
- `@modelcontextprotocol/sdk` for the MCP server, same Worker via Streamable HTTP transport
- x402 middleware for agent-native pay-per-call billing (USDC on Base) — the sole payment rail
- Cloudflare KV for lightweight rate-limiting / usage counters (no real database needed for MVP)

---

## Day 1 — Core engine

- [ ] Scaffold repo: `npm init`, TypeScript, Hono, folder structure (`/src/core`, `/src/http`, `/src/mcp`)
- [ ] Implement `repairPipeline(input: string, schema?: JSONSchema)`:
  - [ ] Direct `JSON.parse` attempt
  - [ ] `jsonrepair` fallback
  - [ ] `ajv` validation + basic type coercion (string→number, fill schema defaults, strip disallowed extra fields)
  - [ ] Return `{ valid, repaired, method, changes[] }` — no LLM call yet
- [ ] Implement LLM-fallback repair (`method: "llm"`): call an LLM via OpenRouter (free model) with broken input + schema + "return only valid JSON matching this schema"
- [ ] Write a test battery of realistically-broken LLM JSON: trailing commas, single quotes, unescaped newlines, markdown code fences around the JSON, truncated/cut-off output, comments, numbers-as-strings
- [ ] Confirm the pipeline handles all test cases correctly, deterministic tier first, LLM tier only as last resort

## Day 2 — Deploy, bill, expose via MCP

- [ ] Wrap `repairPipeline` in a Cloudflare Worker HTTP handler (`POST /v1/repair`), deploy, verify with `curl`
- [ ] Add rate limiting on the free (deterministic) endpoint via Cloudflare KV (e.g., 100 req/day per IP/key) — abuse control, not a paywall
- [ ] Gate the LLM-fallback tier behind **x402**: unpaid request → `402` + payment request → agent pays USDC on Base → retry with receipt → response
  - [ ] Stand up a wallet to receive payments (Base network) before wiring this up
- [ ] Build the MCP server (`repair_json`, `validate_json` tools) on the same Worker via Streamable HTTP transport
- [ ] Test the MCP server locally against Claude Code / Claude Desktop config, then confirm the deployed remote URL works the same way

## Day 3 — Docs, demo, distribution

- [ ] Build a zero-signup interactive demo page: paste broken JSON → click Fix → see the diff. This is the main marketing asset — do not skip it.
- [ ] Write README, OpenAPI spec, and `llms.txt` (so agents/LLMs reading the site understand capabilities and pricing without a human explaining it)
- [ ] Pick a name + domain, point it at the Worker
- [ ] Submit listings: Smithery, MCP.so, PulseMCP, Glama, Apify
- [ ] Post: "Show HN", r/AI_Agents, r/LangChain, r/mcp, r/LocalLLaMA, relevant Discords (LangChain, CrewAI) — angle: "agent pipeline kept dying on malformed JSON, built a fix for it, free for basic repair, MCP-native, pay-per-call via x402 for the hard cases"
- [ ] Open PRs against `awesome-mcp-servers` and `awesome-ai-agents` GitHub lists
- [ ] Wire up minimal usage logging/analytics (Cloudflare Analytics is enough for week 1) so you can see call volume and where it's coming from

---

## Pricing

| Tier | Price | Rail |
|---|---|---|
| Deterministic repair/validate | Free (rate-limited) | — |
| LLM-fallback repair | $0.01–0.02/call | x402 (USDC/Base) — sole rail |
| Wholesale / OEM | negotiated per-call | x402, prepaid wallet commitment |

## Week-1 success signals

- [ ] 4+ directory listings live
- [ ] First 100 free-tier calls
- [ ] First real paid call (proves the payment loop end-to-end)
- [ ] Any organic mention/star from someone who isn't you

## Open decisions before starting

- [ ] Product name / domain
- [ ] OpenRouter API key (free) provisioned for the fallback tier; default free model keeps COGS near zero
- [ ] Wallet set up to receive x402/USDC payments on Base

## Expansion (post-launch, not part of the 3 days)

- Generalize from "repair existing JSON" to "coerce any messy agent text output into schema-conformant JSON"
- Outcome-based pricing option (charge only if the repaired output validates against the schema)
- Batch endpoint for high-throughput pipelines
