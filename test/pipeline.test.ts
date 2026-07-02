import { describe, it, expect } from "vitest";
import { repairPipeline, validateOnly } from "../src/core/pipeline.js";
import { coerceToSchema } from "../src/core/coerce.js";
import { app } from "../src/http/app.js";
import type { Env } from "../src/core/types.js";

describe("repairPipeline — deterministic tier", () => {
  it("passes valid JSON through untouched (method: direct)", () => {
    const r = repairPipeline('{"a": 1, "b": [true, null]}');
    expect(r.valid).toBe(true);
    expect(r.method).toBe("direct");
    expect(r.repaired).toEqual({ a: 1, b: [true, null] });
    expect(r.changes).toEqual([]);
  });

  it("fixes trailing commas", () => {
    const r = repairPipeline('{"a": 1, "b": [1, 2,],}');
    expect(r.valid).toBe(true);
    expect(r.method).toBe("deterministic-repair");
    expect(r.repaired).toEqual({ a: 1, b: [1, 2] });
  });

  it("fixes single quotes", () => {
    const r = repairPipeline("{'name': 'alice', 'age': 30}");
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ name: "alice", age: 30 });
  });

  it("strips markdown code fences", () => {
    const r = repairPipeline('```json\n{"answer": 42}\n```');
    expect(r.valid).toBe(true);
    expect(r.method).toBe("deterministic-repair");
    expect(r.repaired).toEqual({ answer: 42 });
    expect(r.changes).toContain("stripped markdown code fences");
  });

  it("completes truncated output", () => {
    const r = repairPipeline('{"items": [{"id": 1}, {"id": 2');
    expect(r.valid).toBe(true);
    expect(r.method).toBe("deterministic-repair");
    expect((r.repaired as any).items[0]).toEqual({ id: 1 });
  });

  it("handles python literals (True/None)", () => {
    const r = repairPipeline("{\"ok\": True, \"value\": None}");
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ ok: true, value: null });
  });

  it("strips comments", () => {
    const r = repairPipeline('{"a": 1} // agent added this note');
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ a: 1 });
  });

  it("handles unescaped newlines inside strings", () => {
    const r = repairPipeline('{"text": "line one\nline two"}');
    expect(r.valid).toBe(true);
    expect((r.repaired as any).text).toContain("line one");
  });

  it("rejects empty input without flagging LLM", () => {
    const r = repairPipeline("   ");
    expect(r.valid).toBe(false);
    expect(r.llm_required).toBe(false);
  });

  it("flags hopeless input for the LLM tier", () => {
    const r = repairPipeline("the answer is: forty two (42)");
    expect(r.valid).toBe(false);
    expect(r.method).toBe("failed");
    expect(r.llm_required).toBe(true);
  });
});

describe("repairPipeline — schema validation & coercion", () => {
  const schema = {
    type: "object",
    properties: {
      count: { type: "number" },
      name: { type: "string" },
      active: { type: "boolean", default: true },
    },
    required: ["count", "name"],
    additionalProperties: false,
  };

  it("coerces string numbers and string booleans", () => {
    const r = repairPipeline('{"count": "42", "name": "x", "active": "true"}', schema);
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ count: 42, name: "x", active: true });
    expect(r.changes.some((c) => c.includes("coerced"))).toBe(true);
  });

  it("fills schema defaults for missing fields", () => {
    const r = repairPipeline('{"count": 1, "name": "y"}', schema);
    expect(r.valid).toBe(true);
    expect((r.repaired as any).active).toBe(true);
  });

  it("strips disallowed extra fields", () => {
    const r = repairPipeline('{"count": 1, "name": "z", "hallucinated": "field"}', schema);
    expect(r.valid).toBe(true);
    expect(r.repaired).not.toHaveProperty("hallucinated");
  });

  it("repairs syntax AND enforces schema in one pass", () => {
    const r = repairPipeline("{'count': '7', 'name': 'w',}", schema);
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ count: 7, name: "w", active: true });
  });

  it("flags schema-invalid results it cannot coerce for the LLM tier", () => {
    const r = repairPipeline('{"count": "not-a-number", "name": 5}', schema);
    expect(r.valid).toBe(false);
    expect(r.llm_required).toBe(true);
    expect(r.errors!.length).toBeGreaterThan(0);
  });
});

describe("validateOnly", () => {
  it("validates without repairing", () => {
    const good = validateOnly('{"a": 1}', { type: "object", properties: { a: { type: "number" } } });
    expect(good.valid).toBe(true);
    const bad = validateOnly('{"a": "str"}', { type: "object", properties: { a: { type: "number" } } });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});

describe("coerceToSchema", () => {
  it("coerces nested arrays of objects", () => {
    const schema = {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object", properties: { n: { type: "integer" } } } },
      },
    };
    const out = coerceToSchema({ rows: [{ n: "1" }, { n: "2" }] }, schema);
    expect(out.value).toEqual({ rows: [{ n: 1 }, { n: 2 }] });
    expect(out.changes.length).toBe(2);
  });
});

describe("HTTP API", () => {
  const env: Env = { FREE_DAILY_LIMIT: "1000" };

  it("POST /v1/repair fixes broken JSON", async () => {
    const res = await app.request(
      "/v1/repair",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "{'a': 1,}" }) },
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.valid).toBe(true);
    expect(data.repaired).toEqual({ a: 1 });
  });

  it("POST /v1/repair returns 402 when LLM is needed but unpaid", async () => {
    const res = await app.request(
      "/v1/repair",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: "not json at all", allow_llm_fallback: true }),
      },
      env
    );
    expect(res.status).toBe(402);
  });

  it("POST /v1/repair with allow_llm_fallback=false stays free and reports llm_required", async () => {
    const res = await app.request(
      "/v1/repair",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: "not json at all", allow_llm_fallback: false }),
      },
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.valid).toBe(false);
    expect(data.llm_required).toBe(true);
  });

  it("enforces the free-tier rate limit", async () => {
    const tightEnv: Env = { FREE_DAILY_LIMIT: "2" };
    const call = () =>
      app.request(
        "/v1/repair",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
          body: JSON.stringify({ input: "{}" }),
        },
        tightEnv
      );
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });

  it("serves the demo page, llms.txt and openapi.yaml", async () => {
    expect((await app.request("/", {}, env)).status).toBe(200);
    expect((await app.request("/llms.txt", {}, env)).status).toBe(200);
    expect((await app.request("/openapi.yaml", {}, env)).status).toBe(200);
  });
});

describe("MCP endpoint", () => {
  const env: Env = { FREE_DAILY_LIMIT: "1000" };
  const rpc = (body: unknown) =>
    app.request(
      "/mcp",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      env
    );

  it("handles initialize", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result.serverInfo.name).toBe("jsonaut");
    expect(data.result.capabilities.tools).toBeDefined();
  });

  it("lists tools", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const data = (await res.json()) as any;
    const names = data.result.tools.map((t: any) => t.name);
    expect(names).toContain("repair_json");
    expect(names).toContain("validate_json");
  });

  it("calls repair_json", async () => {
    const res = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "repair_json", arguments: { input: "{'fixed': True,}" } },
    });
    const data = (await res.json()) as any;
    const payload = JSON.parse(data.result.content[0].text);
    expect(payload.valid).toBe(true);
    expect(payload.repaired).toEqual({ fixed: true });
  });

  it("calls validate_json", async () => {
    const res = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "validate_json", arguments: { input: '{"n": "x"}', schema: { type: "object", properties: { n: { type: "number" } } } } },
    });
    const data = (await res.json()) as any;
    const payload = JSON.parse(data.result.content[0].text);
    expect(payload.valid).toBe(false);
  });

  it("accepts notifications/initialized with 202", async () => {
    const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });
});
