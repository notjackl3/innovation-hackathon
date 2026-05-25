import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Binary asset storage used by the generation pipelines (sketches, meshes,
 * scene frames, video, audio, extracted docs) and the document uploader.
 *
 * Keys look like `companies/<id>/sketches/<n>.png` — they contain slashes and
 * a file extension. Every stored asset is served back to the client through
 * `GET /api/storage/<key>` (see src/app/api/storage/[...key]/route.ts).
 *
 * Driver is chosen by STORAGE_DRIVER:
 *   - "local" (default): writes under ./storage on the local filesystem.
 *   - "vercel" | "blob":  Vercel Blob (requires @vercel/blob + token).
 */
export interface StorageDriver {
  /** Persist bytes under `key`. Returns the (possibly normalized) key. */
  put(key: string, bytes: Buffer, contentType: string): Promise<{ key: string }>;
  /** Read bytes for `key`. Throws if the key does not exist. */
  get(key: string): Promise<Buffer>;
  /** Public, root-relative URL the client uses to fetch the asset. */
  url(key: string): string;
  /** Best-effort delete. Does not throw if the key is already gone. */
  delete(key: string): Promise<void>;
}

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "");
}

/** Resolve a key to an absolute path, refusing anything that escapes the root. */
function resolveLocal(key: string): string {
  const full = path.resolve(STORAGE_ROOT, normalizeKey(key));
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error(`Invalid storage key (path traversal): ${key}`);
  }
  return full;
}

function publicUrl(key: string): string {
  return `/api/storage/${normalizeKey(key)}`;
}

function createLocalDriver(): StorageDriver {
  return {
    async put(key, bytes) {
      const full = resolveLocal(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      return { key: normalizeKey(key) };
    },
    async get(key) {
      const full = resolveLocal(key);
      return fs.readFile(full); // throws ENOENT when missing — callers rely on this
    },
    url: publicUrl,
    async delete(key) {
      await fs.rm(resolveLocal(key), { force: true });
    },
  };
}

/**
 * Vercel Blob driver. The SDK is an optional dependency, so it's loaded
 * lazily through an indirect specifier to keep the bundler from requiring it
 * when STORAGE_DRIVER=local (the default).
 */
function createBlobDriver(): StorageDriver {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "STORAGE_DRIVER selects Vercel Blob but BLOB_READ_WRITE_TOKEN is not set. " +
        "Set the token (and `npm i @vercel/blob`), or use STORAGE_DRIVER=local.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadBlob = (): Promise<any> => {
    const spec = "@vercel/blob";
    return import(/* webpackIgnore: true */ spec).catch(() => {
      throw new Error("STORAGE_DRIVER selects Vercel Blob but `@vercel/blob` is not installed.");
    });
  };
  return {
    async put(key, bytes, contentType) {
      const { put } = await loadBlob();
      await put(normalizeKey(key), bytes, {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
      });
      return { key: normalizeKey(key) };
    },
    async get(key) {
      const { head } = await loadBlob();
      const info = await head(normalizeKey(key), { token });
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`storage get failed for ${key}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    url: publicUrl,
    async delete(key) {
      const { del } = await loadBlob();
      await del(normalizeKey(key), { token }).catch(() => {});
    },
  };
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (cached) return cached;
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  cached = driver === "vercel" || driver === "blob" ? createBlobDriver() : createLocalDriver();
  return cached;
}
