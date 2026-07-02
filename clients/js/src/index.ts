import { jsonrepair } from "jsonrepair";

export interface RepairOptions {
  /** JSON Schema the output must satisfy. Enforcement runs server-side. */
  schema?: Record<string, unknown>;
  /** Allow calling the hosted API when local repair can't finish. Default true. */
  allowRemote?: boolean;
  /** Permit the paid LLM tier if deterministic repair fails. Default false. */
  allowLlmFallback?: boolean;
  /** Override the API base URL. */
  apiUrl?: string;
  /** Extra headers, e.g. { "X-PAYMENT": "..." } for the x402 paid tier. */
  headers?: Record<string, string>;
}

export type RepairMethod =
  | "direct"
  | "local-repair"
  | "deterministic-repair"
  | "llm-repair"
  | "failed";

export interface RepairResult {
  valid: boolean;
  repaired: unknown;
  method: RepairMethod;
  changes: string[];
  errors?: string[];
}

const DEFAULT_API = "https://jsonaut.jsonaut-shaurya.workers.dev";

/**
 * Repair possibly-malformed JSON.
 *
 * Fast path: with no schema, tries JSON.parse then jsonrepair fully offline —
 * zero network, zero cost. Falls back to the hosted API only when local repair
 * fails, or when a JSON Schema needs server-side validation/coercion, or when
 * you opt into the paid LLM tier.
 */
export async function repairJson(input: string, opts: RepairOptions = {}): Promise<RepairResult> {
  const {
    schema,
    allowRemote = true,
    allowLlmFallback = false,
    apiUrl = DEFAULT_API,
    headers = {},
  } = opts;

  // Local, offline fast path (only when we don't need schema enforcement).
  if (!schema) {
    try {
      return { valid: true, repaired: JSON.parse(input), method: "direct", changes: [] };
    } catch {
      /* not directly parseable — try local repair */
    }
    try {
      const repaired = JSON.parse(jsonrepair(input));
      return { valid: true, repaired, method: "local-repair", changes: ["repaired locally (jsonrepair)"] };
    } catch {
      /* local repair failed — escalate to the API if allowed */
    }
    if (!allowRemote) {
      return { valid: false, repaired: null, method: "failed", changes: [], errors: ["local repair failed and allowRemote=false"] };
    }
  } else if (!allowRemote) {
    return { valid: false, repaired: null, method: "failed", changes: [], errors: ["schema enforcement needs the API but allowRemote=false"] };
  }

  const res = await fetch(`${apiUrl}/v1/repair`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ input, schema, allow_llm_fallback: allowLlmFallback }),
  });

  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    return {
      valid: false,
      repaired: null,
      method: "failed",
      changes: [],
      errors: ["payment required for the LLM tier (x402)", JSON.stringify(body)],
    };
  }

  return (await res.json()) as RepairResult;
}
