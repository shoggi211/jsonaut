# Jsonaut — Launch & Distribution Kit

Everything here is **ready to publish/post — but you send it, not me.** Anything public (Show HN, Reddit, PyPI/npm publish, GitHub PRs) is under your name and needs your click. Live URL: **https://jsonaut.jsonaut-shaurya.workers.dev**

> The code is on GitHub at **https://github.com/shoggi211/jsonaut** and [server.json](server.json) already points at it. Directories and readers expect this source repo.

---

## 1. Directory listings (where agents/devs discover MCP servers)

These crawl [server.json](server.json) / your repo. Claimed listings rank above auto-crawled ones, so claim each.

- **Official MCP registry** — publish `server.json` per https://github.com/modelcontextprotocol/registry (needs the `mcp-publisher` CLI + GitHub auth). This is the source many others read.
- **Smithery** — https://smithery.ai → add server → it's a **remote** server, give the URL `https://jsonaut.jsonaut-shaurya.workers.dev/mcp`. Then claim it. Chase the quality score (clear tool descriptions — already tuned in `src/mcp/server.ts`).
- **Glama** — https://glama.ai/mcp/servers → submit repo URL, then claim.
- **PulseMCP** — https://www.pulsemcp.com → submit.
- **mcp.so** — https://mcp.so/submit.

**x402 Bazaar (no form):** the CDP facilitator auto-indexes your endpoint the first time it **settles a real payment**. Once you're on mainnet, make one paid call against yourself and you're listed.

## 2. Publish the client libraries (each install is a lead)

```bash
# npm  (from clients/js)  — already builds clean
cd clients/js && npm publish --access public

# PyPI (from clients/python)
cd clients/python && python -m build && python -m twine upload dist/*
```

The `jsonaut` name may be taken on npm/PyPI — if so, use a scope/suffix (e.g. `@yourname/jsonaut`, `jsonaut-client`) and update the READMEs.

## 3. Launch posts (same 48h window, after listings are live)

### Show HN
**Title:** `Show HN: Jsonaut – a JSON-repair API that AI agents pay for per-call (x402)`

**Body:**
> Agents that call tools or hand off to other agents constantly choke on malformed JSON — trailing commas, single quotes, truncated output, markdown fences, `True`/`None`. Retrying the whole LLM call to "fix it" costs more in tokens than the bug is worth, and often comes back broken again.
>
> Jsonaut is a small service that repairs it. Deterministic fixes are free (it's `jsonrepair` + JSON Schema coercion). The hard cases — where you basically need a model to reconstruct the intended data — go through a paid LLM tier at $0.01/call, charged only on success. The twist: agents pay for it themselves, per-call, via x402 (USDC on Base) — no account, no signup. There's also an MCP endpoint so an agent can just discover and call it.
>
> It's a Cloudflare Worker (free tier is fully public). Local-first npm/Python clients try to fix JSON offline and only hit the API for the hard cases. Happy to answer anything about the payment-rail plumbing or the repair pipeline.
>
> Demo + docs: https://jsonaut.jsonaut-shaurya.workers.dev

### r/mcp
> **Jsonaut — an MCP server that repairs malformed JSON from tool calls**
> Add it: `claude mcp add --transport http jsonaut https://jsonaut.jsonaut-shaurya.workers.dev/mcp`
> Tools: `repair_json` (fixes broken JSON, optionally enforces a JSON Schema) and `validate_json`. Free deterministic tier; paid LLM fallback via x402 for the cases jsonrepair can't handle. Built it because multi-agent pipelines kept dying on malformed handoffs.

### r/LocalLLaMA
> **Stop losing runs to malformed JSON from local models**
> Small/quantized models love emitting almost-JSON (trailing commas, `True`, fences, truncation). Jsonaut repairs it — free deterministic tier runs offline via the npm/Python client (`pip install "jsonaut[local]"`), and there's a hosted API + MCP server for schema enforcement and a model-based fallback. Local-first, so most calls never leave your machine.

### r/LangChain
> **A drop-in repair step for `OutputParserException`**
> When a chain's JSON output won't parse, `jsonaut` tries a local repair first and only calls the API for the hard cases or to coerce against your schema. Sketch of an output-parser wrapper is in the client README.

### X/Twitter thread
1. Agents break on malformed JSON constantly. The usual "fix": re-run the whole LLM call — $0.03–0.30 in tokens, seconds of latency, might still be broken. Built a cheaper fix. 🧵
2. Jsonaut: free deterministic repair (trailing commas, quotes, truncation, fences, python literals) + JSON Schema coercion. Hard cases → a model reconstructs it for $0.01, charged only on success.
3. The interesting part: agents pay per-call themselves via x402 (USDC on Base) — no account. And there's an MCP endpoint so an agent just discovers + calls it. [demo gif]
4. Local-first npm/Python clients fix most JSON offline, hit the API only when needed. Try it: https://jsonaut.jsonaut-shaurya.workers.dev

### awesome-mcp-servers PR
Add under a "Utilities" / "Developer Tools" section:
```md
- [Jsonaut](https://jsonaut.jsonaut-shaurya.workers.dev) — Repair malformed JSON from LLM tool calls and agent handoffs; optional JSON Schema coercion. Free deterministic tier + pay-per-call LLM fallback (x402). Remote MCP: `https://jsonaut.jsonaut-shaurya.workers.dev/mcp`
```
PR title: `Add Jsonaut (JSON repair for agent output)`

## 4. Record the demo GIF (your screen — it's the best asset)

10 seconds on https://jsonaut.jsonaut-shaurya.workers.dev: paste `{'name': 'test', "count": "42", "tags": ["a","b",],}`, click **Fix it**, show the clean JSON + the "changes" list. Use it in the HN comments and the X thread.

## 5. Reminder on boundaries
- I can prep/update any of this copy and the code. **Posting, publishing, and PRs are yours** — they're public and under your identity.
- Mainnet x402 (real money) still needs the CDP facilitator credentials before the "settle a payment to self-list on Bazaar" step works.
