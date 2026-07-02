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

async function facilitatorCall(
  env: Env,
  endpoint: "verify" | "settle",
  paymentHeader: string,
  requirements: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${env.FACILITATOR_URL}/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x402Version: 1, paymentHeader, paymentRequirements: requirements }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { isValid?: boolean; success?: boolean };
    return endpoint === "verify" ? data.isValid === true : data.success === true;
  } catch {
    return false;
  }
}

/**
 * Authorize a paid (LLM-fallback) call via x402 — the sole payment rail.
 *   1. DEV_ALLOW_FREE_LLM=true bypasses payment (local development only).
 *   2. An X-PAYMENT header is verified via the x402 facilitator; settlement
 *      happens only after a successful repair (see chargeOnSuccess).
 * Otherwise returns a 402 advertising the x402 payment requirement.
 */
export async function authorizePaidCall(
  headers: Headers,
  env: Env,
  _storage: KVLike,
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
  if (paymentHeader && env.FACILITATOR_URL) {
    const verified = await facilitatorCall(env, "verify", paymentHeader, requirements);
    if (verified) {
      return {
        authorized: true,
        via: "x402",
        chargeOnSuccess: async () => {
          await facilitatorCall(env, "settle", paymentHeader, requirements);
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
