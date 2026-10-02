import { t } from "../i18n";
import { canvasToBlob, loadImage } from "../db/assetUrl";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_DECODE_SIDE = 8000;

export class ImportError extends Error {}

export interface DecodedImage {
  img: HTMLImageElement;
  w: number;
  h: number;
}

/** Checks format, file size and decoded dimensions before anything is stored. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new ImportError(t("Unsupported format ({type}). Use PNG, JPEG or WebP.", { type: file.type || "unknown" }));
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError(t("File is too large ({mb} MB). The limit is 20 MB.", { mb: (file.size / 1048576).toFixed(1) }));
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new ImportError("Couldn't decode the image. The file may be damaged.");
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) {
      throw new ImportError("Invalid image dimensions.");
    }
    if (w > MAX_DECODE_SIDE || h > MAX_DECODE_SIDE) {
      throw new ImportError(t("Image is {w}×{h}, which exceeds the {max}px limit.", { w, h, max: MAX_DECODE_SIDE }));
    }
    return { img, w, h };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Downscales so the long side is <= maxSide; keeps PNG when alpha may matter. */
export async function downscale(
  img: HTMLImageElement,
  maxSide: number,
  type: "image/png" | "image/jpeg" | "image/webp" = "image/png",
): Promise<{ blob: Blob; w: number; h: number }> {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new ImportError("Couldn't create a canvas.");
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(c, type, type === "image/png" ? undefined : 0.9);
  return { blob, w, h };
}

export function pickFile(accept = ACCEPT_ATTR): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
