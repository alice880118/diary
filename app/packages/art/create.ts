import { decodeImageFile, downscale } from "../assets/importImage";
import { newId } from "../db/id";
import { putAsset, saveArtwork } from "../db/repo";
import { ART_H, ART_W, type Artwork, type ImageLayer } from "../db/types";

export const WORK_MAX = 1024;

export function blankArtwork(name = "Untitled artwork"): Artwork {
  const now = Date.now();
  return {
    id: newId("aw"),
    name,
    w: ART_W,
    h: ART_H,
    layers: [{ id: newId("ly"), name: "Sketch 1", visible: true, kind: "draw", strokes: [] }],
    texture: { id: "wc-fine", strength: 0.6 },
    print: { enabled: true, layers: [] },
    sticker: {
      material: "white",
      crop: { kind: "contour", rect: { x: 112, y: 112, w: 800, h: 800 }, poly: [] },
      border: 14,
      keepPaper: false,
      holoAngle: 30,
    },
    stickerId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Stores the untouched original plus a working copy, then builds an image layer. */
export async function imageLayerFromFile(file: File, index: number): Promise<ImageLayer> {
  const { img, w, h } = await decodeImageFile(file);
  const original = await putAsset(file, { role: "original", w, h, name: file.name, library: true });
  const work = await downscale(img, WORK_MAX, "image/png");
  const workAsset = await putAsset(work.blob, { role: "work", w: work.w, h: work.h, name: file.name });
  const fit = Math.min((ART_W * 0.8) / work.w, (ART_H * 0.8) / work.h);
  return {
    id: newId("ly"),
    name: `Image ${index}`,
    visible: true,
    kind: "image",
    originalAssetId: original.id,
    workAssetId: workAsset.id,
    maskAssetId: null,
    imgW: work.w,
    imgH: work.h,
    x: ART_W / 2,
    y: ART_H / 2,
    scale: fit,
    rot: 0,
    crop: { l: 0, t: 0, r: 0, b: 0 },
  };
}

export async function imageLayerFromAsset(
  originalAssetId: string,
  blob: Blob,
  name: string,
  index: number,
): Promise<ImageLayer> {
  const file = new File([blob], name || "image.png", { type: blob.type });
  const { img } = await decodeImageFile(file);
  const work = await downscale(img, WORK_MAX, "image/png");
  const workAsset = await putAsset(work.blob, { role: "work", w: work.w, h: work.h, name });
  const fit = Math.min((ART_W * 0.8) / work.w, (ART_H * 0.8) / work.h);
  return {
    id: newId("ly"),
    name: `Image ${index}`,
    visible: true,
    kind: "image",
    originalAssetId,
    workAssetId: workAsset.id,
    maskAssetId: null,
    imgW: work.w,
    imgH: work.h,
    x: ART_W / 2,
    y: ART_H / 2,
    scale: fit,
    rot: 0,
    crop: { l: 0, t: 0, r: 0, b: 0 },
  };
}

export async function createBlankArtwork(): Promise<Artwork> {
  const art = blankArtwork();
  await saveArtwork(art);
  return art;
}

export async function createArtworkFromFile(file: File): Promise<{ art: Artwork; layerId: string }> {
  const layer = await imageLayerFromFile(file, 1);
  const art = blankArtwork(file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Imported artwork");
  art.layers = [layer, { id: newId("ly"), name: "Sketch 1", visible: true, kind: "draw", strokes: [] }];
  await saveArtwork(art);
  return { art, layerId: layer.id };
}
