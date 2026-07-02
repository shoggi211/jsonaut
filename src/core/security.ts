/** Shared security limits and helpers. */

// Reject oversized requests up front (before parsing/processing) to bound CPU,
// memory, and paid-tier LLM token cost.
export const MAX_BODY_BYTES = 512 * 1024; // 512 KB request body
export const MAX_INPUT_CHARS = 200_000; // ~200 KB of JSON text to repair/validate
export const MAX_SCHEMA_CHARS = 50_000; // JSON Schema document

/** Constant-time string comparison to avoid leaking token bytes via timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** SHA-256 hex digest (Web Crypto; available on Workers and Node 20+). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
