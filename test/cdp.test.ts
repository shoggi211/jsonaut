import { describe, it, expect } from "vitest";
import { generateCdpJwt } from "../src/http/cdp.js";

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function decodeSegment(seg: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

describe("generateCdpJwt", () => {
  it("produces a well-formed EdDSA JWT that verifies against the public key", async () => {
    // Build a CDP-style Ed25519 secret (base64 of 32-byte seed + 32-byte pubkey).
    const kp: any = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const seed = b64urlToBytes(priv.d as string);
    const pub = b64urlToBytes(priv.x as string);
    const secretB64 = bytesToB64(new Uint8Array([...seed, ...pub]));

    const keyId = "116f483b-9385-467e-8b61-1588090c08b0";
    const jwt = await generateCdpJwt(keyId, secretB64, "POST", "api.cdp.coinbase.com", "/platform/v2/x402/verify");

    const [h, p, s] = jwt.split(".");
    expect(h && p && s).toBeTruthy();

    // Signature must verify against the original public key.
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      kp.publicKey,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`)
    );
    expect(ok).toBe(true);

    // Header + claims must match CDP's expected shape.
    const header = decodeSegment(h);
    expect(header.alg).toBe("EdDSA");
    expect(header.kid).toBe(keyId);
    expect(header.nonce).toBeTruthy();

    const claims = decodeSegment(p);
    expect(claims.sub).toBe(keyId);
    expect(claims.iss).toBe("cdp");
    expect(claims.aud).toEqual(["cdp_service"]);
    expect(claims.uris).toEqual(["POST api.cdp.coinbase.com/platform/v2/x402/verify"]);
    expect(claims.exp).toBeGreaterThan(claims.nbf);
  });
});
