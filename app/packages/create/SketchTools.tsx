import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { renderSource } from "../art/render";
import type { ArtRuntime } from "../art/runtime";
import type { ArtLayer, Artwork, ImageLayer } from "../db/types";
import { ColorDots } from "../shell/ColorDots";
import { Dropdown } from "../shell/Dropdown";
import { Icon, type IconName } from "../shell/Icon";
import { Popover } from "../shell/Popover";
import { Sheet } from "../shell/Sheet";
import "./create.css";
import { t } from "../i18n";

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
        aria-label={t("Step {n} of {total}: {name}", { n: idx + 1, total: steps.length, name: t(steps[idx]?.label ?? "") })}
        onClick={() => setOpen((v) => !v)}
      >
        {steps.map((s, i) => (
          <i key={s.id} className={i <= idx ? "is-on" : undefined} />
        ))}
        <span>{t(steps[idx]?.label ?? "")}</span>
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
          trail: i === idx ? <Icon name="check" size={18} /> : s.edited ? t("Edited") : undefined,
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
  iconNode,
  label,
  active,
  count,
  onClick,
  btnRef,
  disabled,
}: {
  icon: IconName;
  /** Replaces the icon (e.g. the current shape). */
  iconNode?: ReactNode;
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
      className={`st-tool${active ? " is-active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {iconNode ?? <Icon name={icon} />}
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
    <button ref={btnRef} type="button" className={`st-tool is-labeled${active ? " is-active" : ""}`} aria-pressed={active} onClick={onClick}>
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

export function PalettePopover({
  open,
  onClose,
  color,
  onPick,
  ignore,
  bottom,
  colors,
  title,
}: {
  open: boolean;
  onClose: () => void;
  color: string;
  /** `live`: mid-drag in the system picker (the popover stays open). */
  onPick: (c: string, live?: boolean) => void;
  ignore: RefObject<HTMLElement | null>[];
  bottom?: number | string;
  /** Defaults to the sketch colors. */
  colors?: { value: string; label: string }[];
  title?: string;
}) {
  return (
    <Popover open={open} onClose={onClose} ignore={ignore} bottom={bottom} title={title}>
      <div className="palette">
        <ColorDots
          colors={colors ?? SKETCH_COLORS.map((c) => ({ value: c, label: c }))}
          value={color}
          onChange={(c, live, fromPicker) => {
            onPick(c, live);
            // Stay open while adjusting in the color picker.
            if (!live && !fromPicker) onClose();
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
    <button ref={btnRef} type="button" className="st-tool" aria-label={t("Color")} title={t("Color")} onClick={onClick}>
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
/* Drag-sortable rows (layers, inks)                                   */
/* ------------------------------------------------------------------ */

/**
 * Rows in display order (top first). Dragging the grip moves a row; onMove
 * gets the display index it was dropped on.
 */
export function SortableRows<T extends { id: string; name: string }>({
  items,
  activeId,
  onSelect,
  onMove,
  children,
}: {
  items: T[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, toDisplayIndex: number) => void;
  children: (item: T) => ReactNode;
}) {
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; rowH: number } | null>(null);
  const from = drag ? items.findIndex((l) => l.id === drag.id) : -1;
  const dropIndex = drag ? Math.max(0, Math.min(items.length - 1, from + Math.round(drag.dy / drag.rowH))) : -1;
  return (
    <div className="layer-list" role="list">
      {items.map((l, i) => {
        let shift = 0;
        if (drag && l.id !== drag.id) {
          if (from < i && i <= dropIndex) shift = -drag.rowH;
          if (dropIndex <= i && i < from) shift = drag.rowH;
        }
        const dragging = drag?.id === l.id;
        return (
          <div
            key={l.id}
            role="listitem"
            className={`layer-row2${l.id === activeId ? " is-active" : ""}${dragging ? " is-dragging" : ""}`}
            style={{ transform: `translateY(${dragging ? drag.dy : shift}px)` }}
            onClick={() => onSelect(l.id)}
          >
            <span
              className="layer-grip"
              aria-label={t("Reorder {name}", { name: l.name })}
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
                if (to !== from) onMove(l.id, to);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <Icon name="grip" size={18} />
            </span>
            {children(l)}
          </div>
        );
      })}
    </div>
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
  const top = [...art.layers].reverse();

  useEffect(() => {
    if (!open) {
      setMenuFor(null);
      setPlusOpen(false);
      setRenaming(null);
    }
  }, [open]);

  const menuLayer = art.layers.find((l) => l.id === menuFor) ?? null;

  return (
    <Sheet
      open={open}
      title={t("Layers")}
      onClose={onClose}
      studio
      height={380}
      headerRight={
        <button
          ref={plusRef}
          type="button"
          className={`icon-btn${plusOpen ? " is-pressed" : " is-filled"}`}
          aria-label={t("Add layer")}
          onClick={() => setPlusOpen((v) => !v)}
        >
          <Icon name="plus" />
        </button>
      }
    >
      <SortableRows items={top} activeId={activeId} onSelect={onSelect} onMove={(id, to) => onReorder(id, art.layers.length - 1 - to)}>
        {(l) => (
          <>
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
                  {l.kind === "image" ? <span>{t("Image")}</span> : null}
                </>
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              style={l.visible ? undefined : { color: "#bbb" }}
              aria-label={l.visible ? t("Hide {name}", { name: l.name }) : t("Show {name}", { name: l.name })}
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
              aria-label={t("More for {name}", { name: l.name })}
              onClick={(e) => {
                e.stopPropagation();
                menuRef.current = e.currentTarget;
                setMenuFor(menuFor === l.id ? null : l.id);
              }}
            >
              <Icon name="more" size={18} />
            </button>
          </>
        )}
      </SortableRows>
      <Dropdown
        open={menuLayer !== null}
        anchor={menuRef}
        align="end"
        onClose={() => setMenuFor(null)}
        items={
          menuLayer
            ? [
                { icon: "edit", get label() { return t("Rename"); }, onSelect: () => setRenaming(menuLayer.id) },
                { icon: "copy", get label() { return t("Duplicate"); }, onSelect: () => onDuplicate(menuLayer.id) },
                "separator",
                { icon: "trash", get label() { return t("Delete"); }, danger: true, disabled: art.layers.length <= 1, onSelect: () => onDelete(menuLayer.id) },
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
          { icon: "brush", get label() { return t("New sketch layer"); }, onSelect: onAddSketch },
          { icon: "image2", get label() { return t("Import image"); }, onSelect: onImport },
        ]}
      />
    </Sheet>
  );
}
