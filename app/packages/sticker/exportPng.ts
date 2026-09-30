import { loadRuntime } from "../art/runtime";
import { canvasToBlob, loadAssetImage } from "../db/assetUrl";
import type { Sticker, StickerVersion } from "../db/types";
import { buildSticker, composeStickerCanvas } from "./build";

export type ExportQuality = "standard" | "high";

export function exportSize(v: StickerVersion, q: ExportQuality) {
  const k = q === "high" ? 2 : 1;
  return { w: Math.round(v.w * k), h: Math.round(v.h * k) };
}

/**
 * Standard reuses the stored version assets; high quality re-renders the
 * version's artwork snapshot at 2x with the same seeds, masks and offsets.
 */
export async function renderStickerPng(
  v: StickerVersion,
  q: ExportQuality,
  holoAngle = v.holoAngle,
): Promise<Blob> {
  if (q === "standard") {
    const [art, shape] = await Promise.all([loadAssetImage(v.artAssetId), loadAssetImage(v.shapeAssetId)]);
    const { w, h } = exportSize(v, q);
    return canvasToBlob(composeStickerCanvas(art, shape, w, h, v.material, holoAngle));
  }
  const snap = v.artworkSnapshot;
  const rt = await loadRuntime(snap);
  if (rt.missing.size) {
    throw new Error("Some original assets are missing, so high quality export isn't available. Try standard quality instead.");
  }
  const built = buildSticker({ ...snap, sticker: { ...snap.sticker, material: v.material } }, rt, 2);
  return canvasToBlob(
    composeStickerCanvas(built.art, built.shape, built.art.width, built.art.height, v.material, holoAngle),
  );
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Hands the file to the system share sheet, falling back to a download. */
export async function saveOrShare(blob: Blob, filename: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // Fall through to download when sharing is not permitted.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

export function stickerFileName(s: Sticker, v: StickerVersion, q: ExportQuality) {
  const safe = s.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "sticker";
  return `${safe}_v${v.no}${q === "high" ? "_hq" : ""}.png`;
}
