import type { ArtRuntime } from "../art/runtime";
import { newId } from "../db/id";
import { getSticker, putAsset, saveArtwork, saveSticker } from "../db/repo";
import type { Artwork, Sticker, StickerVersion } from "../db/types";
import { buildSticker, builtToBlobs } from "./build";

/**
 * Each finish appends an immutable version; pages keep referencing the
 * version they were pasted with until the user explicitly updates them.
 */
export async function finishSticker(
  art: Artwork,
  rt: ArtRuntime,
  meta: { name: string; category: string },
): Promise<{ sticker: Sticker; version: StickerVersion; artwork: Artwork }> {
  const built = buildSticker(art, rt, 1);
  const blobs = await builtToBlobs(built);
  const [artAsset, shapeAsset] = await Promise.all([
    putAsset(blobs.art, { role: "art", w: built.art.width, h: built.art.height, name: meta.name }),
    putAsset(blobs.shape, { role: "shape", w: built.shape.width, h: built.shape.height, name: meta.name }),
  ]);
  const existing = art.stickerId ? await getSticker(art.stickerId) : undefined;
  const now = Date.now();
  const sticker: Sticker =
    existing && !existing.deletedAt
      ? { ...existing, name: meta.name, category: meta.category }
      : {
          id: newId("sk"),
          name: meta.name,
          category: meta.category,
          versions: [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
  const artwork: Artwork = { ...art, name: meta.name, stickerId: sticker.id };
  const version: StickerVersion = {
    no: (sticker.versions[sticker.versions.length - 1]?.no ?? 0) + 1,
    artworkId: art.id,
    artworkSnapshot: structuredClone(artwork),
    material: art.sticker.material,
    artAssetId: artAsset.id,
    shapeAssetId: shapeAsset.id,
    w: built.w,
    h: built.h,
    holoAngle: art.sticker.holoAngle,
    createdAt: now,
  };
  const next: Sticker = { ...sticker, versions: [...sticker.versions, version] };
  await saveSticker(next);
  await saveArtwork(artwork);
  return { sticker: next, version, artwork };
}
