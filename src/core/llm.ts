import { jsonrepair } from "jsonrepair";
import { repairPipeline, stripCodeFences } from "./pipeline.js";
import type { Env } from "./types.js";

// OpenRouter exposes an OpenAI-compatible Chat Completions API.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free models are frequently rate-limited upstream (429) and availability
// shifts hour to hour, so we try several and fall back. Override the primary
// with OPENROUTER_MODEL. Free model IDs change over time — see
// https://openrouter.ai/models?max_price=0
const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

export interface LlmRepairOutcome {
  ok: boolean;
  value?: unknown;
  changes?: string[];
  error?: string;
  model?: string;
}

function modelList(env: Env): string[] {
  const primary = env.OPENROUTER_MODEL?.trim();
  const list = primary ? [primary, ...DEFAULT_MODELS] : [...DEFAULT_MODELS];
  return [...new Set(list)];
}

interface ModelCall {
  ok: boolean;
  text?: string;
  retryable: boolean;
  error?: string;
}

async function callModel(model: string, prompt: string, env: Env): Promise<ModelCall> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY?.trim()}`,
        // Optional but recommended by OpenRouter (used for their app rankings).
        "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://jsonaut.dev",
        "X-Title": env.OPENROUTER_APP_NAME || "Jsonaut",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [
          { role: "system", content: "You are a strict JSON repair function. You output only valid JSON and nothing else." },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, retryable: true, error: `request failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!res.ok) {
    const body = await res.text();
    // 429 (rate limit) and 5xx (provider hiccup) are worth trying another model.
    return { ok: false, retryable: res.status === 429 || res.status >= 500, error: `${res.status}: ${body.slice(0, 150)}` };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error) return { ok: false, retryable: true, error: data.error.message ?? "unknown provider error" };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) return { ok: false, retryable: true, error: "empty response" };
  return { ok: true, retryable: false, text };
}

/**
 * Paid tier: ask a small/free model (via OpenRouter) to reconstruct valid JSON,
 * trying a list of free models and falling back on rate limits, then run the
 * result back through deterministic validation so we never return
 * schema-invalid output from a paid call.
 */
export async function llmRepair(
  input: string,
  schema: Record<string, unknown> | undefined,
  env: Env
): Promise<LlmRepairOutcome> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, error: "LLM fallback is not configured on this server (missing OPENROUTER_API_KEY)" };
  }

  const schemaPart = schema
    ? `\nThe output MUST conform to this JSON Schema:\n${JSON.stringify(schema)}\n`
    : "";
  const prompt =
    `The following text is malformed or schema-invalid JSON produced by a program. ` +
    `Reconstruct the intended data and return ONLY the corrected JSON — no explanation, no markdown fences.${schemaPart}\n` +
    `Malformed input:\n${input}`;

  let lastError = "no model was attempted";

  for (const model of modelList(env)) {
    const call = await callModel(model, prompt, env);
    if (!call.ok) {
      lastError = `${model}: ${call.error}`;
      if (call.retryable) continue; // try the next free model
      break; // a non-retryable error (e.g. bad request) won't improve by switching
    }

    // Parse the model's output defensively, then re-validate against the schema.
    const { text: cleaned } = stripCodeFences(call.text ?? "");
    let candidate = cleaned;
    try {
      JSON.parse(candidate);
    } catch {
      try {
        candidate = jsonrepair(candidate);
      } catch {
        lastError = `${model}: produced unparseable output`;
        continue; // maybe another model does better
      }
    }

    const checked = repairPipeline(candidate, schema);
    if (checked.valid) {
      return { ok: true, value: checked.repaired, model, changes: ["reconstructed via LLM repair", ...checked.changes] };
    }
    lastError = `${model}: output failed schema validation: ${(checked.errors ?? []).join("; ")}`;
    // fall through to the next model
  }

  return { ok: false, error: `LLM repair failed. Last error — ${lastError}` };
}
