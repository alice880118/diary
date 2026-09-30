import { useState } from "react";
import type { ArtLayer, PrintLayer } from "../db/types";
import {
  INK_PALETTE,
  MAX_PRINT_LAYERS,
  offsetAmount,
  offsetAngle,
  regenerateMisregistration,
  withOffset,
} from "../print/layers";
import { Icon } from "../shell/Icon";

export type MaskTool = "brush" | "erase" | "lassoAdd" | "lassoSub";
export type PrintView = "composite" | "single" | "draft" | "mask";

export function PrintPanel({
  layers,
  enabled,
  activeId,
  empty,
  tool,
  brushSize,
  view,
  artLayers,
  onEnabled,
  onSelect,
  onAdd,
  onUpdate,
  onDuplicate,
  onDelete,
  onMove,
  onTool,
  onBrushSize,
  onView,
  onFromLayer,
  onClearMask,
}: {
  layers: PrintLayer[];
  enabled: boolean;
  activeId: string | null;
  empty: Set<string>;
  tool: MaskTool;
  brushSize: number;
  view: PrintView;
  artLayers: ArtLayer[];
  onEnabled: (v: boolean) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (p: PrintLayer, record?: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onTool: (t: MaskTool) => void;
  onBrushSize: (n: number) => void;
  onView: (v: PrintView) => void;
  onFromLayer: (artLayerId: string) => void;
  onClearMask: () => void;
}) {
  const active = layers.find((l) => l.id === activeId) ?? null;
  const [renaming, setRenaming] = useState<string | null>(null);
  const full = layers.length >= MAX_PRINT_LAYERS;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
          Use stencil print (replaces original)
        </label>
        <span className="muted small">
          {layers.length}/{MAX_PRINT_LAYERS} inks
        </span>
      </div>
      <div className="tabs" style={{ marginBottom: 8 }}>
        {(
          [
            ["composite", "Composite"],
            ["single", "Single ink"],
            ["mask", "Mask only"],
            ["draft", "Sketch"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab${view === id ? " is-active" : ""}`} onClick={() => onView(id)}>
            {label}
          </button>
        ))}
      </div>

      {layers.length === 0 ? (
        <div className="card muted small" style={{ marginBottom: 8 }}>
          No ink layers yet, so the original is shown. Add an ink layer, then use the brush or lasso to set where the ink goes.
        </div>
      ) : null}

      {[...layers].reverse().map((l) => {
        const idx = layers.findIndex((x) => x.id === l.id);
        const isActive = l.id === activeId;
        return (
          <div
            key={l.id}
            className="row"
            style={{
              padding: "4px 6px",
              marginBottom: 4,
              borderRadius: 10,
              border: isActive ? "2px solid var(--accent)" : "1px solid var(--line)",
              background: "#fff",
            }}
          >
            <button
              type="button"
              aria-label="Select this ink layer"
              onClick={() => onSelect(l.id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px var(--line)",
                background: l.color,
                flex: "0 0 auto",
                cursor: "pointer",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }} onClick={() => onSelect(l.id)}>
              {renaming === l.id ? (
                <input
                  className="input"
                  autoFocus
                  defaultValue={l.name}
                  style={{ minHeight: 34, padding: "4px 8px" }}
                  onBlur={(e) => {
                    onUpdate({ ...l, name: e.target.value.trim() || l.name });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              ) : (
                <div style={{ fontWeight: isActive ? 600 : 400, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {isActive ? "▶ " : ""}
                  {l.name}
                </div>
              )}
              {empty.has(l.id) ? (
                <span className="badge badge-warn">Set an area</span>
              ) : (
                <span className="muted small">Area set{l.visible ? "" : " · Hidden"}</span>
              )}
            </div>
            <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label={l.visible ? "Hide" : "Show"} onClick={() => onUpdate({ ...l, visible: !l.visible })}>
              <Icon name={l.visible ? "eye" : "eyeOff"} size={18} />
            </button>
            <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label="Move up (print order)" disabled={idx === layers.length - 1} onClick={() => onMove(l.id, 1)}>
              <Icon name="up" size={18} />
            </button>
            <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label="Move down" disabled={idx === 0} onClick={() => onMove(l.id, -1)}>
              <Icon name="down" size={18} />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-block btn-sm" disabled={full} onClick={onAdd} style={{ marginBottom: 4 }}>
        <Icon name="plus" size={16} /> Add ink layer
      </button>
      {full ? <div className="muted small">You've reached the 4-ink limit (copies count too). Delete a layer to add another.</div> : null}

      {active ? (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>{active.name}</strong>
            <div className="row" style={{ gap: 0 }}>
              <button type="button" className="icon-btn" aria-label="Rename" onClick={() => setRenaming(active.id)}>
                <Icon name="edit" size={18} />
              </button>
              <button type="button" className="icon-btn" aria-label="Duplicate ink layer" disabled={full} onClick={() => onDuplicate(active.id)}>
                <Icon name="copy" size={18} />
              </button>
              <button type="button" className="icon-btn" aria-label="Delete ink layer" onClick={() => onDelete(active.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
          <div className="small" style={{ marginBottom: 4 }}>Area tools</div>
          <div className="row-wrap" style={{ marginBottom: 6 }}>
            {(
              [
                ["brush", "Brush"],
                ["erase", "Eraser"],
                ["lassoAdd", "Lasso add"],
                ["lassoSub", "Lasso subtract"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={`chip${tool === id ? " is-active" : ""}`} onClick={() => onTool(id)}>
                {label}
              </button>
            ))}
          </div>
          {tool === "brush" || tool === "erase" ? (
            <label className="small">
              Brush size {brushSize}
              <input type="range" min={6} max={160} value={brushSize} onChange={(e) => onBrushSize(Number(e.target.value))} />
            </label>
          ) : null}
          <div className="row-wrap" style={{ margin: "4px 0 8px" }}>
            <select
              className="select"
              style={{ flex: 1, minHeight: 36, padding: "4px 8px", fontSize: 14 }}
              value=""
              onChange={(e) => {
                if (e.target.value) onFromLayer(e.target.value);
              }}
            >
              <option value="">Create area from layer…</option>
              {artLayers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" onClick={onClearMask}>
              Clear area
            </button>
          </div>

          <div className="small">Ink</div>
          <div className="hscroll" style={{ padding: "4px 0" }}>
            {INK_PALETTE.map((c) => (
              <button
                key={c.color}
                type="button"
                className={`swatch${active.color === c.color ? " is-active" : ""}`}
                style={{ background: c.color, flex: "0 0 auto", width: 30, height: 30 }}
                aria-label={c.name}
                onClick={() => onUpdate({ ...active, color: c.color })}
              />
            ))}
            <input type="color" value={active.color} aria-label="Custom ink" onChange={(e) => onUpdate({ ...active, color: e.target.value })} />
          </div>
          <Slider label="Ink density" value={active.density} onChange={(v, r) => onUpdate({ ...active, density: v }, r)} />
          <Slider label="Grain" value={active.grain} onChange={(v, r) => onUpdate({ ...active, grain: v }, r)} />
          <Slider label="Unevenness" value={active.unevenness} onChange={(v, r) => onUpdate({ ...active, unevenness: v }, r)} />
          <Slider label="Paper show-through" value={active.paperShow} onChange={(v, r) => onUpdate({ ...active, paperShow: v }, r)} />
          <div className="small" style={{ marginTop: 8 }}>
            Misregistration {(offsetAmount(active) * 100).toFixed(2)}% (short side) · Angle {Math.round((offsetAngle(active) + 360) % 360)}°
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(offsetAmount(active) * 10000)}
            onChange={(e) => onUpdate(withOffset(active, Number(e.target.value) / 10000, offsetAngle(active)), false)}
            onPointerUp={() => onUpdate(active, true)}
            aria-label="Misregistration amount"
          />
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round((offsetAngle(active) + 360) % 360)}
            onChange={(e) => onUpdate(withOffset(active, offsetAmount(active), Number(e.target.value)), false)}
            onPointerUp={() => onUpdate(active, true)}
            aria-label="Misregistration angle"
          />
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => onUpdate(regenerateMisregistration(active))}>
              Regenerate offset and grain
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onUpdate(withOffset(active, 0, 0))}>
              Reset to zero
            </button>
          </div>
          <p className="muted small">Offset and grain are saved with a fixed seed, so they stay the same when you reopen, zoom, or export.</p>
        </div>
      ) : null}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number, record: boolean) => void;
}) {
  return (
    <label className="small" style={{ display: "block" }}>
      {label} {Math.round(value * 100)}%
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100, false)}
        onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100, true)}
      />
    </label>
  );
}
