import type { KVLike } from "./types.js";

/**
 * Best-effort usage counters, stored as a single JSON doc in KV.
 *
 * Design notes:
 *  - One read + one write per recorded event (read-modify-write). This is fine
 *    for low/moderate traffic. KV has no atomic increment, so under heavy
 *    concurrency some increments can be lost — acceptable for a usage gauge.
 *    Above a few hundred writes/day, migrate to Workers Analytics Engine.
 *  - recordEvent NEVER throws; metrics must never break an actual API request.
 */

const STATS_KEY = "stats:v1";
const MAX_DAYS = 30;

export interface Stats {
  totals: Record<string, number>;
  days: Record<string, Record<string, number>>;
  since?: string;
  updatedAt?: string;
}

function empty(): Stats {
  return { totals: {}, days: {}, since: new Date().toISOString() };
}

export async function readStats(kv: KVLike): Promise<Stats> {
  try {
    const raw = await kv.get(STATS_KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw) as Stats;
    return { totals: s.totals ?? {}, days: s.days ?? {}, since: s.since, updatedAt: s.updatedAt };
  } catch {
    return empty();
  }
}

/**
 * Increment the named counters (and optional numeric amounts, e.g. revenue) for
 * both all-time totals and today's bucket. Fire-and-forget; safe under waitUntil.
 */
export async function recordEvent(
  kv: KVLike,
  fields: string[],
  amounts?: Record<string, number>
): Promise<void> {
  try {
    const s = await readStats(kv);
    const day = new Date().toISOString().slice(0, 10);
    s.days[day] = s.days[day] ?? {};

    for (const f of fields) {
      s.totals[f] = (s.totals[f] ?? 0) + 1;
      s.days[day][f] = (s.days[day][f] ?? 0) + 1;
    }
    if (amounts) {
      for (const [k, v] of Object.entries(amounts)) {
        s.totals[k] = (s.totals[k] ?? 0) + v;
        s.days[day][k] = (s.days[day][k] ?? 0) + v;
      }
    }

    // Keep only the most recent MAX_DAYS buckets.
    const keys = Object.keys(s.days).sort();
    while (keys.length > MAX_DAYS) delete s.days[keys.shift()!];

    s.updatedAt = new Date().toISOString();
    if (!s.since) s.since = s.updatedAt;
    await kv.put(STATS_KEY, JSON.stringify(s));
  } catch {
    // Metrics are best-effort and must never affect the request path.
  }
}
