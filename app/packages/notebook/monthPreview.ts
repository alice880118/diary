import { tn } from "../i18n";
import { monthName } from "../db/id";
import type { MonthlyOverview, Page, StickerObject, StickerSnap } from "../db/types";

export interface MonthPreview {
  ym: string;
  count: number;
  highlight: string;
  highlightManual: boolean;
  sticker: StickerSnap | null;
  stickerManual: boolean;
  samplePage: Page | null;
}

/** Latest page by record date; ties resolved by creation time, not edits. */
export function latestPage(pages: Page[]): Page | null {
  let best: Page | null = null;
  for (const p of pages) {
    if (
      !best ||
      p.date > best.date ||
      (p.date === best.date && p.createdAt > best.createdAt)
    ) {
      best = p;
    }
  }
  return best;
}

export function pageSummary(p: Page, max = 40): string {
  const texts = p.objects
    .filter((o) => o.type === "text" || o.type === "note")
    .sort((a, b) => a.y - b.y)
    .map((o) => (o.type === "text" || o.type === "note" ? o.text.trim() : ""))
    .filter(Boolean);
  const joined = texts.join(" ").replace(/\s+/g, " ");
  return joined.length > max ? `${joined.slice(0, max)}…` : joined;
}

export function firstSticker(p: Page): StickerSnap | null {
  const s = p.objects
    .filter((o): o is StickerObject => o.type === "sticker")
    .sort((a, b) => a.z - b.z)[0];
  return s ? s.snap : null;
}

export function computeMonthPreview(
  ym: string,
  monthPages: Page[],
  overview: MonthlyOverview | undefined,
): MonthPreview {
  const latest = latestPage(monthPages);
  const autoText = latest ? pageSummary(latest) : "";
  const [, m] = ym.split("-").map(Number);
  const fallback = monthPages.length
    ? `${monthName(m, true)} · ${tn(monthPages.length, "{n} page", "{n} pages")}`
    : "";
  const manualText = overview?.highlight?.trim() || "";
  const manualSticker = overview?.sticker ?? null;
  return {
    ym,
    count: monthPages.length,
    highlight: manualText || autoText || fallback,
    highlightManual: Boolean(manualText),
    sticker: manualSticker ?? (latest ? firstSticker(latest) : null),
    stickerManual: Boolean(manualSticker),
    samplePage: latest,
  };
}

/** Stickers on these pages, most used first (one entry per sticker version). */
export function topStickers(pages: Page[], max = 3): StickerSnap[] {
  const count = new Map<string, { snap: StickerSnap; n: number; first: number }>();
  let i = 0;
  for (const p of pages) {
    for (const o of p.objects) {
      if (o.type !== "sticker") continue;
      const key = `${o.snap.stickerId}@${o.snap.version}`;
      const cur = count.get(key);
      if (cur) cur.n++;
      else count.set(key, { snap: o.snap, n: 1, first: i++ });
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, max)
    .map((x) => x.snap);
}

/** First line of the topmost text (or note) on a page. */
export function firstLine(p: Page): string {
  const o = p.objects
    .filter((x) => (x.type === "text" || x.type === "note") && x.text.trim())
    .sort((a, b) => a.y - b.y)[0];
  if (!o || (o.type !== "text" && o.type !== "note")) return "";
  return o.text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

/** Pages grouped by date, each group in reading order. */
export function pagesByDate(pages: Page[]): Map<string, Page[]> {
  const map = new Map<string, Page[]>();
  for (const p of [...pages].sort((a, b) => a.order - b.order)) {
    const arr = map.get(p.date) ?? [];
    arr.push(p);
    map.set(p.date, arr);
  }
  return map;
}

export function stickerCount(pages: Page[]) {
  return pages.reduce((n, p) => n + p.objects.filter((o) => o.type === "sticker").length, 0);
}
