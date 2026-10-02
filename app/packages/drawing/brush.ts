/**
 * Brush renderers. A stroke's geometry (freehand points or a shape outline)
 * is turned into pixels here, so freehand lines and shapes share the exact
 * same look for a given brush.
 *
 * Textured brushes (crayon, chalk, oil pastel, dry brush) are stamp based:
 * an irregular tip mask is stamped along the path with seeded jitter, the
 * stamps are tinted, then paper "tooth" is knocked out with a grain pattern
 * anchored to the surface, which gives the broken edges, speckles and gaps of
 * a real crayon. Everything is seeded, so a stroke renders identically on
 * every redraw and at any export scale.
 */
import type { BrushKind, Stroke } from "../db/types";
import type { Polyline } from "./geometry";

export interface BrushDef {
  id: BrushKind;
  label: string;
  textured: boolean;
}

export const BRUSHES: BrushDef[] = [
  { id: "pen", label: "Pen", textured: false },
  { id: "marker", label: "Marker", textured: false },
  { id: "pencil", label: "Pencil", textured: false },
  { id: "crayon", label: "Crayon", textured: true },
  { id: "pastel", label: "Oil pastel", textured: true },
  { id: "chalk", label: "Chalk", textured: true },
  { id: "dryBrush", label: "Dry brush", textured: true },
];

export function isTextured(b: BrushKind) {
  return b === "crayon" || b === "chalk" || b === "pastel" || b === "dryBrush";
}

interface TexParams {
  /** Stamp spacing as a fraction of the brush width. */
  spacing: number;
  /** Sideways scatter, fraction of width. */
  scatter: number;
  sizeJitter: number;
  /** Per-stamp alpha. */
  flow: number;
  /** Default paper-tooth knockout strength. */
  grain: number;
  /** Tip edge roughness. */
  rough: number;
  /** Tip interior speckle. */
  speckle: number;
  /** Rotate stamps along the stroke direction (bristles). */
  directional: boolean;
  /** Tip aspect (height / width) for directional tips. */
  aspect: number;
  /** Where the tip starts to fade (0..1 of the radius); higher = crisper broken edge. */
  edge: number;
}

const TEX: Record<"crayon" | "chalk" | "pastel" | "dryBrush", TexParams> = {
  crayon: { spacing: 0.1, scatter: 0.1, sizeJitter: 0.16, flow: 0.62, grain: 0.85, rough: 0.5, speckle: 0.35, directional: false, aspect: 1, edge: 0.88 },
  pastel: { spacing: 0.08, scatter: 0.06, sizeJitter: 0.1, flow: 0.7, grain: 0.55, rough: 0.3, speckle: 0.2, directional: false, aspect: 1, edge: 0.78 },
  chalk: { spacing: 0.1, scatter: 0.14, sizeJitter: 0.18, flow: 0.32, grain: 0.95, rough: 0.45, speckle: 0.55, directional: false, aspect: 1, edge: 0.7 },
  dryBrush: { spacing: 0.06, scatter: 0.02, sizeJitter: 0.05, flow: 0.45, grain: 0.6, rough: 0.15, speckle: 0.1, directional: true, aspect: 0.45, edge: 0.85 },
};

export function defaultTexture(b: BrushKind) {
  return isTextured(b) ? 0.7 : 0;
}

/* ------------------------------------------------------------------ */
/* Seeded randomness and periodic noise                                */
/* ------------------------------------------------------------------ */

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function strokeSeed(s: Stroke) {
  return s.seed ?? hashString(s.id);
}

function hash2(ix: number, iy: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise that tiles every `period` lattice cells. */
function periodicNoise(x: number, y: number, period: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash2(w(ix), w(iy), seed);
  const b = hash2(w(ix + 1), w(iy), seed);
  const c = hash2(w(ix), w(iy + 1), seed);
  const d = hash2(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/* ------------------------------------------------------------------ */
/* Tip masks and paper grain                                           */
/* ------------------------------------------------------------------ */

const TIP_PX = 64;
const tipCache = new Map<string, HTMLCanvasElement[]>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** A few seeded variants of an irregular tip (alpha only, drawn in black). */
function tips(kind: keyof typeof TEX): HTMLCanvasElement[] {
  const hit = tipCache.get(kind);
  if (hit) return hit;
  const p = TEX[kind];
  const out: HTMLCanvasElement[] = [];
  for (let v = 0; v < 6; v++) {
    const c = makeCanvas(TIP_PX, TIP_PX);
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    const img = ctx.createImageData(TIP_PX, TIP_PX);
    const r0 = TIP_PX / 2;
    const seed = 1000 + v * 77 + kind.length * 13;
    for (let y = 0; y < TIP_PX; y++) {
      for (let x = 0; x < TIP_PX; x++) {
        let dx = (x + 0.5 - r0) / r0;
        let dy = (y + 0.5 - r0) / r0;
        if (p.directional) dy /= p.aspect;
        const ang = Math.atan2(dy, dx);
        // Edge radius wobbles with angle: rough, not a clean circle.
        const edge = 1 - p.rough * 0.5 + p.rough * 0.5 * periodicNoise((ang / (Math.PI * 2) + 0.5) * 9, v * 3.1, 9, seed);
        const d = Math.hypot(dx, dy) / edge;
        if (d >= 1) continue;
        let a = d < p.edge ? 1 : 1 - (d - p.edge) / (1 - p.edge);
        if (p.directional) {
          // Bristle streaks: bands across the tip's short axis.
          const band = periodicNoise(0.5, (dy * 0.5 + 0.5) * 14, 14, seed + 5);
          a *= band < 0.42 ? 0.15 : 1;
        }
        const sp = periodicNoise(x / 3.2, y / 3.2, 20, seed + 9);
        if (sp < p.speckle * 0.55) a *= 0.2;
        const i = (y * TIP_PX + x) * 4;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  tipCache.set(kind, out);
  return out;
}

/** Grain tile size in surface units, and its resolution. */
const GRAIN_UNITS = 256;
const GRAIN_PX = 512;
let grainTile: HTMLCanvasElement | null = null;

/** Paper tooth: alpha marks where pigment skips over the paper's high points. */
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = makeCanvas(GRAIN_PX, GRAIN_PX);
  const ctx = c.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(GRAIN_PX, GRAIN_PX);
    const k = GRAIN_UNITS / GRAIN_PX;
    for (let y = 0; y < GRAIN_PX; y++) {
      for (let x = 0; x < GRAIN_PX; x++) {
        const u = x * k;
        const v = y * k;
        // Paper tooth: specks of a few units plus coarser patches so gaps cluster
        // like crayon skipping over the paper (periods divide the tile size).
        const fine = periodicNoise(u / 2, v / 2, GRAIN_UNITS / 2, 31);
        const mid = periodicNoise(u / 4, v / 4, GRAIN_UNITS / 4, 47);
        const coarse = periodicNoise(u / 16, v / 16, GRAIN_UNITS / 16, 53);
        const t = fine * 0.35 + mid * 0.4 + coarse * 0.25;
        const a = Math.max(0, Math.min(1, (t - 0.5) / 0.14));
        img.data[(y * GRAIN_PX + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  grainTile = c;
  return c;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export interface RenderStyle {
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
  texture?: number;
  seed: number;
  pressure?: number[];
}

function lineBounds(lines: Polyline[], pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of lines)
    for (let i = 0; i < l.pts.length; i += 2) {
      minX = Math.min(minX, l.pts[i]);
      maxX = Math.max(maxX, l.pts[i]);
      minY = Math.min(minY, l.pts[i + 1]);
      maxY = Math.max(maxY, l.pts[i + 1]);
    }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

const MAX_OFF = 4096;

/** Device pixels per surface unit for the context's current transform. */
function ctxScale(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/** Renders into an offscreen buffer sized to the stroke, then composites once. */
function withBuffer(
  ctx: CanvasRenderingContext2D,
  lines: Polyline[],
  pad: number,
  opacity: number,
  paint: (o: CanvasRenderingContext2D, scale: number, b: { x: number; y: number; w: number; h: number }) => void,
) {
  const b = lineBounds(lines, pad);
  if (!(b.w > 0 && b.h > 0)) return;
  let scale = ctxScale(ctx);
  scale = Math.min(scale, MAX_OFF / b.w, MAX_OFF / b.h);
  const off = makeCanvas(b.w * scale, b.h * scale);
  const o = off.getContext("2d");
  if (!o) return;
  o.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
  paint(o, scale, b);
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.drawImage(off, b.x, b.y, off.width / scale, off.height / scale);
  ctx.restore();
}

function texturedStamps(o: CanvasRenderingContext2D, lines: Polyline[], st: RenderStyle, kind: keyof typeof TEX) {
  const p = TEX[kind];
  const tipList = tips(kind);
  if (!tipList.length) return;
  const rnd = mulberry(st.seed);
  const step = Math.max(0.5, st.width * p.spacing);
  let pIndex = 0;
  for (const l of lines) {
    const pts = l.closed && l.pts.length >= 4 ? [...l.pts, l.pts[0], l.pts[1]] : l.pts;
    const n = pts.length / 2;
    if (n === 1) {
      o.globalAlpha = p.flow;
      o.drawImage(tipList[0], pts[0] - st.width / 2, pts[1] - st.width / 2, st.width, st.width);
      continue;
    }
    let carry = 0;
    for (let i = 1; i < n; i++) {
      const ax = pts[(i - 1) * 2];
      const ay = pts[(i - 1) * 2 + 1];
      const bx = pts[i * 2];
      const by = pts[i * 2 + 1];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg === 0) continue;
      const ux = (bx - ax) / seg;
      const uy = (by - ay) / seg;
      // Sparse input points mean a fast stroke: a little less pigment.
      const speed = Math.max(0.78, Math.min(1, 1.12 - (seg / st.width) * 0.06));
      const pa = st.pressure?.[pIndex + i - 1] ?? 1;
      const pb = st.pressure?.[pIndex + i] ?? pa;
      let t = carry;
      while (t <= seg) {
        const u = t / seg;
        const pr = st.pressure ? pa + (pb - pa) * u : 1;
        const sizeK = st.pressure ? 0.35 + 0.65 * pr : 1;
        const size = st.width * sizeK * (1 + (rnd() - 0.5) * 2 * p.sizeJitter);
        const off = (rnd() - 0.5) * 2 * p.scatter * st.width;
        const x = ax + (bx - ax) * u - uy * off;
        const y = ay + (by - ay) * u + ux * off;
        const tip = tipList[Math.floor(rnd() * tipList.length)];
        const ang = p.directional ? Math.atan2(uy, ux) + Math.PI / 2 + (rnd() - 0.5) * 0.2 : rnd() * Math.PI * 2;
        o.globalAlpha = Math.min(1, p.flow * speed * (st.pressure ? 0.55 + 0.45 * pr : 1) * (0.75 + rnd() * 0.5));
        o.save();
        o.translate(x, y);
        o.rotate(ang);
        o.drawImage(tip, -size / 2, -size / 2, size, size);
        o.restore();
        t += step;
      }
      carry = t - seg;
    }
    pIndex += l.pts.length / 2;
  }
}

function renderTextured(ctx: CanvasRenderingContext2D, lines: Polyline[], st: RenderStyle) {
  const kind = st.brush as keyof typeof TEX;
  const p = TEX[kind];
  const strength = st.texture ?? defaultTexture(st.brush);
  withBuffer(ctx, lines, st.width * (0.7 + p.scatter), st.opacity, (o, _scale, b) => {
    texturedStamps(o, lines, st, kind);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "source-in";
    o.fillStyle = st.color;
    o.fillRect(b.x, b.y, b.w, b.h);
    if (strength > 0) {
      const pat = o.createPattern(grain(), "repeat");
      if (pat) {
        // Grain is anchored to the surface, so overlapping strokes skip the same paper tooth.
        pat.setTransform(new DOMMatrix().scaleSelf(GRAIN_UNITS / GRAIN_PX, GRAIN_UNITS / GRAIN_PX));
        o.globalCompositeOperation = "destination-out";
        o.globalAlpha = Math.min(1, p.grain * strength * 1.15);
        o.fillStyle = pat;
        o.fillRect(b.x, b.y, b.w, b.h);
      }
    }
  });
}

function tracePolyline(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean, jitter = 0, rnd?: () => number) {
  const n = pts.length / 2;
  const j = (v: number) => (rnd && jitter ? v + (rnd() - 0.5) * jitter : v);
  if (n === 0) return;
  ctx.moveTo(j(pts[0]), j(pts[1]));
  if (n === 1) {
    ctx.lineTo(j(pts[0]) + 0.01, j(pts[1]));
    return;
  }
  if (closed) {
    for (let i = 1; i < n; i++) ctx.lineTo(j(pts[i * 2]), j(pts[i * 2 + 1]));
    ctx.closePath();
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const nx = pts[(i + 1) * 2];
    const ny = pts[(i + 1) * 2 + 1];
    ctx.quadraticCurveTo(j(x), j(y), j((x + nx) / 2), j((y + ny) / 2));
  }
  ctx.lineTo(j(pts[(n - 1) * 2]), j(pts[(n - 1) * 2 + 1]));
}

/** Variable-width pen line from per-point pressure. */
function renderPressurePen(ctx: CanvasRenderingContext2D, lines: Polyline[], st: RenderStyle) {
  withBuffer(ctx, lines, st.width, st.opacity, (o) => {
    o.strokeStyle = st.color;
    o.lineCap = "round";
    o.lineJoin = "round";
    let base = 0;
    for (const l of lines) {
      const n = l.pts.length / 2;
      for (let i = 1; i < n; i++) {
        const pr = ((st.pressure?.[base + i - 1] ?? 1) + (st.pressure?.[base + i] ?? 1)) / 2;
        o.lineWidth = Math.max(0.6, st.width * (0.3 + 0.7 * pr));
        o.beginPath();
        o.moveTo(l.pts[(i - 1) * 2], l.pts[(i - 1) * 2 + 1]);
        o.lineTo(l.pts[i * 2], l.pts[i * 2 + 1]);
        o.stroke();
      }
      base += n;
    }
  });
}

/** Draws a stroke's path with its brush; ctx is in surface coordinates. */
export function renderBrush(ctx: CanvasRenderingContext2D, lines: Polyline[], st: RenderStyle) {
  if (isTextured(st.brush)) {
    renderTextured(ctx, lines, st);
    return;
  }
  ctx.save();
  ctx.strokeStyle = st.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (st.brush) {
    case "marker":
      ctx.globalAlpha *= st.opacity * 0.85;
      ctx.lineCap = "square";
      ctx.lineWidth = st.width * 1.6;
      ctx.beginPath();
      for (const l of lines) tracePolyline(ctx, l.pts, l.closed);
      ctx.stroke();
      break;
    case "pencil": {
      const rnd = mulberry(st.seed);
      ctx.lineWidth = Math.max(0.6, st.width * 0.45);
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = st.opacity * (pass === 0 ? 0.7 : 0.35);
        ctx.beginPath();
        for (const l of lines) tracePolyline(ctx, l.pts, l.closed, st.width * 0.6, rnd);
        ctx.stroke();
      }
      break;
    }
    default:
      if (st.pressure && st.pressure.length) {
        ctx.restore();
        renderPressurePen(ctx, lines, st);
        return;
      }
      ctx.globalAlpha *= st.opacity;
      ctx.lineWidth = st.width;
      ctx.beginPath();
      for (const l of lines) tracePolyline(ctx, l.pts, l.closed);
      ctx.stroke();
  }
  ctx.restore();
}
