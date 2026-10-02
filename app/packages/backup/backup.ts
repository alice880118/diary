import { emitChange } from "../db/events";
import { newId } from "../db/id";
import { getAll, txGet, txPut, withTx } from "../db/idb";
import { sha256 } from "../db/sha256";
import { bytesMode, enableBytesMode, getSettings, hydrateAsset, isBlobStoreError, updateSettings } from "../db/repo";
import {
  SCHEMA_VERSION,
  type Artwork,
  type Asset,
  type MonthlyOverview,
  type Notebook,
  type Page,
  type Sticker,
} from "../db/types";

export const BACKUP_FORMAT = "paper-collage-diary-backup";

interface AssetRecord extends Omit<Asset, "blob"> {
  data: string;
}

interface BackupData {
  notebooks: Notebook[];
  pages: Page[];
  months: MonthlyOverview[];
  artworks: Artwork[];
  stickers: Sticker[];
  assets: AssetRecord[];
}

export interface BackupCounts {
  notebooks: number;
  pages: number;
  stickers: number;
  artworks: number;
  assets: number;
}

export class BackupError extends Error {}

async function hashBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle && window.isSecureContext) {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let s = "";
    for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, "0");
    return s;
  }
  return sha256(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + CHUNK)));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function countsOf(d: BackupData): BackupCounts {
  return {
    notebooks: d.notebooks.length,
    pages: d.pages.length,
    stickers: d.stickers.length,
    artworks: d.artworks.length,
    assets: d.assets.length,
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export async function exportBackup(onProgress?: (p: number) => void): Promise<{ blob: Blob; name: string; counts: BackupCounts }> {
  const [notebooks, pages, months, artworks, stickers, assets] = await Promise.all([
    getAll<Notebook>("notebooks"),
    getAll<Page>("pages"),
    getAll<MonthlyOverview>("months"),
    getAll<Artwork>("artworks"),
    getAll<Sticker>("stickers"),
    getAll<Asset>("assets"),
  ]);
  const records: AssetRecord[] = [];
  for (let i = 0; i < assets.length; i++) {
    const { blob, ...meta } = hydrateAsset(assets[i]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    records.push({ ...meta, data: bytesToBase64(bytes) });
    onProgress?.((i + 1) / Math.max(1, assets.length));
  }
  const data: BackupData = { notebooks, pages, months, artworks, stickers, assets: records };
  const dataStr = JSON.stringify(data);
  const checksum = await hashBytes(new TextEncoder().encode(dataStr));
  const counts = countsOf(data);
  const header = JSON.stringify({
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    counts,
    checksum,
  });
  const blob = new Blob([header.slice(0, -1), ',"data":', dataStr, "}"], { type: "application/json" });
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const name = `diary-backup-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  await updateSettings({ lastBackupAt: Date.now() });
  return { blob, name, counts };
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

export interface RestorePlan {
  exportedAt: number;
  schemaVersion: number;
  counts: BackupCounts;
  /** Records already present with identical content. */
  identical: number;
  /** Records whose id exists locally with different content; imported as copies. */
  conflicts: number;
  data: BackupData;
}

const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;

function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export async function readBackup(file: File): Promise<RestorePlan> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError("The backup file is too large to read.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupError("This isn't a valid backup file. It couldn't be parsed.");
  }
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.format !== BACKUP_FORMAT) {
    throw new BackupError("This isn't a Paper Collage Diary backup file.");
  }
  const ver = Number(o.schemaVersion);
  if (!Number.isInteger(ver) || ver < 1) throw new BackupError("The backup's version info is corrupted.");
  if (ver > SCHEMA_VERSION) throw new BackupError("This backup was made with a newer version. Update the app, then restore.");
  const data = o.data as BackupData | undefined;
  if (
    !data ||
    !isArr(data.notebooks) ||
    !isArr(data.pages) ||
    !isArr(data.months) ||
    !isArr(data.artworks) ||
    !isArr(data.stickers) ||
    !isArr(data.assets)
  ) {
    throw new BackupError("The backup file is incomplete.");
  }
  const checksum = await hashBytes(new TextEncoder().encode(JSON.stringify(data)));
  if (checksum !== o.checksum) throw new BackupError("Checksum mismatch. The backup file may be corrupted or modified.");
  for (const a of data.assets) {
    if (typeof a.id !== "string" || typeof a.data !== "string") throw new BackupError("An asset in the backup has an invalid format.");
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = base64ToBytes(a.data);
    } catch {
      throw new BackupError(`Asset "${a.name || a.id}" is corrupted.`);
    }
    if ((await hashBytes(bytes)) !== a.hash) throw new BackupError(`Checksum mismatch for asset "${a.name || a.id}".`);
  }

  const local = await Promise.all([
    getAll<Notebook>("notebooks"),
    getAll<Page>("pages"),
    getAll<MonthlyOverview>("months"),
    getAll<Artwork>("artworks"),
    getAll<Sticker>("stickers"),
    getAll<Asset>("assets"),
  ]);
  let identical = 0;
  let conflicts = 0;
  const cmp = <T>(list: T[], localList: T[], key: (t: T) => string, same: (a: T, b: T) => boolean) => {
    const m = new Map(localList.map((x) => [key(x), x]));
    for (const r of list) {
      const l = m.get(key(r));
      if (!l) continue;
      if (same(r, l)) identical++;
      else conflicts++;
    }
  };
  const json = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  cmp(data.notebooks, local[0], (x) => x.id, json);
  cmp(data.pages, local[1], (x) => x.id, json);
  cmp(data.months, local[2], (x) => x.key, json);
  cmp(data.artworks, local[3], (x) => x.id, json);
  cmp(data.stickers, local[4], (x) => x.id, json);
  cmp(
    data.assets,
    local[5] as unknown as AssetRecord[],
    (x) => x.id,
    (a, b) => a.hash === b.hash,
  );

  return {
    exportedAt: Number(o.exportedAt) || 0,
    schemaVersion: ver,
    counts: countsOf(data),
    identical,
    conflicts,
    data,
  };
}

function remapDeep<T>(value: T, map: Map<string, string>): T {
  if (map.size === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

const ID_PREFIX: Record<string, string> = {
  notebooks: "nb",
  pages: "pg",
  artworks: "aw",
  stickers: "st",
  assets: "as",
};

/**
 * Merge a validated backup into local data: identical records are skipped,
 * conflicting ids are imported as copies with new ids. One transaction, so a
 * failure leaves local data untouched.
 */
export async function applyRestore(plan: RestorePlan): Promise<{ added: number; skipped: number }> {
  try {
    return await applyRestoreOnce(plan, bytesMode());
  } catch (err) {
    // iOS Safari may refuse Blobs; the transaction rolled back, so retry storing raw bytes.
    if (bytesMode() || !isBlobStoreError(err)) throw err;
    enableBytesMode();
    return applyRestoreOnce(plan, true);
  }
}

async function applyRestoreOnce(plan: RestorePlan, asBytes: boolean): Promise<{ added: number; skipped: number }> {
  const d = plan.data;
  let added = 0;
  let skipped = 0;
  await withTx(["notebooks", "pages", "months", "artworks", "stickers", "assets"], "readwrite", async (tx) => {
    const idMap = new Map<string, string>();
    const skip = new Set<string>();
    const decide = async (store: "notebooks" | "pages" | "artworks" | "stickers" | "assets", list: { id: string }[]) => {
      for (const r of list) {
        const cur = await txGet<Record<string, unknown>>(tx, store, r.id);
        if (!cur) continue;
        const same =
          store === "assets"
            ? (cur as unknown as Asset).hash === (r as unknown as AssetRecord).hash
            : JSON.stringify(cur) === JSON.stringify(r);
        if (same) skip.add(r.id);
        else idMap.set(r.id, newId(ID_PREFIX[store]));
      }
    };
    await decide("notebooks", d.notebooks);
    await decide("pages", d.pages);
    await decide("artworks", d.artworks);
    await decide("stickers", d.stickers);
    await decide("assets", d.assets);

    for (const a of d.assets) {
      if (skip.has(a.id)) {
        skipped++;
        continue;
      }
      const { data, ...meta } = a;
      const bytes = base64ToBytes(data);
      const id = idMap.get(a.id) ?? a.id;
      const asset = asBytes ? { ...meta, id, bytes: bytes.buffer } : { ...meta, id, blob: new Blob([bytes], { type: meta.mime }) };
      await txPut(tx, "assets", asset);
      added++;
    }
    const put = async <T extends { id: string }>(store: "notebooks" | "pages" | "artworks" | "stickers", list: T[]) => {
      for (const r of list) {
        if (skip.has(r.id)) {
          skipped++;
          continue;
        }
        await txPut(tx, store, remapDeep(r, idMap));
        added++;
      }
    };
    await put("notebooks", d.notebooks);
    await put("pages", d.pages);
    await put("artworks", d.artworks);
    await put("stickers", d.stickers);
    for (const m of d.months) {
      const r = remapDeep(m, idMap);
      r.key = `${r.notebookId}:${r.ym}`;
      const cur = await txGet<MonthlyOverview>(tx, "months", r.key);
      if (cur && JSON.stringify(cur) === JSON.stringify(r)) {
        skipped++;
        continue;
      }
      // An existing overview for the same notebook/month is kept.
      if (cur) {
        skipped++;
        continue;
      }
      await txPut(tx, "months", r);
      added++;
    }
  });
  const s = await getSettings();
  if (!s.onboarded) await updateSettings({ onboarded: true });
  emitChange();
  return { added, skipped };
}
