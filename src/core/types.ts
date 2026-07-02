export type RepairMethod = "direct" | "deterministic-repair" | "llm-repair" | "failed";

export interface RepairResult {
  valid: boolean;
  repaired: unknown;
  method: RepairMethod;
  changes: string[];
  errors?: string[];
  /** True when the deterministic pipeline could not produce valid output
   *  and an LLM-fallback attempt is the remaining option. */
  llm_required?: boolean;
}

export interface RepairRequest {
  input: string;
  schema?: Record<string, unknown>;
  allow_llm_fallback?: boolean;
}

/** Minimal KV interface satisfied by both Cloudflare KV and the in-memory dev store. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  KV?: KVLike;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME?: string;
  X402_PAY_TO?: string;
  X402_NETWORK?: string;
  FACILITATOR_URL?: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
  DEV_ALLOW_FREE_LLM?: string;
  FREE_DAILY_LIMIT?: string;
  PRICE_USD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CREDIT_PACKS?: string;
  [key: string]: unknown;
}
