import { newId } from "../db/id";
import { PAGE_H, PAGE_W, type PageObject } from "../db/types";

export function toLocal(o: PageObject, px: number, py: number) {
  const r = (-o.rot * Math.PI) / 180;
  const dx = px - o.x;
  const dy = py - o.y;
  return {
    x: dx * Math.cos(r) - dy * Math.sin(r),
    y: dx * Math.sin(r) + dy * Math.cos(r),
  };
}

export function rotateVec(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

export function hitObjects(objects: PageObject[], px: number, py: number, pad = 0) {
  return objects
    .filter((o) => {
      const l = toLocal(o, px, py);
      return Math.abs(l.x) <= o.w / 2 + pad && Math.abs(l.y) <= o.h / 2 + pad;
    })
    .sort((a, b) => b.z - a.z);
}

export function bounds(o: PageObject) {
  const corners = [
    [-o.w / 2, -o.h / 2],
    [o.w / 2, -o.h / 2],
    [o.w / 2, o.h / 2],
    [-o.w / 2, o.h / 2],
  ].map(([x, y]) => rotateVec(x, y, o.rot));
  const xs = corners.map((c) => c.x + o.x);
  const ys = corners.map((c) => c.y + o.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function isOffPage(o: PageObject) {
  const b = bounds(o);
  return b.maxX < 0 || b.minX > PAGE_W || b.maxY < 0 || b.minY > PAGE_H;
}

export function bringIntoPage<T extends PageObject>(o: T): T {
  const b = bounds(o);
  const hw = (b.maxX - b.minX) / 2;
  const hh = (b.maxY - b.minY) / 2;
  return {
    ...o,
    x: Math.min(Math.max(o.x, Math.min(hw, PAGE_W / 2)), Math.max(PAGE_W - hw, PAGE_W / 2)),
    y: Math.min(Math.max(o.y, Math.min(hh, PAGE_H / 2)), Math.max(PAGE_H - hh, PAGE_H / 2)),
  };
}

export function normalizeZ(objects: PageObject[]): PageObject[] {
  const sorted = [...objects].sort((a, b) => a.z - b.z);
  const zOf = new Map(sorted.map((o, i) => [o.id, i + 1]));
  return objects.map((o) => ({ ...o, z: zOf.get(o.id) ?? o.z }));
}

export function maxZ(objects: PageObject[]) {
  return objects.reduce((m, o) => Math.max(m, o.z), 0);
}

export function shiftZ(objects: PageObject[], id: string, dir: 1 | -1): PageObject[] {
  const norm = normalizeZ(objects).sort((a, b) => a.z - b.z);
  const idx = norm.findIndex((o) => o.id === id);
  const other = norm[idx + dir];
  if (idx < 0 || !other) {
    return objects;
  }
  const a = norm[idx];
  return norm.map((o) =>
    o.id === a.id ? { ...o, z: other.z } : o.id === other.id ? { ...o, z: a.z } : o,
  );
}

export function duplicateObject(o: PageObject, z: number): PageObject {
  return { ...structuredClone(o), id: newId("ob"), x: o.x + 30, y: o.y + 30, z, locked: false };
}

export const OBJECT_LABEL: Record<PageObject["type"], string> = {
  text: "Text",
  image: "Image",
  sticker: "Sticker",
  note: "Sticky note",
  link: "Link",
};
