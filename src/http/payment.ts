import { generateCdpJwt } from "./cdp.js";
import { sha256Hex } from "../core/security.js";
import type { Env, KVLike } from "../core/types.js";

// USDC contract addresses per x402-supported network.
const USDC: Record<string, string> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export interface PaymentAuth {
  authorized: boolean;
  via: "x402" | "dev" | null;
  /** Called only after a successful paid operation — failed repairs are never charged. */
  chargeOnSuccess: () => Promise<void>;
  /** Called when the paid operation failed: releases the replay reservation so the
   *  caller can retry with the same (uncharged) payment. */
  releaseOnFailure?: () => Promise<void>;
  /** Populated when authorized=false: the HTTP 402 body to return. */
  paymentRequired?: { status: number; body: Record<string, unknown> };
}

function priceAtomic(env: Env): string {
  const usd = Number(env.PRICE_USD) > 0 ? Number(env.PRICE_USD) : 0.01;
  return String(Math.round(usd * 1_000_000)); // USDC has 6 decimals
}

function x402Requirements(env: Env, resource: string) {
  const network = env.X402_NETWORK || "base";
  return {
    scheme: "exact",
    network,
    maxAmountRequired: priceAtomic(env),
    resource,
    description: "LLM-fallback JSON repair (charged only on success)",
    mimeType: "application/json",
    payTo: env.X402_PAY_TO,
    maxTimeoutSeconds: 60,
    asset: USDC[network] ?? USDC.base,
    extra: { name: "USD Coin", version: "2" },
  };
}

/** The X-PAYMENT header is base64-encoded JSON of the payment payload. */
function decodePaymentHeader(header: string): Record<string, unknown> | null {
  try {
    const bin = atob(header.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Call the x402 facilitator's /verify or /settle endpoint. When CDP credentials
 * are present (mainnet), signs an EdDSA Bearer JWT; otherwise sends the request
 * unauthenticated (works with the free base-sepolia facilitator).
 */
async function facilitatorCall(
  env: Env,
  endpoint: "verify" | "settle",
  paymentPayload: Record<string, unknown>,
  requirements: Record<string, unknown>
): Promise<boolean> {
  const base = (env.FACILITATOR_URL ?? "").replace(/\/$/, "");
  const url = `${base}/${endpoint}`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET) {
    try {
      const u = new URL(url);
      const jwt = await generateCdpJwt(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET, "POST", u.host, u.pathname);
      headers["authorization"] = `Bearer ${jwt}`;
    } catch {
      // If JWT signing fails, the request proceeds unauthenticated and CDP will reject it.
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements: requirements }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { isValid?: boolean; valid?: boolean; success?: boolean };
    return endpoint === "verify" ? data.isValid === true || data.valid === true : data.success === true;
  } catch {
    return false;
  }
}

/**
 * Authorize a paid (LLM-fallback) call via x402 — the sole payment rail.
 *   1. DEV_ALLOW_FREE_LLM=true bypasses payment (local development only).
 *   2. An X-PAYMENT header is verified via the facilitator; settlement happens
 *      only after a successful repair (see chargeOnSuccess).
 * Otherwise returns a 402 advertising the x402 payment requirement.
 */
export async function authorizePaidCall(
  headers: Headers,
  env: Env,
  storage: KVLike,
  resourceUrl: string
): Promise<PaymentAuth> {
  if (env.DEV_ALLOW_FREE_LLM === "true") {
    return { authorized: true, via: "dev", chargeOnSuccess: async () => {} };
  }

  // No wallet configured — the paid tier is effectively closed.
  if (!env.X402_PAY_TO) {
    return {
      authorized: false,
      via: null,
      chargeOnSuccess: async () => {},
      paymentRequired: {
        status: 402,
        body: {
          error: "LLM-fallback repair is a paid feature and no x402 payment rail is configured on this server",
          accepts: [],
        },
      },
    };
  }

  const requirements = x402Requirements(env, resourceUrl);
  const paymentHeader = headers.get("x-payment");
  const paymentPayload = paymentHeader ? decodePaymentHeader(paymentHeader) : null;

  if (paymentPayload && paymentHeader && env.FACILITATOR_URL) {
    const verified = await facilitatorCall(env, "verify", paymentPayload, requirements);
    if (verified) {
      // Replay protection: `verify` does not consume the authorization and the
      // paid work runs before `settle`, so a single valid X-PAYMENT could be
      // reused across concurrent calls. Reserve a per-authorization key so the
      // same payment can't be spent twice. (KV read-modify-write is not fully
      // atomic; a Durable Object would close the residual concurrent window.)
      const dedupeKey = `pay:${await sha256Hex(paymentHeader)}`;
      if (await storage.get(dedupeKey)) {
        return {
          authorized: false,
          via: null,
          chargeOnSuccess: async () => {},
          paymentRequired: {
            status: 402,
            body: {
              x402Version: 1,
              error: "this payment authorization was already used; create a fresh payment",
              accepts: [requirements],
            },
          },
        };
      }
      await storage.put(dedupeKey, "1", { expirationTtl: 900 });

      return {
        authorized: true,
        via: "x402",
        chargeOnSuccess: async () => {
          await facilitatorCall(env, "settle", paymentPayload, requirements);
        },
        releaseOnFailure: async () => {
          try {
            await storage.delete(dedupeKey);
          } catch {
            /* best-effort */
          }
        },
      };
    }
  }

  return {
    authorized: false,
    via: null,
    chargeOnSuccess: async () => {},
    paymentRequired: {
      status: 402,
      body: {
        x402Version: 1,
        error: paymentHeader ? "payment verification failed" : "X-PAYMENT header is required for LLM-fallback repair",
        accepts: [requirements],
      },
    },
  };
}
