import { useEffect, useRef, useState } from "react";
import { NOTE_BASE, type NoteObject, type Stroke } from "../db/types";
import { LiveInk } from "../drawing/liveInk";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { NOTE_COLORS, NOTE_FIXES, NOTE_SHAPES, NoteView } from "../page/ObjectViews";
import { Sheet } from "../shell/Sheet";

const PREVIEW_W = 200;

function NoteInk({
  note,
  onChange,
}: {
  note: NoteObject;
  onChange: (strokes: Stroke[]) => void;
}) {
  const liveRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<LiveInk | null>(null);
  const [eraser, setEraser] = useState(false);
  const h = (NOTE_BASE * note.h) / note.w;
  const k = 260 / NOTE_BASE;
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  const toLocal = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  return (
    <div>
      <div
        style={{
          position: "relative",
          width: 260,
          height: h * k,
          background: note.color,
          borderRadius: 6,
          touchAction: "none",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (!liveRef.current) return;
          live.current = new LiveInk(liveRef.current, k * dpr, {
            tool: eraser ? "eraser" : "pen",
            color: "#2f2a25",
            width: eraser ? 18 : 4,
            opacity: 1,
          });
          const p = toLocal(e);
          live.current.add(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!live.current) return;
          const p = toLocal(e);
          live.current.add(p.x, p.y);
        }}
        onPointerUp={() => {
          const s = live.current?.finish();
          live.current = null;
          if (s) onChange([...note.strokes, s]);
        }}
        onPointerCancel={() => {
          live.current?.clear();
          live.current = null;
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${k})`, transformOrigin: "0 0" }}>
          <StrokeCanvas strokes={note.strokes} w={NOTE_BASE} h={h} pixelWidth={260} />
          <canvas
            ref={liveRef}
            width={Math.round(NOTE_BASE * k * dpr)}
            height={Math.round(h * k * dpr)}
            style={{ position: "absolute", left: 0, top: 0, width: NOTE_BASE, height: h, pointerEvents: "none" }}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className={`chip${!eraser ? " is-active" : ""}`} onClick={() => setEraser(false)}>
          Pen
        </button>
        <button type="button" className={`chip${eraser ? " is-active" : ""}`} onClick={() => setEraser(true)}>
          Eraser
        </button>
        <button type="button" className="chip" disabled={!note.strokes.length} onClick={() => onChange(note.strokes.slice(0, -1))}>
          Undo stroke
        </button>
        <button type="button" className="chip" disabled={!note.strokes.length} onClick={() => onChange([])}>
          Clear
        </button>
      </div>
    </div>
  );
}

export function NotePanel({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: NoteObject | null;
  onClose: () => void;
  onSave: (n: NoteObject) => void;
}) {
  const [note, setNote] = useState<NoteObject | null>(initial);
  const [tab, setTab] = useState<"text" | "ink">("text");
  const [swayKey, setSwayKey] = useState(0);

  useEffect(() => {
    if (open) {
      setNote(initial);
      setTab("text");
    }
  }, [open, initial]);

  if (!note) {
    return null;
  }
  const patch = (p: Partial<NoteObject>) => setNote({ ...note, ...p });
  const k = PREVIEW_W / note.w;

  return (
    <Sheet
      open={open}
      title="Sticky note"
      onClose={onClose}
      tall
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(note)}>
            Done
          </button>
        </div>
      }
    >
      <div className="row" style={{ alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
        <div
          style={{
            position: "relative",
            width: PREVIEW_W + 20,
            height: note.h * k + 30,
            background: "#fffdf8",
            borderRadius: 8,
            boxShadow: "inset 0 0 0 1px var(--line)",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 18,
              width: note.w,
              height: note.h,
              transform: `scale(${k})`,
              transformOrigin: "0 0",
            }}
          >
            <NoteView o={note} swayKey={swayKey} still={false} pixelScale={k} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <button type="button" className="btn btn-sm" onClick={() => setSwayKey((n) => n + 1)}>
            Preview sway
          </button>
          <p className="muted small">The anchor stays put while loose edges sway and settle. Paused while editing or dragging.</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={`tab${tab === "text" ? " is-active" : ""}`} onClick={() => setTab("text")}>
          Typing
        </button>
        <button type="button" className={`tab${tab === "ink" ? " is-active" : ""}`} onClick={() => setTab("ink")}>
          Handwriting
        </button>
      </div>
      {tab === "text" ? (
        <>
          <textarea
            className="textarea"
            value={note.text}
            placeholder="Write something…"
            onChange={(e) => patch({ text: e.target.value })}
          />
          <label className="small">
            Size {Math.round(note.textSize)}
            <input type="range" min={16} max={60} value={note.textSize} onChange={(e) => patch({ textSize: Number(e.target.value) })} />
          </label>
        </>
      ) : (
        <NoteInk note={note} onChange={(strokes) => patch({ strokes })} />
      )}

      <div className="section-title">Paper color</div>
      <div className="row-wrap">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`swatch${note.color === c.id ? " is-active" : ""}`}
            style={{ background: c.id }}
            aria-label={c.label}
            onClick={() => patch({ color: c.id })}
          />
        ))}
      </div>
      <div className="section-title">Shape</div>
      <div className="row-wrap">
        {NOTE_SHAPES.map((s) => (
          <button key={s.id} type="button" className={`chip${note.shape === s.id ? " is-active" : ""}`} onClick={() => patch({ shape: s.id })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="section-title">Attach with</div>
      <div className="row-wrap">
        {NOTE_FIXES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${note.fix === f.id ? " is-active" : ""}`}
            onClick={() => patch({ fix: f.id, anchor: f.id === "top" ? { x: 0.5, y: 0 } : note.anchor.y === 0 ? { x: note.anchor.x, y: 0.06 } : note.anchor })}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="section-title">Anchor and sway</div>
      <label className="small">
        Horizontal {Math.round(note.anchor.x * 100)}%
        <input type="range" min={5} max={95} value={Math.round(note.anchor.x * 100)} onChange={(e) => patch({ anchor: { ...note.anchor, x: Number(e.target.value) / 100 } })} />
      </label>
      {note.fix !== "top" ? (
        <label className="small">
          Vertical {Math.round(note.anchor.y * 100)}%
          <input type="range" min={3} max={95} value={Math.round(note.anchor.y * 100)} onChange={(e) => patch({ anchor: { ...note.anchor, y: Number(e.target.value) / 100 } })} />
        </label>
      ) : null}
      <label className="small">
        Sway {Math.round(note.sway * 100)}%
        <input type="range" min={0} max={100} value={Math.round(note.sway * 100)} onChange={(e) => patch({ sway: Number(e.target.value) / 100 })} />
      </label>
    </Sheet>
  );
}
