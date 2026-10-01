import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { renderSource } from "../art/render";
import type { ArtRuntime } from "../art/runtime";
import type { ArtLayer, Artwork, BrushKind, ImageLayer } from "../db/types";
import { ColorDots } from "../shell/ColorDots";
import { Dropdown } from "../shell/Dropdown";
import { Icon, type IconName } from "../shell/Icon";
import { Popover } from "../shell/Popover";
import { Sheet } from "../shell/Sheet";

/* ------------------------------------------------------------------ */
/* Step pill (header)                                                  */
/* ------------------------------------------------------------------ */

export interface StepInfo {
  id: string;
  label: string;
  edited: boolean;
}

/** Progress bars + current step name; opens a menu to jump to any step. */
export function StepPill({
  steps,
  current,
  onPick,
}: {
  steps: StepInfo[];
  current: string;
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`step-pill${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Step ${idx + 1} of ${steps.length}: ${steps[idx]?.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        {steps.map((s, i) => (
          <i key={s.id} className={i <= idx ? "is-on" : undefined} />
        ))}
        <span>{steps[idx]?.label}</span>
        <Icon name="chev" size={12} />
      </button>
      <Dropdown
        open={open}
        anchor={ref}
        onClose={() => setOpen(false)}
        minWidth={250}
        items={steps.map((s, i) => ({
          label: i === idx ? <b>{s.label}</b> : s.label,
          lead: <span className={`step-dot${i < idx || i === idx ? " is-done" : ""}`}>{i + 1}</span>,
          trail: i === idx ? <Icon name="check" size={18} /> : s.edited ? "Edited" : undefined,
          highlighted: i === idx,
          onSelect: () => onPick(s.id),
        }))}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom toolbar primitives                                           */
/* ------------------------------------------------------------------ */

export function ToolButton({
  icon,
  label,
  active,
  count,
  onClick,
  btnRef,
  disabled,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
  btnRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      className={`tool-btn${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      {count ? <span className="tool-count">{count}</span> : null}
    </button>
  );
}

export function LabeledTool({
  icon,
  label,
  active,
  onClick,
  btnRef,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
  btnRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={btnRef} type="button" className={`tool-btn is-labeled${active ? " is-active" : ""}`} aria-pressed={active} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function StudioBar({ children }: { children: ReactNode }) {
  return <div className="studio-bar">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Sketch tools                                                        */
/* ------------------------------------------------------------------ */

export type SketchTool = BrushKind | "eraser";

export interface BrushSetting {
  width: number;
  opacity: number;
}

export const SKETCH_TOOLS: { id: SketchTool; label: string; icon: IconName }[] = [
  { id: "pen", label: "Pen", icon: "pen2" },
  { id: "marker", label: "Marker", icon: "marker" },
  { id: "pencil", label: "Pencil", icon: "pencil" },
  { id: "eraser", label: "Eraser", icon: "eraser2" },
];

export const DEFAULT_BRUSHES: Record<SketchTool, BrushSetting> = {
  pen: { width: 5, opacity: 1 },
  marker: { width: 16, opacity: 0.8 },
  pencil: { width: 3, opacity: 0.9 },
  eraser: { width: 24, opacity: 1 },
};

export const SKETCH_COLORS = [
  "#1b1b1b",
  "#5b4232",
  "#d4573f",
  "#e98aa0",
  "#efb33b",
  "#6aa56f",
  "#3d6fc4",
  "#7f5cc0",
  "#ffffff",
  "#2c2724",
];

const BRUSH_KEY = "diary.sketchBrushes";

/** Per-tool size/opacity, remembered on this device only (a convenience, not data). */
export function useSketchBrushes() {
  const [brushes, setBrushes] = useState<Record<SketchTool, BrushSetting>>(DEFAULT_BRUSHES);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BRUSH_KEY);
      if (raw) setBrushes({ ...DEFAULT_BRUSHES, ...(JSON.parse(raw) as Partial<Record<SketchTool, BrushSetting>>) });
    } catch {
      // Storage unavailable; defaults are fine.
    }
  }, []);
  const update = (tool: SketchTool, b: BrushSetting) =>
    setBrushes((cur) => {
      const next = { ...cur, [tool]: b };
      try {
        localStorage.setItem(BRUSH_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  return [brushes, update] as const;
}

function SliderRow({
  icon,
  label,
  min,
  max,
  value,
  display,
  onChange,
}: {
  icon: IconName;
  label: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider-row">
      <span className="slider-icon" title={label}>
        <Icon name={icon} size={18} />
      </span>
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{display}</span>
    </label>
  );
}

export function BrushPopover({
  open,
  onClose,
  tool,
  setting,
  color,
  onChange,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  tool: SketchTool;
  setting: BrushSetting;
  color: string;
  onChange: (b: BrushSetting) => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  const label = SKETCH_TOOLS.find((t) => t.id === tool)?.label ?? "";
  const erase = tool === "eraser";
  const w = Math.max(1, Math.min(setting.width * 0.5, 18));
  return (
    <Popover open={open} onClose={onClose} title={label} ignore={ignore}>
      <div className="brush-preview">
        <svg width="220" height="24" viewBox="0 0 220 24" aria-hidden>
          <path
            d="M6 14c30-10 50 8 80 0s50-10 80 0 40 4 48-2"
            fill="none"
            stroke={erase ? "#c8c8c8" : color}
            strokeOpacity={erase ? 1 : setting.opacity}
            strokeWidth={w}
            strokeLinecap="round"
            strokeDasharray={erase ? "2 6" : undefined}
          />
        </svg>
      </div>
      <SliderRow icon="size" label="Size" min={1} max={80} value={setting.width} display={String(setting.width)} onChange={(width) => onChange({ ...setting, width })} />
      {erase ? null : (
        <SliderRow
          icon="opacity"
          label="Opacity"
          min={10}
          max={100}
          value={Math.round(setting.opacity * 100)}
          display={`${Math.round(setting.opacity * 100)}%`}
          onChange={(v) => onChange({ ...setting, opacity: v / 100 })}
        />
      )}
    </Popover>
  );
}

export function PalettePopover({
  open,
  onClose,
  color,
  onPick,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  color: string;
  onPick: (c: string) => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  return (
    <Popover open={open} onClose={onClose} ignore={ignore}>
      <div className="palette">
        <ColorDots
          colors={SKETCH_COLORS.map((c) => ({ value: c, label: c }))}
          value={color}
          onChange={(c) => {
            onPick(c);
            onClose();
          }}
        />
      </div>
    </Popover>
  );
}

/** Current color: a dot with the selection ring; grey while erasing. */
export function ColorButton({
  color,
  disabled,
  onClick,
  btnRef,
}: {
  color: string;
  disabled?: boolean;
  onClick: () => void;
  btnRef: Ref<HTMLButtonElement>;
}) {
  const c = disabled ? "#c8c8c8" : color;
  return (
    <button ref={btnRef} type="button" className="tool-btn" aria-label="Color" title="Color" onClick={onClick}>
      <span className="color-dot" style={{ background: c, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${c === "#ffffff" ? "#ccc" : c}` }} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Image layer adjust                                                  */
/* ------------------------------------------------------------------ */

export function ImageAdjustPopover({
  open,
  onClose,
  layer,
  onChange,
  onEnd,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  layer: ImageLayer;
  onChange: (patch: Partial<ImageLayer>) => void;
  onEnd: () => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  const row = (label: string, min: number, max: number, value: number, display: string, set: (v: number) => void) => (
    <label className="slider-row" onPointerUp={onEnd}>
      <span className="slider-text">{label}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => set(Number(e.target.value))} />
      <span className="slider-value">{display}</span>
    </label>
  );
  return (
    <Popover open={open} onClose={onClose} ignore={ignore}>
      {row("Scale", 5, 300, Math.round(layer.scale * 100), `${Math.round(layer.scale * 100)}%`, (v) => onChange({ scale: v / 100 }))}
      {row("Rotate", -180, 180, Math.round(layer.rot), `${Math.round(layer.rot)}°`, (v) => onChange({ rot: v }))}
      {(
        [
          ["t", "Crop top"],
          ["b", "Crop bottom"],
          ["l", "Crop left"],
          ["r", "Crop right"],
        ] as const
      ).map(([k, label]) => (
        <div key={k}>
          {row(label, 0, 45, Math.round(layer.crop[k] * 100), `${Math.round(layer.crop[k] * 100)}%`, (v) =>
            onChange({ crop: { ...layer.crop, [k]: v / 100 } }),
          )}
        </div>
      ))}
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Layers sheet                                                        */
/* ------------------------------------------------------------------ */

const THUMB = 44;

function LayerThumb({ art, rt, layer }: { art: Artwork; rt: ArtRuntime | null; layer: ArtLayer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sig = layer.kind === "draw" ? `${layer.strokes.length}` : `${layer.workAssetId}|${layer.maskAssetId}|${layer.x}|${layer.y}|${layer.scale}|${layer.rot}|${JSON.stringify(layer.crop)}`;
  useEffect(() => {
    const c = ref.current;
    if (!c || !rt) return;
    const t = setTimeout(() => {
      const src = renderSource({ ...art, layers: art.layers.map((l) => (l.id === layer.id ? { ...l, visible: true } : l)) }, rt, 0.125, layer.id);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, layer.id, sig]);
  return <canvas ref={ref} className="layer-thumb" width={THUMB * 2} height={THUMB * 2} aria-hidden />;
}

export function LayersSheet({
  open,
  onClose,
  art,
  rt,
  activeId,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onReorder,
  onAddSketch,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  art: Artwork;
  rt: ArtRuntime | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<ArtLayer>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move the layer to a new index in the stored (bottom-first) array. */
  onReorder: (id: string, toIndex: number) => void;
  onAddSketch: () => void;
  onImport: () => void;
}) {
  const plusRef = useRef<HTMLButtonElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; rowH: number } | null>(null);
  const top = [...art.layers].reverse();

  useEffect(() => {
    if (!open) {
      setMenuFor(null);
      setPlusOpen(false);
      setRenaming(null);
      setDrag(null);
    }
  }, [open]);

  // Display index (top-first) the dragged row would land on.
  const dropIndex = (() => {
    if (!drag) return -1;
    const from = top.findIndex((l) => l.id === drag.id);
    return Math.max(0, Math.min(top.length - 1, from + Math.round(drag.dy / drag.rowH)));
  })();

  const menuLayer = art.layers.find((l) => l.id === menuFor) ?? null;

  return (
    <Sheet
      open={open}
      title="Layers"
      onClose={onClose}
      studio
      height={380}
      headerRight={
        <button
          ref={plusRef}
          type="button"
          className={`icon-btn${plusOpen ? " is-pressed" : " is-filled"}`}
          aria-label="Add layer"
          onClick={() => setPlusOpen((v) => !v)}
        >
          <Icon name="plus" />
        </button>
      }
    >
      <div className="layer-list" role="list">
        {top.map((l, i) => {
          const active = l.id === activeId;
          let shift = 0;
          if (drag && l.id !== drag.id) {
            const from = top.findIndex((x) => x.id === drag.id);
            if (from < i && i <= dropIndex) shift = -drag.rowH;
            if (dropIndex <= i && i < from) shift = drag.rowH;
          }
          const dragging = drag?.id === l.id;
          return (
            <div
              key={l.id}
              role="listitem"
              className={`layer-row2${active ? " is-active" : ""}${dragging ? " is-dragging" : ""}`}
              style={{ transform: `translateY(${dragging ? drag.dy : shift}px)` }}
              onClick={() => onSelect(l.id)}
            >
              <span
                className="layer-grip"
                aria-label={`Reorder ${l.name}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const row = (e.currentTarget as HTMLElement).closest(".layer-row2") as HTMLElement | null;
                  setDrag({ id: l.id, startY: e.clientY, dy: 0, rowH: (row?.offsetHeight ?? 60) + 2 });
                }}
                onPointerMove={(e) => {
                  if (drag?.id !== l.id) return;
                  setDrag({ ...drag, dy: e.clientY - drag.startY });
                }}
                onPointerUp={() => {
                  if (drag?.id !== l.id) return;
                  const to = dropIndex;
                  setDrag(null);
                  const from = top.findIndex((x) => x.id === l.id);
                  if (to !== from) onReorder(l.id, art.layers.length - 1 - to);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <Icon name="grip" size={18} />
              </span>
              <LayerThumb art={art} rt={rt} layer={l} />
              <div className="layer-name">
                {renaming === l.id ? (
                  <input
                    className="input"
                    autoFocus
                    defaultValue={l.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onPatch(l.id, { name: e.target.value.trim() || l.name });
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <>
                    <b>{l.name}</b>
                    {l.kind === "image" ? <span>Image</span> : null}
                  </>
                )}
              </div>
              <button
                type="button"
                className="icon-btn"
                style={l.visible ? undefined : { color: "#bbb" }}
                aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPatch(l.id, { visible: !l.visible });
                }}
              >
                <Icon name={l.visible ? "eye" : "eyeOff"} size={18} />
              </button>
              <button
                type="button"
                className={`icon-btn${menuFor === l.id ? " is-pressed" : ""}`}
                aria-label={`More for ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  menuRef.current = e.currentTarget;
                  setMenuFor(menuFor === l.id ? null : l.id);
                }}
              >
                <Icon name="more" size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <Dropdown
        open={menuLayer !== null}
        anchor={menuRef}
        align="end"
        onClose={() => setMenuFor(null)}
        items={
          menuLayer
            ? [
                { icon: "edit", label: "Rename", onSelect: () => setRenaming(menuLayer.id) },
                { icon: "copy", label: "Duplicate", onSelect: () => onDuplicate(menuLayer.id) },
                "separator",
                { icon: "trash", label: "Delete", danger: true, disabled: art.layers.length <= 1, onSelect: () => onDelete(menuLayer.id) },
              ]
            : []
        }
      />
      <Dropdown
        open={plusOpen}
        anchor={plusRef}
        align="end"
        onClose={() => setPlusOpen(false)}
        items={[
          { icon: "brush", label: "New sketch layer", onSelect: onAddSketch },
          { icon: "image2", label: "Import image", onSelect: onImport },
        ]}
      />
    </Sheet>
  );
}
