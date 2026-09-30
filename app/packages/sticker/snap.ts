import type { Sticker, StickerSnap, StickerVersion } from "../db/types";

export function latestVersion(s: Sticker): StickerVersion | null {
  return s.versions[s.versions.length - 1] ?? null;
}

export function snapFromVersion(s: Sticker, v: StickerVersion): StickerSnap {
  return {
    stickerId: s.id,
    version: v.no,
    name: s.name,
    artAssetId: v.artAssetId,
    shapeAssetId: v.shapeAssetId,
    material: v.material,
    w: v.w,
    h: v.h,
    holoAngle: v.holoAngle,
  };
}

export function snapFromSticker(s: Sticker): StickerSnap | null {
  const v = latestVersion(s);
  return v ? snapFromVersion(s, v) : null;
}
