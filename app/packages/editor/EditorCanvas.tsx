import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAGE_H, PAGE_W, type Page, type PageObject, type Stroke } from "../db/types";
import type { Box } from "../drawing/geometry";
import { dragBox as nextBox, duplicateStroke, pickStroke, strokeBox, transformStroke } from "../drawing/objectOps";
import { ShapeDrag, StrokeSession, type InkConfig, type SessionResult, type ShapeStyle } from "../drawing/session";
import { TransformBox, type BoxOp, type DragPhase } from "../drawing/TransformBox";
import { Icon } from "../shell/Icon";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { strokeBounds, translateStroke } from "../drawing/strokes";
import { ObjectBody, objectFrameStyle } from "../page/ObjectViews";
import { PageBackground } from "../page/PageBackground";
import { sortByZ } from "../page/PageSurface";
import type { PeelState } from "../sticker/geometry";
import { hitObjects, isOffPage, toLocal, rotateVec } from "./geometry";
import "../page/page.css";

export type EditMode = "layout" | "ink";

interface Props {
  page: Page;
  mode: EditMode;
  /** Ink settings in handwriting mode; null with `inkSelect` for the stroke selector. */
  ink: InkConfig | null;
  inkSelect: boolean;
  /** Shape tool style in handwriting mode, or null. */
  shapeStyle?: ShapeStyle | null;
  /** Selected handwriting object (stroke or shape). */
  inkSel?: string | null;
  onInkSel?: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (fn: (p: Page) => Page) => void;
  onTransient: (fn: (p: Page) => Page) => void;
  onEditObject: (o: PageObject) => void;
  reduceMotion: boolean;
  focusId: string | null;
  bottomInset: number;
}

type Gesture =
  | { kind: "none" }
  | { kind: "pinch"; d0: number; z0: number; cx: number; cy: number; px: number; py: number }
  | { kind: "pan"; x: number; y: number; px: number; py: number }
  | {
      kind: "obj";
      id: string;
      orig: PageObject;
      sx: number;
      sy: number;
      cx: number;
      cy: number;
      moved: boolean;
      t: number;
      hits: PageObject[];
      draggable: boolean;
    }
  | { kind: "handle"; id: string; orig: PageObject; a0: number; d0: number }
  | { kind: "ink" }
  | { kind: "shapeDrag" }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "moveSel"; sx: number; sy: number; dx: number; dy: number };

interface PeelAnim {
  id: string;
  ux: number;
  uy: number;
  amount: number;
  target: number;
  lift: number;
  liftTarget: number;
}

const MAX_BACKING = 1400;

export function EditorCanvas(props: Props) {
  const { page, mode, ink: inkCfg, inkSelect, shapeStyle, inkSel = null, onInkSel, selectedId, onSelect, onCommit, onTransient, onEditObject, reduceMotion, focusId, bottomInset } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const live = useRef<StrokeSession | null>(null);
  const shapeDrag = useRef<ShapeDrag | null>(null);
  const objDrag = useRef<{ orig: Stroke; box: Box; recorded: boolean } | null>(null);
  const [dragBoxState, setDragBoxState] = useState<Box | null>(null);
  type DragState = { id: string; obj: PageObject; ox: number; oy: number } | null;
  const [drag, setDragState] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  const setDrag = (d: DragState) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [selStrokes, setSelStrokes] = useState<Set<string>>(new Set());
  const [selOffset, setSelOffset] = useState({ dx: 0, dy: 0 });
  const [peel, setPeel] = useState<PeelAnim | null>(null);
  const peelRef = useRef<PeelAnim | null>(null);
  const peelRaf = useRef(0);
  const lastTap = useRef({ t: 0, id: "" });
  const cycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textEls = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHost({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setHost({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = host.w ? Math.min((host.w - 20) / PAGE_W, (host.h - 20 - bottomInset) / PAGE_H) : 0.3;
  const s = Math.max(0.05, fit * view.z);
  const pw = PAGE_W * s;
  const ph = PAGE_H * s;
  const left = (host.w - pw) / 2 + view.x;
  const top = (host.h - bottomInset - ph) / 2 + view.y;
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const backing = Math.min(pw * dpr, MAX_BACKING * dpr) / PAGE_W;

  useEffect(() => {
    if (mode !== "ink") {
      setSelStrokes(new Set());
      setRect(null);
    }
  }, [mode]);

  // Keep the object being edited visible above the panel / keyboard.
  useEffect(() => {
    if (!focusId) return;
    const o = page.objects.find((x) => x.id === focusId);
    if (!o || !host.h) return;
    const targetY = host.h * 0.22;
    const curY = top + o.y * s;
    setView((v) => ({ ...v, y: v.y + (targetY - curY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // Text boxes grow with content; store the measured height (not a history step).
  useLayoutEffect(() => {
    const fixes: { id: string; h: number }[] = [];
    for (const o of page.objects) {
      if (o.type !== "text") continue;
      const el = textEls.current.get(o.id);
      if (!el) continue;
      const h = Math.max(40, el.offsetHeight);
      if (Math.abs(h - o.h) > 2) fixes.push({ id: o.id, h });
    }
    if (fixes.length) {
      onTransient((p) => ({
        ...p,
        objects: p.objects.map((o) => {
          const f = fixes.find((x) => x.id === o.id);
          return f ? { ...o, h: f.h } : o;
        }),
      }));
    }
  });

  /* ---------- peel animation ---------- */

  const runPeel = useCallback(() => {
    if (peelRaf.current) return;
    const tick = () => {
      const p = peelRef.current;
      if (!p) {
        peelRaf.current = 0;
        setPeel(null);
        return;
      }
      const k = reduceMotion ? 1 : 0.22;
      p.amount += (p.target - p.amount) * k;
      p.lift += (p.liftTarget - p.lift) * k;
      setPeel({ ...p });
      if (Math.abs(p.target - p.amount) < 0.4 && Math.abs(p.liftTarget - p.lift) < 0.01) {
        p.amount = p.target;
        p.lift = p.liftTarget;
        setPeel({ ...p });
        peelRaf.current = 0;
        if (p.target === 0) {
          peelRef.current = null;
          setPeel(null);
        }
        return;
      }
      peelRaf.current = requestAnimationFrame(tick);
    };
    peelRaf.current = requestAnimationFrame(tick);
  }, [reduceMotion]);

  useEffect(() => () => cancelAnimationFrame(peelRaf.current), []);

  const startPeel = (o: PageObject, px: number, py: number) => {
    if (o.type !== "sticker" && o.type !== "note" && o.type !== "image") return;
    const l = toLocal(o, px, py);
    let ux = l.x;
    let uy = l.y;
    const len = Math.hypot(ux, uy);
    if (len < 4) {
      ux = 0.7;
      uy = -0.7;
    } else {
      ux /= len;
      uy /= len;
    }
    const isSticker = o.type === "sticker";
    peelRef.current = {
      id: o.id,
      ux,
      uy,
      amount: 0,
      target: isSticker && !reduceMotion ? Math.min(o.w, o.h) * 0.26 : 0,
      lift: 0,
      liftTarget: 1,
    };
    runPeel();
  };

  const steerPeel = (o: PageObject, dx: number, dy: number) => {
    const p = peelRef.current;
    if (!p || p.id !== o.id || o.type !== "sticker") return;
    const d = rotateVec(dx, dy, -o.rot);
    const len = Math.hypot(d.x, d.y);
    if (len < 2) return;
    const nx = p.ux * 0.85 + (d.x / len) * 0.15;
    const ny = p.uy * 0.85 + (d.y / len) * 0.15;
    const nl = Math.hypot(nx, ny) || 1;
    p.ux = nx / nl;
    p.uy = ny / nl;
    p.target = reduceMotion ? 0 : Math.min(o.w, o.h) * Math.min(0.42, 0.26 + len / 1500);
    runPeel();
  };

  const endPeel = () => {
    const p = peelRef.current;
    if (!p) return;
    p.target = 0;
    p.liftTarget = 0;
    runPeel();
  };

  /* ---------- coordinates ---------- */

  const toPage = (cx: number, cy: number) => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (cx - r.left) / s, y: (cy - r.top) / s };
  };

  const selectedStrokeBounds = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const st of page.ink) {
      if (!selStrokes.has(st.id)) continue;
      const b = strokeBounds(st);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  };

  const cancelSingle = () => {
    const g = gesture.current;
    if (g.kind === "ink") {
      live.current?.cancel();
      live.current = null;
    }
    if (g.kind === "shapeDrag") {
      shapeDrag.current?.cancel();
      shapeDrag.current = null;
    }
    if (g.kind === "obj" || g.kind === "handle") {
      setDrag(null);
      endPeel();
    }
    if (g.kind === "rect") setRect(null);
    if (g.kind === "moveSel") setSelOffset({ dx: 0, dy: 0 });
  };

  /* ---------- pointer handling ---------- */

  /** Corrections take two history steps, so Undo first returns to the raw freehand. */
  const commitInk = (r: SessionResult) => {
    if (!r) return;
    const first = r.kind === "freehand" ? r.stroke : r.raw;
    onCommit((p) => ({ ...p, ink: [...p.ink, first] }));
    const second = r.kind === "freehand" ? r.smoothed : r.shape;
    if (second) onCommit((p) => ({ ...p, ink: p.ink.map((st) => (st.id === first.id ? second : st)) }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      cancelSingle();
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        z0: view.z,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        px: view.x,
        py: view.y,
      };
      return;
    }
    if (pointers.current.size > 2) return;
    const pt = toPage(e.clientX, e.clientY);
    const target = e.target as HTMLElement;

    if (mode === "ink") {
      if (shapeStyle) {
        const c = liveRef.current;
        if (!c) return;
        shapeDrag.current = new ShapeDrag(c, backing, shapeStyle, pt.x, pt.y);
        gesture.current = { kind: "shapeDrag" };
        return;
      }
      if (inkSelect || !inkCfg) {
        const b = selectedStrokeBounds();
        const hit = b ? null : pickStroke(page.ink, pt.x, pt.y, 10 / s);
        if (b && pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY) {
          gesture.current = { kind: "moveSel", sx: pt.x, sy: pt.y, dx: 0, dy: 0 };
        } else if (hit) {
          setSelStrokes(new Set());
          onInkSel?.(hit.id);
          gesture.current = { kind: "none" };
        } else {
          onInkSel?.(null);
          setSelStrokes(new Set());
          gesture.current = { kind: "rect", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
          setRect({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
        }
        return;
      }
      const c = liveRef.current;
      if (!c) return;
      live.current = new StrokeSession(c, backing, inkCfg, { unitsPerPx: 1 / s });
      live.current.add(pt.x, pt.y, e.timeStamp, e.pressure, e.pointerType);
      gesture.current = { kind: "ink" };
      return;
    }

    const handle = target.closest("[data-handle]");
    const sel = page.objects.find((o) => o.id === selectedId);
    if (handle && sel && !sel.locked) {
      gesture.current = {
        kind: "handle",
        id: sel.id,
        orig: sel,
        a0: Math.atan2(pt.y - sel.y, pt.x - sel.x),
        d0: Math.max(1, Math.hypot(pt.x - sel.x, pt.y - sel.y)),
      };
      setDrag({ id: sel.id, obj: sel, ox: sel.x, oy: sel.y });
      return;
    }

    const hits = hitObjects(page.objects, pt.x, pt.y);
    if (hits.length) {
      const pick = hits.find((h) => h.id === selectedId) ?? hits[0];
      gesture.current = {
        kind: "obj",
        id: pick.id,
        orig: pick,
        sx: pt.x,
        sy: pt.y,
        cx: e.clientX,
        cy: e.clientY,
        moved: false,
        t: performance.now(),
        hits,
        draggable: !pick.locked,
      };
      if (!pick.locked) {
        startPeel(pick, pt.x, pt.y);
      }
      return;
    }
    gesture.current = view.z > 1.01 ? { kind: "pan", x: e.clientX, y: e.clientY, px: view.x, py: view.y } : { kind: "none" };
    onSelect(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const z = Math.max(1, Math.min(4, (g.z0 * d) / Math.max(1, g.d0)));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setView({ z, x: g.px + (cx - g.cx), y: g.py + (cy - g.cy) });
      return;
    }
    if (g.kind === "pan") {
      setView((v) => ({ ...v, x: g.px + (e.clientX - g.x), y: g.py + (e.clientY - g.y) }));
      return;
    }
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    if (g.kind === "shapeDrag") {
      const pt = toPage(e.clientX, e.clientY);
      shapeDrag.current?.move(pt.x, pt.y);
      return;
    }
    if (g.kind === "ink") {
      const list = events.length ? events : [e.nativeEvent];
      for (const ev of list) {
        const pt = toPage(ev.clientX, ev.clientY);
        live.current?.add(pt.x, pt.y, ev.timeStamp, ev.pressure, ev.pointerType);
      }
      return;
    }
    const pt = toPage(e.clientX, e.clientY);
    if (g.kind === "rect") {
      g.x1 = pt.x;
      g.y1 = pt.y;
      setRect({ x0: g.x0, y0: g.y0, x1: pt.x, y1: pt.y });
      return;
    }
    if (g.kind === "moveSel") {
      g.dx = pt.x - g.sx;
      g.dy = pt.y - g.sy;
      setSelOffset({ dx: g.dx, dy: g.dy });
      return;
    }
    if (g.kind === "obj") {
      if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 6) return;
      if (!g.draggable) return;
      if (!g.moved) {
        g.moved = true;
        onSelect(g.id);
      }
      const dx = pt.x - g.sx;
      const dy = pt.y - g.sy;
      setDrag({ id: g.id, obj: { ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy }, ox: g.orig.x, oy: g.orig.y });
      steerPeel(g.orig, dx, dy);
      return;
    }
    if (g.kind === "handle") {
      const o = g.orig;
      const a = Math.atan2(pt.y - o.y, pt.x - o.x);
      const d = Math.hypot(pt.x - o.x, pt.y - o.y);
      const k = Math.max(0.1, d / g.d0);
      let rot = o.rot + ((a - g.a0) * 180) / Math.PI;
      const snap = Math.round(rot / 90) * 90;
      if (Math.abs(rot - snap) < 4) rot = snap;
      rot = ((rot + 540) % 360) - 180;
      const w = Math.max(40, o.w * k);
      const kk = w / o.w;
      const next: PageObject =
        o.type === "text"
          ? { ...o, w, size: Math.max(10, Math.round(o.size * kk)), rot }
          : o.type === "note"
            ? { ...o, w, h: o.h * kk, textSize: Math.max(10, o.textSize * kk), rot }
            : { ...o, w, h: o.h * kk, rot };
      setDrag({ id: o.id, obj: next, ox: o.x, oy: o.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = { kind: "none" };
      return;
    }
    gesture.current = { kind: "none" };
    const cancelled = e.type === "pointercancel";

    if (g.kind === "shapeDrag") {
      const d = shapeDrag.current;
      shapeDrag.current = null;
      const st = d?.finish() ?? null;
      if (st && !cancelled) {
        onCommit((p) => ({ ...p, ink: [...p.ink, st] }));
        onInkSel?.(st.id);
      }
      return;
    }
    if (g.kind === "ink") {
      const session = live.current;
      live.current = null;
      if (!session) return;
      if (cancelled) {
        session.cancel();
        return;
      }
      const end = toPage(e.clientX, e.clientY);
      commitInk(session.finish(end.x, end.y));
      return;
    }
    if (g.kind === "rect") {
      setRect(null);
      const minX = Math.min(g.x0, g.x1);
      const maxX = Math.max(g.x0, g.x1);
      const minY = Math.min(g.y0, g.y1);
      const maxY = Math.max(g.y0, g.y1);
      const ids = new Set<string>();
      for (const st of page.ink) {
        if (st.mode === "erase") continue;
        const b = strokeBounds(st);
        if (b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY) ids.add(st.id);
      }
      setSelStrokes(ids);
      return;
    }
    if (g.kind === "moveSel") {
      setSelOffset({ dx: 0, dy: 0 });
      if (!cancelled && (g.dx || g.dy)) {
        const { dx, dy } = g;
        onCommit((p) => ({
          ...p,
          ink: p.ink.map((st) => (selStrokes.has(st.id) ? translateStroke(st, dx, dy) : st)),
        }));
      }
      return;
    }
    if (g.kind === "handle") {
      const d = dragRef.current;
      setDrag(null);
      if (d && !cancelled) {
        onCommit((p) => ({ ...p, objects: p.objects.map((o) => (o.id === d.id ? d.obj : o)) }));
      }
      return;
    }
    if (g.kind === "obj") {
      endPeel();
      if (g.moved) {
        const d = dragRef.current;
        setDrag(null);
        if (d && !cancelled) {
          onCommit((p) => ({ ...p, objects: p.objects.map((o) => (o.id === d.id ? d.obj : o)) }));
        }
        return;
      }
      if (cancelled) return;
      const now = performance.now();
      if (selectedId !== g.id) {
        onSelect(g.id);
        lastTap.current = { t: now, id: g.id };
        return;
      }
      // Second tap on the selected object: double tap edits, single tap cycles
      // to the next overlapping object underneath.
      if (cycleTimer.current && lastTap.current.id === g.id && now - lastTap.current.t < 350) {
        clearTimeout(cycleTimer.current);
        cycleTimer.current = null;
        lastTap.current = { t: 0, id: "" };
        const o = page.objects.find((x) => x.id === g.id);
        if (o && !o.locked && (o.type === "text" || o.type === "note" || o.type === "link")) {
          onEditObject(o);
        }
        return;
      }
      lastTap.current = { t: now, id: g.id };
      const hits = g.hits;
      cycleTimer.current = setTimeout(() => {
        cycleTimer.current = null;
        if (hits.length > 1) {
          const idx = hits.findIndex((h) => h.id === g.id);
          onSelect(hits[(idx + 1) % hits.length].id);
        }
      }, 320);
    }
  };

  /* ---------- handwriting object selection ---------- */

  const inkSelStroke = mode === "ink" && inkSel ? page.ink.find((st) => st.id === inkSel) ?? null : null;
  const inkSelBox = inkSelStroke ? (dragBoxState && objDrag.current?.orig.id === inkSelStroke.id ? dragBoxState : strokeBox(inkSelStroke)) : null;

  const dragInkSel = (op: BoxOp, phase: DragPhase, p: { x: number; y: number }, start: { x: number; y: number }) => {
    if (!inkSelStroke || !inkSelBox) return;
    if (phase === "start") {
      objDrag.current = { orig: inkSelStroke, box: inkSelBox, recorded: false };
      return;
    }
    const d = objDrag.current;
    if (!d) return;
    const nb = nextBox(d.box, op, p, start);
    const next = transformStroke(d.orig, d.box, nb);
    const fn = (pg: Page) => ({ ...pg, ink: pg.ink.map((st) => (st.id === next.id ? next : st)) });
    // One undo step per drag: the first change records, the rest are transient.
    if (!d.recorded) {
      onCommit(fn);
      d.recorded = true;
    } else onTransient(fn);
    setDragBoxState(d.orig.shape ? null : nb);
    if (phase === "end") {
      objDrag.current = null;
      setDragBoxState(null);
    }
  };

  /* ---------- render ---------- */

  const objects = sortByZ(page.objects).map((o) => (drag && drag.id === o.id ? drag.obj : o));
  const sel = objects.find((o) => o.id === selectedId) ?? null;
  const handleSize = 30 / s;
  const ink: Stroke[] =
    selOffset.dx || selOffset.dy
      ? page.ink.map((st) => (selStrokes.has(st.id) ? translateStroke(st, selOffset.dx, selOffset.dy) : st))
      : page.ink;
  const sb = mode === "ink" && selStrokes.size ? selectedStrokeBounds() : null;

  return (
    <div
      ref={hostRef}
      className="editor-host"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={surfaceRef}
        className="page-surface"
        style={{ position: "absolute", left, top, width: pw, height: ph }}
      >
        <div className="page-inner" style={{ transform: `scale(${s})` }}>
          <PageBackground style={page.style} date={page.date} />
          {objects.map((o) => {
            const isDrag = drag?.id === o.id;
            const p: PeelState | null = peel && peel.id === o.id && o.type === "sticker" ? peel : null;
            const lift = peel && peel.id === o.id ? peel.lift : 0;
            return (
              <div
                key={o.id}
                data-obj={o.id}
                style={{
                  ...objectFrameStyle(o),
                  transform: `rotate(${o.rot}deg) scale(${o.type === "sticker" ? 1 : 1 + lift * 0.025})`,
                  filter:
                    lift > 0.01 && o.type !== "sticker"
                      ? `drop-shadow(0 ${lift * 10}px ${lift * 14}px rgba(40,30,20,0.28))`
                      : undefined,
                }}
              >
                <ObjectBody
                  o={o}
                  still
                  pixelScale={s}
                  peel={p}
                  holoAngle={
                    o.type === "sticker" && isDrag && drag
                      ? o.snap.holoAngle + o.rot + (o.x - drag.ox) * 0.35 - (o.y - drag.oy) * 0.25 + (p?.amount ?? 0) * 0.6
                      : o.type === "sticker" && p
                        ? o.snap.holoAngle + o.rot + p.amount * 0.6
                        : undefined
                  }
                  textRef={(el) => {
                    if (el) textEls.current.set(o.id, el);
                    else textEls.current.delete(o.id);
                  }}
                />
              </div>
            );
          })}
          <StrokeCanvas strokes={ink} w={PAGE_W} h={PAGE_H} pixelWidth={Math.min(pw, MAX_BACKING)} style={{ zIndex: 10000 }} />
          <canvas
            ref={liveRef}
            width={Math.round(PAGE_W * backing)}
            height={Math.round(PAGE_H * backing)}
            style={{ position: "absolute", left: 0, top: 0, width: PAGE_W, height: PAGE_H, zIndex: 10001, pointerEvents: "none" }}
          />
          {mode === "layout" && sel ? (
            <div
              className="sel-frame"
              style={{
                ...objectFrameStyle(sel),
                zIndex: 10002,
                outline: `${2 / s}px ${sel.locked ? "dashed" : "solid"} ${sel.locked ? "#8a7b68" : "#1b1b1b"}`,
                outlineOffset: 4 / s,
              }}
            >
              {sel.locked ? (
                <div className="sel-lock" style={{ fontSize: 14 / s, top: -26 / s }}>🔒 Locked</div>
              ) : (
                <div
                  data-handle="transform"
                  className="sel-handle"
                  aria-label="Resize and rotate"
                  style={{
                    width: handleSize,
                    height: handleSize,
                    right: -handleSize / 2 - 4 / s,
                    bottom: -handleSize / 2 - 4 / s,
                    borderWidth: 2 / s,
                  }}
                />
              )}
              {isOffPage(sel) ? <div className="sel-lock" style={{ fontSize: 14 / s, top: -26 / s }}>Off page</div> : null}
            </div>
          ) : null}
          {inkSelBox ? (
            <TransformBox box={inkSelBox} unit={1} zoom={s} toSurface={toPage} onDrag={dragInkSel} z={10004} />
          ) : null}
          {rect ? (
            <div
              style={{
                position: "absolute",
                left: Math.min(rect.x0, rect.x1),
                top: Math.min(rect.y0, rect.y1),
                width: Math.abs(rect.x1 - rect.x0),
                height: Math.abs(rect.y1 - rect.y0),
                border: `${2 / s}px dashed #1b1b1b`,
                background: "rgba(56,104,184,0.06)",
                zIndex: 10003,
              }}
            />
          ) : null}
          {sb ? (
            <div
              style={{
                position: "absolute",
                left: sb.minX + selOffset.dx - 6,
                top: sb.minY + selOffset.dy - 6,
                width: sb.maxX - sb.minX + 12,
                height: sb.maxY - sb.minY + 12,
                border: `${2 / s}px dashed #d2553f`,
                zIndex: 10003,
              }}
            />
          ) : null}
        </div>
      </div>
      {inkSelStroke ? (
        <div className="float-group ink-sel-actions" role="toolbar" aria-label="Selection" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Duplicate"
            onClick={() => {
              const copy = duplicateStroke(inkSelStroke);
              onCommit((pg) => ({ ...pg, ink: [...pg.ink, copy] }));
              onInkSel?.(copy.id);
            }}
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete"
            style={{ color: "var(--destructive)" }}
            onClick={() => {
              const id = inkSelStroke.id;
              onCommit((pg) => ({ ...pg, ink: pg.ink.filter((st) => st.id !== id) }));
              onInkSel?.(null);
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
