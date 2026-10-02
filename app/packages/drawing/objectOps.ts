/**
 * Operations on drawing objects (freehand strokes and shapes) shared by the
 * studio canvas and page handwriting: hit testing, selection boxes,
 * box transforms and duplication.
 */
import { newId } from "../db/id";
import type { Stroke } from "../db/types";
import {
  boxOfPoints,
  boxOfShape,
  distToPolyline,
  hitShape,
  mapPoints,
  resizeBox,
  rotateTowards,
  shapeFallbackPoints,
  shapeFromBox,
  type Box,
} from "./geometry";
import type { BoxOp } from "./TransformBox";

export function strokeBox(st: Stroke): Box {
  return st.shape ? boxOfShape(st.shape, st.width) : boxOfPoints(st.points, st.width / 2);
}

export function hitStroke(st: Stroke, x: number, y: number, tol: number) {
  if (st.mode === "erase") return false;
  return st.shape
    ? hitShape(st.shape, st.fill?.kind === "solid", st.outline === false ? 0 : st.width, x, y, tol)
    : distToPolyline(st.points, x, y) <= st.width / 2 + tol;
}

/** Topmost object under (x, y), or null. */
export function pickStroke(list: Stroke[], x: number, y: number, tol: number): Stroke | null {
  for (let i = list.length - 1; i >= 0; i--) if (hitStroke(list[i], x, y, tol)) return list[i];
  return null;
}

/** New box for a drag of `op` from `start` to `p`, starting from box `b0`. */
export function dragBox(b0: Box, op: BoxOp, p: { x: number; y: number }, start: { x: number; y: number }): Box {
  if (op === "move") return { ...b0, cx: b0.cx + p.x - start.x, cy: b0.cy + p.y - start.y };
  if (op === "rotate") return { ...b0, rot: rotateTowards(b0, p.x, p.y) };
  return resizeBox(b0, op, p.x, p.y);
}

/** Applies the change from box `from` to box `to` to an object. */
export function transformStroke(st: Stroke, from: Box, to: Box): Stroke {
  if (st.shape) {
    const g = shapeFromBox(st.shape, to);
    return { ...st, shape: g, points: shapeFallbackPoints(g) };
  }
  return { ...st, points: mapPoints(st.points, from, to) };
}

export function duplicateStroke(st: Stroke, offset = 24): Stroke {
  if (st.shape) {
    const g = { ...st.shape, cx: st.shape.cx + offset, cy: st.shape.cy + offset };
    return { ...st, id: newId("st"), shape: g, points: shapeFallbackPoints(g) };
  }
  return { ...st, id: newId("st"), points: st.points.map((v) => v + offset) };
}

/** Union box (unrotated) of several objects, or null when empty. */
export function groupBox(list: Stroke[]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const st of list) {
    const b = strokeBox(st);
    const r = (b.rot * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(r)) * b.w + Math.abs(Math.sin(r)) * b.h) / 2;
    const hh = (Math.abs(Math.sin(r)) * b.w + Math.abs(Math.cos(r)) * b.h) / 2;
    minX = Math.min(minX, b.cx - hw);
    maxX = Math.max(maxX, b.cx + hw);
    minY = Math.min(minY, b.cy - hh);
    maxY = Math.max(maxY, b.cy + hh);
  }
  if (!Number.isFinite(minX)) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, rot: 0 };
}

/**
 * Applies a group box change to one member: points (or the shape's center)
 * follow the group, and line width scales with the group so the drawing keeps
 * its look.
 */
export function transformStrokeInGroup(st: Stroke, from: Box, to: Box): Stroke {
  const kx = from.w ? to.w / from.w : 1;
  const ky = from.h ? to.h / from.h : 1;
  const kw = Math.sqrt(Math.abs(kx * ky)) || 1;
  const width = Math.max(0.5, st.width * kw);
  if (st.shape) {
    const [cx, cy] = mapPoints([st.shape.cx, st.shape.cy], from, to);
    const g = { ...st.shape, cx, cy, w: st.shape.w * kx, h: st.shape.h * ky, rot: st.shape.rot + (to.rot - from.rot) };
    return { ...st, width, shape: g, points: shapeFallbackPoints(g) };
  }
  return { ...st, width, points: mapPoints(st.points, from, to) };
}
