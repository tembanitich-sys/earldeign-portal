import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** Storage adapter: Vercel Blob (private) in production on Vercel, local disk on a VPS or in development. */
export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
}

class LocalStorage implements Storage {
  constructor(private dir: string) {}
  private full(key: string) {
    const p = path.resolve(this.dir, key);
    if (!p.startsWith(path.resolve(this.dir))) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return key;
  }
  async get(key: string) {
    try { return await fs.readFile(this.full(key)); } catch { return null; }
  }
}

class BlobStorage implements Storage {
  async put(key: string, data: Buffer, mime: string) {
    const { put } = await import("@vercel/blob");
    const r = await put(key, data, { access: "private", contentType: mime, addRandomSuffix: true });
    return r.pathname;
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const r = await get(key, { access: "private" });
    if (!r) return null;
    const chunks: Uint8Array[] = [];
    const reader = (r as unknown as { stream: ReadableStream<Uint8Array> }).stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    return Buffer.concat(chunks);
  }
}

export function storage(): Storage {
  return process.env.STORAGE_DRIVER === "blob" ? new BlobStorage() : new LocalStorage(process.env.STORAGE_DIR ?? "./storage");
}

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "text/csv": "csv",
};
export const MAX_BYTES = 10 * 1024 * 1024;

export function newKey(jvId: string, ext: string) {
  return `${jvId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
}
