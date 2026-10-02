import { useEffect, useRef, useState } from "react";
import { NOTE_BASE, type NoteObject, type Stroke } from "../db/types";
import { StrokeSession } from "../drawing/session";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { NOTE_COLORS, NOTE_FIXES, NOTE_SHAPES, NoteView, TAPE_COLORS, TAPE_PATTERNS, tapeFill } from "../page/ObjectViews";
import { ColorDots } from "../shell/ColorDots";
import { Sheet } from "../shell/Sheet";
import { t } from "../i18n";

const PREVIEW_W = 200;

function NoteInk({
  note,
  onChange,
}: {
  note: NoteObject;
  onChange: (strokes: Stroke[]) => void;
}) {
  const liveRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<StrokeSession | null>(null);
  const [eraser, setEraser] = useState(false);
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(18);
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
          live.current = new StrokeSession(
            liveRef.current,
            k * dpr,
            {
              erase: eraser,
              brush: "pen",
              color: "#2f2a25",
              width: eraser ? eraserSize : penSize,
              opacity: 1,
              stabilizer: "medium",
              smooth: "off",
              holdToPerfect: false,
              eraseColor: note.color,
            },
            { unitsPerPx: 1 / k },
          );
          const p = toLocal(e);
          live.current.add(p.x, p.y, e.timeStamp, e.pressure, e.pointerType);
        }}
        onPointerMove={(e) => {
          if (!live.current) return;
          const p = toLocal(e);
          live.current.add(p.x, p.y, e.timeStamp, e.pressure, e.pointerType);
        }}
        onPointerUp={(e) => {
          const p = toLocal(e);
          const r = live.current?.finish(p.x, p.y);
          live.current = null;
          if (r?.kind === "freehand") onChange([...note.strokes, r.stroke]);
        }}
        onPointerCancel={() => {
          live.current?.cancel();
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
          {t("Pen")}
        </button>
        <button type="button" className={`chip${eraser ? " is-active" : ""}`} onClick={() => setEraser(true)}>
          {t("Eraser")}
        </button>
        <button type="button" className="chip" disabled={!note.strokes.length} onClick={() => onChange(note.strokes.slice(0, -1))}>
          {t("Undo stroke")}
        </button>
        <button type="button" className="chip" disabled={!note.strokes.length} onClick={() => onChange([])}>
          {t("Clear")}
        </button>
      </div>
      <label className="slider-row">
        <span className="slider-text">{eraser ? t("Eraser size") : t("Pen size")}</span>
        <input
          type="range"
          min={1}
          max={eraser ? 60 : 30}
          value={eraser ? eraserSize : penSize}
          aria-label={eraser ? t("Eraser size") : t("Pen size")}
          onChange={(e) => (eraser ? setEraserSize : setPenSize)(Number(e.target.value))}
        />
        <span className="slider-value">{eraser ? eraserSize : penSize}</span>
      </label>
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
  const tapeLabel = t(TAPE_PATTERNS.find((tp) => tp.id === note.tapePattern)?.label ?? "Original");

  return (
    <Sheet
      open={open}
      title={t("Sticky note")}
      onClose={onClose}
      tall
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(note)}>
            {t("Done")}
          </button>
        </div>
      }
    >
      <div className="note-preview">
        <div style={{ position: "relative", width: PREVIEW_W, height: note.h * k }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: note.w,
              height: note.h,
              transform: `scale(${k})`,
              transformOrigin: "0 0",
            }}
          >
            <NoteView o={note} swayKey={0} still pixelScale={k} />
          </div>
        </div>
      </div>

      <div className="section-title">{t("Text")}</div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={`tab${tab === "text" ? " is-active" : ""}`} onClick={() => setTab("text")}>
          {t("Typing")}
        </button>
        <button type="button" className={`tab${tab === "ink" ? " is-active" : ""}`} onClick={() => setTab("ink")}>
          {t("Handwriting")}
        </button>
      </div>
      {tab === "text" ? (
        <>
          <textarea
            className="textarea"
            value={note.text}
            placeholder={t("Write something…")}
            onChange={(e) => patch({ text: e.target.value })}
          />
          <label className="small">
            {t("Size")} {Math.round(note.textSize)}
            <input type="range" min={16} max={60} value={note.textSize} onChange={(e) => patch({ textSize: Number(e.target.value) })} />
          </label>
        </>
      ) : (
        <NoteInk note={note} onChange={(strokes) => patch({ strokes })} />
      )}

      <div className="section-title">{t("Paper color")}</div>
      <ColorDots colors={NOTE_COLORS.map((c) => ({ value: c.id, label: c.label }))} value={note.color} onChange={(color) => patch({ color })} />
      <div className="section-title">{t("Shape")}</div>
      <div className="row-wrap">
        {NOTE_SHAPES.map((s) => (
          <button key={s.id} type="button" className={`chip${note.shape === s.id ? " is-active" : ""}`} onClick={() => patch({ shape: s.id })}>
            {t(s.label)}
          </button>
        ))}
      </div>
      <div className="section-title">{t("Attach with")}</div>
      <div className="row-wrap">
        {NOTE_FIXES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${note.fix === f.id ? " is-active" : ""}`}
            onClick={() => patch({ fix: f.id, anchor: f.id === "top" ? { x: 0.5, y: 0 } : note.anchor.y === 0 ? { x: note.anchor.x, y: 0.06 } : note.anchor })}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {note.fix === "tape" ? (
        <>
          <div className="section-title row-between">
            <span>{t("Tape pattern")}</span>
            <span className="muted small">{tapeLabel}</span>
          </div>
          <div className="tape-grid">
            {TAPE_PATTERNS.map((tp) => (
              <button
                key={tp.id}
                type="button"
                className={`tape-cell${note.tapePattern === tp.id ? " is-active" : ""}`}
                aria-label={t(tp.label)}
                aria-pressed={note.tapePattern === tp.id}
                onClick={() => patch({ tapePattern: tp.id, tapeColor: note.tapeColor ?? TAPE_COLORS[0] })}
              >
                <i style={{ background: tapeFill(tp.id, note.tapeColor) }} />
                <span>{t(tp.label)}</span>
              </button>
            ))}
          </div>
          <div className="section-title">{t("Tape color")}</div>
          <ColorDots
            colors={TAPE_COLORS.map((c) => ({ value: c, label: c }))}
            value={note.tapePattern ? note.tapeColor ?? TAPE_COLORS[0] : ""}
            onChange={(tapeColor) => patch({ tapeColor, tapePattern: note.tapePattern ?? "solid" })}
          />
        </>
      ) : null}
      <div className="section-title">{t("Anchor and sway")}</div>
      <label className="small">
        {t("Horizontal")} {Math.round(note.anchor.x * 100)}%
        <input type="range" min={5} max={95} value={Math.round(note.anchor.x * 100)} onChange={(e) => patch({ anchor: { ...note.anchor, x: Number(e.target.value) / 100 } })} />
      </label>
      {note.fix !== "top" ? (
        <label className="small">
          {t("Vertical")} {Math.round(note.anchor.y * 100)}%
          <input type="range" min={3} max={95} value={Math.round(note.anchor.y * 100)} onChange={(e) => patch({ anchor: { ...note.anchor, y: Number(e.target.value) / 100 } })} />
        </label>
      ) : null}
      <label className="small">
        {t("Sway")} {Math.round(note.sway * 100)}%
        <input type="range" min={0} max={100} value={Math.round(note.sway * 100)} onChange={(e) => patch({ sway: Number(e.target.value) / 100 })} />
      </label>
    </Sheet>
  );
}
