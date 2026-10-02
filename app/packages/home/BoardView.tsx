import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BOARD_H, BOARD_W, type BoardItem, type HomeBoard } from "../db/types";
import { StrokeSession, type InkConfig, type SessionResult } from "../drawing/session";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { t } from "../i18n";
import { fillCss } from "../shell/FillPicker";
import { Icon } from "../shell/Icon";
import { StickerArt } from "../sticker/StickerArt";
import { hitStroke } from "../drawing/objectOps";
import { PresetArt, presetById } from "./presets";
import {
  PHYSICS,
  isIOSDevice,
  kick,
  motionReader,
  nudge,
  requestMotionPermission,
  step,
  type Body,
  type MotionSample,
  type Rect,
  type Vec,
  type World,
} from "./stickerPhysics";

/** Phone motion tuning: gentle sways from small movements. */
const MOTION = {
  /** Phone acceleration (m/s², gravity removed) that counts as a shake. */
  joltThreshold: 1.1,
  /** Tilt change (m/s² of gravity on screen, ~5°) that wakes the stickers. */
  tiltThreshold: 0.9,
  /** Velocity change (board units/s) per m/s² of phone acceleration, per event. */
  joltImpulse: 9,
  /** Downhill acceleration (board units/s²) per m/s² of tilt. */
  tiltForce: 24,
  /** Stickers settle once the phone has been still this long. */
  quietMs: 900,
};

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
  if (it.source === "doodle" && it.dw && it.dh) return it.dh / it.dw;
  return presetById(it.presetId)?.ratio ?? 1;
}

/** Item box in board units. */
function boxOf(it: BoardItem) {
  const w = it.w * BOARD_W;
  const h = w * itemRatio(it);
  return { cx: it.x * BOARD_W, cy: it.y * BOARD_W, w, h };
}

function ItemArt({ it, w, h, px }: { it: BoardItem; w: number; h: number; px: number }) {
  if (it.source === "doodle" && it.strokes && it.dw && it.dh) {
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: it.dw, height: it.dh, transform: `scale(${w / it.dw})`, transformOrigin: "0 0" }}>
        <StrokeCanvas strokes={it.strokes} w={it.dw} h={it.dh} pixelWidth={w * px} />
      </div>
    );
  }
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

  /** Sticker currently lifted by a finger (drag / pinch). */
  const [lifted, setLifted] = useState<string | null>(null);
  const itemEls = useRef(new Map<string, HTMLDivElement>());
  const physics = useRef<{ bodies: Body[]; raf: number; last: number; t0: number } | null>(null);
  const [scattering, setScattering] = useState(false);
  /** Positions just committed by an interrupted scatter, until the board prop catches up. */
  const pending = useRef<Map<string, BoardItem> | null>(null);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    pending.current = null;
  }, [board]);

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
  const find = (id: string) => pending.current?.get(id) ?? board.items.find((it) => it.id === id) ?? null;

  /* ---------- scatter physics ---------- */

  /** Walls = the visible board; solids = nav bar and floating controls, in board units. */
  const worldNow = (): World | null => {
    const br = boardRef.current?.getBoundingClientRect();
    const host = scrollRef.current;
    if (!br || !host) return null;
    const hr = host.getBoundingClientRect();
    const toRect = (r: DOMRect, pad = 6): Rect => ({
      x0: (r.left - br.left) / s - pad,
      y0: (r.top - br.top) / s - pad,
      x1: (r.right - br.left) / s + pad,
      y1: (r.bottom - br.top) / s + pad,
    });
    const frame = host.closest(".home-screen");
    const solids: Rect[] = [];
    frame?.querySelectorAll<HTMLElement>(".bottom-nav, .home-top > *").forEach((el) => solids.push(toRect(el.getBoundingClientRect())));
    const nav = frame?.querySelector(".bottom-nav")?.getBoundingClientRect();
    const bottom = Math.min(BOARD_H, (hr.bottom - br.top) / s, nav ? (nav.top - br.top) / s : Infinity);
    return { bounds: { x0: 4, y0: 4, x1: BOARD_W - 4, y1: bottom - 4 }, solids };
  };

  const paint = (b: Body) => {
    const el = itemEls.current.get(b.id);
    if (!el) return;
    el.style.left = `${b.cx - b.w / 2}px`;
    el.style.top = `${b.cy - b.h / 2}px`;
    el.style.transform = `rotate(${b.rot}deg)`;
  };

  const setLift = (id: string, on: boolean) => itemEls.current.get(id)?.firstElementChild?.classList.toggle("is-lifted", on);

  /** Ends a scatter: settles everything where it is and commits one undo step. */
  const endScatter = () => {
    const ph = physics.current;
    if (!ph) return;
    cancelAnimationFrame(ph.raf);
    physics.current = null;
    setScattering(false);
    const moved = new Map<string, BoardItem>();
    for (const b of ph.bodies) {
      setLift(b.id, false);
      const it = board.items.find((x) => x.id === b.id);
      if (it) moved.set(b.id, { ...it, x: b.cx / BOARD_W, y: b.cy / BOARD_W, rot: ((b.rot % 360) + 540) % 360 - 180 });
    }
    pending.current = moved;
    onCommit((bd) => ({ ...bd, items: bd.items.map((it) => moved.get(it.id) ?? it) }));
  };

  /** Latest phone motion: tilt (gravity on screen) and when the phone last moved. */
  const motion = useRef<{ gravity: Vec; settledGravity: Vec | null; lastMove: number }>({ gravity: { x: 0, y: 0 }, settledGravity: null, lastMove: 0 });

  /** Floats the stickers and runs the simulation; `prepare` sets their starting velocities. */
  const runPhysics = (prepare: (bodies: Body[]) => Body[]) => {
    if (mode !== "stickers" || gesture.current.kind !== "none") return;
    if (physics.current) {
      // Already floating: wake everything with the new push.
      const ph = physics.current;
      ph.bodies = prepare(ph.bodies);
      ph.t0 = performance.now();
      for (const b of ph.bodies) setLift(b.id, true);
      return;
    }
    const world = worldNow();
    if (!world) return;
    onSelect(null);
    const start = board.items
      .filter((it) => !(it.source === "preset" && presetById(it.presetId)?.flat))
      .map((it) => {
        const b = boxOf(it);
        return { id: it.id, cx: b.cx, cy: b.cy, w: b.w, h: b.h, rot: it.rot, vx: 0, vy: 0, vr: 0, settled: false };
      });
    if (!start.length) return;
    const bodies = prepare(start);
    for (const b of bodies) setLift(b.id, true);
    setScattering(true);
    const tick = (now: number) => {
      const ph = physics.current;
      if (!ph) return;
      const dt = Math.min(0.033, (now - ph.last) / 1000);
      ph.last = now;
      const m = motion.current;
      const moving = now - m.lastMove < MOTION.quietMs;
      // Tilt pulls the stickers "downhill" only while the phone is moving.
      const force = moving ? { x: m.gravity.x * MOTION.tiltForce, y: m.gravity.y * MOTION.tiltForce } : { x: 0, y: 0 };
      const before = new Set(ph.bodies.filter((b) => b.settled).map((b) => b.id));
      ph.bodies = step(ph.bodies, dt, world, force, !moving);
      for (const b of ph.bodies) {
        paint(b);
        // Each sticker drops back onto the paper as soon as it comes to rest.
        if (b.settled && !before.has(b.id)) setLift(b.id, false);
      }
      if ((!moving && ph.bodies.every((b) => b.settled)) || now - ph.t0 > PHYSICS.maxSeconds * 1000) {
        m.settledGravity = m.gravity;
        endScatter();
        return;
      }
      ph.raf = requestAnimationFrame(tick);
    };
    const now = performance.now();
    physics.current = { bodies, raf: requestAnimationFrame(tick), last: now, t0: now };
  };

  /** Tap on empty paper: random scatter. */
  const scatter = () => runPhysics((bodies) => bodies.map((b) => kick(b)));

  const onMotionSample = (sample: MotionSample) => {
    const m = motion.current;
    m.gravity = sample.gravity;
    if (mode !== "stickers" || gesture.current.kind !== "none") return;
    const jolt = Math.hypot(sample.linear.x, sample.linear.y);
    const ref = m.settledGravity ?? sample.gravity;
    m.settledGravity ??= sample.gravity;
    const tilt = Math.hypot(sample.gravity.x - ref.x, sample.gravity.y - ref.y);
    if (jolt < MOTION.joltThreshold && tilt < MOTION.tiltThreshold && !physics.current) return;
    if (jolt >= MOTION.joltThreshold || tilt >= MOTION.tiltThreshold) m.lastMove = performance.now();
    if (jolt >= MOTION.joltThreshold) {
      // Stickers lag behind the phone: push opposite to its acceleration.
      runPhysics((bodies) => nudge(bodies, { x: -sample.linear.x * MOTION.joltImpulse, y: -sample.linear.y * MOTION.joltImpulse }));
    } else if (tilt >= MOTION.tiltThreshold) {
      // Re-baseline so holding the phone at a new angle lets things settle.
      m.settledGravity = sample.gravity;
      runPhysics((bodies) => nudge(bodies, { x: 0, y: 0 }));
    }
  };
  const onMotionRef = useRef(onMotionSample);
  onMotionRef.current = onMotionSample;

  useEffect(() => () => {
    if (physics.current) cancelAnimationFrame(physics.current.raf);
  }, []);

  // Moving or tilting the phone sways the stickers with it.
  useEffect(() => {
    if (mode !== "stickers" || typeof window === "undefined") return;
    const read = motionReader(isIOSDevice());
    const onMotion = (e: DeviceMotionEvent) => {
      const sample = read(e);
      if (sample) onMotionRef.current(sample);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [mode]);

  // iOS only grants motion events after a tap; ask on the first one (click/touchend count as user gestures).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ask = () => {
      void requestMotionPermission();
      window.removeEventListener("touchend", ask);
      window.removeEventListener("click", ask);
    };
    window.addEventListener("touchend", ask, { once: true });
    window.addEventListener("click", ask, { once: true });
    return () => {
      window.removeEventListener("touchend", ask);
      window.removeEventListener("click", ask);
    };
  }, []);

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
    const doodleMiss = (() => {
      const it = itemEl?.dataset.item ? find(itemEl.dataset.item) : null;
      if (!it || it.source !== "doodle" || !it.strokes || !it.dw) return false;
      const b = boxOf(it);
      const p0 = toBoard(e.clientX, e.clientY);
      const r = (-it.rot * Math.PI) / 180;
      const dx = p0.x - b.cx;
      const dy = p0.y - b.cy;
      const k = it.dw / b.w;
      const lx = (dx * Math.cos(r) - dy * Math.sin(r)) * k + it.dw / 2;
      const ly = (dx * Math.sin(r) + dy * Math.cos(r)) * k + (it.dh ?? 0) / 2;
      return !it.strokes.some((st) => hitStroke(st, lx, ly, 14 * k));
    })();
    if (mode === "stickers" && (!itemEl || doodleMiss) && !handle && pointers.current.size === 0) {
      // Empty board: a tap deselects, or scatters the stickers when nothing is selected.
      tap.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    // Grabbing a sticker mid-scatter settles the rest where they are.
    if (mode === "stickers" && physics.current) endScatter();
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
    setLifted(orig.id);
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
    setLifted(null);
    if (d && !cancelled) onCommit((b) => ({ ...b, items: b.items.map((it) => (it.id === d.id ? d : it)) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const tp = tap.current;
    tap.current = null;
    if (tp && e.type === "pointerup" && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 10 && performance.now() - tp.t < 400) {
      if (selectedId) onSelect(null);
      else scatter();
      return;
    }
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
    else setLifted(null);
  };

  const sel = mode === "stickers" && selectedId && !lifted && !scattering ? items.find((it) => it.id === selectedId) ?? null : null;
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
              ref={(el) => {
                if (el) itemEls.current.set(it.id, el);
                else itemEls.current.delete(it.id);
              }}
              className={`board-item${it.source === "preset" && presetById(it.presetId)?.flat ? " is-flat" : ""}`}
              style={{ left: b.cx - b.w / 2, top: b.cy - b.h / 2, width: b.w, height: b.h, transform: `rotate(${it.rot}deg)`, zIndex: lifted === it.id ? 9000 : 10 + it.z }}
            >
              {/* Lift layer: peel-up scale / shadow, springs back when released. */}
              <div className={`board-lift${lifted === it.id ? " is-lifted" : ""}`}>
                <ItemArt it={it} w={b.w} h={b.h} px={s} />
              </div>
            </div>
          );
        })}
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
