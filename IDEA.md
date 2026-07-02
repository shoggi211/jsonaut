# Project Brief: Jsonaut — Agent-Native JSON Repair & Validation API

## 0. Purpose of this document

This file is self-contained context for an AI model/agent picking up this project cold, with no access to the conversation that produced it. It contains the market rationale, the product spec, the technical architecture, the build plan, and the go-to-market plan. If you are an AI agent tasked with executing this project:

- Follow section 6 (Build Plan) sequentially.
- Do not ask the human operator for anything except the items listed in section 10 (Inputs Required From Human Operator).
- Section 3 (Alternatives Considered) is a fallback list — if this idea stalls or a required input is refused, it contains other vetted options from the same research pass, ranked, so you do not need to re-derive them.
- All market claims below were gathered via web search in July 2026. Treat dates, transaction volumes, and protocol adoption figures as a snapshot, not ground truth at execution time — re-verify anything load-bearing (e.g., "is x402 still the right payment rail") before committing engineering time to it.

---

## 1. Executive summary

Build and ship, in 3 days, a pay-per-call API + MCP server that repairs and validates malformed JSON produced by LLM tool-calling and agent-to-agent handoffs. Deterministic repair (trailing commas, unescaped quotes, truncation, markdown code-fences, comments) is free and rate-limited. A paid LLM-fallback tier handles inputs deterministic repair can't fix. Billing is agent-native and x402-only (x402 micropayments, USDC on Base) — no fiat/Stripe rail, no accounts. (A Stripe credit implementation exists but is parked/unused in src/http/billing.ts; the product does not use it.) Distribution is via MCP directories and developer communities, not paid marketing — the target buyer (an autonomous agent, or the developer wiring one up) discovers and adopts the tool in the same session they hit the problem it solves.

---

## 2. Market context and rationale

**Core thesis:** the customer is an AI agent (or the wallet/budget it operates under), not a human clicking through a funnel. This changes what "go to market" means — there is no landing-page-to-signup-to-trial funnel. Discovery happens through tool directories and developer word-of-mouth; purchase happens autonomously and per-call, often without a human in the loop at time of payment.

**Payment infrastructure that makes this viable right now:**
- **x402** (Coinbase-originated, now an open standard/foundation): revives HTTP 402 so an unpaid API call returns a payment request, the agent pays in stablecoin (USDC on Base/Solana), and retries with a receipt — round-trip under 2 seconds, fees under $0.001. As of April 2026: ~165M transactions, ~69,000 active agents (Coinbase disclosure). Independent data (CoinDesk, March 2026) shows *real* organic daily volume is still small (~$28K/day network-wide) relative to the ~$7B ecosystem valuation — adoption is real but early, treat it as one rail, not the only rail.
- **Stripe Machine Payments Protocol (MPP)**, opened to developers March 2026: fiat-rail alternative, better suited to session-based/aggregated billing than x402's per-call model. (Considered as a fiat fallback but deliberately NOT used — this product is x402-only.)
- **AP2** (Google, 60+ partners incl. Mastercard, Amex, PayPal, Coinbase): authorization/trust layer — cryptographically signed "mandates" proving a human authorized an agent's action. Relevant context, not required for this project's MVP.
- **ACP** (OpenAI/Stripe): standardizes agent checkout against merchant catalogs. OpenAI's own consumer-facing "Instant Checkout" built on it was quietly killed in March 2026 after near-zero sales — signal that consumer agentic-checkout is not yet proven, but the merchant-catalog/B2B use of ACP persists. Not directly relevant to this project.

**MCP as the distribution channel:**
- 17,000+ MCP servers exist as of mid-2026; fewer than 5% make any money. The minority that succeed are narrow, high-frequency utilities, not broad platforms (example: 21st.dev's "Magic MCP" crossed $10K MRR in 6 weeks with zero paid marketing).
- Winning pricing models blend a free/freemium on-ramp with per-call or outcome-based pricing for the expensive path. "Meter as the product, payment as a detail" is cited as the operative success pattern for 2026 MCP monetization.
- Marketplaces/directories worth listing on: Smithery, MCP.so, PulseMCP, Glama, Apify (Apify hosts MCP servers with a pay-per-event model, 80% revenue share to the builder).

**Why JSON repair specifically, versus other agent-tool ideas evaluated:**
- Malformed structured output is one of the most universal failure modes in agent tool-calling and multi-agent handoffs — essentially every framework that does function-calling hits this.
- Zero infrastructure cost for the free tier (pure compute, no browser fleet, no data licensing, no proxy/anti-bot costs).
- Trivial value proposition requiring no domain explanation: a wasted LLM retry costs more in tokens than the fee for this service.
- Extremely fast to build — deterministic JSON repair is a solved problem with mature open-source libraries in every language; the paid LLM-fallback tier is a thin wrapper around an existing model API.

---

## 3. Alternatives considered (fallback list, ranked)

If this idea needs to be abandoned or swapped, these were independently vetted across the same research pass, roughly in order of plausibility/scalability/profitability for a solo 1-week build:

1. **Visual render & verify API** — URL/HTML in, screenshot/PDF/visual-diff out, for agents that generate UI but have no browser sandbox to check their own work. Slightly more build time than JSON repair (~1 extra day for Playwright integration) but far more visually demoable for marketing (GIFs, tweets).
2. **PII/compliance redaction & content-safety pre-check API** — regulatory-driven, recurring, non-optional step for agents handling user data before it goes to a third-party LLM or store.
3. **Content → polished office file renderer** — structured JSON/markdown to pixel-correct DOCX/PPTX/XLSX/PDF. Agents generate text well, produce acceptable *files* poorly.
4. **Independent LLM-as-a-judge / grading API** — a second, differently-sourced model grades an agent's own output against a rubric, since self-grading is correlated with the agent's own blind spots. Fits outcome-based pricing.
5. **OCR + structured extraction for receipts/invoices/forms** — back-office automation demand (expense, procurement, claims).
6. **Phone-call-as-a-tool** — agent hands off a task requiring an actual voice call (confirm a reservation, reach a business with no API) to a telephony+voice-AI service, returns structured transcript. Solves something an agent structurally cannot do itself.
7. **Lightweight tool/agent reputation registry** — crowdsourced "is this MCP server/tool reliable" lookup, paid per query. MCP has 17,000+ servers and no quality signal — discovery/trust, not supply, is the bottleneck.
8. **Know-Your-Business (KYB) counterparty check** — agent pays a small fee to verify an unfamiliar merchant/counterparty is a real registered business before an autonomous transaction. Rides the same "Know Your Agent" trust wave as Experian's Agent Trust and Mastercard Agent Pay, but as a narrow lookup rather than a full identity platform.
9. **Ephemeral pay-per-op memory for small/indie agents** — scoped vector-store billed per operation via x402, targeting the long tail of small agents that don't want an enterprise memory-infra contract (Mem0/Letta own the enterprise tier).
10. **Fact-check / claim verification with citations** — claim in, verdict + ranked sources out, cached, to save a content-generating agent from burning its own context on multi-source search.

Deliberately excluded: general-purpose code execution sandboxes (crowded/well-funded: E2B, Modal, Daytona, Northflank, Vercel Sandbox), general web search/scraping (Exa and Firecrawl dominate), anything where the actual payer is an advertiser or enterprise rather than the agent itself (agentic advertising, NHI/security governance sold to enterprises), and anything that facilitates bypassing bot-detection or anti-abuse systems (excluded on policy grounds, not just market grounds).

---

## 4. Product specification

**Name (placeholder, human must confirm — see section 10):** Jsonaut

**Function:** Given a string of possibly-malformed JSON and an optional JSON Schema, return valid, schema-conformant JSON, or a clear failure with diagnostic detail.

**Interfaces:**
1. HTTP REST endpoint: `POST /v1/repair`
2. MCP server exposing tools: `repair_json`, `validate_json`, reachable over Streamable HTTP transport so it can be added to any MCP-compatible agent by URL.

**Request shape (both interfaces):**
```json
{
  "input": "<string, the possibly-broken JSON>",
  "schema": { "...optional JSON Schema..." },
  "allow_llm_fallback": true
}
```

**Response shape:**
```json
{
  "valid": true,
  "repaired": { "...parsed object..." },
  "method": "direct" | "deterministic-repair" | "llm-repair" | "failed",
  "changes": ["..human-readable list of what was fixed.."]
}
```

**Tier logic:**
- `method: direct` and `deterministic-repair` — free, rate-limited.
- `method: llm-repair` — only attempted if `allow_llm_fallback: true` and the deterministic path fails; requires x402 payment before executing, since it costs real inference tokens.
- `method: failed` — returned (free) if even LLM repair cannot produce schema-valid output; caller is not charged for a failed paid attempt.

---

## 5. Technical architecture

```
Agent (or agent-owning developer)
   │
   ├─ HTTP POST /v1/repair                (plain REST)
   └─ MCP tool call: repair_json          (Streamable HTTP transport, hosted)
         │
         ▼
   1. JSON.parse attempt
   2. jsonrepair library (trailing commas, single quotes, truncation,
      markdown code-fence stripping, comments, unescaped newlines)
   3. ajv schema validation + type coercion, if a schema was supplied
      (string→number coercion, fill schema defaults, strip disallowed
      extra fields)
   4. [PAID, only if 1-3 fail and allow_llm_fallback=true]
      Call an LLM via OpenRouter (free-tier model) with the broken input + schema +
      instruction to return only valid JSON matching the schema
         │
         ▼
   Response: { valid, repaired, method, changes[] }
```

**Stack:**
- TypeScript, deployed on Cloudflare Workers (Hono framework) — scales to zero, no server management, free tier covers early volume.
- `jsonrepair` npm package for deterministic repair.
- `ajv` for JSON Schema validation.
- OpenRouter (OpenAI-compatible API) for the paid LLM-fallback tier, defaulting to a free ":free" model — cheap/zero-cost and appropriate for a narrow, well-specified repair task. Swappable to a paid model via OPENROUTER_MODEL for reliability at scale.
- `@modelcontextprotocol/sdk` for the MCP server, hosted on the same Worker.
- x402 middleware for the paid tier (USDC on Base) — primary agent-native billing rail.
- (No fiat rail. x402 is the sole payment path. A parked Stripe implementation exists in src/http/billing.ts but is not wired in.)
- Cloudflare KV for lightweight rate-limiting/usage counters on the free tier. No relational database needed for MVP — the service is stateless per-call.

---

## 6. Build plan (3 days)

### Day 1 — Core engine
- Scaffold repo: TypeScript, Hono, folders `/src/core`, `/src/http`, `/src/mcp`.
- Implement `repairPipeline(input: string, schema?: JSONSchema)`: direct parse → `jsonrepair` → `ajv` validate/coerce → return `{ valid, repaired, method, changes[] }`. No LLM call at this stage.
- Implement the LLM-fallback path (`method: "llm-repair"`): call an LLM via OpenRouter (free-tier model) with the broken input, the schema, and an instruction to return only valid JSON.
- Build a test battery of realistic broken-JSON samples: trailing commas, single quotes, unescaped newlines, markdown code fences wrapping the JSON, truncated/cut-off output, inline comments, numbers represented as strings.
- Confirm deterministic repair handles the majority of cases; LLM fallback is only invoked as last resort.

### Day 2 — Deploy, bill, expose via MCP
- Wrap `repairPipeline` in a Cloudflare Worker HTTP handler at `POST /v1/repair`; deploy; verify with `curl`.
- Add free-tier rate limiting via Cloudflare KV (e.g., 100 req/day per IP/key) — abuse control, not a paywall.
- Gate the LLM-fallback tier behind x402: unpaid request → HTTP 402 + payment request → agent pays USDC on Base → retry with receipt → response executes.
  - Requires a wallet provisioned on Base to receive payments before this step (see section 10).
- (Stripe fiat fallback intentionally omitted — x402-only.)
- Build the MCP server (`repair_json`, `validate_json`) on the same Worker via Streamable HTTP transport.
- Test locally against an MCP-compatible client (e.g., Claude Code / Claude Desktop config), then confirm the deployed remote URL behaves identically.

### Day 3 — Docs, demo, distribution
- Build a zero-signup interactive demo page: paste broken JSON, click Fix, see the diff. This is the primary marketing asset — do not skip it.
- Write README, an OpenAPI spec, and an `llms.txt` file describing capabilities and pricing in a format other AI systems can parse directly.
- Finalize name/domain (see section 10) and point it at the deployed Worker.
- Submit listings to: Smithery, MCP.so, PulseMCP, Glama, Apify.
- Post to: Hacker News ("Show HN"), r/AI_Agents, r/LangChain, r/mcp, r/LocalLLaMA, relevant Discords (LangChain, CrewAI). Framing: "agent pipeline kept breaking on malformed JSON, built a fix — free for basic repair, MCP-native, pay-per-call via x402 for the hard cases."
- Open PRs against `awesome-mcp-servers` and `awesome-ai-agents` GitHub lists.
- Add minimal usage logging/analytics (Cloudflare Analytics is sufficient for week 1) to observe call volume and traffic sources.

---

## 7. Pricing and business model

| Tier | Price | Rail |
|---|---|---|
| Deterministic repair/validate | Free (rate-limited) | — |
| LLM-fallback repair | $0.01–0.02/call | x402 (USDC/Base) — sole rail |
| Wholesale / OEM | negotiated per-call | x402, prepaid wallet commitment |

Failed paid attempts (deterministic and LLM repair both fail to produce schema-valid output) are not charged.

---

## 8. Go-to-market / distribution plan

No paid acquisition. Distribution is entirely: (a) MCP/tool directory listings, where the buyer is already searching with intent, and (b) developer-community posts framed around the specific pain point, not the product. The interactive no-signup demo page is the primary conversion asset since it lets a developer or agent verify the value proposition in under 10 seconds with zero commitment. See Day 3 of the build plan for the specific channel list.

---

## 9. Success metrics (week 1)

- 4+ live directory listings (Smithery, MCP.so, PulseMCP, Glama minimum).
- First 100 free-tier calls.
- First real paid call completed end-to-end (proves the x402 payment loop actually works, not just that the code compiles).
- Any organic mention, star, or listing pickup from someone who is not the builder.

---

## 10. Inputs required from human operator

An executing AI agent should request only these from the human before or during the build — nothing else:

1. **Product name and domain** to replace the "Jsonaut" placeholder.
2. **OpenRouter API key** (free to create), for the LLM-fallback tier. Defaults to a free model; can be pointed at a cheap paid model later for reliability.
3. **A wallet address on the Base network** to receive x402/USDC payments (needs to exist before Day 2's payment-gating step).
4. **Explicit confirmation before any public posting** (Hacker News, Reddit, Discord, GitHub PRs) and **before any spend-incurring action** (domain purchase, funding the Base wallet) — these are visible/external actions and should not be taken autonomously without the human's sign-off, consistent with standard operating caution around irreversible or externally visible actions.

---

## 11. Expansion roadmap (post-launch)

- Generalize from "repair existing JSON" to "coerce arbitrary messy agent text output into schema-conformant JSON" (broader input surface, same core engine).
- Add outcome-based pricing option: charge only if the repaired output actually validates against the caller's schema.
- Add a batch endpoint for high-throughput agent pipelines.

---

## 12. Sources (as of July 2026 — re-verify before relying on any figure)

- x402 Protocol Explained: How AI Agents Pay Onchain — https://eco.com/support/en/articles/12328618-x402-protocol-explained-how-ai-agents-pay-onchain
- Coinbase-backed AI payments protocol wants to fix micropayment but demand is just not there yet (CoinDesk, March 2026) — https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet
- Agentic payments protocols compared: MPP, ACP, AP2, x402 — https://www.crossmint.com/learn/agentic-payments-protocols-compared
- Agentic Commerce Standards: UCP vs ACP vs AP2 in 2026 — https://www.digitalapplied.com/blog/agentic-commerce-standards-ucp-acp-ap2-2026-merchant-guide
- How to Monetize MCP Servers in 2026: The Developer's Revenue Playbook — https://godberrystudios.com/posts/how-to-monetize-mcp-servers-2026/
- How to Charge for an MCP Server in 2026: Per-Call, Subscription, or x402 — https://usagebox.com/articles/how-to-charge-for-mcp-server-2026-per-call-subscription-x402
- MCP and Payments: A 2026 Guide — https://eco.com/support/en/articles/14845480-mcp-and-payments-a-2026-guide
- Agent Identity Verification: How AI Agents Authenticate Purchases in 2026 — https://eco.com/support/en/articles/15192005-agent-identity-verification-how-ai-agents-authenticate-purchases-in-2026
- Experian Announces Agent Trust to Power Trusted AI Driven Commerce — https://www.experianplc.com/newsroom/press-releases/2026/experian-announces-agent-trust-to-power-trusted-ai-driven-commer
- AI Agent Memory 2026: Progress Benchmark Report — Mem0 — https://mem0.ai/blog/state-of-ai-agent-memory-2026
- What's the best code execution sandbox for AI agents in 2026? — https://northflank.com/blog/best-code-execution-sandbox-for-ai-agents
- Best AI Search Engine API tools for agents in 2026 — Composio — https://composio.dev/content/9-top-ai-search-engine-tools
