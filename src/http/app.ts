import { Hono } from "hono";
import { cors } from "hono/cors";
import { repairPipeline, validateOnly } from "../core/pipeline.js";
import { llmRepair } from "../core/llm.js";
import { getStorage } from "../core/storage.js";
import { checkRateLimit } from "./ratelimit.js";
import { authorizePaidCall } from "./payment.js";
import { handleMcpRequest } from "../mcp/server.js";
import { DEMO_HTML } from "./demo.js";
import { LLMS_TXT, OPENAPI_YAML } from "./staticContent.js";
import type { Env } from "../core/types.js";

function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

export const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-PAYMENT", "Mcp-Protocol-Version"] }));

app.get("/", (c) => c.html(DEMO_HTML));
app.get("/llms.txt", (c) => c.text(LLMS_TXT));
app.get("/openapi.yaml", (c) => c.text(OPENAPI_YAML, 200, { "content-type": "application/yaml" }));
app.get("/healthz", (c) => c.json({ ok: true, service: "jsonaut", version: "0.1.0" }));

app.post("/v1/repair", async (c) => {
  const env = c.env;
  const storage = getStorage(env);

  let body: { input?: unknown; schema?: unknown; allow_llm_fallback?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, schema?, allow_llm_fallback?}" }, 400);
  }
  if (typeof body.input !== "string") {
    return c.json({ error: "input must be a string containing the (possibly broken) JSON" }, 400);
  }
  const schema =
    body.schema && typeof body.schema === "object" && !Array.isArray(body.schema)
      ? (body.schema as Record<string, unknown>)
      : undefined;
  const allowLlm = body.allow_llm_fallback !== false; // default true per spec

  const rate = await checkRateLimit(storage, env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded; retry tomorrow or pay via x402` }, 429);
  }

  const result = repairPipeline(body.input, schema);
  if (result.valid || !result.llm_required) {
    return c.json(result);
  }

  if (!allowLlm) {
    return c.json({ ...result, hint: "deterministic repair failed; retry with allow_llm_fallback=true (paid via x402) to attempt LLM repair" });
  }

  const auth = await authorizePaidCall(c.req.raw.headers, env, storage, c.req.url);
  if (!auth.authorized) {
    return c.json(auth.paymentRequired!.body, auth.paymentRequired!.status as 402);
  }

  const llm = await llmRepair(body.input, schema, env);
  if (!llm.ok) {
    // Failed paid attempts are never charged.
    return c.json({ valid: false, repaired: null, method: "failed", changes: result.changes, errors: [llm.error] });
  }
  await auth.chargeOnSuccess();
  return c.json({
    valid: true,
    repaired: llm.value,
    method: "llm-repair",
    changes: [...result.changes, ...(llm.changes ?? [])],
    paid_via: auth.via,
  });
});

app.post("/v1/validate", async (c) => {
  let body: { input?: unknown; schema?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be JSON: {input, schema}" }, 400);
  }
  if (typeof body.input !== "string" || !body.schema || typeof body.schema !== "object" || Array.isArray(body.schema)) {
    return c.json({ error: "requires input (string) and schema (object)" }, 400);
  }
  const rate = await checkRateLimit(getStorage(c.env), c.env, clientIp(c.req.raw.headers));
  if (!rate.allowed) {
    return c.json({ error: `free-tier daily limit (${rate.limit}) exceeded` }, 429);
  }
  const result = validateOnly(body.input, body.schema as Record<string, unknown>);
  return c.json({ valid: result.valid, errors: result.errors });
});

app.post("/mcp", async (c) => {
  const env = c.env;
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
