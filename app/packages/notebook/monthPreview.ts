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
    ? `${monthName(m, true)} · ${monthPages.length} ${monthPages.length === 1 ? "page" : "pages"}`
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
