import { t, tn } from "../i18n";
import { emitChange } from "./events";
import { formatDate, newId, todayLocal, ymOf } from "./id";
import {
  getAll,
  getAllByIndex,
  getOne,
  putOne,
  txDelete,
  txGet,
  txGetAll,
  txGetAllByIndex,
  txPut,
  withTx,
} from "./idb";
import { sha256Blob } from "./sha256";
import {
  PAGE_H,
  PAGE_W,
  SCHEMA_VERSION,
  type AppSettings,
  type Artwork,
  type Asset,
  type AssetRole,
  type HomeBoard,
  type MonthCover,
  type MonthGoal,
  type MonthlyOverview,
  type Notebook,
  type Page,
  type PageObject,
  type PageStyle,
  type Sticker,
} from "./types";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: AppSettings = {
  key: "app",
  schemaVersion: SCHEMA_VERSION,
  motion: "system",
  onboarded: false,
  lastBackupAt: null,
};

export async function getSettings(): Promise<AppSettings> {
  const s = await getOne<AppSettings>("settings", "app");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const cur = await getSettings();
  await putOne("settings", { ...cur, ...patch, key: "app" });
  emitChange();
}

/* ------------------------------------------------------------------ */
/* Home board                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_BOARD_BG: HomeBoard["background"] = { color: "blush", texture: "grain", shapes: true };

/** The stored board, or null before the first edit. */
export async function getHomeBoard(): Promise<HomeBoard | null> {
  const b = await getOne<HomeBoard>("settings", "home");
  if (!b) return null;
  return {
    key: "home",
    background: { ...DEFAULT_BOARD_BG, ...(b.background ?? {}) },
    items: Array.isArray(b.items) ? b.items : [],
    strokes: Array.isArray(b.strokes) ? b.strokes : [],
    updatedAt: b.updatedAt ?? 0,
  };
}

export async function saveHomeBoard(b: HomeBoard) {
  await putOne("settings", { ...b, key: "home", updatedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Notebooks                                                           */
/* ------------------------------------------------------------------ */

export async function listNotebooks(): Promise<Notebook[]> {
  const all = await getAll<Notebook>("notebooks");
  return all.filter((n) => !n.deletedAt).sort((a, b) => a.order - b.order);
}

export async function getNotebook(id: string) {
  return getOne<Notebook>("notebooks", id);
}

export async function createNotebook(input: {
  name: string;
  cover: string;
  defaultStyle: PageStyle;
}): Promise<Notebook> {
  const all = await getAll<Notebook>("notebooks");
  const maxOrder = all.reduce((m, n) => Math.max(m, n.order), 0);
  const now = Date.now();
  const nb: Notebook = {
    id: newId("nb"),
    name: input.name,
    cover: input.cover,
    defaultStyle: input.defaultStyle,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await putOne("notebooks", nb);
  emitChange();
  return nb;
}

export async function updateNotebook(
  id: string,
  patch: Partial<Pick<Notebook, "name" | "cover" | "defaultStyle">>,
) {
  await withTx(["notebooks"], "readwrite", async (tx) => {
    const nb = await txGet<Notebook>(tx, "notebooks", id);
    if (!nb) {
      throw new Error("Notebook not found.");
    }
    await txPut(tx, "notebooks", { ...nb, ...patch, updatedAt: Date.now() });
  });
  emitChange();
}

export async function moveNotebook(id: string, dir: -1 | 1) {
  await withTx(["notebooks"], "readwrite", async (tx) => {
    const list = (await txGetAll<Notebook>(tx, "notebooks"))
      .filter((n) => !n.deletedAt)
      .sort((a, b) => a.order - b.order);
    const idx = list.findIndex((n) => n.id === id);
    const other = list[idx + dir];
    if (idx < 0 || !other) {
      return;
    }
    const cur = list[idx];
    const tmp = cur.order;
    await txPut(tx, "notebooks", { ...cur, order: other.order });
    await txPut(tx, "notebooks", { ...other, order: tmp });
  });
  emitChange();
}

export async function trashNotebook(id: string) {
  await withTx(["notebooks"], "readwrite", async (tx) => {
    const nb = await txGet<Notebook>(tx, "notebooks", id);
    if (nb) {
      await txPut(tx, "notebooks", { ...nb, deletedAt: Date.now() });
    }
  });
  emitChange();
}

export async function restoreNotebook(id: string) {
  await withTx(["notebooks"], "readwrite", async (tx) => {
    const nb = await txGet<Notebook>(tx, "notebooks", id);
    if (nb) {
      await txPut(tx, "notebooks", { ...nb, deletedAt: null });
    }
  });
  emitChange();
}

export async function purgeNotebook(id: string) {
  await withTx(["notebooks", "pages", "months"], "readwrite", async (tx) => {
    const pages = await txGetAllByIndex<Page>(tx, "pages", "notebookId", id);
    for (const p of pages) {
      await txDelete(tx, "pages", p.id);
    }
    const months = await txGetAllByIndex<MonthlyOverview>(
      tx,
      "months",
      "notebookId",
      id,
    );
    for (const m of months) {
      await txDelete(tx, "months", m.key);
    }
    await txDelete(tx, "notebooks", id);
  });
  await collectGarbage();
  emitChange();
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

export function sortPagesByOrder(pages: Page[]) {
  return [...pages].sort((a, b) => a.order - b.order);
}

export function sortPagesByDate(pages: Page[]) {
  return [...pages].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
}

export async function listPages(notebookId: string): Promise<Page[]> {
  const all = await getAllByIndex<Page>("pages", "notebookId", notebookId);
  return sortPagesByOrder(all.filter((p) => !p.deletedAt));
}

export async function getPage(id: string) {
  return getOne<Page>("pages", id);
}

/**
 * New pages are placed after the last page whose date is <= the new date so
 * flipping roughly follows the calendar, while order stays independent.
 */
export async function createPage(
  notebookId: string,
  date: string = todayLocal(),
): Promise<Page> {
  const page = await withTx(
    ["notebooks", "pages"],
    "readwrite",
    async (tx) => {
      const nb = await txGet<Notebook>(tx, "notebooks", notebookId);
      if (!nb) {
        throw new Error("Notebook not found.");
      }
      const pages = sortPagesByOrder(
        (await txGetAllByIndex<Page>(tx, "pages", "notebookId", notebookId)).filter(
          (p) => !p.deletedAt,
        ),
      );
      let order: number;
      const beforeIdx = pages.findIndex((p) => p.date > date);
      if (beforeIdx < 0) {
        order = (pages[pages.length - 1]?.order ?? 0) + 1;
      } else {
        const prev = pages[beforeIdx - 1]?.order ?? pages[beforeIdx].order - 1;
        order = (prev + pages[beforeIdx].order) / 2;
      }
      const now = Date.now();
      const p: Page = {
        id: newId("pg"),
        notebookId,
        date,
        order,
        style: nb.defaultStyle,
        coord: { w: PAGE_W, h: PAGE_H },
        objects: [],
        ink: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await txPut(tx, "pages", p);
      await txPut(tx, "notebooks", { ...nb, updatedAt: now });
      return p;
    },
  );
  emitChange();
  return page;
}

export async function savePage(page: Page): Promise<void> {
  const now = Date.now();
  await withTx(["pages", "notebooks"], "readwrite", async (tx) => {
    await txPut(tx, "pages", { ...page, updatedAt: now });
    const nb = await txGet<Notebook>(tx, "notebooks", page.notebookId);
    if (nb) {
      await txPut(tx, "notebooks", { ...nb, updatedAt: now });
    }
  });
  emitChange();
}

export async function setPageDate(id: string, date: string) {
  await withTx(["pages"], "readwrite", async (tx) => {
    const p = await txGet<Page>(tx, "pages", id);
    if (!p) {
      throw new Error("Page not found.");
    }
    await txPut(tx, "pages", { ...p, date, updatedAt: Date.now() });
  });
  emitChange();
}

export async function setPageStyle(id: string, style: PageStyle) {
  await withTx(["pages"], "readwrite", async (tx) => {
    const p = await txGet<Page>(tx, "pages", id);
    if (p) {
      await txPut(tx, "pages", { ...p, style, updatedAt: Date.now() });
    }
  });
  emitChange();
}

export function cloneObjects(objects: PageObject[]): PageObject[] {
  return objects.map((o) => ({
    ...structuredClone(o),
    id: newId("ob"),
  }));
}

export async function duplicatePage(id: string): Promise<Page> {
  const copy = await withTx(["pages"], "readwrite", async (tx) => {
    const src = await txGet<Page>(tx, "pages", id);
    if (!src) {
      throw new Error("Page not found.");
    }
    const pages = sortPagesByOrder(
      (await txGetAllByIndex<Page>(tx, "pages", "notebookId", src.notebookId)).filter(
        (p) => !p.deletedAt,
      ),
    );
    const idx = pages.findIndex((p) => p.id === id);
    const next = pages[idx + 1];
    const order = next ? (src.order + next.order) / 2 : src.order + 1;
    const now = Date.now();
    const p: Page = {
      ...structuredClone(src),
      id: newId("pg"),
      order,
      objects: cloneObjects(src.objects),
      ink: src.ink.map((s) => ({ ...s, id: newId("st") })),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await txPut(tx, "pages", p);
    return p;
  });
  emitChange();
  return copy;
}

export async function movePage(id: string, dir: -1 | 1) {
  await withTx(["pages"], "readwrite", async (tx) => {
    const src = await txGet<Page>(tx, "pages", id);
    if (!src) {
      return;
    }
    const pages = sortPagesByOrder(
      (await txGetAllByIndex<Page>(tx, "pages", "notebookId", src.notebookId)).filter(
        (p) => !p.deletedAt,
      ),
    );
    const idx = pages.findIndex((p) => p.id === id);
    const other = pages[idx + dir];
    if (!other) {
      return;
    }
    await txPut(tx, "pages", { ...src, order: other.order });
    await txPut(tx, "pages", { ...other, order: src.order });
  });
  emitChange();
}

export async function trashPage(id: string) {
  await withTx(["pages"], "readwrite", async (tx) => {
    const p = await txGet<Page>(tx, "pages", id);
    if (p) {
      await txPut(tx, "pages", { ...p, deletedAt: Date.now() });
    }
  });
  emitChange();
}

export async function restorePage(id: string) {
  await withTx(["pages", "notebooks"], "readwrite", async (tx) => {
    const p = await txGet<Page>(tx, "pages", id);
    if (!p) {
      return;
    }
    const nb = await txGet<Notebook>(tx, "notebooks", p.notebookId);
    if (!nb) {
      throw new Error("This page's notebook was permanently deleted, so the page can't be restored.");
    }
    if (nb.deletedAt) {
      await txPut(tx, "notebooks", { ...nb, deletedAt: null });
    }
    await txPut(tx, "pages", { ...p, deletedAt: null });
  });
  emitChange();
}

export async function purgePage(id: string) {
  await withTx(["pages"], "readwrite", (tx) => txDelete(tx, "pages", id));
  await collectGarbage();
  emitChange();
}

/* ------------------------------------------------------------------ */
/* Monthly overview                                                    */
/* ------------------------------------------------------------------ */

export function monthKey(notebookId: string, ym: string) {
  return `${notebookId}:${ym}`;
}

export async function getMonth(
  notebookId: string,
  ym: string,
): Promise<MonthlyOverview> {
  const m = await getOne<MonthlyOverview>("months", monthKey(notebookId, ym));
  return (
    m ?? {
      key: monthKey(notebookId, ym),
      notebookId,
      ym,
      highlight: null,
      sticker: null,
      updatedAt: 0,
    }
  );
}

export async function listMonths(notebookId: string) {
  return getAllByIndex<MonthlyOverview>("months", "notebookId", notebookId);
}

export async function saveMonth(m: MonthlyOverview) {
  await putOne("months", { ...m, updatedAt: Date.now() });
  emitChange();
}

export const MAX_GOALS = 5;
export const GOAL_MAX_LEN = 30;

export const DEFAULT_COVER: MonthCover = {
  paper: "#fdfaf0",
  shape: "polaroid",
  fix: "tape",
  tapePattern: "stripe",
  tapeColor: "#f2a7bd",
};

export function coverOfMonth(m: MonthlyOverview | undefined): MonthCover {
  return { ...DEFAULT_COVER, ...(m?.cover ?? {}) };
}

export function goalsOf(m: MonthlyOverview | undefined): MonthGoal[] {
  return [...(m?.goals ?? [])].sort((a, b) => a.order - b.order);
}

export function prevYm(ym: string) {
  const [y, mo] = ym.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Applies a change to one month record (created if missing) in a transaction. */
export async function updateMonth(notebookId: string, ym: string, fn: (m: MonthlyOverview) => MonthlyOverview) {
  await withTx(["months"], "readwrite", async (tx) => {
    const key = monthKey(notebookId, ym);
    const cur = (await txGet<MonthlyOverview>(tx, "months", key)) ?? {
      key,
      notebookId,
      ym,
      highlight: null,
      sticker: null,
      updatedAt: 0,
    };
    await txPut(tx, "months", { ...fn(cur), key, updatedAt: Date.now() });
  });
  emitChange();
}

/**
 * Saves the goal list from the edit sheet. Goals carried in from the previous
 * month that were deleted here go back to unfinished there.
 */
export async function saveGoals(notebookId: string, ym: string, goals: MonthGoal[]) {
  await withTx(["months"], "readwrite", async (tx) => {
    const key = monthKey(notebookId, ym);
    const cur = await txGet<MonthlyOverview>(tx, "months", key);
    const kept = new Set(goals.map((g) => g.id));
    const dropped = (cur?.goals ?? []).filter((g) => !kept.has(g.id) && g.carriedFrom);
    const clean = goals
      .map((g) => ({ ...g, text: g.text.trim().slice(0, GOAL_MAX_LEN) }))
      .filter((g) => g.text)
      .slice(0, MAX_GOALS)
      .map((g, i) => ({ ...g, order: i }));
    await txPut(tx, "months", {
      ...(cur ?? { key, notebookId, ym, highlight: null, sticker: null }),
      key,
      goals: clean,
      updatedAt: Date.now(),
    });
    for (const g of dropped) {
      const fromKey = monthKey(notebookId, g.carriedFrom!);
      const from = await txGet<MonthlyOverview>(tx, "months", fromKey);
      if (!from?.goals) continue;
      await txPut(tx, "months", {
        ...from,
        goals: from.goals.map((x) => (x.id === g.id && x.movedTo === ym ? { ...x, movedTo: null } : x)),
        updatedAt: Date.now(),
      });
    }
  });
  emitChange();
}

/**
 * First visit to the current month: copies last month's unfinished goals that
 * weren't carried yet, up to the limit. Runs once per month; returns how many
 * were carried.
 */
export async function carryOverGoals(notebookId: string, ym: string): Promise<number> {
  let carried = 0;
  await withTx(["months"], "readwrite", async (tx) => {
    const key = monthKey(notebookId, ym);
    const cur = await txGet<MonthlyOverview>(tx, "months", key);
    if (cur?.carried) return;
    const from = prevYm(ym);
    const prev = await txGet<MonthlyOverview>(tx, "months", monthKey(notebookId, from));
    const open = goalsOf(prev).filter((g) => !g.done && !g.movedTo);
    if (!prev || !open.length) return;
    const goals = goalsOf(cur);
    const ids = new Set(goals.map((g) => g.id));
    const take = open.filter((g) => !ids.has(g.id)).slice(0, Math.max(0, MAX_GOALS - goals.length));
    if (!take.length) return;
    const next = [...goals, ...take.map((g) => ({ ...g, done: false, carriedFrom: from, movedTo: null }))].map((g, i) => ({ ...g, order: i }));
    await txPut(tx, "months", {
      ...(cur ?? { key, notebookId, ym, highlight: null, sticker: null }),
      key,
      goals: next,
      carried: true,
      updatedAt: Date.now(),
    });
    const moved = new Set(take.map((g) => g.id));
    await txPut(tx, "months", {
      ...prev,
      goals: (prev.goals ?? []).map((g) => (moved.has(g.id) ? { ...g, movedTo: ym } : g)),
      updatedAt: Date.now(),
    });
    carried = take.length;
  });
  if (carried) emitChange();
  return carried;
}

export function pagesInMonth(pages: Page[], ym: string) {
  return sortPagesByDate(pages.filter((p) => ymOf(p.date) === ym));
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

/* ---------- asset blobs: iOS Safari fallback ---------- */

/**
 * WebKit sometimes refuses to store Blobs in IndexedDB ("Error preparing
 * Blob/File data to be stored in object store"). When that happens the
 * bytes are stored as an ArrayBuffer instead, and from then on on this
 * device. Readers accept both forms, so older records are untouched.
 */
type StoredAsset = Omit<Asset, "blob"> & { blob?: Blob; bytes?: ArrayBuffer };

const BYTES_KEY = "diary.assetsAsBytes";

export function bytesMode(): boolean {
  try {
    return localStorage.getItem(BYTES_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableBytesMode() {
  try {
    localStorage.setItem(BYTES_KEY, "1");
  } catch {
    // Without storage the fallback still applies to this write.
  }
}

export function isBlobStoreError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return Boolean(e && (/Blob\/File|preparing Blob/i.test(e.message ?? "") || (e.name === "UnknownError" && /blob/i.test(e.message ?? ""))));
}

async function toBytesRecord(a: StoredAsset): Promise<StoredAsset> {
  if (!(a.blob instanceof Blob)) return a;
  const { blob, ...rest } = a;
  return { ...rest, bytes: await blob.arrayBuffer() };
}

/** Stored record → Asset with a Blob, whichever form it was saved in. */
export function hydrateAsset(raw: StoredAsset): Asset;
export function hydrateAsset(raw: StoredAsset | undefined): Asset | undefined;
export function hydrateAsset(raw: StoredAsset | undefined): Asset | undefined {
  if (!raw) return undefined;
  if (raw.blob instanceof Blob) return raw as Asset;
  const { bytes, ...rest } = raw;
  return { ...rest, blob: new Blob([bytes ?? new ArrayBuffer(0)], { type: raw.mime }) };
}

/** Writes an asset record, switching to ArrayBuffer storage if Blobs are refused. */
export async function putAssetRecord(a: StoredAsset): Promise<void> {
  if (bytesMode()) {
    await putOne("assets", await toBytesRecord(a));
    return;
  }
  try {
    await putOne("assets", a);
  } catch (err) {
    if (!isBlobStoreError(err)) throw err;
    enableBytesMode();
    await putOne("assets", await toBytesRecord(a));
  }
}

async function patchAsset(id: string, patch: Partial<Asset>) {
  const raw = await getOne<StoredAsset>("assets", id);
  if (!raw) return;
  await putAssetRecord({ ...raw, ...patch });
}

export async function putAsset(
  blob: Blob,
  meta: {
    role: AssetRole;
    w: number;
    h: number;
    name?: string;
    library?: boolean;
  },
): Promise<Asset> {
  const hash = await sha256Blob(blob);
  const asset: Asset = {
    id: newId("as"),
    mime: blob.type || "application/octet-stream",
    blob,
    w: meta.w,
    h: meta.h,
    hash,
    role: meta.role,
    name: meta.name ?? "",
    library: meta.library ?? false,
    createdAt: Date.now(),
    deletedAt: null,
  };
  await putAssetRecord(asset);
  return asset;
}

export async function getAsset(id: string) {
  return hydrateAsset(await getOne<StoredAsset>("assets", id));
}

export async function listLibraryImages(): Promise<Asset[]> {
  const all = (await getAll<StoredAsset>("assets")).map((a) => hydrateAsset(a));
  return all
    .filter((a) => a.library && !a.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function renameAsset(id: string, name: string) {
  await patchAsset(id, { name });
  emitChange();
}

export async function trashAsset(id: string) {
  await patchAsset(id, { deletedAt: Date.now() });
  emitChange();
}

export async function restoreAsset(id: string) {
  await patchAsset(id, { deletedAt: null });
  emitChange();
}

/** Removes the library entry; the blob survives while anything references it. */
export async function purgeLibraryAsset(id: string) {
  await patchAsset(id, { library: false, deletedAt: null });
  await collectGarbage();
  emitChange();
}

const ASSET_KEY = /(^assetId$|AssetId$)/;

export function collectAssetRefs(value: unknown, out: Set<string>) {
  if (Array.isArray(value)) {
    for (const v of value) {
      collectAssetRefs(v, out);
    }
    return;
  }
  if (value && typeof value === "object" && !(value instanceof Blob)) {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && ASSET_KEY.test(k)) {
        out.add(v);
      } else if (typeof v === "object") {
        collectAssetRefs(v, out);
      }
    }
  }
}

/**
 * Deletes assets no longer referenced by any record, including records in the
 * trash, so restoring from trash never finds missing blobs.
 */
export async function collectGarbage(): Promise<number> {
  return withTx(
    ["notebooks", "pages", "months", "artworks", "stickers", "assets", "settings"],
    "readwrite",
    async (tx) => {
      const refs = new Set<string>();
      // "settings" holds the home board, whose stickers reference assets too.
      for (const store of ["pages", "months", "artworks", "stickers", "settings"] as const) {
        const rows = await txGetAll<unknown>(tx, store);
        collectAssetRefs(rows, refs);
      }
      const assets = await txGetAll<Asset>(tx, "assets");
      let removed = 0;
      for (const a of assets) {
        if (!a.library && !refs.has(a.id)) {
          await txDelete(tx, "assets", a.id);
          removed++;
        }
      }
      return removed;
    },
  );
}

/* ------------------------------------------------------------------ */
/* Artworks                                                            */
/* ------------------------------------------------------------------ */

export async function listArtworks(): Promise<Artwork[]> {
  const all = await getAll<Artwork>("artworks");
  return all.filter((a) => !a.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getArtwork(id: string) {
  return getOne<Artwork>("artworks", id);
}

export async function saveArtwork(art: Artwork) {
  await putOne("artworks", { ...art, updatedAt: Date.now() });
  emitChange();
}

export async function duplicateArtwork(id: string): Promise<Artwork> {
  const src = await getArtwork(id);
  if (!src) {
    throw new Error("Draft not found.");
  }
  const now = Date.now();
  const copy: Artwork = {
    ...structuredClone(src),
    id: newId("aw"),
    name: `${src.name} copy`,
    stickerId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await putOne("artworks", copy);
  emitChange();
  return copy;
}

export async function trashArtwork(id: string) {
  await withTx(["artworks"], "readwrite", async (tx) => {
    const a = await txGet<Artwork>(tx, "artworks", id);
    if (a) {
      await txPut(tx, "artworks", { ...a, deletedAt: Date.now() });
    }
  });
  emitChange();
}

export async function restoreArtwork(id: string) {
  await withTx(["artworks"], "readwrite", async (tx) => {
    const a = await txGet<Artwork>(tx, "artworks", id);
    if (a) {
      await txPut(tx, "artworks", { ...a, deletedAt: null });
    }
  });
  emitChange();
}

export async function purgeArtwork(id: string) {
  await withTx(["artworks"], "readwrite", (tx) => txDelete(tx, "artworks", id));
  await collectGarbage();
  emitChange();
}

/* ------------------------------------------------------------------ */
/* Stickers                                                            */
/* ------------------------------------------------------------------ */

export async function listStickers(): Promise<Sticker[]> {
  const all = await getAll<Sticker>("stickers");
  return all.filter((s) => !s.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSticker(id: string) {
  return getOne<Sticker>("stickers", id);
}

export async function saveSticker(s: Sticker) {
  await putOne("stickers", { ...s, updatedAt: Date.now() });
  emitChange();
}

export async function duplicateSticker(id: string): Promise<Sticker> {
  const src = await getSticker(id);
  if (!src) {
    throw new Error("Sticker not found.");
  }
  const now = Date.now();
  const copy: Sticker = {
    ...structuredClone(src),
    id: newId("sk"),
    name: `${src.name} copy`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await putOne("stickers", copy);
  emitChange();
  return copy;
}

export async function trashSticker(id: string) {
  await withTx(["stickers"], "readwrite", async (tx) => {
    const s = await txGet<Sticker>(tx, "stickers", id);
    if (s) {
      await txPut(tx, "stickers", { ...s, deletedAt: Date.now() });
    }
  });
  emitChange();
}

export async function restoreSticker(id: string) {
  await withTx(["stickers"], "readwrite", async (tx) => {
    const s = await txGet<Sticker>(tx, "stickers", id);
    if (s) {
      await txPut(tx, "stickers", { ...s, deletedAt: null });
    }
  });
  emitChange();
}

export async function purgeSticker(id: string) {
  await withTx(["stickers"], "readwrite", (tx) => txDelete(tx, "stickers", id));
  await collectGarbage();
  emitChange();
}

/* ------------------------------------------------------------------ */
/* Trash                                                               */
/* ------------------------------------------------------------------ */

export interface TrashEntry {
  kind: "notebook" | "page" | "sticker" | "artwork" | "image";
  id: string;
  title: string;
  detail: string;
  deletedAt: number;
}

export async function listTrash(): Promise<TrashEntry[]> {
  return withTx(
    ["notebooks", "pages", "stickers", "artworks", "assets"],
    "readonly",
    async (tx) => {
      const out: TrashEntry[] = [];
      const notebooks = await txGetAll<Notebook>(tx, "notebooks");
      const nbName = new Map(notebooks.map((n) => [n.id, n.name]));
      const pages = await txGetAll<Page>(tx, "pages");
      for (const n of notebooks) {
        if (n.deletedAt) {
          const count = pages.filter((p) => p.notebookId === n.id).length;
          out.push({
            kind: "notebook",
            id: n.id,
            title: n.name,
            detail: `${t("Notebook")} · ${tn(count, "{n} page", "{n} pages")}`,
            deletedAt: n.deletedAt,
          });
        }
      }
      for (const p of pages) {
        if (p.deletedAt) {
          out.push({
            kind: "page",
            id: p.id,
            title: `Page · ${formatDate(p.date)}`,
            detail: `${t("Page")} · ${nbName.get(p.notebookId) ?? t("Unknown notebook")}`,
            deletedAt: p.deletedAt,
          });
        }
      }
      for (const s of await txGetAll<Sticker>(tx, "stickers")) {
        if (s.deletedAt) {
          out.push({
            kind: "sticker",
            id: s.id,
            title: s.name,
            detail: t("Sticker"),
            deletedAt: s.deletedAt,
          });
        }
      }
      for (const a of await txGetAll<Artwork>(tx, "artworks")) {
        if (a.deletedAt) {
          out.push({
            kind: "artwork",
            id: a.id,
            title: a.name,
            detail: t("Draft"),
            deletedAt: a.deletedAt,
          });
        }
      }
      for (const a of await txGetAll<Asset>(tx, "assets")) {
        if (a.library && a.deletedAt) {
          out.push({
            kind: "image",
            id: a.id,
            title: a.name || "Imported image",
            detail: t("Imported image"),
            deletedAt: a.deletedAt,
          });
        }
      }
      return out.sort((a, b) => b.deletedAt - a.deletedAt);
    },
  );
}

export async function restoreTrash(e: TrashEntry) {
  switch (e.kind) {
    case "notebook":
      return restoreNotebook(e.id);
    case "page":
      return restorePage(e.id);
    case "sticker":
      return restoreSticker(e.id);
    case "artwork":
      return restoreArtwork(e.id);
    case "image":
      return restoreAsset(e.id);
  }
}

export async function purgeTrash(e: TrashEntry) {
  switch (e.kind) {
    case "notebook":
      return purgeNotebook(e.id);
    case "page":
      return purgePage(e.id);
    case "sticker":
      return purgeSticker(e.id);
    case "artwork":
      return purgeArtwork(e.id);
    case "image":
      return purgeLibraryAsset(e.id);
  }
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export async function countPagesByNotebook(): Promise<Map<string, Page[]>> {
  const all = await getAll<Page>("pages");
  const map = new Map<string, Page[]>();
  for (const p of all) {
    if (p.deletedAt) {
      continue;
    }
    const arr = map.get(p.notebookId) ?? [];
    arr.push(p);
    map.set(p.notebookId, arr);
  }
  return map;
}

export async function findStickerUsage(): Promise<Map<string, number>> {
  const all = await getAll<Page>("pages");
  const map = new Map<string, number>();
  for (const p of all) {
    if (p.deletedAt) {
      continue;
    }
    for (const o of p.objects) {
      if (o.type === "sticker") {
        map.set(o.snap.stickerId, (map.get(o.snap.stickerId) ?? 0) + 1);
      }
    }
  }
  return map;
}
