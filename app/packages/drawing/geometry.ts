/**
 * Shape geometry: turns a ShapeGeom into outline polylines (rendered by the
 * same brush renderers as freehand strokes), plus hit testing and the box
 * transforms used by the selection box. Pure functions, no DOM.
 */
import type { ShapeGeom, ShapeType } from "../db/types";

export interface Polyline {
  /** Flat x, y list in surface coordinates. */
  pts: number[];
  closed: boolean;
}

export const SHAPE_TYPES: { id: ShapeType; label: string }[] = [
  { id: "rect", label: "Rectangle" },
  { id: "roundRect", label: "Rounded" },
  { id: "circle", label: "Circle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "triangle", label: "Triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
];

/** Shapes that are a single open path; they have no fill. */
export function isOpenShape(t: ShapeType) {
  return t === "line" || t === "arrow" || t === "arc";
}

const TAU = Math.PI * 2;

/** Local (unrotated, centered) outline points for a unit description of the shape. */
function localOutline(g: ShapeGeom): Polyline[] {
  const hw = g.w / 2;
  const hh = g.h / 2;
  const poly = (pts: [number, number][]): Polyline => ({ pts: pts.flat(), closed: true });
  const regular = (n: number, rotOffset: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = rotOffset + (i / n) * TAU;
      out.push([Math.cos(a) * hw, Math.sin(a) * hh]);
    }
    return poly(out);
  };
  const ellipse = (from: number, sweep: number, closed: boolean): Polyline => {
    const steps = Math.max(12, Math.ceil((Math.abs(sweep) / TAU) * 96));
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      if (closed && i === steps) break;
      const a = from + (sweep * i) / steps;
      pts.push(Math.cos(a) * hw, Math.sin(a) * hh);
    }
    return { pts, closed };
  };
  switch (g.type) {
    case "rect":
      return [poly([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]])];
    case "roundRect": {
      const r = Math.min(Math.abs(hw), Math.abs(hh)) * 0.36;
      const pts: number[] = [];
      const corners: [number, number, number][] = [
        [hw - r, -hh + r, -Math.PI / 2],
        [hw - r, hh - r, 0],
        [-hw + r, hh - r, Math.PI / 2],
        [-hw + r, -hh + r, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= 8; i++) {
          const a = a0 + (i / 8) * (Math.PI / 2);
          pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
      }
      return [{ pts, closed: true }];
    }
    case "circle":
    case "ellipse":
      return [ellipse(-Math.PI / 2, TAU, true)];
    case "arc":
      return [ellipse(g.start ?? 0, g.sweep ?? Math.PI, false)];
    case "triangle":
      return [poly([[0, -hh], [hw, hh], [-hw, hh]])];
    case "diamond":
      return [poly([[0, -hh], [hw, 0], [0, hh], [-hw, 0]])];
    case "pentagon":
      return [regular(5, -Math.PI / 2)];
    case "hexagon":
      return [regular(6, 0)];
    case "star": {
      const out: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * TAU;
        const k = i % 2 === 0 ? 1 : 0.45;
        out.push([Math.cos(a) * hw * k, Math.sin(a) * hh * k]);
      }
      return [poly(out)];
    }
    case "line":
      return [{ pts: [-hw, 0, hw, 0], closed: false }];
    case "arrow": {
      const head = Math.min(Math.abs(g.w) * 0.3, 40 + Math.abs(g.w) * 0.06);
      return [
        { pts: [-hw, 0, hw, 0], closed: false },
        { pts: [hw - head, -head * 0.6, hw, 0, hw - head, head * 0.6], closed: false },
      ];
    }
  }
}

function toWorld(g: ShapeGeom, lines: Polyline[]): Polyline[] {
  const a = (g.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return lines.map((l) => {
    const pts = new Array<number>(l.pts.length);
    for (let i = 0; i < l.pts.length; i += 2) {
      const x = l.pts[i];
      const y = l.pts[i + 1];
      pts[i] = g.cx + x * c - y * s;
      pts[i + 1] = g.cy + x * s + y * c;
    }
    return { pts, closed: l.closed };
  });
}

/** Outline polylines in surface coordinates. */
export function shapeOutline(g: ShapeGeom): Polyline[] {
  return toWorld(g, localOutline(g));
}

/** One flat point list (closed outlines repeat their first point) for the legacy `points` field. */
export function shapeFallbackPoints(g: ShapeGeom): number[] {
  const out: number[] = [];
  for (const l of shapeOutline(g)) {
    out.push(...l.pts);
    if (l.closed && l.pts.length >= 2) out.push(l.pts[0], l.pts[1]);
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

/* ------------------------------------------------------------------ */
/* Boxes and transforms                                                */
/* ------------------------------------------------------------------ */

/** Oriented box: center, size, rotation in degrees. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export function boxOfShape(g: ShapeGeom, minThickness = 0): Box {
  return { cx: g.cx, cy: g.cy, w: Math.abs(g.w), h: Math.max(Math.abs(g.h), minThickness), rot: g.rot };
}

export function boxOfPoints(pts: number[], pad = 0): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
    rot: 0,
  };
}

/** Point in the box's local (unrotated, centered) frame. */
export function toLocal(b: Box, x: number, y: number) {
  const a = (-b.rot * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function fromLocal(b: Box, x: number, y: number) {
  const a = (b.rot * Math.PI) / 180;
  return { x: b.cx + x * Math.cos(a) - y * Math.sin(a), y: b.cy + x * Math.sin(a) + y * Math.cos(a) };
}

export function boxCorners(b: Box) {
  const hw = b.w / 2;
  const hh = b.h / 2;
  return [fromLocal(b, -hw, -hh), fromLocal(b, hw, -hh), fromLocal(b, hw, hh), fromLocal(b, -hw, hh)];
}

/**
 * Resize by dragging corner `corner` (0 TL, 1 TR, 2 BR, 3 BL) to (x, y);
 * the opposite corner stays put. Sizes keep their sign so flips are allowed.
 */
export function resizeBox(b: Box, corner: number, x: number, y: number, minSize = 8): Box {
  const sx = corner === 1 || corner === 2 ? 1 : -1;
  const sy = corner === 2 || corner === 3 ? 1 : -1;
  const anchor = fromLocal(b, (-sx * b.w) / 2, (-sy * b.h) / 2);
  const p = toLocal({ ...b, cx: anchor.x, cy: anchor.y }, x, y);
  let w = p.x * sx;
  let h = p.y * sy;
  if (Math.abs(w) < minSize) w = minSize * Math.sign(w || 1);
  if (Math.abs(h) < minSize) h = b.h === 0 ? 0 : minSize * Math.sign(h || 1);
  const c = fromLocal({ ...b, cx: anchor.x, cy: anchor.y }, (sx * w) / 2, (sy * h) / 2);
  return { cx: c.x, cy: c.y, w: Math.abs(w), h: Math.abs(h), rot: b.rot };
}

/** Rotation (degrees) so the box's top-center handle points at (x, y). */
export function rotateTowards(b: Box, x: number, y: number) {
  const deg = (Math.atan2(y - b.cy, x - b.cx) * 180) / Math.PI + 90;
  return ((deg % 360) + 540) % 360 - 180;
}

/** Applies the change from box `from` to box `to` to a flat point list. */
export function mapPoints(pts: number[], from: Box, to: Box): number[] {
  const kx = from.w ? to.w / from.w : 1;
  const ky = from.h ? to.h / from.h : 1;
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const l = toLocal(from, pts[i], pts[i + 1]);
    const p = fromLocal(to, l.x * kx, l.y * ky);
    out[i] = Math.round(p.x * 10) / 10;
    out[i + 1] = Math.round(p.y * 10) / 10;
  }
  return out;
}

export function shapeFromBox(g: ShapeGeom, b: Box): ShapeGeom {
  return { ...g, cx: b.cx, cy: b.cy, w: b.w, h: g.type === "line" || g.type === "arrow" ? g.h : b.h, rot: b.rot };
}

/* ------------------------------------------------------------------ */
/* Hit testing                                                         */
/* ------------------------------------------------------------------ */

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolyline(pts: number[], x: number, y: number, closed = false) {
  if (pts.length < 4) return pts.length === 2 ? Math.hypot(x - pts[0], y - pts[1]) : Infinity;
  let d = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) d = Math.min(d, segDist(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  if (closed) d = Math.min(d, segDist(x, y, pts[pts.length - 2], pts[pts.length - 1], pts[0], pts[1]));
  return d;
}

export function pointInPolygon(pts: number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether (x, y) touches a shape: its outline within `tol`, or its inside when filled. */
export function hitShape(g: ShapeGeom, filled: boolean, width: number, x: number, y: number, tol: number) {
  for (const l of shapeOutline(g)) {
    if (distToPolyline(l.pts, x, y, l.closed) <= width / 2 + tol) return true;
    if (filled && l.closed && pointInPolygon(l.pts, x, y)) return true;
  }
  return false;
}
