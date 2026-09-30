import { canvasToBlob, loadAssetImage } from "../db/assetUrl";
import { putAsset } from "../db/repo";
import { ART_H, ART_W, type Artwork } from "../db/types";

/**
 * In-memory decoded assets for one artwork. Masks are editable canvases;
 * every persisted edit produces a new immutable asset.
 */
export interface ArtRuntime {
  images: Map<string, HTMLImageElement>;
  /** Print layer id -> ART_W x ART_H mask canvas (alpha = coverage). */
  printMasks: Map<string, HTMLCanvasElement>;
  /** Image layer id -> work-size removal mask canvas. */
  imageMasks: Map<string, HTMLCanvasElement>;
  missing: Set<string>;
}

export function createCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Couldn't create a 2D canvas.");
  }
  return ctx;
}

async function imageToCanvas(id: string, w: number, h: number) {
  const img = await loadAssetImage(id);
  const c = createCanvas(w, h);
  ctx2d(c).drawImage(img, 0, 0, w, h);
  return c;
}

export async function loadRuntime(art: Artwork, prev?: ArtRuntime): Promise<ArtRuntime> {
  const rt: ArtRuntime = {
    images: prev?.images ?? new Map(),
    printMasks: new Map(),
    imageMasks: new Map(),
    missing: new Set(),
  };
  const jobs: Promise<void>[] = [];
  for (const l of art.layers) {
    if (l.kind !== "image") continue;
    if (!rt.images.has(l.workAssetId)) {
      jobs.push(
        loadAssetImage(l.workAssetId)
          .then((img) => {
            rt.images.set(l.workAssetId, img);
          })
          .catch(() => {
            rt.missing.add(l.workAssetId);
          }),
      );
    }
    if (l.maskAssetId) {
      const maskId = l.maskAssetId;
      const reuse = prev?.imageMasks.get(l.id);
      if (reuse && reuse.dataset.asset === maskId) {
        rt.imageMasks.set(l.id, reuse);
      } else {
        jobs.push(
          imageToCanvas(maskId, l.imgW, l.imgH)
            .then((c) => {
              c.dataset.asset = maskId;
              rt.imageMasks.set(l.id, c);
            })
            .catch(() => {
              rt.missing.add(maskId);
            }),
        );
      }
    }
  }
  for (const p of art.print.layers) {
    const reuse = prev?.printMasks.get(p.id);
    if (reuse && (reuse.dataset.asset ?? "") === (p.maskAssetId ?? "")) {
      rt.printMasks.set(p.id, reuse);
      continue;
    }
    if (!p.maskAssetId) {
      const c = createCanvas(ART_W, ART_H);
      c.dataset.asset = "";
      rt.printMasks.set(p.id, c);
      continue;
    }
    const maskId = p.maskAssetId;
    jobs.push(
      imageToCanvas(maskId, ART_W, ART_H)
        .then((c) => {
          c.dataset.asset = maskId;
          rt.printMasks.set(p.id, c);
        })
        .catch(() => {
          rt.missing.add(maskId);
          const c = createCanvas(ART_W, ART_H);
          c.dataset.asset = maskId;
          rt.printMasks.set(p.id, c);
        }),
    );
  }
  await Promise.all(jobs);
  return rt;
}

export function maskHasContent(c: HTMLCanvasElement | undefined): boolean {
  if (!c) return false;
  const small = createCanvas(64, 64);
  const ctx = ctx2d(small);
  ctx.drawImage(c, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 8) return true;
  }
  return false;
}

export async function persistMask(c: HTMLCanvasElement, name: string): Promise<string> {
  const blob = await canvasToBlob(c);
  const a = await putAsset(blob, { role: "mask", w: c.width, h: c.height, name });
  c.dataset.asset = a.id;
  return a.id;
}
