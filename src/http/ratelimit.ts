import { sha256Hex } from "../core/security.js";
import type { Env, KVLike } from "../core/types.js";

const DEFAULT_DAILY_LIMIT = 100;

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/** Simple daily counter per client IP. Approximate under concurrency, which is fine for abuse control. */
export async function checkRateLimit(storage: KVLike, env: Env, ip: string): Promise<RateLimitStatus> {
  const limit = Number(env.FREE_DAILY_LIMIT) > 0 ? Number(env.FREE_DAILY_LIMIT) : DEFAULT_DAILY_LIMIT;
  const day = new Date().toISOString().slice(0, 10);
  // Store a truncated hash of the IP rather than the raw address (avoids plaintext PII in KV).
  const key = `rl:${(await sha256Hex(ip)).slice(0, 24)}:${day}`;
  const current = Number((await storage.get(key)) ?? "0");
  if (current >= limit) {
    return { allowed: false, remaining: 0, limit };
  }
  await storage.put(key, String(current + 1), { expirationTtl: 86400 });
  return { allowed: true, remaining: limit - current - 1, limit };
}
