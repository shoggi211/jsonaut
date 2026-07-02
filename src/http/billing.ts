import type { Env, KVLike } from "../core/types.js";

/**
 * PARKED — NOT WIRED INTO THE PRODUCT. Jsonaut is x402-only (see payment.ts).
 * This Stripe prepaid-credit implementation is kept here, fully working and
 * tested-in-isolation, in case a fiat rail is ever wanted again. It is not
 * imported by app.ts and has no routes. Safe to delete.
 *
 * Stripe-backed prepaid credit system. No Stripe SDK — raw fetch against the
 * REST API keeps this Cloudflare-Workers-compatible. Webhook signatures are
 * verified with Web Crypto (available in both Workers and Node 20+).
 *
 * Flow: POST /v1/checkout mints an API key + a Stripe Checkout Session whose
 * metadata carries that key. On checkout.session.completed, the webhook credits
 * KV at `credits:<key>`. The key is inert until the webhook fires.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export interface CreditPack {
  id: string;
  label: string;
  amountCents: number;
  credits: number;
}

/** Default packs; override with CREDIT_PACKS env (JSON) if desired. */
const DEFAULT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter — 200 LLM repairs", amountCents: 100, credits: 200 },
  { id: "dev", label: "Dev — 2,000 LLM repairs", amountCents: 900, credits: 2000 },
  { id: "scale", label: "Scale — 50,000 LLM repairs", amountCents: 15000, credits: 50000 },
];

export function getPacks(env: Env): CreditPack[] {
  if (typeof env.CREDIT_PACKS === "string") {
    try {
      const parsed = JSON.parse(env.CREDIT_PACKS);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through to defaults */
    }
  }
  return DEFAULT_PACKS;
}

function newApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `fj_live_${hex}`;
}

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export interface CheckoutOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

export async function createCheckout(env: Env, packId: string | undefined, origin: string): Promise<CheckoutOutcome> {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 501,
      body: { error: "billing is not configured on this server (missing STRIPE_SECRET_KEY)" },
    };
  }
  const packs = getPacks(env);
  const pack = packs.find((p) => p.id === packId) ?? packs.find((p) => p.id === "dev") ?? packs[0];
  const apiKey = newApiKey();

  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(pack.amountCents),
    "line_items[0][price_data][product_data][name]": `Jsonaut — ${pack.label}`,
    "metadata[api_key]": apiKey,
    "metadata[credits]": String(pack.credits),
    "metadata[pack]": pack.id,
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  };

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formEncode(params),
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    return { ok: false, status: 502, body: { error: `stripe error: ${data.error?.message ?? res.status}` } };
  }
  // The key is returned now but stays inert until the webhook credits it.
  return { ok: true, status: 200, body: { checkout_url: data.url, api_key: apiKey, pack: pack.id, credits: pack.credits } };
}

/** Constant-time-ish hex string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a Stripe webhook signature. Header format:
 *   Stripe-Signature: t=<ts>,v1=<hex sig>
 * signed_payload = `${t}.${rawBody}`, HMAC-SHA256 keyed by the endpoint secret.
 */
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Number.isFinite(toleranceSeconds) && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return timingSafeEqual(expected, v1);
}

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

export async function handleStripeWebhook(
  rawBody: string,
  sigHeader: string | null,
  env: Env,
  storage: KVLike
): Promise<WebhookOutcome> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return { status: 501, body: { error: "webhook not configured (missing STRIPE_WEBHOOK_SECRET)" } };
  }
  if (!sigHeader || !(await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET))) {
    return { status: 400, body: { error: "invalid or missing Stripe-Signature" } };
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, any> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "unparseable webhook body" } };
  }

  if (event.type !== "checkout.session.completed") {
    return { status: 200, body: { received: true, ignored: event.type } };
  }

  const session = event.data?.object ?? {};
  if (session.payment_status && session.payment_status !== "paid") {
    return { status: 200, body: { received: true, unpaid: true } };
  }

  // Idempotency: Stripe retries webhooks; credit each session at most once.
  const guardKey = `stripe_evt:${session.id ?? event.id}`;
  if (await storage.get(guardKey)) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  const apiKey = session.metadata?.api_key;
  const credits = Number(session.metadata?.credits ?? "0");
  if (!apiKey || !(credits > 0)) {
    return { status: 200, body: { received: true, warning: "no api_key/credits in metadata" } };
  }

  const creditKey = `credits:${apiKey}`;
  const existing = Number((await storage.get(creditKey)) ?? "0");
  await storage.put(creditKey, String(existing + credits));
  await storage.put(guardKey, "1", { expirationTtl: 60 * 60 * 24 * 30 });

  return { status: 200, body: { received: true, credited: credits, key_balance: existing + credits } };
}

export async function getCreditBalance(storage: KVLike, apiKey: string): Promise<number> {
  return Number((await storage.get(`credits:${apiKey}`)) ?? "0");
}

/** Retrieve a completed checkout session to show the key + balance on the success page. */
export async function lookupCheckoutSession(
  env: Env,
  sessionId: string,
  storage: KVLike
): Promise<{ ok: boolean; apiKey?: string; balance?: number; error?: string }> {
  if (!env.STRIPE_SECRET_KEY) return { ok: false, error: "billing not configured" };
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) return { ok: false, error: `stripe lookup failed (${res.status})` };
  const data = (await res.json()) as { metadata?: Record<string, string>; payment_status?: string };
  const apiKey = data.metadata?.api_key;
  if (!apiKey) return { ok: false, error: "session has no api_key" };
  const balance = await getCreditBalance(storage, apiKey);
  return { ok: true, apiKey, balance };
}
