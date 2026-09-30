import { useEffect, useRef, useState } from "react";
import type { StickerMaterial } from "../db/types";
import type { PeelState } from "../sticker/geometry";
import { StickerArtView } from "../sticker/StickerArt";
import { useReduceMotion } from "../shell/motion";

/**
 * Sticker on a diary-paper swatch. In interactive mode pressing lifts the
 * corner nearest the finger and dragging changes the holo reflection.
 */
export function StickerPreview({
  artUrl,
  shapeUrl,
  material,
  w,
  h,
  angle,
  size,
  interactive,
}: {
  artUrl: string;
  shapeUrl: string;
  material: StickerMaterial;
  w: number;
  h: number;
  angle: number;
  size: number;
  interactive: boolean;
}) {
  const reduce = useReduceMotion();
  const k = Math.min((size * 0.78) / w, (size * 0.78) / h);
  const dw = w * k;
  const dh = h * k;
  const [peel, setPeel] = useState<PeelState | null>(null);
  const [tilt, setTilt] = useState(0);
  const drag = useRef<{ x: number; y: number; ux: number; uy: number } | null>(null);
  const raf = useRef(0);
  const target = useRef({ amount: 0, lift: 0 });
  const cur = useRef({ amount: 0, lift: 0, ux: 0.7, uy: -0.7 });

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const animate = () => {
    if (raf.current) return;
    const tick = () => {
      const c = cur.current;
      const t = target.current;
      const kk = reduce ? 1 : 0.2;
      c.amount += (t.amount - c.amount) * kk;
      c.lift += (t.lift - c.lift) * kk;
      setPeel(c.amount < 0.3 && t.amount === 0 ? null : { ux: c.ux, uy: c.uy, amount: c.amount, lift: c.lift });
      if (Math.abs(t.amount - c.amount) < 0.3 && Math.abs(t.lift - c.lift) < 0.01) {
        raf.current = 0;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - r.left - dw / 2;
    const ly = e.clientY - r.top - dh / 2;
    const len = Math.hypot(lx, ly) || 1;
    cur.current.ux = lx / len;
    cur.current.uy = ly / len;
    drag.current = { x: e.clientX, y: e.clientY, ux: lx / len, uy: ly / len };
    target.current = { amount: reduce ? 0 : Math.min(dw, dh) * 0.28, lift: 1 };
    animate();
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setTilt(dx * 0.8 - dy * 0.5);
    const len = Math.hypot(dx, dy);
    if (len > 3) {
      const nx = d.ux * 0.7 + (dx / len) * 0.3;
      const ny = d.uy * 0.7 + (dy / len) * 0.3;
      const nl = Math.hypot(nx, ny) || 1;
      cur.current.ux = nx / nl;
      cur.current.uy = ny / nl;
      target.current.amount = reduce ? 0 : Math.min(dw, dh) * Math.min(0.45, 0.28 + len / 800);
      animate();
    }
  };

  const onUp = () => {
    drag.current = null;
    target.current = { amount: 0, lift: 0 };
    setTilt(0);
    animate();
  };

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 8,
        overflow: "hidden",
        background:
          "repeating-linear-gradient(transparent 0 27px, #c9d6e6 27px 28px), radial-gradient(circle at 50% 40%, #fffdf8, #f3ecdf)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(40,30,20,0.18)",
      }}
    >
      <div
        style={{ position: "relative", width: dw, height: dh, touchAction: "none", cursor: interactive ? "grab" : "default" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <StickerArtView
          artUrl={artUrl}
          shapeUrl={shapeUrl}
          material={material}
          w={dw}
          h={dh}
          angle={angle + tilt + (peel?.amount ?? 0) * 0.8}
          peel={peel}
        />
      </div>
      {interactive ? (
        <div className="muted small" style={{ position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center" }}>
          Press and drag the sticker to see it peel and shine
        </div>
      ) : null}
    </div>
  );
}
