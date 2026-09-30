import type { BrushKind, Stroke } from "../db/types";

export interface BrushSettings {
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
}

export const BRUSHES: { id: BrushKind; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "marker", label: "Marker" },
  { id: "pencil", label: "Pencil" },
];

export const INK_COLORS = [
  "#2f2a25",
  "#5b4636",
  "#d2553f",
  "#e98aa4",
  "#f2b134",
  "#6aa36f",
  "#3868b8",
  "#7a5bb5",
  "#ffffff",
];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: number[], jitter = 0, rnd?: () => number) {
  const n = pts.length / 2;
  const j = (v: number) => (rnd && jitter ? v + (rnd() - 0.5) * jitter : v);
  ctx.beginPath();
  if (n === 1) {
    ctx.moveTo(j(pts[0]), j(pts[1]));
    ctx.lineTo(j(pts[0]) + 0.01, j(pts[1]));
    return;
  }
  ctx.moveTo(j(pts[0]), j(pts[1]));
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const nx = pts[(i + 1) * 2];
    const ny = pts[(i + 1) * 2 + 1];
    ctx.quadraticCurveTo(j(x), j(y), j((x + nx) / 2), j((y + ny) / 2));
  }
  ctx.lineTo(j(pts[(n - 1) * 2]), j(pts[(n - 1) * 2 + 1]));
}

/** Draws one stroke; ctx must already be transformed to surface coordinates. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 2) {
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.globalAlpha = 1;
    ctx.lineWidth = s.width;
    tracePath(ctx, s.points);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.strokeStyle = s.color;
  switch (s.brush) {
    case "marker":
      ctx.globalAlpha = s.opacity * 0.85;
      ctx.lineCap = "square";
      ctx.lineWidth = s.width * 1.6;
      tracePath(ctx, s.points);
      ctx.stroke();
      break;
    case "pencil": {
      const rnd = mulberry(hashString(s.id));
      ctx.lineWidth = Math.max(0.6, s.width * 0.45);
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = s.opacity * (pass === 0 ? 0.7 : 0.35);
        tracePath(ctx, s.points, s.width * 0.6, rnd);
        ctx.stroke();
      }
      break;
    }
    default:
      ctx.globalAlpha = s.opacity;
      ctx.lineWidth = s.width;
      tracePath(ctx, s.points);
      ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const s of strokes) {
    drawStroke(ctx, s);
  }
}

export function strokeBounds(s: Stroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < s.points.length; i += 2) {
    minX = Math.min(minX, s.points[i]);
    maxX = Math.max(maxX, s.points[i]);
    minY = Math.min(minY, s.points[i + 1]);
    maxY = Math.max(maxY, s.points[i + 1]);
  }
  const pad = s.width / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const pts = s.points.slice();
  for (let i = 0; i < pts.length; i += 2) {
    pts[i] += dx;
    pts[i + 1] += dy;
  }
  return { ...s, points: pts };
}

/** Drops points closer than minDist to keep stored strokes compact. */
export function simplifyPoints(pts: number[], minDist = 1.2): number[] {
  if (pts.length <= 4) {
    return pts;
  }
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const dx = pts[i] - out[out.length - 2];
    const dy = pts[i + 1] - out[out.length - 1];
    if (dx * dx + dy * dy >= minDist * minDist) {
      out.push(pts[i], pts[i + 1]);
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out.map((v) => Math.round(v * 10) / 10);
}
