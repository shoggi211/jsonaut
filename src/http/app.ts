import { Hono } from "hono";
import { cors } from "hono/cors";
import { repairPipeline, validateOnly } from "../core/pipeline.js";
import { llmRepair, llmExtract } from "../core/llm.js";
import { inferSchema } from "../core/schema-infer.js";
import { extractDeterministic } from "../core/extract.js";
import { getStorage } from "../core/storage.js";
import { checkRateLimit } from "./ratelimit.js";
import { authorizePaidCall } from "./payment.js";
import { handleMcpRequest } from "../mcp/server.js";
import { recordEvent, readStats } from "../core/metrics.js";
import { renderDashboard } from "./dashboard.js";
import { DEMO_HTML } from "./demo.js";
import { LLMS_TXT, OPENAPI_YAML, AI_PLUGIN } from "./staticContent.js";
import { MAX_BODY_BYTES, MAX_INPUT_CHARS, MAX_SCHEMA_CHARS, constantTimeEqual } from "../core/security.js";
import type { Env, KVLike } from "../core/types.js";

/** Reject obviously-oversized bodies before we parse/process them (413). Returns null when ok. */
function oversize(headers: Headers): number {
  const len = Number(headers.get("content-length") ?? 0);
  return Number.isFinite(len) ? len : 0;
}

function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

function priceMicros(env: Env): number {
  const usd = Number(env.PRICE_USD) > 0 ? Number(env.PRICE_USD) : 0.01;
  return Math.round(usd * 1_000_000);
}

/** Fire-and-forget usage counter; runs past the response via waitUntil when available. */
function track(c: { env: Env; executionCtx?: { waitUntil(p: Promise<unknown>): void } }, storage: KVLike, fields: string[], amounts?: Record<string, number>) {
  const p = recordEvent(storage, fields, amounts);
  try {
    c.executionCtx?.waitUntil(p);
  } catch {
    /* no execution context (e.g. tests) — the promise still runs */
  }
}

/** Gate the stats endpoints behind ADMIN_TOKEN (query ?token= or x-admin-token header). */
function statsAuthed(c: { env: Env; req: { query(k: string): string | undefined; header(k: string): string | undefined } }): boolean {
  const token = c.env.ADMIN_TOKEN?.trim();
  if (!token) return false;
  const given = (c.req.query("token") ?? c.req.header("x-admin-token"))?.trim();
  return !!given && constantTimeEqual(given, token);
}

export const app = new Hono<{ Bindings: Env }>();

// Never leak framework internals; always answer with JSON.
app.onError((err, c) => {
  console.error("unhandled error:", err instanceof Error ? err.message : String(err));
  return c.json({ error: "internal error" }, 500);
});
app.notFound((c) => c.json({ error: "not found" }, 404));

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-PAYMENT", "Mcp-Protocol-Version"] }));

// Baseline hardening headers on every response.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "no-referrer");
});

app.get("/", (c) => c.html(DEMO_HTML));
app.get("/llms.txt", (c) => c.text(LLMS_TXT));
app.get("/openapi.yaml", (c) => c.text(OPENAPI_YAML, 200, { "content-type": "application/yaml" }));
app.get("/.well-known/ai-plugin.json", (c) => c.json(AI_PLUGIN));
app.get("/healthz", (c) => c.json({ ok: true, service: "jsonaut", version: "0.2.0" }));

app.post("/v1/repair", async (c) => {
  const env = c.env;
  const storage = getStorage(env);

  if (oversize(c.req.raw.headers) > MAX_BODY_BYTES) {
    return c.json({ error: `request body too large (max ${MAX_BODY_BYTES} bytes)` }, 413);
  }
  let body: { input?: unknown; schema?: unknown; allow_llm_fallback?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, schema?, allow_llm_fallback?}" }, 400);
  }
  if (typeof body.input !== "string") {
    return c.json({ error: "input must be a string containing the (possibly broken) JSON" }, 400);
  }
  if (body.input.length > MAX_INPUT_CHARS) {
    return c.json({ error: `input too large (max ${MAX_INPUT_CHARS} characters)` }, 413);
  }
  const schema =
    body.schema && typeof body.schema === "object" && !Array.isArray(body.schema)
      ? (body.schema as Record<string, unknown>)
      : undefined;
  if (schema && JSON.stringify(schema).length > MAX_SCHEMA_CHARS) {
    return c.json({ error: `schema too large (max ${MAX_SCHEMA_CHARS} characters)` }, 413);
  }
  const allowLlm = body.allow_llm_fallback !== false; // default true per spec

  const rate = await checkRateLimit(storage, env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    track(c, storage, ["requests", "rate_limited"]);
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded; retry tomorrow or pay via x402` }, 429);
  }

  const result = repairPipeline(body.input, schema);
  if (result.valid || !result.llm_required) {
    track(c, storage, ["requests", result.valid ? (result.method === "direct" ? "direct" : "deterministic_success") : "deterministic_failed"]);
    return c.json(result);
  }

  if (!allowLlm) {
    track(c, storage, ["requests", "llm_declined"]);
    return c.json({ ...result, hint: "deterministic repair failed; retry with allow_llm_fallback=true (paid via x402) to attempt LLM repair" });
  }

  const auth = await authorizePaidCall(c.req.raw.headers, env, storage, c.req.url);
  if (!auth.authorized) {
    track(c, storage, ["requests", "payment_required"]);
    return c.json(auth.paymentRequired!.body, auth.paymentRequired!.status as 402);
  }

  const llm = await llmRepair(body.input, schema, env);
  if (!llm.ok) {
    // Failed paid attempts are never charged — release the replay reservation so the caller can retry.
    await auth.releaseOnFailure?.();
    track(c, storage, ["requests", "llm_failed"]);
    return c.json({ valid: false, repaired: null, method: "failed", changes: result.changes, errors: [llm.error] });
  }
  await auth.chargeOnSuccess();
  track(c, storage, ["requests", "llm_paid"], { revenue_micros: priceMicros(env) });
  return c.json({
    valid: true,
    repaired: llm.value,
    method: "llm-repair",
    changes: [...result.changes, ...(llm.changes ?? [])],
    paid_via: auth.via,
  });
});

app.post("/v1/validate", async (c) => {
  if (oversize(c.req.raw.headers) > MAX_BODY_BYTES) {
    return c.json({ error: `request body too large (max ${MAX_BODY_BYTES} bytes)` }, 413);
  }
  let body: { input?: unknown; schema?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, schema}" }, 400);
  }
  if (typeof body.input !== "string" || !body.schema || typeof body.schema !== "object" || Array.isArray(body.schema)) {
    return c.json({ error: "requires input (string) and schema (object)" }, 400);
  }
  if (body.input.length > MAX_INPUT_CHARS || JSON.stringify(body.schema).length > MAX_SCHEMA_CHARS) {
    return c.json({ error: `input or schema too large (max ${MAX_INPUT_CHARS}/${MAX_SCHEMA_CHARS} characters)` }, 413);
  }
  const storage = getStorage(c.env);
  const rate = await checkRateLimit(storage, c.env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    track(c, storage, ["validate_requests", "rate_limited"]);
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded` }, 429);
  }
  track(c, storage, ["validate_requests"]);
  const result = validateOnly(body.input, body.schema as Record<string, unknown>);
  return c.json({ valid: result.valid, errors: result.errors });
});

// Infer a JSON Schema from an example value. Free, deterministic (no LLM).
app.post("/v1/infer-schema", async (c) => {
  if (oversize(c.req.raw.headers) > MAX_BODY_BYTES) {
    return c.json({ error: `request body too large (max ${MAX_BODY_BYTES} bytes)` }, 413);
  }
  let body: { input?: unknown; as_samples?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, as_samples?}" }, 400);
  }
  if (typeof body.input !== "string") {
    return c.json({ error: "input must be a JSON string to infer a schema from" }, 400);
  }
  if (body.input.length > MAX_INPUT_CHARS) {
    return c.json({ error: `input too large (max ${MAX_INPUT_CHARS} characters)` }, 413);
  }
  const storage = getStorage(c.env);
  const rate = await checkRateLimit(storage, c.env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    track(c, storage, ["infer_schema_requests", "rate_limited"]);
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded` }, 429);
  }
  track(c, storage, ["infer_schema_requests"]);
  const parsed = repairPipeline(body.input);
  if (!parsed.valid) {
    return c.json({ ok: false, error: "could not parse input as JSON", details: parsed.errors }, 422);
  }
  return c.json({ ok: true, schema: inferSchema(parsed.repaired, body.as_samples === true) });
});

// Extract JSON embedded in arbitrary text (LLM prose, logs, emails). Deterministic
// extraction is free; if none is found and a schema is given, a paid LLM extraction
// can run (x402, charged only on success) — same payment flow as /v1/repair.
app.post("/v1/extract", async (c) => {
  const env = c.env;
  const storage = getStorage(env);
  if (oversize(c.req.raw.headers) > MAX_BODY_BYTES) {
    return c.json({ error: `request body too large (max ${MAX_BODY_BYTES} bytes)` }, 413);
  }
  let body: { input?: unknown; schema?: unknown; allow_llm_fallback?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, schema?, allow_llm_fallback?}" }, 400);
  }
  if (typeof body.input !== "string") {
    return c.json({ error: "input must be the text to extract JSON from" }, 400);
  }
  if (body.input.length > MAX_INPUT_CHARS) {
    return c.json({ error: `input too large (max ${MAX_INPUT_CHARS} characters)` }, 413);
  }
  const schema =
    body.schema && typeof body.schema === "object" && !Array.isArray(body.schema)
      ? (body.schema as Record<string, unknown>)
      : undefined;
  if (schema && JSON.stringify(schema).length > MAX_SCHEMA_CHARS) {
    return c.json({ error: `schema too large (max ${MAX_SCHEMA_CHARS} characters)` }, 413);
  }
  const allowLlm = body.allow_llm_fallback !== false;

  const rate = await checkRateLimit(storage, env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    track(c, storage, ["extract_requests", "rate_limited"]);
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded; retry tomorrow or pay via x402` }, 429);
  }

  const result = extractDeterministic(body.input, schema);
  if (result.valid || !result.llm_required) {
    track(c, storage, ["extract_requests", result.valid ? "extract_deterministic" : "extract_failed"]);
    return c.json(result);
  }
  if (!allowLlm) {
    track(c, storage, ["extract_requests", "llm_declined"]);
    return c.json({ ...result, hint: "no JSON found deterministically; retry with allow_llm_fallback=true (paid via x402) to extract with an LLM" });
  }
  const auth = await authorizePaidCall(c.req.raw.headers, env, storage, c.req.url);
  if (!auth.authorized) {
    track(c, storage, ["extract_requests", "payment_required"]);
    return c.json(auth.paymentRequired!.body, auth.paymentRequired!.status as 402);
  }
  const llm = await llmExtract(body.input, schema, env);
  if (!llm.ok) {
    await auth.releaseOnFailure?.();
    track(c, storage, ["extract_requests", "llm_failed"]);
    return c.json({ valid: false, repaired: null, method: "failed", changes: result.changes, errors: [llm.error] });
  }
  await auth.chargeOnSuccess();
  track(c, storage, ["extract_requests", "llm_paid"], { revenue_micros: priceMicros(env) });
  return c.json({ valid: true, repaired: llm.value, method: "llm-extract", changes: llm.changes ?? [], paid_via: auth.via });
});

// Private usage metrics (gated by ADMIN_TOKEN). JSON for scripting, HTML for humans.
app.get("/stats", async (c) => {
  if (!statsAuthed(c)) return c.json({ error: "unauthorized" }, 401);
  return c.json(await readStats(getStorage(c.env)));
});

app.get("/dashboard", async (c) => {
  if (!statsAuthed(c)) return c.text("unauthorized — append ?token=YOUR_ADMIN_TOKEN", 401);
  // The page has no scripts and only inline styles; lock it down hard.
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  return c.html(renderDashboard(await readStats(getStorage(c.env))));
});

app.post("/mcp", async (c) => {
  const env = c.env;
  if (oversize(c.req.raw.headers) > MAX_BODY_BYTES) {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "request too large" } }, 413);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);
  }
  const { status, body: responseBody } = await handleMcpRequest(body, {
    env,
    storage: getStorage(env),
    headers: c.req.raw.headers,
    resourceUrl: c.req.url,
  });
  if (responseBody === null) {
    return c.body(null, status as 202);
  }
  return c.json(responseBody as Record<string, unknown>, status as 200);
});

// Streamable HTTP transport: we run stateless, so there is no SSE stream to open.
app.get("/mcp", (c) => c.json({ error: "this MCP server is stateless; use POST" }, 405));
