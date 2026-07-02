import { describe, it, expect } from "vitest";
import { constantTimeEqual, sha256Hex, MAX_INPUT_CHARS } from "../src/core/security.js";
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

describe("constantTimeEqual", () => {
  it("matches equal strings and rejects differences", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false); // length mismatch
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("produces the known digest for the empty string", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("is deterministic", async () => {
    expect(await sha256Hex("jsonaut")).toBe(await sha256Hex("jsonaut"));
  });
});

describe("MCP tool size guard", () => {
  it("rejects oversized input before doing any work", async () => {
    const ctx = { env: {}, storage: memKV(), headers: new Headers(), resourceUrl: "http://x/mcp" };
    const res = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "repair_json", arguments: { input: "x".repeat(MAX_INPUT_CHARS + 1) } },
      },
      ctx
    );
    const result = (res.body as { result: { isError: boolean; content: Array<{ text: string }> } }).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("too large");
  });

  it("still processes normal input", async () => {
    const ctx = { env: {}, storage: memKV(), headers: new Headers(), resourceUrl: "http://x/mcp" };
    const res = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "repair_json", arguments: { input: "{a:1,}" } },
      },
      ctx
    );
    const result = (res.body as { result: { isError: boolean; content: Array<{ text: string }> } }).result;
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"a": 1');
  });
});
