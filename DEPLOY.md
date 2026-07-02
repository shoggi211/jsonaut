# Jsonaut — Deploy Runbook

Copy-paste steps to get from local code to a live URL earning money. Each block says whether it needs an account/credentials.

Prereqs: Node 20+, this repo, `npm install` already run, `npm test` green.

---

## Step 1 — Cloudflare account + login  *(needs your account)*

Create a free account at cloudflare.com, then:

```bash
npx wrangler login          # opens a browser to authorize
```

## Step 2 — Create the KV namespace (rate limits + credit balances)

```bash
npx wrangler kv namespace create KV
```

Copy the printed `id` into `wrangler.toml` under a `[[kv_namespaces]]` block:

```toml
[[kv_namespaces]]
binding = "KV"
id = "PASTE_THE_ID_HERE"
```

## Step 3 — First deploy (free tier works with no secrets yet)

```bash
npx wrangler deploy
```

This gives you a live `https://jsonaut.<your-subdomain>.workers.dev`. The **free deterministic repair + validation tier is fully working at this point** — visit the URL to see the demo page. Paid features stay dormant until you add the secrets below.

## Step 4 — Turn on the paid LLM tier  *(needs a free OpenRouter account)*

Create a free account at openrouter.ai → **Keys** → create a key (starts `sk-or-...`). The default model is a free one, so no credit card is needed to start. Then:

```bash
npx wrangler secret put OPENROUTER_API_KEY
# optional: pick a specific free model
npx wrangler secret put OPENROUTER_MODEL   # e.g. meta-llama/llama-3.3-70b-instruct:free
```

Now LLM-fallback repair works — but calls to it return HTTP 402 until the x402 payment rail is configured (Step 5).

> **Free-tier caveat:** OpenRouter's free models are rate-limited (a capped number of requests/day) and can change or go offline. Great for launch and validation; before real traffic, switch `OPENROUTER_MODEL` to a cheap paid model (fractions of a cent per call) for reliability. Your $0.01 x402 price still covers it with margin.

## Step 5 — x402 agent-payment rail (the only paid rail + your Bazaar listing)  *(needs a Base wallet)*

1. Create/obtain a wallet address on Base to receive USDC.
2. Set the vars in `wrangler.toml`:
   ```toml
   [vars]
   FREE_DAILY_LIMIT = "100"
   PRICE_USD = "0.01"
   X402_NETWORK = "base"
   X402_PAY_TO = "0xYOUR_BASE_WALLET"
   FACILITATOR_URL = "https://<cdp-facilitator-url>"   # from Coinbase CDP docs
   ```
3. Redeploy. Now unpaid LLM-tier calls return a proper x402 `accepts` body, and paying + retrying with `X-PAYMENT` works.
4. **This is also your x402 Bazaar listing:** there's no form — make one real paid call against your own endpoint; the facilitator indexes you when that payment settles.

## Step 6 — Custom domain (optional)  *(needs a domain)*

Add your domain to Cloudflare, then in `wrangler.toml`:
```toml
routes = [{ pattern = "api.yourdomain.com", custom_domain = true }]
```
Redeploy.

---

## Post-deploy smoke test

```bash
URL=https://YOUR-WORKER-URL
curl -s $URL/healthz
curl -s -X POST $URL/v1/repair -H "content-type: application/json" \
  -d '{"input":"{'"'"'a'"'"': 1,}"}'
curl -s -X POST $URL/mcp -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Rollback

`npx wrangler deployments list` then `npx wrangler rollback [id]`. Secrets and KV persist across deploys.

## What's live at each step

| After step | Working |
|---|---|
| 3 | Free repair/validate + MCP + demo page (no revenue yet) |
| 4 | LLM tier exists but returns 402 until the x402 rail is set |
| 5 | **Agents can pay per-call via x402 → first revenue + you're in the x402 Bazaar** |
