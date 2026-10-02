import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PAGE_H, PAGE_W, type Page, type PageObject } from "../db/types";
import { PageSurface } from "../page/PageSurface";
import { Icon } from "../shell/Icon";
import "./reader.css";
import { t } from "../i18n";

interface FlipState {
  dir: 1 | -1;
  /** 0 = not turned, 1 = fully turned to the target page. */
  p: number;
}

const FLIP_MS = 520;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Single-page book view. Horizontal swipe turns the page around the spine
 * only at 1x zoom; when zoomed, one finger pans instead.
 */
export function PageFlipper({
  pages,
  index,
  onIndexChange,
  width,
  height,
  reduceMotion,
  onOpenLink,
}: {
  pages: Page[];
  index: number;
  onIndexChange: (i: number) => void;
  width: number;
  height: number;
  reduceMotion: boolean;
  onOpenLink: (url: string) => void;
}) {
  const pageW = Math.max(120, Math.min(width - 24, (height - 12) * (PAGE_W / PAGE_H)));
  const pageH = pageW * (PAGE_H / PAGE_W);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [swayKey, setSwayKey] = useState(0);
  const [bump, setBump] = useState<"left" | "right" | null>(null);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const [fading, setFading] = useState(false);
  const anim = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "none" }
    | { kind: "pending"; x: number; y: number; t: number }
    | { kind: "flip"; x: number; dir: 1 | -1; lastX: number; lastT: number; v: number }
    | { kind: "pan"; x: number; y: number; ox: number; oy: number }
    | { kind: "pinch"; d0: number; s0: number; cx: number; cy: number; ox: number; oy: number }
  >({ kind: "none" });
  const lastTap = useRef(0);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  useEffect(() => {
    setZoom({ s: 1, x: 0, y: 0 });
  }, [index]);

  const doBump = useCallback((side: "left" | "right") => {
    setBump(side);
    setTimeout(() => setBump(null), 320);
  }, []);

  const animateTo = useCallback(
    (from: FlipState, target: 0 | 1) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const start = performance.now();
      const dur = FLIP_MS * Math.max(0.3, Math.abs(target - from.p));
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const p = from.p + (target - from.p) * easeInOut(t);
        if (t < 1) {
          setFlip({ dir: from.dir, p });
          anim.current = requestAnimationFrame(step);
        } else {
          anim.current = null;
          setFlip(null);
          if (target === 1) {
            onIndexChange(index + from.dir);
          }
        }
      };
      anim.current = requestAnimationFrame(step);
    },
    [index, onIndexChange],
  );

  const turn = useCallback(
    (dir: 1 | -1) => {
      const target = index + dir;
      if (target < 0 || target >= pages.length) {
        doBump(dir === 1 ? "right" : "left");
        return;
      }
      setSwayKey((k) => k + 1);
      if (reduceMotion) {
        setFading(true);
        onIndexChange(target);
        setTimeout(() => setFading(false), 160);
        return;
      }
      animateTo({ dir, p: 0 }, 1);
    },
    [index, pages.length, reduceMotion, animateTo, onIndexChange, doBump],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") turn(1);
      if (e.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  const clampPan = (s: number, x: number, y: number) => {
    const mx = ((s - 1) * pageW) / 2;
    const my = ((s - 1) * pageH) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (flip && anim.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        s0: zoom.s,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        ox: zoom.x,
        oy: zoom.y,
      };
      if (flip) {
        setFlip(null);
      }
      return;
    }
    if (zoom.s > 1.01) {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, ox: zoom.x, oy: zoom.y };
    } else {
      gesture.current = { kind: "pending", x: e.clientX, y: e.clientY, t: performance.now() };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = Math.max(1, Math.min(3.5, (g.s0 * d) / Math.max(1, g.d0)));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setZoom(clampPan(s, g.ox + (cx - g.cx), g.oy + (cy - g.cy)));
      suppressClick.current = true;
      return;
    }
    if (g.kind === "pan") {
      setZoom((z) => clampPan(z.s, g.ox + (e.clientX - g.x), g.oy + (e.clientY - g.y)));
      if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 6) suppressClick.current = true;
      return;
    }
    if (g.kind === "pending") {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        const dir: 1 | -1 = dx < 0 ? 1 : -1;
        suppressClick.current = true;
        const target = index + dir;
        if (target < 0 || target >= pages.length || reduceMotion) {
          gesture.current = { kind: "flip", x: g.x, dir, lastX: e.clientX, lastT: performance.now(), v: 0 };
          return;
        }
        setSwayKey((k) => k + 1);
        gesture.current = { kind: "flip", x: g.x, dir, lastX: e.clientX, lastT: performance.now(), v: 0 };
        setFlip({ dir, p: 0 });
      }
      return;
    }
    if (g.kind === "flip") {
      const now = performance.now();
      const v = (e.clientX - g.lastX) / Math.max(1, now - g.lastT);
      gesture.current = { ...g, lastX: e.clientX, lastT: now, v };
      if (flip) {
        const dx = e.clientX - g.x;
        const p = Math.max(0, Math.min(1, (g.dir === 1 ? -dx : dx) / (pageW * 0.9)));
        setFlip({ dir: g.dir, p });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) {
        gesture.current = { kind: "none" };
      }
      return;
    }
    gesture.current = { kind: "none" };
    if (g.kind === "flip") {
      const target = index + g.dir;
      if (target < 0 || target >= pages.length) {
        doBump(g.dir === 1 ? "right" : "left");
      } else if (reduceMotion) {
        turn(g.dir);
      } else if (flip) {
        const fling = (g.dir === 1 ? -g.v : g.v) > 0.5;
        animateTo(flip, flip.p > 0.3 || fling ? 1 : 0);
      }
      return;
    }
    if (g.kind === "pending") {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        setZoom((z) => (z.s > 1.01 ? { s: 1, x: 0, y: 0 } : { s: 2, x: 0, y: 0 }));
        lastTap.current = 0;
        suppressClick.current = true;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  const onObjectClick = (o: PageObject) => {
    if (o.type === "link") {
      onOpenLink(o.url);
    }
  };

  const cur = pages[index];
  let under: Page | undefined;
  let over: Page | undefined;
  let angle = 0;
  if (flip) {
    if (flip.dir === 1) {
      under = pages[index + 1];
      over = cur;
      angle = -180 * flip.p;
    } else {
      under = cur;
      over = pages[index - 1];
      angle = -180 * (1 - flip.p);
    }
  }
  const turnAmt = flip ? Math.sin((Math.abs(angle) / 180) * Math.PI) : 0;

  const stageStyle: CSSProperties = {
    width: pageW,
    height: pageH,
    transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
    animation: bump ? `bump-${bump} 0.3s ease-out` : undefined,
    opacity: fading ? 0.35 : 1,
    transition: fading ? "none" : "opacity 0.16s",
  };

  return (
    <div className="flipper" style={{ width, height }}>
      <div
        className="flipper-touch"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        <div className="flipper-stage" style={stageStyle}>
          {!flip && cur ? (
            <PageSurface page={cur} width={pageW} swayKey={swayKey} still={false} onObjectClick={onObjectClick} />
          ) : null}
          {flip && under ? (
            <div style={{ position: "absolute", inset: 0 }}>
              <PageSurface page={under} width={pageW} swayKey={swayKey} still={false} />
              <div
                className="flip-under-shade"
                style={{ opacity: flip.dir === 1 ? 1 - flip.p : flip.p }}
              />
            </div>
          ) : null}
          {flip && over ? (
            <div
              className="flip-leaf"
              style={{
                transform: `perspective(${pageW * 3.2}px) rotateY(${angle}deg) skewY(${turnAmt * (flip.dir === 1 ? -2.5 : 2.5)}deg)`,
              }}
            >
              <div className="flip-front">
                <PageSurface page={over} width={pageW} swayKey={swayKey} still={false} />
                <div
                  className="flip-gloss"
                  style={{
                    opacity: turnAmt,
                    backgroundPosition: `${100 - (Math.abs(angle) / 180) * 100}% 0`,
                  }}
                />
              </div>
              <div className="flip-back" style={{ opacity: 1 }} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flipper-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label={t("Previous page")}
          disabled={index <= 0}
          onClick={() => turn(-1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <span className="muted">
          {index + 1} / {pages.length}
          {zoom.s > 1.01 ? ` · ${zoom.s.toFixed(1)}x` : ""}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("Next page")}
          disabled={index >= pages.length - 1}
          onClick={() => turn(1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  );
}
