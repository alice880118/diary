import { useRef } from "react";
import type { Box } from "./geometry";

export type BoxOp = "move" | "rotate" | 0 | 1 | 2 | 3;
export type DragPhase = "start" | "move" | "end";

/** Visible handle size and the larger invisible touch target, in screen px. */
const HANDLE = 14;
const HIT = 44;
const ROTATE_GAP = 30;

/**
 * Selection box for a drawing object: drag inside to move, a corner to
 * resize, the top knob to rotate. Rendered inside a container whose CSS
 * pixels are `unit` per surface unit; `zoom` is any extra CSS scale applied
 * to that container, so handles keep a constant on-screen size.
 */
export function TransformBox({
  box,
  unit,
  zoom = 1,
  toSurface,
  onDrag,
  rotatable = true,
}: {
  box: Box;
  unit: number;
  zoom?: number;
  toSurface: (clientX: number, clientY: number) => { x: number; y: number };
  onDrag: (op: BoxOp, phase: DragPhase, p: { x: number; y: number }, start: { x: number; y: number }) => void;
  rotatable?: boolean;
}) {
  const active = useRef<{ op: BoxOp; id: number; start: { x: number; y: number } } | null>(null);
  const k = 1 / zoom;
  const w = Math.max(box.w * unit, 1);
  const h = Math.max(box.h * unit, 1);

  const handlers = (op: BoxOp) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (active.current) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const p = toSurface(e.clientX, e.clientY);
      active.current = { op, id: e.pointerId, start: p };
      onDrag(op, "start", p, p);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      e.stopPropagation();
      onDrag(a.op, "move", toSurface(e.clientX, e.clientY), a.start);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      e.stopPropagation();
      active.current = null;
      onDrag(a.op, "end", toSurface(e.clientX, e.clientY), a.start);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      active.current = null;
      onDrag(a.op, "end", a.start, a.start);
    },
  });

  const corner = (i: 0 | 1 | 2 | 3) => {
    const x = i === 1 || i === 2 ? w : 0;
    const y = i === 2 || i === 3 ? h : 0;
    return (
      <div
        key={i}
        className="tbox-hit"
        role="button"
        aria-label="Resize"
        style={{ left: x - (HIT * k) / 2, top: y - (HIT * k) / 2, width: HIT * k, height: HIT * k, cursor: i % 2 === 0 ? "nwse-resize" : "nesw-resize" }}
        {...handlers(i)}
      >
        <span className="tbox-handle" style={{ width: HANDLE * k, height: HANDLE * k, borderWidth: 2 * k }} />
      </div>
    );
  };

  return (
    <div
      className="tbox"
      style={{
        left: (box.cx - box.w / 2) * unit,
        top: (box.cy - box.h / 2) * unit,
        width: w,
        height: h,
        transform: `rotate(${box.rot}deg)`,
        outlineWidth: 1.5 * k,
      }}
    >
      <div className="tbox-body" {...handlers("move")} />
      {rotatable ? (
        <>
          <span className="tbox-stem" style={{ height: ROTATE_GAP * k, top: -ROTATE_GAP * k, width: 1.5 * k }} />
          <div
            className="tbox-hit"
            role="button"
            aria-label="Rotate"
            style={{ left: w / 2 - (HIT * k) / 2, top: -ROTATE_GAP * k - (HIT * k) / 2, width: HIT * k, height: HIT * k, cursor: "grab" }}
            {...handlers("rotate")}
          >
            <span className="tbox-handle is-rotate" style={{ width: (HANDLE + 4) * k, height: (HANDLE + 4) * k, borderWidth: 2 * k }} />
          </div>
        </>
      ) : null}
      {([0, 1, 2, 3] as const).map(corner)}
    </div>
  );
}
