/**
 * One pointer-down → pointer-up drawing gesture.
 *
 *   drawing ──(still ≥ 1 s)──▶ holding ──▶ recognized ──(morph)──▶ adjusting
 *      │                                       ╰──(not confident: back to drawing)
 *      ╰──pointer up──▶ committed
 *
 * Points are stabilized as they arrive and drawn on a dedicated live canvas
 * once per animation frame, so React never sees individual points. The
 * result is handed back on finish(): a freehand stroke (plus an optional
 * Auto Smooth version) or a recognized shape (plus the raw freehand it
 * replaced, so Undo can step back to it).
 */
import { newId } from "../db/id";
import type { BrushKind, FillStyle, ShapeGeom, ShapeType, Stroke } from "../db/types";
import { shapeFallbackPoints, shapeOutline } from "./geometry";
import { recognize, type RecognizedKind } from "./recognition";
import { autoSmooth, resampleCount, type SmoothLevel } from "./smoothing";
import { Stabilizer, type StabilizerLevel } from "./stabilizer";
import { drawStroke } from "./strokes";

export interface InkConfig {
  erase: boolean;
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
  texture?: number;
  stabilizer: StabilizerLevel;
  smooth: SmoothLevel;
  holdToPerfect: boolean;
  /** Color the eraser preview is painted with (the surface color). */
  eraseColor?: string;
}

export type SessionState = "drawing" | "holding" | "recognized" | "adjusting" | "committed";

export type SessionResult =
  | { kind: "freehand"; stroke: Stroke; smoothed: Stroke | null }
  | { kind: "shape"; raw: Stroke; shape: Stroke; recognized: RecognizedKind }
  | null;

export const HOLD_MS = 1000;
/** Screen pixels the pointer may drift while holding. */
export const HOLD_TOLERANCE_PX = 8;
const RING_DELAY_MS = 280;
const MORPH_MS = 150;

export function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function clearCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  return ctx;
}

/** Drops points closer than minDist, keeping pressure aligned. */
function compact(pts: number[], pressure: number[] | null, minDist = 1.2) {
  const n = pts.length / 2;
  if (n <= 2) return { pts: pts.map((v) => Math.round(v * 10) / 10), pressure };
  const keep = [0];
  for (let i = 1; i < n - 1; i++) {
    const j = keep[keep.length - 1];
    if (Math.hypot(pts[i * 2] - pts[j * 2], pts[i * 2 + 1] - pts[j * 2 + 1]) >= minDist) keep.push(i);
  }
  keep.push(n - 1);
  return {
    pts: keep.flatMap((i) => [Math.round(pts[i * 2] * 10) / 10, Math.round(pts[i * 2 + 1] * 10) / 10]),
    pressure: pressure ? keep.map((i) => Math.round(pressure[i] * 100) / 100) : null,
  };
}

export class StrokeSession {
  state: SessionState = "drawing";
  private pts: number[] = [];
  private pressure: number[] | null = null;
  private readonly stab: Stabilizer;
  private raf = 0;
  private readonly id = newId("st");
  private readonly seed = randomSeed();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private anchor = { x: 0, y: 0, t: 0 };
  private last = { x: 0, y: 0 };
  private shape: ShapeGeom | null = null;
  private kind: RecognizedKind | null = null;
  private morph: { from: number[]; to: number[]; t0: number } | null = null;
  private adjust: { d0: number; a0: number; sweep0: number; lastA: number; w0: number; h0: number; sx: number; sy: number } | null =
    null;

  private readonly canvas: HTMLCanvasElement;
  /** Backing pixels per surface unit of the live canvas. */
  private readonly scale: number;
  private readonly cfg: InkConfig;
  /** Surface units per screen pixel (zoom aware). */
  private readonly unitsPerPx: number;
  private readonly onState?: (s: SessionState) => void;

  constructor(
    canvas: HTMLCanvasElement,
    scale: number,
    cfg: InkConfig,
    opts: { unitsPerPx: number; onState?: (s: SessionState) => void },
  ) {
    this.canvas = canvas;
    this.scale = scale;
    this.cfg = cfg;
    this.unitsPerPx = opts.unitsPerPx;
    this.onState = opts.onState;
    this.stab = new Stabilizer(cfg.erase ? "off" : cfg.stabilizer, opts.unitsPerPx);
  }

  private setState(s: SessionState) {
    this.state = s;
    this.onState?.(s);
  }

  /** Feed one input sample. `pressure` is only kept for pens. */
  add(x: number, y: number, t: number, pressure?: number, pointerType?: string) {
    this.last = { x, y };
    if (this.state === "adjusting" || this.state === "recognized") {
      this.adjustTo(x, y);
      this.request();
      return;
    }
    const [sx, sy] = this.stab.push(x, y, t);
    this.pts.push(sx, sy);
    if (pointerType === "pen" && typeof pressure === "number" && pressure > 0) {
      if (!this.pressure) this.pressure = new Array(this.pts.length / 2 - 1).fill(pressure);
      this.pressure.push(pressure);
    } else if (this.pressure) {
      this.pressure.push(this.pressure[this.pressure.length - 1] ?? 0.5);
    }
    this.watchHold(x, y, t);
    this.request();
  }

  private watchHold(x: number, y: number, t: number) {
    if (!this.cfg.holdToPerfect || this.cfg.erase) return;
    const tol = HOLD_TOLERANCE_PX * this.unitsPerPx;
    if (this.holdTimer && Math.hypot(x - this.anchor.x, y - this.anchor.y) <= tol) return;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    if (this.state === "holding") this.setState("drawing");
    this.anchor = { x, y, t };
    this.holdTimer = setTimeout(() => this.onHold(), HOLD_MS);
  }

  private onHold() {
    this.holdTimer = null;
    if (this.state !== "drawing" && this.state !== "holding") return;
    this.setState("holding");
    const r = recognize(this.pts);
    if (!r) {
      // Not confident: stay freehand; a further hold can try again.
      this.setState("drawing");
      this.request();
      return;
    }
    this.kind = r.kind;
    this.shape = r.shape;
    this.setState("recognized");
    const target = shapeFallbackPoints(r.shape);
    let to = resampleCount(target, 64);
    const from = resampleCount(this.pts, 64);
    if (r.kind === "circle" || r.kind === "ellipse") {
      // Start the closed outline where the freehand started, in the same direction.
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < 64; i++) {
        const d = Math.hypot(to[i * 2] - from[0], to[i * 2 + 1] - from[1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      to = [...to.slice(best * 2), ...to.slice(0, best * 2)];
      // Match winding so the morph does not flip through the center.
      const area = (q: number[]) => {
        let sum = 0;
        for (let i = 0; i < q.length; i += 2) {
          const j = (i + 2) % q.length;
          sum += q[i] * q[j + 1] - q[j] * q[i + 1];
        }
        return sum;
      };
      if (Math.sign(area(to)) !== Math.sign(area(from))) {
        const rev: number[] = [to[0], to[1]];
        for (let i = 63; i >= 1; i--) rev.push(to[i * 2], to[i * 2 + 1]);
        to = rev;
      }
    }
    this.morph = { from, to, t0: performance.now() };
    this.beginAdjust();
    this.request();
  }

  private beginAdjust() {
    const g = this.shape;
    if (!g) return;
    const { x, y } = this.last;
    if (g.type === "line") {
      const a = (g.rot * Math.PI) / 180;
      this.adjust = { d0: 1, a0: 0, sweep0: 0, lastA: 0, w0: g.w, h0: g.h, sx: g.cx - (Math.cos(a) * g.w) / 2, sy: g.cy - (Math.sin(a) * g.w) / 2 };
      return;
    }
    const a0 = Math.atan2(y - g.cy, x - g.cx);
    this.adjust = {
      d0: Math.max(1, Math.hypot(x - g.cx, y - g.cy)),
      a0,
      sweep0: g.sweep ?? 0,
      lastA: a0,
      w0: g.w,
      h0: g.h,
      sx: 0,
      sy: 0,
    };
  }

  /** While the pointer stays down after recognition, it reshapes the result. */
  private adjustTo(x: number, y: number) {
    const g = this.shape;
    const a = this.adjust;
    if (!g || !a) return;
    if (g.type === "line") {
      const w = Math.hypot(x - a.sx, y - a.sy);
      this.shape = { ...g, cx: (a.sx + x) / 2, cy: (a.sy + y) / 2, w, rot: (Math.atan2(y - a.sy, x - a.sx) * 180) / Math.PI };
      return;
    }
    const k = Math.max(0.15, Math.hypot(x - g.cx, y - g.cy) / a.d0);
    if (g.type === "arc") {
      const ang = Math.atan2(y - g.cy, x - g.cx);
      let d = ang - a.lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      a.lastA = ang;
      const sweep = Math.max(-Math.PI * 1.95, Math.min(Math.PI * 1.95, (g.sweep ?? 0) + d));
      this.shape = { ...g, w: a.w0 * k, h: a.h0 * k, sweep };
      return;
    }
    this.shape = { ...g, w: a.w0 * k, h: a.h0 * k };
  }

  private request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  private styleStroke(points: number[], extra?: Partial<Stroke>): Stroke {
    const c = this.cfg;
    return {
      id: this.id,
      mode: c.erase ? "erase" : "draw",
      brush: c.brush,
      color: c.color,
      width: c.width,
      opacity: c.opacity,
      points,
      seed: this.seed,
      ...(c.texture !== undefined ? { texture: c.texture } : null),
      ...extra,
    };
  }

  private paint() {
    const ctx = clearCanvas(this.canvas);
    if (!ctx) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const now = performance.now();
    if (this.morph) {
      const u = Math.min(1, (now - this.morph.t0) / MORPH_MS);
      const e = 1 - (1 - u) * (1 - u);
      if (u < 1) {
        const pts = this.morph.from.map((v, i) => v + (this.morph!.to[i] - v) * e);
        drawStroke(ctx, this.styleStroke(pts));
        this.request();
        return;
      }
      this.morph = null;
      this.setState("adjusting");
    }
    if (this.shape && (this.state === "adjusting" || this.state === "recognized")) {
      drawStroke(ctx, this.styleStroke(shapeFallbackPoints(this.shape), { shape: this.shape }));
      return;
    }
    if (this.cfg.erase) {
      drawStroke(ctx, { ...this.styleStroke(this.pts), mode: "draw", brush: "pen", color: this.cfg.eraseColor ?? "#fffdf8", opacity: 0.9 });
    } else {
      drawStroke(ctx, this.styleStroke(this.pts, this.pressure ? { pressure: this.pressure } : undefined));
    }
    this.paintRing(ctx, now);
  }

  /** Subtle progress ring at the pen tip while holding still. */
  private paintRing(ctx: CanvasRenderingContext2D, now: number) {
    if (!this.holdTimer || !this.cfg.holdToPerfect || this.cfg.erase) return;
    const held = now - this.anchor.t;
    if (held < RING_DELAY_MS) {
      this.request();
      return;
    }
    const u = Math.min(1, (held - RING_DELAY_MS) / (HOLD_MS - RING_DELAY_MS));
    const r = 13 * this.unitsPerPx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 3 * this.unitsPerPx;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(this.anchor.x, this.anchor.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(27,27,27,0.55)";
    ctx.beginPath();
    ctx.arc(this.anchor.x, this.anchor.y, r, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (u < 1) this.request();
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    clearCanvas(this.canvas);
  }

  cancel() {
    this.stop();
    this.setState("committed");
  }

  finish(x?: number, y?: number): SessionResult {
    const recognized = this.shape && (this.state === "adjusting" || this.state === "recognized");
    if (!recognized && typeof x === "number" && typeof y === "number") {
      const tail = this.stab.finish(x, y);
      for (let i = 0; i < tail.length; i += 2) {
        this.pts.push(tail[i], tail[i + 1]);
        if (this.pressure) this.pressure.push(this.pressure[this.pressure.length - 1]);
      }
    }
    this.stop();
    this.setState("committed");
    if (this.pts.length < 2) return null;
    const c = compact(this.pts, this.pressure);
    const raw = this.styleStroke(c.pts, c.pressure ? { pressure: c.pressure } : undefined);
    if (recognized && this.shape && this.kind) {
      const shape: Stroke = {
        ...this.styleStroke(shapeFallbackPoints(this.shape), { shape: this.shape }),
        id: newId("st"),
        fill: { kind: "none" },
      };
      return { kind: "shape", raw, shape, recognized: this.kind };
    }
    let smoothed: Stroke | null = null;
    if (!this.cfg.erase && this.cfg.smooth !== "off") {
      const s = autoSmooth(c.pts, this.cfg.smooth, c.pressure ?? undefined);
      if (s.pts !== c.pts) smoothed = { ...raw, points: s.pts, ...(s.pressure ? { pressure: s.pressure } : null) };
    }
    return { kind: "freehand", stroke: raw, smoothed };
  }
}

/* ------------------------------------------------------------------ */
/* Shape tool: drag out a shape                                        */
/* ------------------------------------------------------------------ */

export interface ShapeStyle {
  type: ShapeType;
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
  texture?: number;
  fill: FillStyle;
  outline: boolean;
}

export function shapeFromDrag(type: ShapeType, x0: number, y0: number, x1: number, y1: number): ShapeGeom {
  if (type === "line" || type === "arrow") {
    return { type, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.hypot(x1 - x0, y1 - y0), h: 0, rot: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
  }
  let w = Math.abs(x1 - x0);
  let h = Math.abs(y1 - y0);
  if (type === "circle") {
    const d = Math.max(w, h);
    w = d;
    h = d;
    return { type, cx: x0 + (Math.sign(x1 - x0) * d) / 2, cy: y0 + (Math.sign(y1 - y0) * d) / 2, w, h, rot: 0 };
  }
  return { type, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h, rot: 0 };
}

export function makeShapeStroke(style: ShapeStyle, g: ShapeGeom, id = newId("st"), seed = randomSeed()): Stroke {
  return {
    id,
    mode: "draw",
    brush: style.brush,
    color: style.color,
    width: style.width,
    opacity: style.opacity,
    points: shapeFallbackPoints(g),
    seed,
    ...(style.texture !== undefined ? { texture: style.texture } : null),
    shape: g,
    fill: style.fill,
    outline: style.outline,
  };
}

export class ShapeDrag {
  private x1: number;
  private y1: number;
  private raf = 0;
  private readonly id = newId("st");
  private readonly seed = randomSeed();
  private readonly canvas: HTMLCanvasElement;
  private readonly scale: number;
  private readonly style: ShapeStyle;
  private readonly x0: number;
  private readonly y0: number;

  constructor(canvas: HTMLCanvasElement, scale: number, style: ShapeStyle, x0: number, y0: number) {
    this.canvas = canvas;
    this.scale = scale;
    this.style = style;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x0;
    this.y1 = y0;
  }

  move(x: number, y: number) {
    this.x1 = x;
    this.y1 = y;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const ctx = clearCanvas(this.canvas);
      if (!ctx) return;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      const g = this.geom();
      if (g) drawStroke(ctx, makeShapeStroke(this.style, g, this.id, this.seed));
    });
  }

  private geom(): ShapeGeom | null {
    const g = shapeFromDrag(this.style.type, this.x0, this.y0, this.x1, this.y1);
    const size = g.type === "line" || g.type === "arrow" ? g.w : Math.max(g.w, g.h);
    return size < 6 ? null : g;
  }

  cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearCanvas(this.canvas);
  }

  finish(): Stroke | null {
    this.cancel();
    const g = this.geom();
    if (!g) return null;
    // Tiny accidental drags in one direction still make a usable box.
    if (g.type !== "line" && g.type !== "arrow") {
      g.w = Math.max(g.w, 12);
      g.h = Math.max(g.h, 12);
    }
    return makeShapeStroke(this.style, g, this.id, this.seed);
  }
}

/** Outline helper re-exported for hit testing callers. */
export { shapeOutline };
