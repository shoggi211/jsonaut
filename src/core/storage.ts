import type { Env, KVLike } from "./types.js";

/** In-memory fallback used in local dev and when no KV binding is configured. */
class MemoryStorage implements KVLike {
  private data = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const memory = new MemoryStorage();

export function getStorage(env: Env): KVLike {
  return env.KV ?? memory;
}
