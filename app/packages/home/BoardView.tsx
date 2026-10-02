import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BOARD_H, BOARD_W, type BoardItem, type HomeBoard } from "../db/types";
import { StrokeSession, type InkConfig, type SessionResult } from "../drawing/session";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { t } from "../i18n";
import { fillCss } from "../shell/FillPicker";
import { Icon } from "../shell/Icon";
import { StickerArt } from "../sticker/StickerArt";
import { PresetArt, presetById } from "./presets";

export type BoardMode = "stickers" | "doodle";

export const BOARD_COLORS: { id: string; label: string; css: string }[] = [
  { id: "blush", get label() { return t("Blush"); }, css: "linear-gradient(to top, #fedaff 64.76%, #fff)" },
  { id: "lilac", get label() { return t("Lilac"); }, css: "#d9c8f2" },
  { id: "mint", get label() { return t("Mint"); }, css: "#cdeedd" },
  { id: "sky", get label() { return t("Sky"); }, css: "#cfe4fb" },
  { id: "kraft", get label() { return t("Kraft"); }, css: "#e2cda7" },
  { id: "paper", get label() { return t("Paper"); }, css: "#fdfaf2" },
];

/** Fill below a short board on tall screens: the bottom color of the board background. */
const BELOW: Record<string, string> = { blush: "#fedaff" };

/** Board fill and the color used below it on tall screens. */
export function boardFill(bg: HomeBoard["background"]): { css: string; below: string } {
  if (bg.color === "custom" && bg.custom) {
    const c = bg.custom;
    return { css: fillCss(c), below: c.kind === "solid" ? c.color : c.to };
  }
  const p = boardColor(bg.color);
  return { css: p.css, below: BELOW[p.id] ?? p.css };
}

export function boardColor(id: string) {
  return BOARD_COLORS.find((c) => c.id === id) ?? BOARD_COLORS[0];
}

const NOISE = (freq: number, alpha: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2 0 0 0 0 .1 0 0 0 0 .1 0 0 0 ${alpha} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const TEXTURE: Record<string, string | undefined> = {
  smooth: undefined,
  grain: NOISE(0.85, 0.16),
  paper: `${NOISE(0.04, 0.1)}, ${NOISE(0.6, 0.12)}`,
};

export function itemRatio(it: BoardItem) {
  if (it.source === "sticker" && it.snap) return it.snap.h / Math.max(1, it.snap.w);
  return presetById(it.presetId)?.ratio ?? 1;
}

/** Item box in board units. */
function boxOf(it: BoardItem) {
  const w = it.w * BOARD_W;
  const h = w * itemRatio(it);
  return { cx: it.x * BOARD_W, cy: it.y * BOARD_W, w, h };
}

function ItemArt({ it, w, h }: { it: BoardItem; w: number; h: number }) {
  if (it.source === "sticker" && it.snap) {
    const s = it.snap;
    return <StickerArt artAssetId={s.artAssetId} shapeAssetId={s.shapeAssetId} material={s.material} w={w} h={h} angle={s.holoAngle + it.rot} />;
  }
  const p = presetById(it.presetId);
  if (!p) return null;
  return (
    <div className={`board-preset${p.id.startsWith("icon-") ? " is-icon" : ""}${p.flat ? " is-flat" : ""}`}>
      <PresetArt id={p.id} />
    </div>
  );
}

type Gesture =
  | { kind: "none" }
  | { kind: "move"; id: string; orig: BoardItem; sx: number; sy: number; cx: number; cy: number; moved: boolean }
  | { kind: "handle"; id: string; orig: BoardItem; a0: number; d0: number }
  | { kind: "pinch"; id: string; orig: BoardItem; a0: number; d0: number; mx: number; my: number }
  | { kind: "ink" };

const clampW = (w: number) => Math.max(0.06, Math.min(1.6, w));

export function BoardView({
  board,
  width,
  mode,
  selectedId,
  onSelect,
  onCommit,
  ink,
  scrollRef,
  actions,
}: {
  board: HomeBoard;
  width: number;
  mode: BoardMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (fn: (b: HomeBoard) => HomeBoard) => void;
  ink: InkConfig | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Action bar shown above the selected sticker. */
  actions?: React.ReactNode;
}) {
  const s = width / BOARD_W;
  const boardRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const session = useRef<StrokeSession | null>(null);
  const [drag, setDragState] = useState<BoardItem | null>(null);
  const dragRef = useRef<BoardItem | null>(null);
  // The ref is updated synchronously so a release right after a move still commits it.
  const setDrag = (d: BoardItem | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const backing = (width * dpr) / BOARD_W;

  useEffect(() => {
    if (mode === "doodle") onSelect(null);
  }, [mode, onSelect]);

  const toBoard = (x: number, y: number) => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (x - r.left) / s, y: (y - r.top) / s };
  };

  const items = board.items.map((it) => (drag && it.id === drag.id ? drag : it)).sort((a, b) => a.z - b.z);
  const find = (id: string) => board.items.find((it) => it.id === id) ?? null;

  const commitInk = (r: SessionResult) => {
    if (!r) return;
    const first = r.kind === "freehand" ? r.stroke : r.raw;
    onCommit((b) => ({ ...b, strokes: [...b.strokes, first] }));
    const second = r.kind === "freehand" ? r.smoothed : r.shape;
    if (second) onCommit((b) => ({ ...b, strokes: b.strokes.map((st) => (st.id === first.id ? second : st)) }));
  };

  const startPinch = (id: string) => {
    const orig = dragRef.current?.id === id ? dragRef.current : find(id);
    if (!orig) return;
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: "pinch",
      id,
      orig,
      a0: Math.atan2(b.y - a.y, b.x - a.x),
      d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const itemEl = target.closest<HTMLElement>("[data-item]");
    const handle = target.closest("[data-handle]");
    if (mode === "stickers" && !itemEl && !handle && pointers.current.size === 0) {
      // Empty board: just deselect.
      if (!target.closest("[data-actions]")) onSelect(null);
      return;
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Capture is best effort (synthetic or already-released pointers).
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (mode === "doodle") {
      if (pointers.current.size > 1) {
        session.current?.cancel();
        session.current = null;
        gesture.current = { kind: "none" };
        return;
      }
      const c = liveRef.current;
      if (!c || !ink) return;
      const p = toBoard(e.clientX, e.clientY);
      session.current = new StrokeSession(c, backing, ink, { unitsPerPx: 1 / s });
      session.current.add(p.x, p.y, e.timeStamp, e.pressure, e.pointerType);
      gesture.current = { kind: "ink" };
      return;
    }

    const g = gesture.current;
    if (pointers.current.size === 2) {
      const id = g.kind === "move" || g.kind === "handle" ? g.id : selectedId;
      if (id) startPinch(id);
      return;
    }
    if (pointers.current.size > 2) return;

    const p = toBoard(e.clientX, e.clientY);
    if (handle && selectedId) {
      const orig = find(selectedId);
      if (!orig) return;
      const b = boxOf(orig);
      gesture.current = {
        kind: "handle",
        id: orig.id,
        orig,
        a0: Math.atan2(p.y - b.cy, p.x - b.cx),
        d0: Math.max(1, Math.hypot(p.x - b.cx, p.y - b.cy)),
      };
      return;
    }
    const id = itemEl?.dataset.item;
    const orig = id ? find(id) : null;
    if (!orig) return;
    onSelect(orig.id);
    gesture.current = { kind: "move", id: orig.id, orig, sx: p.x, sy: p.y, cx: e.clientX, cy: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "ink") {
      const evs = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const p = toBoard(ev.clientX, ev.clientY);
        session.current?.add(p.x, p.y, ev.timeStamp, ev.pressure, ev.pointerType);
      }
      return;
    }
    if (g.kind === "move") {
      if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 5) return;
      g.moved = true;
      const p = toBoard(e.clientX, e.clientY);
      setDrag({ ...g.orig, x: g.orig.x + (p.x - g.sx) / BOARD_W, y: g.orig.y + (p.y - g.sy) / BOARD_W });
      return;
    }
    if (g.kind === "handle") {
      const p = toBoard(e.clientX, e.clientY);
      const b = boxOf(g.orig);
      const a = Math.atan2(p.y - b.cy, p.x - b.cx);
      const d = Math.hypot(p.x - b.cx, p.y - b.cy);
      let rot = g.orig.rot + ((a - g.a0) * 180) / Math.PI;
      const snap = Math.round(rot / 90) * 90;
      if (Math.abs(rot - snap) < 4) rot = snap;
      setDrag({ ...g.orig, w: clampW((g.orig.w * d) / g.d0), rot: ((rot + 540) % 360) - 180 });
      return;
    }
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const rot = g.orig.rot + ((ang - g.a0) * 180) / Math.PI;
      setDrag({
        ...g.orig,
        w: clampW((g.orig.w * d) / g.d0),
        rot: ((rot + 540) % 360) - 180,
        x: g.orig.x + (mx - g.mx) / s / BOARD_W,
        y: g.orig.y + (my - g.my) / s / BOARD_W,
      });
    }
  };

  const finishDrag = (cancelled: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    if (d && !cancelled) onCommit((b) => ({ ...b, items: b.items.map((it) => (it.id === d.id ? d : it)) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const cancelled = e.type === "pointercancel";
    const g = gesture.current;
    if (g.kind === "ink") {
      gesture.current = { kind: "none" };
      const sess = session.current;
      session.current = null;
      if (!sess) return;
      if (cancelled) {
        sess.cancel();
        return;
      }
      const p = toBoard(e.clientX, e.clientY);
      commitInk(sess.finish(p.x, p.y));
      return;
    }
    if (g.kind === "pinch") {
      if (pointers.current.size > 0) return;
      gesture.current = { kind: "none" };
      finishDrag(cancelled);
      return;
    }
    gesture.current = { kind: "none" };
    if (g.kind === "move" || g.kind === "handle") finishDrag(cancelled);
  };

  const sel = mode === "stickers" && selectedId ? items.find((it) => it.id === selectedId) ?? null : null;
  const fill = boardFill(board.background);
  const tex = TEXTURE[board.background.texture];

  // Action bar position in stage pixels: above the selection, or below it near the top.
  let barStyle: CSSProperties | null = null;
  if (sel) {
    const b = boxOf(sel);
    const r = (sel.rot * Math.PI) / 180;
    const hh = (Math.abs(Math.sin(r)) * b.w + Math.abs(Math.cos(r)) * b.h) / 2;
    const top = (b.cy - hh) * s - 60;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const below = top < scrollTop + 64;
    barStyle = {
      left: Math.max(8, Math.min(width - 176, b.cx * s - 84)),
      top: below ? (b.cy + hh) * s + 16 : top,
    };
  }

  return (
    <div className="board-stage" style={{ height: BOARD_H * s, background: fill.below }}>
      <div
        ref={boardRef}
        className={`board${mode === "doodle" ? " is-doodle" : ""}`}
        style={{ transform: `scale(${s})`, background: fill.css }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {board.background.shapes ? (
          <>
            <img className="board-shape" src="/home/bgblob.webp" alt="" style={{ left: 0, top: 246, width: 334, height: 579 }} />
            <img className="board-shape" src="/home/bgglow.webp" alt="" style={{ left: 0, top: 18, width: 402, height: 856 }} />
          </>
        ) : null}
        {tex ? <div className="board-texture" style={{ backgroundImage: tex }} /> : null}
        <StrokeCanvas strokes={board.strokes} w={BOARD_W} h={BOARD_H} pixelWidth={width} style={{ zIndex: 1 }} />
        <canvas
          ref={liveRef}
          width={Math.round(BOARD_W * backing)}
          height={Math.round(BOARD_H * backing)}
          style={{ position: "absolute", left: 0, top: 0, width: BOARD_W, height: BOARD_H, zIndex: 2, pointerEvents: "none" }}
        />
        {items.map((it) => {
          const b = boxOf(it);
          return (
            <div
              key={it.id}
              data-item={it.id}
              className="board-item"
              style={{ left: b.cx - b.w / 2, top: b.cy - b.h / 2, width: b.w, height: b.h, transform: `rotate(${it.rot}deg)`, zIndex: 10 + it.z }}
            >
              <ItemArt it={it} w={b.w} h={b.h} />
            </div>
          );
        })}
        {sel
          ? (() => {
              const b = boxOf(sel);
              const pad = 4 / s;
              return (
                <div
                  className="board-sel"
                  style={{
                    left: b.cx - b.w / 2 - pad,
                    top: b.cy - b.h / 2 - pad,
                    width: b.w + pad * 2,
                    height: b.h + pad * 2,
                    transform: `rotate(${sel.rot}deg)`,
                    borderWidth: 1.5 / s,
                    borderRadius: 4 / s,
                  }}
                >
                  <div
                    data-handle
                    className="board-handle-hit"
                    role="button"
                    aria-label={t("Resize and rotate")}
                    style={{ width: 44 / s, height: 44 / s, right: -22 / s, bottom: -22 / s }}
                  >
                    <span style={{ width: 14 / s, height: 14 / s, borderWidth: 1.5 / s }} />
                  </div>
                </div>
              );
            })()
          : null}
      </div>
      {sel && barStyle && actions ? (
        <div className="board-actbar" data-actions style={barStyle}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ActButton({ icon, label, onClick, danger }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`icon-btn${danger ? " is-danger" : ""}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={20} />
    </button>
  );
}
