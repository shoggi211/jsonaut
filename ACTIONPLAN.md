# Jsonaut — Launch Action Plan

Split of who does what to get from "built locally" to "live and earning." Ordered by the critical path to first dollar.

Legend: **[YOU]** needs your account/credentials/money/identity · **[ME]** I can build/write it · **[BOTH]** I prep, you execute.

---

## Phase 0 — Decisions that unblock everything (do first)

- [ ] **[YOU] Pick the name + buy the domain.** Working name is "Jsonaut" (used everywhere in code). This gates the domain, the npm/PyPI package names, and all listing copy — changing it later means a find-replace pass + re-listing. If you want a different name, tell me and I'll rename the codebase in one pass.
- [x] **[ME] Revenue rail = x402 only.** Per your call, dropped the Stripe/credit-card rail entirely — agents pay per-call via x402, no accounts. Simpler product, purer agent-native story. The Stripe code I'd built is parked (unused) in [billing.ts](src/http/billing.ts) in case a fiat rail is ever wanted again.

## Phase 1 — Make it deployable & earning (critical path)

- [x] **[ME] Deploy runbook** — copy-paste steps in [DEPLOY.md](DEPLOY.md).
- [ ] **[YOU] Create accounts & secrets:**
  - [ ] Cloudflare account → `npx wrangler login`
  - [ ] Free OpenRouter API key (enables the paid LLM tier, free model) → `npx wrangler secret put OPENROUTER_API_KEY`
- [ ] **[BOTH] Deploy to Cloudflare.** I hand you the exact command list; you run it (needs your login). I'll debug anything that breaks.
- [ ] **[YOU] Set up the Base wallet** for x402 (`X402_PAY_TO`) + point `FACILITATOR_URL` at the CDP facilitator. This is now the **only** paid rail, so it's required to earn.

## Phase 2 — Discovery plumbing (so buyers can find it)

- [ ] **[ME] `server.json` + `smithery.yaml`** registry manifests, tuned tool descriptions (the "SEO" that makes models pick the tool). *(next turn)*
- [ ] **[ME] `jsonaut` npm client + Python client** — local-first repair, calls API only for hard cases. Each install is a lead. *(next turn)*
- [ ] **[ME] LangChain + Vercel AI SDK output-parser adapters.** *(next turn)*
- [ ] **[BOTH] Publish + claim listings:** I prep the manifests and exact publish commands; **[YOU]** run `smithery mcp publish` and click "claim" on Smithery / Glama / PulseMCP (needs your accounts).
- [ ] **[YOU] Trigger the x402 Bazaar listing** — make one real paid call against your own deployed endpoint. That settlement auto-indexes you; there's no form.

## Phase 3 — Launch (all in one 48h window, listings already live)

- [ ] **[ME] Draft everything:** Show HN post + top comment, the 4 tailored Reddit posts, the X/Twitter thread, the demo-GIF shot list/script.
- [ ] **[YOU] Record the demo GIF** (10s: paste broken JSON → Fix → clean output). It's your best asset; must be your screen.
- [ ] **[YOU] Post everything** — HN, r/AI_Agents, r/LangChain, r/mcp, r/LocalLLaMA, the Discords, X. **All public posting is yours to approve and send** (it's under your identity).
- [ ] **[BOTH] Awesome-list PRs** — I write them, you submit from your GitHub.

## Phase 4 — Sell the real money (week 4+)

- [ ] **[ME] Draft the OEM pitch** + target list (agent platforms, eval/observability tools) with your usage numbers plugged in.
- [ ] **[ME] Error-message SEO pages** (evergreen, high-intent).
- [ ] **[YOU] Send the OEM emails** + take the calls.

---

## The division in one sentence

**I build the code, configs, client libraries, and all the copy/drafts; you own the accounts, money, the demo recording, and anything posted publicly under your name.**

## What I need from you to keep moving

1. Name/domain confirmation (or "keep Jsonaut").
2. When ready: Cloudflare + a free OpenRouter account + a Base wallet so we can deploy.
3. Go/no-go on each public post before it ships.
