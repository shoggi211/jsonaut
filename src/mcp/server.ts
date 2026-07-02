import { repairPipeline, validateOnly } from "../core/pipeline.js";
import { llmRepair } from "../core/llm.js";
import { authorizePaidCall } from "../http/payment.js";
import { MAX_INPUT_CHARS, MAX_SCHEMA_CHARS } from "../core/security.js";
import type { Env, KVLike } from "../core/types.js";

/** Reject oversized tool arguments (mirrors the HTTP API limits). Returns an error message or null. */
function argTooLarge(input: unknown, schema: unknown): string | null {
  if (typeof input === "string" && input.length > MAX_INPUT_CHARS) return `input too large (max ${MAX_INPUT_CHARS} characters)`;
  if (schema && typeof schema === "object" && JSON.stringify(schema).length > MAX_SCHEMA_CHARS) return `schema too large (max ${MAX_SCHEMA_CHARS} characters)`;
  return null;
}

/**
 * Minimal stateless MCP server over Streamable HTTP transport.
 * Implements only what tool-calling clients need: initialize,
 * notifications/initialized, ping, tools/list, tools/call.
 * No sessions, no SSE stream — every POST is self-contained.
 */

const SERVER_INFO = { name: "jsonaut", version: "0.1.0" };
const KNOWN_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "repair_json",
    description:
      "Repair malformed JSON (trailing commas, single quotes, truncation, markdown fences, comments, python literals) and optionally validate/coerce it against a JSON Schema. Deterministic repair is free. If it fails and allow_llm_fallback is true, a paid LLM repair is attempted (requires x402 payment; charged only on success).",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "The possibly-malformed JSON text" },
        schema: { type: "object", description: "Optional JSON Schema the output must conform to" },
        allow_llm_fallback: { type: "boolean", default: false, description: "Permit the paid LLM repair tier" },
      },
      required: ["input"],
    },
  },
  {
    name: "validate_json",
    description: "Validate a JSON string against a JSON Schema. Free. Returns validity and a list of violations.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "The JSON text to validate" },
        schema: { type: "object", description: "The JSON Schema to validate against" },
      },
      required: ["input", "schema"],
    },
  },
];

interface McpContext {
  env: Env;
  storage: KVLike;
  headers: Headers;
  resourceUrl: string;
}

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolText(payload: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError };
}

async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext) {
  const tooLarge = argTooLarge(args.input, args.schema);
  if (tooLarge) return toolText({ error: tooLarge }, true);

  if (name === "validate_json") {
    if (typeof args.input !== "string" || typeof args.schema !== "object" || args.schema === null) {
      return toolText({ error: "validate_json requires: input (string), schema (object)" }, true);
    }
    const result = validateOnly(args.input, args.schema as Record<string, unknown>);
    return toolText({ valid: result.valid, errors: result.errors });
  }

  if (name === "repair_json") {
    if (typeof args.input !== "string") {
      return toolText({ error: "repair_json requires: input (string)" }, true);
    }
    const schema = args.schema && typeof args.schema === "object" ? (args.schema as Record<string, unknown>) : undefined;
    const result = repairPipeline(args.input, schema);

    if (result.valid || !result.llm_required || args.allow_llm_fallback !== true) {
      return toolText(result, !result.valid && !result.llm_required);
    }

    // Paid LLM path — same authorization as the HTTP API.
    const auth = await authorizePaidCall(ctx.headers, ctx.env, ctx.storage, ctx.resourceUrl);
    if (!auth.authorized) {
      return toolText(
        {
          ...result,
          payment_required: auth.paymentRequired?.body,
          hint: "Deterministic repair failed. LLM repair is available but needs payment: pay via x402 and retry with the X-PAYMENT header.",
        },
        true
      );
    }
    const llm = await llmRepair(args.input, schema, ctx.env);
    if (!llm.ok) {
      await auth.releaseOnFailure?.();
      return toolText({ valid: false, repaired: null, method: "failed", changes: result.changes, errors: [llm.error] }, true);
    }
    await auth.chargeOnSuccess();
    return toolText({ valid: true, repaired: llm.value, method: "llm-repair", changes: [...result.changes, ...(llm.changes ?? [])] });
  }

  return toolText({ error: `unknown tool: ${name}` }, true);
}

export async function handleMcpRequest(body: unknown, ctx: McpContext): Promise<{ status: number; body: unknown | null }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: rpcError(null, -32700, "expected a single JSON-RPC request object") };
  }
  const req = body as { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return { status: 400, body: rpcError(req.id ?? null, -32600, "invalid JSON-RPC 2.0 request") };
  }
  const id = req.id ?? null;
  const params = req.params ?? {};

  switch (req.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = KNOWN_PROTOCOL_VERSIONS.includes(requested) ? requested : KNOWN_PROTOCOL_VERSIONS[0];
      return {
        status: 200,
        body: rpcResult(id, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions:
            "Jsonaut repairs malformed JSON. Use repair_json for broken output from tool calls or other agents; pass a JSON Schema to also enforce structure. Deterministic repair is free; set allow_llm_fallback=true only when you can pay via x402.",
        }),
      };
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return { status: 202, body: null };
    case "ping":
      return { status: 200, body: rpcResult(id, {}) };
    case "tools/list":
      return { status: 200, body: rpcResult(id, { tools: TOOLS }) };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args, ctx);
        return { status: 200, body: rpcResult(id, result) };
      } catch (e) {
        return { status: 200, body: rpcError(id, -32603, e instanceof Error ? e.message : String(e)) };
      }
    }
    default:
      return { status: 200, body: rpcError(id, -32601, `method not found: ${req.method}`) };
  }
}
