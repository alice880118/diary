import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ART_H, ART_W, type Stroke } from "../db/types";
import type { Box } from "../drawing/geometry";
import { ShapeDrag, StrokeSession, type InkConfig, type SessionResult, type ShapeStyle } from "../drawing/session";
import { TransformBox, type BoxOp, type DragPhase } from "../drawing/TransformBox";

export type ArtTool =
  | { kind: "none" }
  | { kind: "ink"; cfg: InkConfig }
  | { kind: "shape"; style: ShapeStyle }
  | { kind: "select" }
  | { kind: "moveImage" }
  | { kind: "maskBrush"; canvas: HTMLCanvasElement; size: number; erase: boolean }
  | { kind: "lasso"; purpose: "maskAdd" | "maskSub" | "crop" };

type Gesture =
  | { kind: "none" }
  | { kind: "pinch"; d0: number; z0: number; x0: number; y0: number; mx: number; my: number }
  | { kind: "ink" }
  | { kind: "shapeDrag"; x: number; y: number }
  | { kind: "tap"; x: number; y: number; cx: number; cy: number; moved: boolean }
  | { kind: "move"; x: number; y: number }
  | { kind: "mask"; x: number; y: number; snapshot: ImageData | null }
  | { kind: "lasso"; pts: number[] };

interface View {
  z: number;
  x: number;
  y: number;
}

const MAX_ZOOM = 5;
/** Pinching below 1x rubber-bands down to this, then springs back on release. */
const MIN_PINCH_ZOOM = 0.8;
const SNAP_BACK_BELOW = 1.05;
const HOME: View = { z: 1, x: 0, y: 0 };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function ArtCanvas({
  size,
  base,
  checker,
  tool,
  drawOverlay,
  overlayKey,
  onInk,
  onShape,
  onTap,
  selection,
  onSelectionDrag,
  onImageDrag,
  onDragStart,
  onMaskEnd,
  onLasso,
}: {
  size: number;
  base: HTMLCanvasElement | null;
  checker: boolean;
  tool: ArtTool;
  drawOverlay?: (ctx: CanvasRenderingContext2D) => void;
  overlayKey: unknown;
  onInk?: (r: SessionResult) => void;
  onShape?: (s: Stroke) => void;
  /** Tap (no drag) in select/shape mode, art coordinates. */
  onTap?: (x: number, y: number) => void;
  /** Selected object's box; shows move / resize / rotate handles. */
  selection?: { box: Box; rotatable: boolean } | null;
  onSelectionDrag?: (op: BoxOp, phase: DragPhase, p: { x: number; y: number }, start: { x: number; y: number }) => void;
  onImageDrag?: (dx: number, dy: number, done: boolean) => void;
  /** Art-space point where a moveImage drag starts. */
  onDragStart?: (x: number, y: number) => void;
  onMaskEnd?: () => void;
  onLasso?: (poly: number[]) => void;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const live = useRef<StrokeSession | null>(null);
  const drag = useRef<ShapeDrag | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>(HOME);
  const viewRef = useRef<View>(HOME);
  const [snapping, setSnapping] = useState(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayFn = useRef(drawOverlay);
  overlayFn.current = drawOverlay;

  const setView = (v: View) => {
    viewRef.current = v;
    setViewState(v);
  };

  /** Keeps the zoomed canvas covering the viewport; at or below 1x it stays centered. */
  const clampView = (v: View): View => {
    if (v.z <= 1) return { z: v.z, x: 0, y: 0 };
    const m = (size * (v.z - 1)) / 2;
    return { z: v.z, x: clamp(v.x, -m, m), y: clamp(v.y, -m, m) };
  };

  /** Offset that keeps the canvas point under (m0x, m0y) at zoom z0 under (mx, my) at zoom z. */
  const focalOffset = (from: View, m0x: number, m0y: number, z: number, mx: number, my: number) => {
    const left0 = (size - size * from.z) / 2 + from.x;
    const top0 = (size - size * from.z) / 2 + from.y;
    const nx = (m0x - left0) / (size * from.z);
    const ny = (m0y - top0) / (size * from.z);
    return {
      x: mx - nx * size * z - (size - size * z) / 2,
      y: my - ny * size * z - (size - size * z) / 2,
    };
  };

  const snapHome = () => {
    setSnapping(true);
    setView(HOME);
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => setSnapping(false), 220);
  };

  const toLocal = (cx: number, cy: number) => {
    const r = hostRef.current?.getBoundingClientRect();
    return r ? { x: cx - r.left, y: cy - r.top } : { x: 0, y: 0 };
  };

  useEffect(
    () => () => {
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [],
  );

  // Native listener: React registers wheel as passive, so preventDefault would be ignored.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = viewRef.current;
      const z = clamp(cur.z * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
      if (z < 1.02) {
        setView(HOME);
        return;
      }
      const m = toLocal(e.clientX, e.clientY);
      setView(clampView({ z, ...focalOffset(cur, m.x, m.y, z, m.x, m.y) }));
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useLayoutEffect(() => {
    const c = baseRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (base) ctx.drawImage(base, 0, 0, c.width, c.height);
  }, [base]);

  const repaintOverlay = () => {
    const c = overlayRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, c.width, c.height);
    overlayFn.current?.(ctx);
  };

  useLayoutEffect(repaintOverlay, [overlayKey]);

  useEffect(() => {
    setView(HOME);
  }, [size]);

  const toArt = (cx: number, cy: number) => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((cx - r.left) / r.width) * ART_W, y: ((cy - r.top) / r.height) * ART_H };
  };

  const clearLive = () => {
    const c = liveRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
    }
  };

  const paintMask = (x0: number, y0: number, x1: number, y1: number) => {
    if (tool.kind !== "maskBrush") return;
    const ctx = tool.canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = tool.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = tool.size;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 + 0.01, y1);
    ctx.stroke();
    ctx.restore();
    repaintOverlay();
  };

  const drawLasso = (pts: number[]) => {
    const c = liveRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || pts.length < 4) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(56,104,184,0.12)";
    ctx.fill();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#3868b8";
    ctx.stroke();
  };

  const cancelSingle = () => {
    const g = gesture.current;
    if (g.kind === "ink") {
      live.current?.cancel();
      live.current = null;
    }
    if (g.kind === "shapeDrag") {
      drag.current?.cancel();
      drag.current = null;
    }
    if (g.kind === "lasso") clearLive();
    if (g.kind === "move") onImageDrag?.(0, 0, true);
    if (g.kind === "mask") {
      // The first finger of a pinch must not leave a dab in the mask.
      if (g.snapshot && tool.kind === "maskBrush") {
        tool.canvas.getContext("2d")?.putImageData(g.snapshot, 0, 0);
        repaintOverlay();
      } else {
        onMaskEnd?.();
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      cancelSingle();
      const [a, b] = [...pointers.current.values()];
      const m = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      const v = viewRef.current;
      gesture.current = {
        kind: "pinch",
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        z0: v.z,
        x0: v.x,
        y0: v.y,
        mx: m.x,
        my: m.y,
      };
      return;
    }
    if (pointers.current.size > 2) return;
    const p = toArt(e.clientX, e.clientY);
    switch (tool.kind) {
      case "ink": {
        const c = liveRef.current;
        if (!c) return;
        live.current = new StrokeSession(c, c.width / ART_W, tool.cfg, { unitsPerPx: ART_W / (size * viewRef.current.z) });
        live.current.add(p.x, p.y, e.timeStamp, e.pressure, e.pointerType);
        gesture.current = { kind: "ink" };
        return;
      }
      case "shape": {
        const c = liveRef.current;
        if (!c) return;
        drag.current = new ShapeDrag(c, c.width / ART_W, tool.style, p.x, p.y);
        gesture.current = { kind: "shapeDrag", x: p.x, y: p.y };
        return;
      }
      case "select":
        gesture.current = { kind: "tap", x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, moved: false };
        return;
      case "moveImage":
        gesture.current = { kind: "move", x: p.x, y: p.y };
        onDragStart?.(p.x, p.y);
        return;
      case "maskBrush": {
        const snapshot =
          e.pointerType === "touch"
            ? tool.canvas.getContext("2d")?.getImageData(0, 0, tool.canvas.width, tool.canvas.height) ?? null
            : null;
        gesture.current = { kind: "mask", x: p.x, y: p.y, snapshot };
        paintMask(p.x, p.y, p.x, p.y);
        return;
      }
      case "lasso":
        gesture.current = { kind: "lasso", pts: [p.x, p.y] };
        return;
      default:
        gesture.current = { kind: "none" };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const z = clamp((g.z0 * d) / g.d0, MIN_PINCH_ZOOM, MAX_ZOOM);
      const m = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      const from = { z: g.z0, x: g.x0, y: g.y0 };
      setView(clampView({ z, ...focalOffset(from, g.mx, g.my, z, m.x, m.y) }));
      return;
    }
    const evs = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e.nativeEvent];
    if (g.kind === "ink") {
      for (const ev of list) {
        const p = toArt(ev.clientX, ev.clientY);
        live.current?.add(p.x, p.y, ev.timeStamp, ev.pressure, ev.pointerType);
      }
      return;
    }
    if (g.kind === "shapeDrag") {
      const p = toArt(e.clientX, e.clientY);
      drag.current?.move(p.x, p.y);
      return;
    }
    if (g.kind === "tap") {
      if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > 6) g.moved = true;
      return;
    }
    const p = toArt(e.clientX, e.clientY);
    if (g.kind === "move") {
      onImageDrag?.(p.x - g.x, p.y - g.y, false);
      return;
    }
    if (g.kind === "mask") {
      for (const ev of list) {
        const q = toArt(ev.clientX, ev.clientY);
        paintMask(g.x, g.y, q.x, q.y);
        g.x = q.x;
        g.y = q.y;
      }
      return;
    }
    if (g.kind === "lasso") {
      const lx = g.pts[g.pts.length - 2];
      const ly = g.pts[g.pts.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) > 4) {
        g.pts.push(p.x, p.y);
        drawLasso(g.pts);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === "pinch") {
      // Settle as soon as the pinch breaks; the remaining finger stays inert.
      if (pointers.current.size === 1 && viewRef.current.z < SNAP_BACK_BELOW) snapHome();
      if (pointers.current.size === 0) {
        if (viewRef.current.z < SNAP_BACK_BELOW) snapHome();
        gesture.current = { kind: "none" };
      }
      return;
    }
    gesture.current = { kind: "none" };
    const cancelled = e.type === "pointercancel";
    if (g.kind === "ink") {
      const p = toArt(e.clientX, e.clientY);
      const session = live.current;
      live.current = null;
      if (!session) return;
      if (cancelled) {
        session.cancel();
        return;
      }
      onInk?.(session.finish(p.x, p.y));
      return;
    }
    if (g.kind === "shapeDrag") {
      const d = drag.current;
      drag.current = null;
      const s = d?.finish() ?? null;
      if (cancelled) return;
      if (s) onShape?.(s);
      else onTap?.(g.x, g.y);
      return;
    }
    if (g.kind === "tap") {
      if (!g.moved && !cancelled) onTap?.(g.x, g.y);
      return;
    }
    if (g.kind === "move") {
      const p = toArt(e.clientX, e.clientY);
      onImageDrag?.(cancelled ? 0 : p.x - g.x, cancelled ? 0 : p.y - g.y, true);
      return;
    }
    if (g.kind === "mask") {
      onMaskEnd?.();
      return;
    }
    if (g.kind === "lasso") {
      clearLive();
      if (!cancelled && g.pts.length >= 6) onLasso?.(g.pts);
    }
  };

  const left = (size - size * view.z) / 2 + view.x;
  const top = (size - size * view.z) / 2 + view.y;
  const common = { position: "absolute" as const, left: 0, top: 0, width: size, height: size };
  return (
    <div
      ref={hostRef}
      style={{
        position: "relative",
        width: size,
        height: size,
        overflow: "hidden",
        touchAction: "none",
        background: "#fff",
        boxShadow: "0 1px 6px rgb(0 0 0 / 0.08)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={checker ? "checker" : undefined}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          transformOrigin: "0 0",
          transform: `translate(${left}px, ${top}px) scale(${view.z})`,
          transition: snapping ? "transform 0.2s ease-out" : "none",
          willChange: "transform",
        }}
      >
        <canvas ref={baseRef} width={ART_W} height={ART_H} style={common} />
        <canvas ref={overlayRef} width={ART_W} height={ART_H} style={{ ...common, pointerEvents: "none" }} />
        <canvas ref={liveRef} width={ART_W} height={ART_H} style={{ ...common, pointerEvents: "none" }} />
        {selection && onSelectionDrag ? (
          <TransformBox
            box={selection.box}
            unit={size / ART_W}
            zoom={view.z}
            rotatable={selection.rotatable}
            toSurface={toArt}
            onDrag={onSelectionDrag}
          />
        ) : null}
      </div>
      <button
        type="button"
        className="zoom-chip"
        aria-label={view.z > 1.01 ? "Reset zoom" : "Zoom"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={snapHome}
      >
        {Math.round(view.z * 100)}%
      </button>
    </div>
  );
}
