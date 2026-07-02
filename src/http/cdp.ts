/**
 * Coinbase CDP authentication for the mainnet x402 facilitator.
 *
 * The CDP facilitator (https://api.cdp.coinbase.com/platform/v2/x402) requires a
 * short-lived EdDSA JWT (Bearer token) signed with the CDP API secret (Ed25519).
 * We sign it with Web Crypto, which works on both Cloudflare Workers and Node 20+.
 */

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s));
}

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Import a CDP Ed25519 secret (base64 of 64 bytes: 32-byte seed + 32-byte public
 * key) as a signing CryptoKey via a JWK.
 */
async function importEd25519PrivateKey(secretB64: string) {
  const raw = bytesFromB64(secretB64.trim());
  const seed = raw.slice(0, 32);
  const pub = raw.length >= 64 ? raw.slice(32, 64) : undefined;
  const jwk = {
    kty: "OKP",
    crv: "Ed25519",
    d: b64urlFromBytes(seed),
    ...(pub ? { x: b64urlFromBytes(pub) } : {}),
    key_ops: ["sign"],
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}

/**
 * Generate a CDP Bearer JWT for a single REST request.
 * uris claim format: "<METHOD> <HOST><PATH>" (no scheme), e.g.
 * "POST api.cdp.coinbase.com/platform/v2/x402/verify".
 */
export async function generateCdpJwt(
  keyId: string,
  secretB64: string,
  method: string,
  host: string,
  path: string,
  expiresInSec = 120
): Promise<string> {
  const key = await importEd25519PrivateKey(secretB64);
  const now = Math.floor(Date.now() / 1000);

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const header = { alg: "EdDSA", typ: "JWT", kid: keyId, nonce };
  const claims = {
    sub: keyId,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: now,
    exp: now + expiresInSec,
    uris: [`${method.toUpperCase()} ${host}${path}`],
  };

  const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
}
