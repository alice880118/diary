import type { LinkDisplay, LinkMeta } from "../db/types";

/** Only http/https are accepted; anything else (javascript:, data:) is rejected. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return null;
    }
    if (!u.hostname.includes(".") && u.hostname !== "localhost") {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

export function openExternal(url: string) {
  const safe = normalizeUrl(url);
  if (safe) {
    window.open(safe, "_blank", "noopener,noreferrer");
  }
}

function metaContent(doc: Document, names: string[]): string | undefined {
  for (const n of names) {
    const el =
      doc.querySelector(`meta[property="${n}"]`) ?? doc.querySelector(`meta[name="${n}"]`);
    const v = el?.getAttribute("content")?.trim();
    if (v) {
      return v;
    }
  }
  return undefined;
}

/**
 * Best-effort metadata straight from the site. Most sites block cross-origin
 * reads, in which case the link is kept as a simple card. No third-party
 * proxy is used, and the returned HTML is only parsed, never executed.
 */
export async function fetchLinkMeta(url: string, timeoutMs = 6000): Promise<LinkMeta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) {
      return { status: "fail", fetchedAt: Date.now() };
    }
    const text = (await res.text()).slice(0, 400_000);
    const doc = new DOMParser().parseFromString(text, "text/html");
    const title = metaContent(doc, ["og:title", "twitter:title"]) ?? doc.title?.trim();
    const description = metaContent(doc, ["og:description", "description", "twitter:description"]);
    const imgRaw = metaContent(doc, ["og:image", "twitter:image"]);
    let image: string | undefined;
    if (imgRaw) {
      try {
        const abs = new URL(imgRaw, url);
        if (abs.protocol === "https:" || abs.protocol === "http:") {
          image = abs.href;
        }
      } catch {
        image = undefined;
      }
    }
    return {
      status: "ok",
      siteTitle: title?.slice(0, 120),
      description: description?.slice(0, 200),
      image,
      fetchedAt: Date.now(),
    };
  } catch {
    return { status: "fail", fetchedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Box size for a link object. Card and text keep their v1 sizes so existing
 * links never move or resize unless the user changes how they're displayed.
 */
const TAG_FONT = '"Poppins", "Noto Sans TC", "PingFang TC", sans-serif';
let measureCtx: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 13;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 13;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Tag width that just fits the icon, title and (when different) host; mirrors LinkView's tag layout. */
export function linkTagWidth(title: string, host: string): number {
  let w = 4 + 36 + 30; // border, side padding, icon
  w += 10 + textWidth(title, `600 24px ${TAG_FONT}`);
  if (host && host !== title) w += 10 + textWidth(host, `400 20px ${TAG_FONT}`);
  return Math.round(Math.min(860, Math.max(140, w + 6)));
}

export function linkBox(display: LinkDisplay, prevW?: number): { w: number; h: number } {
  switch (display) {
    case "card":
      return { w: prevW === undefined ? 640 : Math.max(prevW, 560), h: 170 };
    case "sticker":
      return { w: 180, h: 180 };
    case "tag":
      return { w: 520, h: 64 };
    default:
      return { w: 520, h: 60 };
  }
}
