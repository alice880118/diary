import { useEffect, useRef, type CSSProperties } from "react";
import type { Stroke } from "../db/types";
import { drawStrokes } from "./strokes";

/**
 * Renders strokes of a logical surface (w x h units) into a canvas whose
 * backing store matches the displayed pixel size.
 */
export function StrokeCanvas({
  strokes,
  w,
  h,
  pixelWidth,
  style,
  live,
}: {
  strokes: Stroke[];
  w: number;
  h: number;
  /** Displayed CSS width in px; backing resolution is derived from it. */
  pixelWidth: number;
  style?: CSSProperties;
  /** Optional stroke being drawn right now. */
  live?: Stroke | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.max(0.05, (pixelWidth * dpr) / w);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  useEffect(() => {
    const c = ref.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawStrokes(ctx, strokes);
    if (live) {
      drawStrokes(ctx, [live]);
    }
  }, [strokes, live, scale, cw, ch]);

  return (
    <canvas
      ref={ref}
      width={cw}
      height={ch}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        height: h,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
