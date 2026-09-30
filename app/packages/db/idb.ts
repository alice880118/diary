export const DB_NAME = "paper-collage-diary";
export const DB_VERSION = 1;

export type StoreName =
  | "notebooks"
  | "pages"
  | "months"
  | "artworks"
  | "stickers"
  | "assets"
  | "settings";

export const ALL_STORES: StoreName[] = [
  "notebooks",
  "pages",
  "months",
  "artworks",
  "stickers",
  "assets",
  "settings",
];

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Migrations are additive and keyed by version so a partially failed upgrade
 * is rolled back by IndexedDB and simply retried on next open.
 */
function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore("notebooks", { keyPath: "id" });
    const pages = db.createObjectStore("pages", { keyPath: "id" });
    pages.createIndex("notebookId", "notebookId", { unique: false });
    const months = db.createObjectStore("months", { keyPath: "key" });
    months.createIndex("notebookId", "notebookId", { unique: false });
    db.createObjectStore("artworks", { keyPath: "id" });
    db.createObjectStore("stickers", { keyPath: "id" });
    db.createObjectStore("assets", { keyPath: "id" });
    db.createObjectStore("settings", { keyPath: "key" });
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't support IndexedDB, so data can't be saved on this device."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      upgrade(req.result, ev.oldVersion);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Couldn't open the local database."));
    };
    req.onblocked = () => {
      reject(new Error("The database is in use by another tab. Close other tabs and try again."));
    };
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Runs fn inside one transaction; resolves only after the transaction commits,
 * so callers never report "saved" before data is durable.
 */
export async function withTx<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted."));
  });
  let result: T;
  try {
    result = await fn(tx);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished; the original error is what matters.
    }
    await done.catch(() => undefined);
    throw err;
  }
  await done;
  return result;
}

export function txGet<T>(
  tx: IDBTransaction,
  store: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  return reqToPromise(tx.objectStore(store).get(key)) as Promise<T | undefined>;
}

export function txGetAll<T>(tx: IDBTransaction, store: StoreName): Promise<T[]> {
  return reqToPromise(tx.objectStore(store).getAll()) as Promise<T[]>;
}

export function txGetAllByIndex<T>(
  tx: IDBTransaction,
  store: StoreName,
  index: string,
  key: IDBValidKey,
): Promise<T[]> {
  return reqToPromise(
    tx.objectStore(store).index(index).getAll(key),
  ) as Promise<T[]>;
}

export function txPut<T>(tx: IDBTransaction, store: StoreName, value: T) {
  return reqToPromise(tx.objectStore(store).put(value));
}

export function txDelete(tx: IDBTransaction, store: StoreName, key: IDBValidKey) {
  return reqToPromise(tx.objectStore(store).delete(key));
}

export async function getOne<T>(
  store: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  return withTx([store], "readonly", (tx) => txGet<T>(tx, store, key));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return withTx([store], "readonly", (tx) => txGetAll<T>(tx, store));
}

export async function getAllByIndex<T>(
  store: StoreName,
  index: string,
  key: IDBValidKey,
): Promise<T[]> {
  return withTx([store], "readonly", (tx) =>
    txGetAllByIndex<T>(tx, store, index, key),
  );
}

export async function putOne<T>(store: StoreName, value: T): Promise<void> {
  await withTx([store], "readwrite", (tx) => txPut(tx, store, value));
}

export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}

export function describeError(err: unknown): string {
  if (isQuotaError(err)) {
    return "Storage is full. Empty the trash, or export a backup and delete some content, then try again.";
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
