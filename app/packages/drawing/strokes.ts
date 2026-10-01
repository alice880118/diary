import type { BrushKind, Stroke } from "../db/types";
import { renderBrush, strokeSeed } from "./brush";
import { isOpenShape, shapeOutline, type Polyline } from "./geometry";


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

/** Draws one stroke or shape; ctx must already be transformed to surface coordinates. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const shape = s.shape;
  if (!shape && s.points.length < 2) {
    return;
  }
  if (s.mode === "erase") {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.globalAlpha = 1;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    tracePath(ctx, s.points);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const lines: Polyline[] = shape ? shapeOutline(shape) : [{ pts: s.points, closed: false }];
  if (shape && s.fill?.kind === "solid" && !isOpenShape(shape.type)) {
    ctx.save();
    ctx.globalAlpha *= s.opacity;
    ctx.fillStyle = s.fill.color;
    ctx.beginPath();
    for (const l of lines) {
      if (!l.closed) continue;
      ctx.moveTo(l.pts[0], l.pts[1]);
      for (let i = 2; i < l.pts.length; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  if (shape && s.outline === false) return;
  renderBrush(ctx, lines, {
    brush: s.brush,
    color: s.color,
    width: s.width,
    opacity: s.opacity,
    texture: s.texture,
    seed: strokeSeed(s),
    pressure: shape ? undefined : s.pressure,
  });
}

function tracePath(ctx: CanvasRenderingContext2D, pts: number[]) {
  const n = pts.length / 2;
  if (n === 1) {
    ctx.moveTo(pts[0], pts[1]);
    ctx.lineTo(pts[0] + 0.01, pts[1]);
    return;
  }
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    ctx.quadraticCurveTo(x, y, (x + pts[(i + 1) * 2]) / 2, (y + pts[(i + 1) * 2 + 1]) / 2);
  }
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
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
