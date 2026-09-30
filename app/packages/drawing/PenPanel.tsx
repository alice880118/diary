import type { BrushKind } from "../db/types";
import { Icon, type IconName } from "../shell/Icon";
import { INK_COLORS } from "./strokes";
import "./pen.css";

export type PenTool = BrushKind | "eraser" | "select";

export interface PenState {
  tool: PenTool;
  color: string;
  width: number;
  opacity: number;
}

export const DEFAULT_PEN: PenState = { tool: "pen", color: "#2f2a25", width: 5, opacity: 1 };

const TOOLS: { id: PenTool; label: string; icon: IconName }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "marker", label: "Marker", icon: "brush" },
  { id: "pencil", label: "Pencil", icon: "edit" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
  { id: "select", label: "Select", icon: "select" },
];

export function PenPanel({
  pen,
  onChange,
  extra,
  maxWidth = 40,
  allowSelect = true,
}: {
  pen: PenState;
  onChange: (p: PenState) => void;
  extra?: React.ReactNode;
  maxWidth?: number;
  allowSelect?: boolean;
}) {
  return (
    <div className="pen-panel">
      <div className="pen-tools" role="group" aria-label="Brush">
        {TOOLS.filter((t) => allowSelect || t.id !== "select").map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pen-tool${pen.tool === t.id ? " is-active" : ""}`}
            aria-pressed={pen.tool === t.id}
            onClick={() => onChange({ ...pen, tool: t.id })}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {pen.tool === "select" ? (
        <div className="muted small">
          Drag to select strokes, then drag inside the box to move them. Tap empty space to deselect.
        </div>
      ) : (
        <>
          {pen.tool !== "eraser" ? (
            <div className="pen-colors">
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${pen.color === c ? " is-active" : ""}`}
                  style={{ background: c, flex: "0 0 auto", width: 32, height: 32 }}
                  aria-label={`Color ${c}`}
                  onClick={() => onChange({ ...pen, color: c })}
                />
              ))}
              <input
                type="color"
                value={pen.color}
                aria-label="Custom color"
                onChange={(e) => onChange({ ...pen, color: e.target.value })}
              />
            </div>
          ) : null}
          <div className="pen-sliders" style={pen.tool === "eraser" ? { gridTemplateColumns: "1fr" } : undefined}>
            <label className="pen-slider">
              <span className="pen-slider-label">
                <span>Size</span>
                <span className="pen-slider-value">{pen.width}</span>
              </span>
              <input
                type="range"
                min={1}
                max={maxWidth}
                value={pen.width}
                onChange={(e) => onChange({ ...pen, width: Number(e.target.value) })}
              />
            </label>
            {pen.tool !== "eraser" ? (
              <label className="pen-slider">
                <span className="pen-slider-label">
                  <span>Opacity</span>
                  <span className="pen-slider-value">{Math.round(pen.opacity * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(pen.opacity * 100)}
                  onChange={(e) => onChange({ ...pen, opacity: Number(e.target.value) / 100 })}
                />
              </label>
            ) : null}
          </div>
        </>
      )}
      {extra}
    </div>
  );
}
