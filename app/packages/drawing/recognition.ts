/**
 * Stroke recognition for Hold-to-Perfect: decides whether a freehand stroke
 * is close enough to a line, arc, circle or ellipse to be replaced by clean
 * geometry. Each candidate gets a confidence in [0, 1]; nothing is returned
 * below the threshold, so ordinary doodles stay freehand.
 */
import type { ShapeGeom } from "../db/types";
import { pathLength, resample } from "./smoothing.ts";

export type RecognizedKind = "line" | "arc" | "circle" | "ellipse";

export interface Recognition {
  kind: RecognizedKind;
  shape: ShapeGeom;
  confidence: number;
  scores: Record<RecognizedKind, number>;
}

export const CONFIDENCE_THRESHOLD = 0.55;
/** Strokes smaller than this (surface units) are never corrected. */
const MIN_SIZE = 24;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function bounds(pts: number[]) {
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
  return { minX, minY, maxX, maxY, diag: Math.hypot(maxX - minX, maxY - minY) };
}

function centroid(pts: number[]) {
  let x = 0;
  let y = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    x += pts[i];
    y += pts[i + 1];
  }
  return { x: x / n, y: y / n };
}

/** Principal axis angle (radians) of the point cloud. */
function principalAngle(pts: number[], c: { x: number; y: number }) {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - c.x;
    const dy = pts[i + 1] - c.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** Total signed angle swept around (cx, cy), radians. */
function sweepAround(pts: number[], cx: number, cy: number) {
  let total = 0;
  let prev = Math.atan2(pts[1] - cy, pts[0] - cx);
  for (let i = 2; i < pts.length; i += 2) {
    const a = Math.atan2(pts[i + 1] - cy, pts[i] - cx);
    let d = a - prev;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = a;
  }
  return total;
}

function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/** Algebraic (Kåsa) circle fit. */
function fitCircle(pts: number[]) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const sol = solve3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxz, -syz, -sz],
  );
  if (!sol) return null;
  const [D, E, F] = sol;
  const cx = -D / 2;
  const cy = -E / 2;
  const r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let err = 0;
  for (let i = 0; i < pts.length; i += 2) err += (Math.hypot(pts[i] - cx, pts[i + 1] - cy) - r) ** 2;
  return { cx, cy, r, rel: Math.sqrt(err / n) / r };
}

/** Axis-aligned (in the principal frame) ellipse fit around the centroid. */
function fitEllipse(pts: number[]) {
  const c = centroid(pts);
  const ang = principalAngle(pts, c);
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  let x4 = 0, y4 = 0, x2y2 = 0, x2 = 0, y2 = 0;
  const local: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - c.x;
    const dy = pts[i + 1] - c.y;
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    local.push(x, y);
    x4 += x ** 4; y4 += y ** 4; x2y2 += x * x * y * y; x2 += x * x; y2 += y * y;
  }
  const det = x4 * y4 - x2y2 * x2y2;
  if (Math.abs(det) < 1e-9) return null;
  const A = (x2 * y4 - y2 * x2y2) / det;
  const B = (y2 * x4 - x2 * x2y2) / det;
  if (!(A > 0 && B > 0)) return null;
  let err = 0;
  for (let i = 0; i < local.length; i += 2) err += Math.abs(Math.sqrt(local[i] ** 2 * A + local[i + 1] ** 2 * B) - 1);
  return { cx: c.x, cy: c.y, a: 1 / Math.sqrt(A), b: 1 / Math.sqrt(B), ang, rel: err / (local.length / 2) };
}

function movingAverage(pts: number[], radius: number) {
  const n = pts.length / 2;
  const out = pts.slice();
  for (let i = 1; i < n - 1; i++) {
    const r = Math.min(radius, i, n - 1 - i);
    let x = 0;
    let y = 0;
    for (let k = -r; k <= r; k++) {
      x += pts[(i + k) * 2];
      y += pts[(i + k) * 2 + 1];
    }
    out[i * 2] = x / (2 * r + 1);
    out[i * 2 + 1] = y / (2 * r + 1);
  }
  return out;
}

export function recognize(raw: number[]): Recognition | null {
  if (raw.length < 8) return null;
  const b = bounds(raw);
  if (b.diag < MIN_SIZE) return null;
  const L = pathLength(raw);
  const pts = resample(raw, Math.max(2, L / 160)).pts;
  const n = pts.length / 2;
  if (n < 6) return null;

  const sx = pts[0];
  const sy = pts[1];
  const ex = pts[pts.length - 2];
  const ey = pts[pts.length - 1];
  const direct = Math.hypot(ex - sx, ey - sy);
  const scores: Record<RecognizedKind, number> = { line: 0, arc: 0, circle: 0, ellipse: 0 };
  let best: Recognition | null = null;
  const consider = (kind: RecognizedKind, confidence: number, shape: ShapeGeom) => {
    scores[kind] = confidence;
    if (confidence >= CONFIDENCE_THRESHOLD && (!best || confidence > best.confidence)) best = { kind, shape, confidence, scores };
  };

  /* Closed loop → circle / ellipse only. */
  const c0 = centroid(pts);
  const sweepC = Math.abs(sweepAround(pts, c0.x, c0.y));
  const closure = direct / b.diag;
  if (closure < 0.3 && sweepC > Math.PI * 1.65) {
    const e = fitEllipse(pts);
    if (e) {
      const ratio = Math.min(e.a, e.b) / Math.max(e.a, e.b);
      const fit = clamp01(1 - e.rel / 0.12);
      const loop = clamp01((sweepC - Math.PI * 1.65) / (Math.PI * 0.3));
      const close = clamp01(1 - closure / 0.3);
      const conf = fit * (0.6 + 0.25 * loop + 0.15 * close);
      if (ratio > 0.86) {
        const d = e.a + e.b;
        consider("circle", conf, { type: "circle", cx: e.cx, cy: e.cy, w: d, h: d, rot: 0 });
      } else {
        consider("ellipse", conf, { type: "ellipse", cx: e.cx, cy: e.cy, w: e.a * 2, h: e.b * 2, rot: (e.ang * 180) / Math.PI });
      }
    }
    for (const k of ["line", "arc"] as const) scores[k] = 0;
    return best;
  }

  /* Line: nearly as long as its path and close to the chord. */
  if (direct >= MIN_SIZE) {
    const nx = -(ey - sy) / direct;
    const ny = (ex - sx) / direct;
    let maxDev = 0;
    let rms = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.abs((pts[i] - sx) * nx + (pts[i + 1] - sy) * ny);
      maxDev = Math.max(maxDev, d);
      rms += d * d;
    }
    rms = Math.sqrt(rms / n);
    // Measured on a lightly averaged path so hand tremor does not count as length.
    const straight = pathLength(movingAverage(pts, 3)) / direct;
    const conf = clamp01(1 - Math.max(rms / (direct * 0.03), maxDev / (direct * 0.075), (straight - 1) / 0.1));
    consider("line", conf, {
      type: "line",
      cx: (sx + ex) / 2,
      cy: (sy + ey) / 2,
      w: direct,
      h: 0,
      rot: (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI,
    });
    if (conf >= 0.8) return best;
  }

  /* Arc: an open stroke that fits a circle segment well. */
  const circ = fitCircle(pts);
  if (circ && circ.r < b.diag * 3) {
    const sweep = sweepAround(pts, circ.cx, circ.cy);
    const deg = (Math.abs(sweep) * 180) / Math.PI;
    if (deg >= 25 && deg <= 330) {
      const fit = clamp01(1 - circ.rel / 0.07);
      // Very shallow arcs are better treated as lines.
      const bend = clamp01((deg - 25) / 35);
      const conf = fit * (0.55 + 0.45 * bend);
      consider("arc", conf, {
        type: "arc",
        cx: circ.cx,
        cy: circ.cy,
        w: circ.r * 2,
        h: circ.r * 2,
        rot: 0,
        start: Math.atan2(sy - circ.cy, sx - circ.cx),
        sweep,
      });
    }
  }
  return best;
}
