import { describe, it, expect } from "vitest";
import { inferSchema } from "../src/core/schema-infer.js";
import { extractDeterministic, findJsonCandidates } from "../src/core/extract.js";
import { handleMcpRequest } from "../src/mcp/server.js";
import type { KVLike } from "../src/core/types.js";

function memKV(): KVLike {
  const m = new Map<string, string>();
  return {
    async get(k) { return m.get(k) ?? null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}
const ctx = () => ({ env: {}, storage: memKV(), headers: new Headers(), resourceUrl: "http://x/mcp" });
const toolText = (res: { body: unknown }) =>
  (res.body as { result: { content: Array<{ text: string }> } }).result.content[0].text;

describe("inferSchema", () => {
  it("infers an object schema with required fields and string formats", () => {
    const s = inferSchema({ id: "a1b2", email: "x@y.com", age: 30, active: true }) as Record<string, any>;
    expect(s.type).toBe("object");
    expect(s.properties.age.type).toBe("integer");
    expect(s.properties.active.type).toBe("boolean");
    expect(s.properties.email).toEqual({ type: "string", format: "email" });
    expect(s.required).toEqual(expect.arrayContaining(["id", "email", "age", "active"]));
    expect(String(s.$schema)).toContain("json-schema.org");
  });

  it("infers array item schemas", () => {
    const s = inferSchema([1, 2, 3]) as Record<string, any>;
    expect(s.type).toBe("array");
    expect(s.items.type).toBe("integer");
  });

  it("merges multiple samples: only fields present in all are required", () => {
    const s = inferSchema([{ a: 1, b: "x" }, { a: 2 }], true) as Record<string, any>;
    expect(s.type).toBe("object");
    expect(s.required).toContain("a");
    expect(s.required ?? []).not.toContain("b");
  });
});

describe("extractDeterministic", () => {
  it("finds JSON embedded in prose", () => {
    const r = extractDeterministic('Sure! Here is the result: {"ok": true, "n": 5} — hope that helps.');
    expect(r.valid).toBe(true);
    expect(r.repaired).toEqual({ ok: true, n: 5 });
  });

  it("extracts and coerces against a schema", () => {
    const r = extractDeterministic('the answer is {"count": "42"}', {
      type: "object",
      properties: { count: { type: "number" } },
    });
    expect(r.valid).toBe(true);
    expect((r.repaired as { count: number }).count).toBe(42);
  });

  it("flags llm_required when no JSON is present", () => {
    const r = extractDeterministic("there is absolutely no json here, just words");
    expect(r.valid).toBe(false);
    expect(r.llm_required).toBe(true);
  });
});

describe("findJsonCandidates", () => {
  it("ignores braces inside strings", () => {
    const cands = findJsonCandidates('x {"s": "a } b", "n": 1} y');
    expect(cands.length).toBe(1);
    expect(JSON.parse(cands[0])).toEqual({ s: "a } b", n: 1 });
  });
});

describe("new MCP tools", () => {
  it("tools/list advertises all four tools", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx());
    const names = (res.body as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["repair_json", "extract_json", "validate_json", "infer_schema"]));
  });

  it("infer_schema returns a schema", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "infer_schema", arguments: { input: '{"a":1}' } } },
      ctx()
    );
    const txt = toolText(res);
    expect(txt).toContain('"schema"');
    expect(txt).toContain('"type": "object"');
  });

  it("extract_json pulls JSON from prose on the free path", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "extract_json", arguments: { input: 'result: {"ok":true}' } } },
      ctx()
    );
    expect(toolText(res)).toContain('"ok": true');
  });
});
