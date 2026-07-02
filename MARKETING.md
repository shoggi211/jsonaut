# Jsonaut — Marketing & Sales Plan

Companion to [PLAN.md](PLAN.md) and [IDEA.md](IDEA.md). Budget assumption: ~$0 plus a domain. One person. The product's buyers are (a) AI agents discovering tools mid-task, and (b) the developers who configure agents' toolsets. These need different funnels, and this plan treats them separately.

---

## 1. Positioning

**One-liner:** "Your agent's JSON breaks. Send it here first."

**Category:** reliability infrastructure for agent pipelines (not "a JSON tool" — a *reliability layer*). The long-term brand is "the thing you put between any two agents so handoffs never crash."

**Price anchor — always sell against the retry:** a failed tool call means the calling agent re-prompts with the full context window again. At typical context sizes that retry costs $0.03–0.30+ in tokens and adds seconds of latency, with no guarantee the second attempt parses either. Jsonaut's paid tier is $0.01, charged only on success. Every piece of copy should contain some version of "cheaper than one retry."

**Objection handling (put these answers in the FAQ, verbatim):**
- *"I'll just use the jsonrepair npm package locally."* — Correct, and our free tier IS jsonrepair. You outgrow it the moment you need schema enforcement, type coercion, an LLM escalation path, or a fix that works from any language/runtime without adding a dependency. Agents calling via MCP can't `npm install` anything.
- *"I'll just ask the LLM to retry."* — That's the $0.30 option. See price anchor.
- *"What happens to my data?"* — Stateless, processed in-memory, never stored or logged. (This must actually stay true; it's a selling point for agents handling user data.)

---

## 2. Funnel A: the agent as the customer (agent-native discovery)

This is the novel channel and the story that makes the product press-worthy. Machines read your metadata and decide autonomously — which means **your ad copy is read by models, not humans**, and it lives in three places:

### 2a. x402 Bazaar (Coinbase's discovery index)
- There is **no submission form**. The CDP Facilitator auto-catalogs an endpoint the first time it **settles a real payment** against it. Action item: once deployed with `FACILITATOR_URL` pointed at the CDP facilitator, make one real paid call against yourself — that transaction IS the listing.
- Agents discover services via **semantic search** (`search_resources`) over the endpoint's description, pricing, and input/output schemas. The `description` field in our 402 `accepts` payload is therefore search ad copy. Optimize it the way you'd optimize a search snippet: lead with the problem ("repairs malformed JSON from LLM tool calls"), include the words agents will search with ("fix JSON parse error", "schema validation", "malformed output"), state the price.
- Keep the OpenAPI spec and llms.txt in sync with this copy — hybrid search indexes them.

### 2b. MCP registries (where agent developers configure toolsets)
- **Smithery** ranks by a quality score plus install count, and **claimed listings outrank auto-crawled ones**. Publish via `smithery mcp publish`, then claim the listing. Chase the quality score: complete server.json, correct remote-transport config, clear tool descriptions with examples. Then claim listings on **Glama** (~37K servers tracked; claimed = verified tier) and **PulseMCP**. Also: MCP.so, mcpmarket, and **Apify** (hosts the server, handles billing, 80% rev share — a second storefront for free).
- **Tool descriptions are the new SEO.** When an agent has 40 tools registered, the model chooses which to call by reading descriptions. Ours must answer "when should a model pick me": *"Use when JSON.parse fails on output from another model or tool. Fixes trailing commas, quotes, truncation, fences; enforces your JSON Schema."* Test this empirically: give Claude/GPT a broken-JSON task with Jsonaut among many tools and iterate the description until it reliably gets picked.

### 2c. The 402 response is your best salesperson
When a free-tier call fails and the paid tier could fix it, the 402/hint body is read by the very agent that has the problem, at the exact moment it has the problem, with budget authority to solve it. That error body is the highest-intent sales surface that has ever existed. It must contain: what went wrong, that a fix is available, the exact price, and machine-followable payment instructions for both rails. Treat its wording as seriously as a landing-page hero.

---

## 3. Funnel B: the developer as the customer (classic dev-tool GTM)

### 3a. Launch week
- **Demo GIF first.** Record: paste mangled agent output → click Fix → clean JSON with a changes-audit list. 10 seconds. This asset does more work than any paragraph.
- **Show HN** — title shaped like: "Show HN: I built a JSON-repair API that AI agents pay for autonomously (x402)". The agent-pays-machine angle is the upvote hook; the utility is the retention hook. Post the technical story in comments immediately: what broke, the jsonrepair-wraps-prose bug, the charge-only-on-success design.
- **Reddit:** r/AI_Agents, r/LangChain, r/mcp, r/LocalLLaMA — not the same post; each gets the framing its community cares about (agent reliability / output parsers / MCP server drop / local-pipeline tooling).
- **Discords:** LangChain, CrewAI, Cursor, Windsurf — answer people's "my agent keeps crashing on JSON" questions with genuinely helpful replies that happen to link the tool.
- **X/Twitter:** the demo GIF + the price-anchor math as a thread. Tag the MCP/agent-infra accounts that retweet ecosystem tools.

### 3b. Error-message SEO (the compounding channel)
Developers don't search "JSON repair API" — they paste error messages. Write one page each targeting:
- "Unexpected token in JSON at position" + LLM/agent context
- "LLM returns invalid JSON" / "GPT function calling malformed JSON"
- "LangChain OutputParserException fix"
- "Claude/GPT JSON mode still returns broken JSON"
Each page: explain the error honestly, show the free local fix (jsonrepair), then show ours as the escalation. High intent, evergreen, zero competition on most of these phrases from actual tools (only blog spam).

### 3c. Wedge into the frameworks
- Ship a tiny **`jsonaut` npm package + Python client**: tries local repair first (free, instant), calls the API only for hard cases. Local-first is honest AND it's distribution — every install is a lead, and npm/PyPI listings rank.
- Write output-parser adapters for LangChain, Vercel AI SDK, Pydantic-AI, CrewAI. PR them or publish as community packages ("langchain-jsonaut"). Each adapter = a docs page in someone else's ecosystem pointing at you.
- PR into `awesome-mcp-servers` / `awesome-ai-agents` lists (sustained organic GitHub traffic).

---

## 4. What to sell beyond per-call (the actual money)

We are **x402-only** (no Stripe/credit-card rail — deliberate, per the product decision). That makes this purely agent-native but also means near-term per-call revenue is genuinely small, because x402 network-wide organic volume is still ~$28K/day and the buyer must already hold a funded Base wallet. So treat per-call x402 as proof-of-loop, and put real weight on the deals below:

1. **OEM/wholesale (the real prize):** agent-framework and agent-ops platforms embedding Jsonaut as their default output-repair layer, at a wholesale per-call rate, under their branding. One platform deal = thousands of end users' volume, and platforms are far more likely than individual agents to have wallets/budgets today. Target list: agent-hosting platforms, eval/observability tools (they see their customers' parse failures!), no-code agent builders. The pitch: "your users' agents crash on malformed JSON and they blame *you* — here's a white-label fix." **This, not retail per-call, is where x402-only revenue actually comes from at launch.**
2. **Volume/prepaid arrangements** for high-throughput pipeline operators — a wallet-funded commitment for a discounted per-call rate.
3. **The x402 story itself** is marketing capital even while volume is small: "agents autonomously buy repairs from us, no human in the loop" is a talk, a blog post, a press quote. The purity of going x402-only makes this story *stronger* than a hybrid would. Milk the novelty while it's novel.

> Tradeoff we accepted: dropping Stripe removes the "any developer with a credit card" revenue floor. If early x402 volume proves too thin, the parked Stripe code ([billing.ts](src/http/billing.ts)) can be re-wired in under a day as a fallback — but the plan does not assume it.

---

## 5. Sequencing (first 30 days)

**Week 1 — ship the funnel:** deploy to Cloudflare, buy domain, make the demo GIF, publish + claim Smithery/Glama/PulseMCP, wire the x402 rail and settle one payment against yourself (= Bazaar listing).
**Week 2 — launch:** Show HN + Reddit + Discords + X in the same 48h window (listings already live so the traffic has somewhere to convert). Awesome-list PRs.
**Week 3 — compound:** npm/PyPI clients, first two error-message SEO pages, LangChain adapter.
**Week 4 — sell:** email 10 agent-platform/eval companies the OEM pitch with week-1..3 usage numbers attached.

## 6. Metrics that matter

- Free calls/day and **method distribution** (what % of traffic needs the paid tier — this sets the realistic conversion ceiling)
- **402s served → paid conversions** (the agent-native funnel's only KPI)
- Directory referrer split (which listing actually sends traffic)
- OEM/platform pipeline: conversations started → wholesale deals signed (the real revenue KPI given x402-only)
- One vanity metric worth tracking anyway: cumulative "retries saved" — it becomes the homepage counter and the HN comment stat.

## 7. Honest risks

- **Moat is thin at the free tier** (it's an OSS library). The moat is the escalation path, the MCP/x402 packaging, and eventually the benchmark reputation. Publish a public repair-success-rate benchmark early and keep winning it.
- **x402 agent-wallet adoption may stay slow, and we removed the fiat fallback** — this is the biggest risk of going x402-only. Mitigation: lean on OEM/platform deals (buyers who *do* have wallets) rather than retail per-call, and keep the parked Stripe code ready to re-wire if the wallet economy lags.
- **A model-provider fix** (perfect structured outputs) shrinks the category over time. Counter: multi-model pipelines and agent-to-agent handoffs keep producing garbage even when single models behave; expand toward "coerce anything to schema" and cross-agent contract validation.
