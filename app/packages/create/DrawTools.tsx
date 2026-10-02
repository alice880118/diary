/**
 * Drawing toolbar shared by the studio Sketch step and page handwriting:
 * Brush / Eraser / Shape / Select on the left, Color / Size (or Fill) on the
 * right, with Brush Settings, Size, Palette, Shape Picker and Fill panels.
 * Changes apply to the selected object (if any) and become the defaults for
 * the next stroke or shape.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BrushKind, FillStyle, ShapeType, Stroke } from "../db/types";
import { BRUSHES, isTextured, renderBrush } from "../drawing/brush";
import { SHAPE_TYPES, shapeOutline } from "../drawing/geometry";
import type { InkConfig, ShapeStyle } from "../drawing/session";
import { SMOOTH_LEVELS, type SmoothLevel } from "../drawing/smoothing";
import { STABILIZER_LEVELS, type StabilizerLevel } from "../drawing/stabilizer";
import { ColorDots } from "../shell/ColorDots";
import { Icon, type IconName } from "../shell/Icon";
import { Popover } from "../shell/Popover";
import { Sheet } from "../shell/Sheet";
import { ColorButton, PalettePopover, SKETCH_COLORS, ToolButton } from "./SketchTools";
import { t } from "../i18n";

export type DrawTool = "brush" | "eraser" | "shape" | "select";

export interface DrawPrefs {
  brush: BrushKind;
  sizes: Record<BrushKind | "eraser", number>;
  opacity: Record<BrushKind, number>;
  texture: number;
  stabilizer: StabilizerLevel;
  smooth: SmoothLevel;
  hold: boolean;
  shape: ShapeType;
  fillOn: boolean;
  fillColor: string;
  outlineOn: boolean;
}

export const DEFAULT_PREFS: DrawPrefs = {
  brush: "pen",
  sizes: { pen: 5, marker: 16, pencil: 3, crayon: 18, pastel: 22, chalk: 20, dryBrush: 24, eraser: 24 },
  opacity: { pen: 1, marker: 0.8, pencil: 0.9, crayon: 1, pastel: 1, chalk: 0.9, dryBrush: 0.9 },
  texture: 0.7,
  stabilizer: "medium",
  smooth: "off",
  hold: true,
  shape: "rect",
  fillOn: false,
  fillColor: "#ff6b42",
  outlineOn: true,
};

const PREFS_KEY = "diary.drawPrefs";
const LEGACY_KEY = "diary.sketchBrushes";

/** Tool settings remembered on this device only (a convenience, not document data). */
export function useDrawPrefs() {
  const [prefs, setPrefsState] = useState<DrawPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<DrawPrefs>;
        setPrefsState({
          ...DEFAULT_PREFS,
          ...p,
          sizes: { ...DEFAULT_PREFS.sizes, ...(p.sizes ?? {}) },
          opacity: { ...DEFAULT_PREFS.opacity, ...(p.opacity ?? {}) },
        });
        return;
      }
      // Carry over per-tool sizes from the previous toolbar.
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        const o = JSON.parse(old) as Partial<Record<string, { width: number; opacity: number }>>;
        const sizes = { ...DEFAULT_PREFS.sizes };
        const opacity = { ...DEFAULT_PREFS.opacity };
        for (const k of ["pen", "marker", "pencil"] as const) {
          if (o[k]) {
            sizes[k] = o[k]!.width;
            opacity[k] = o[k]!.opacity;
          }
        }
        if (o.eraser) sizes.eraser = o.eraser.width;
        setPrefsState({ ...DEFAULT_PREFS, sizes, opacity });
      }
    } catch {
      // Storage unavailable; defaults are fine.
    }
  }, []);
  const setPrefs = (patch: Partial<DrawPrefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  return [prefs, setPrefs] as const;
}

export function inkConfig(prefs: DrawPrefs, tool: DrawTool, color: string, eraseColor?: string): InkConfig {
  const erase = tool === "eraser";
  return {
    erase,
    brush: prefs.brush,
    color,
    width: erase ? prefs.sizes.eraser : prefs.sizes[prefs.brush],
    opacity: prefs.opacity[prefs.brush],
    texture: isTextured(prefs.brush) ? prefs.texture : undefined,
    stabilizer: prefs.stabilizer,
    smooth: prefs.smooth,
    holdToPerfect: prefs.hold && !erase,
    eraseColor,
  };
}

export function shapeStyle(prefs: DrawPrefs, color: string): ShapeStyle {
  return {
    type: prefs.shape,
    brush: prefs.brush,
    color,
    width: prefs.sizes[prefs.brush],
    opacity: prefs.opacity[prefs.brush],
    texture: isTextured(prefs.brush) ? prefs.texture : undefined,
    fill: prefs.fillOn ? { kind: "solid", color: prefs.fillColor } : { kind: "none" },
    outline: prefs.outlineOn,
  };
}

/* ------------------------------------------------------------------ */
/* Small visuals                                                       */
/* ------------------------------------------------------------------ */

const BRUSH_ICON: Record<BrushKind, IconName> = {
  pen: "pen2",
  marker: "marker",
  pencil: "pencil",
  crayon: "brush2",
  pastel: "brush2",
  chalk: "brush2",
  dryBrush: "brush2",
};

/** A sample stroke drawn with the real renderer. */
export function BrushSample({ brush, color, width, texture, w = 120, h = 36 }: { brush: BrushKind; color: string; width: number; texture: number; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push(10 + u * (w - 20), h / 2 + Math.sin(u * Math.PI * 2) * (h / 2 - Math.max(6, width / 2 + 2)));
    }
    renderBrush(ctx, [{ pts, closed: false }], {
      brush,
      color,
      width: Math.min(width, h * 0.5),
      opacity: 1,
      texture: isTextured(brush) ? texture : undefined,
      seed: 7,
    });
  }, [brush, color, width, texture, w, h]);
  return <canvas ref={ref} width={w * 2} height={h * 2} style={{ width: w, height: h, display: "block" }} aria-hidden />;
}

export function ShapeIcon({ type, size = 22 }: { type: ShapeType; size?: number }) {
  const g = { type, cx: 12, cy: 12, w: type === "circle" ? 16 : 18, h: type === "ellipse" ? 11 : type === "line" || type === "arrow" ? 0 : 16, rot: type === "line" || type === "arrow" ? -35 : 0 };
  const lines = shapeOutline(g);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {lines.map((l, i) => {
        const pts = [];
        for (let j = 0; j < l.pts.length; j += 2) pts.push(`${l.pts[j].toFixed(2)},${l.pts[j + 1].toFixed(2)}`);
        return l.closed ? <polygon key={i} points={pts.join(" ")} /> : <polyline key={i} points={pts.join(" ")} />;
      })}
    </svg>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`tab${value === o.id ? " is-active" : ""}`} onClick={() => onChange(o.id)}>
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, icon, min, max, value, display, onChange, onEnd }: { label: string; icon?: IconName; min: number; max: number; value: number; display: string; onChange: (v: number) => void; onEnd?: () => void }) {
  return (
    <label className="slider-row" onPointerUp={onEnd} onKeyUp={onEnd}>
      {icon ? (
        <span className="slider-icon" title={label}>
          <Icon name={icon} size={18} />
        </span>
      ) : (
        <span className="slider-text">{label}</span>
      )}
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{display}</span>
    </label>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export function BrushSettingsSheet({
  open,
  onClose,
  prefs,
  color,
  onBrush,
  onPrefs,
}: {
  open: boolean;
  onClose: () => void;
  prefs: DrawPrefs;
  color: string;
  onBrush: (b: BrushKind) => void;
  onPrefs: (p: Partial<DrawPrefs>) => void;
}) {
  const b = prefs.brush;
  return (
    <Sheet open={open} title={t("Brush")} onClose={onClose} studio height={560}>
      <div className="brush-grid" role="radiogroup" aria-label={t("Brush type")}>
        {BRUSHES.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={b === d.id} className={`brush-cell${b === d.id ? " is-active" : ""}`} onClick={() => onBrush(d.id)}>
            <BrushSample brush={d.id} color={color === "#ffffff" ? "#1b1b1b" : color} width={d.textured ? 14 : 6} texture={prefs.texture} w={92} h={30} />
            <span>{t(d.label)}</span>
          </button>
        ))}
      </div>
      <Slider
        label={t("Size")}
        icon="size"
        min={1}
        max={120}
        value={prefs.sizes[b]}
        display={String(prefs.sizes[b])}
        onChange={(v) => onPrefs({ sizes: { ...prefs.sizes, [b]: v } })}
      />
      <Slider
        label={t("Opacity")}
        icon="opacity"
        min={10}
        max={100}
        value={Math.round(prefs.opacity[b] * 100)}
        display={`${Math.round(prefs.opacity[b] * 100)}%`}
        onChange={(v) => onPrefs({ opacity: { ...prefs.opacity, [b]: v / 100 } })}
      />
      {isTextured(b) ? (
        <Slider label={t("Texture")} min={0} max={100} value={Math.round(prefs.texture * 100)} display={`${Math.round(prefs.texture * 100)}%`} onChange={(v) => onPrefs({ texture: v / 100 })} />
      ) : null}
      <div className="section-title">{t("Stabilizer")}</div>
      <Segmented label={t("Stabilizer")} value={prefs.stabilizer} options={STABILIZER_LEVELS.map((l) => ({ id: l, label: cap(l) }))} onChange={(v) => onPrefs({ stabilizer: v })} />
      <div className="section-title">{t("Auto smooth")}</div>
      <Segmented label={t("Auto smooth")} value={prefs.smooth} options={SMOOTH_LEVELS.map((l) => ({ id: l, label: cap(l) }))} onChange={(v) => onPrefs({ smooth: v })} />
      <label className="row-between" style={{ marginTop: 18 }}>
        <span className="section-title" style={{ margin: 0 }}>
          {t("Hold to perfect")}
        </span>
        <input type="checkbox" role="switch" className="toggle" checked={prefs.hold} onChange={(e) => onPrefs({ hold: e.target.checked })} />
      </label>
    </Sheet>
  );
}

export function SizePopover({
  open,
  onClose,
  value,
  max,
  color,
  onChange,
  onEnd,
  ignore,
  bottom,
}: {
  open: boolean;
  onClose: () => void;
  value: number;
  max: number;
  color: string;
  onChange: (v: number) => void;
  onEnd?: () => void;
  ignore: React.RefObject<HTMLElement | null>[];
  bottom?: number | string;
}) {
  const d = Math.max(2, Math.min(56, value));
  return (
    <Popover open={open} onClose={onClose} title={t("Size")} ignore={ignore} bottom={bottom}>
      <div className="size-preview">
        <span style={{ width: d, height: d, background: color }} />
      </div>
      <Slider label={t("Size")} icon="size" min={1} max={max} value={value} display={String(value)} onChange={onChange} onEnd={onEnd} />
    </Popover>
  );
}

export function ShapePickerPopover({
  open,
  onClose,
  value,
  onPick,
  ignore,
  bottom,
}: {
  open: boolean;
  onClose: () => void;
  value: ShapeType;
  onPick: (t: ShapeType) => void;
  ignore: React.RefObject<HTMLElement | null>[];
  bottom?: number | string;
}) {
  return (
    <Popover open={open} onClose={onClose} ignore={ignore} bottom={bottom}>
      <div className="shape-grid" role="radiogroup" aria-label={t("Shape")}>
        {SHAPE_TYPES.map((sh) => (
          <button
            key={sh.id}
            type="button"
            role="radio"
            aria-checked={value === sh.id}
            aria-label={t(sh.label)}
            title={t(sh.label)}
            className={`shape-cell${value === sh.id ? " is-active" : ""}`}
            onClick={() => {
              onPick(sh.id);
              onClose();
            }}
          >
            <ShapeIcon type={sh.id} />
          </button>
        ))}
      </div>
    </Popover>
  );
}

export interface FillState {
  fill: FillStyle;
  fillColor: string;
  outline: boolean;
  strokeColor: string;
  width: number;
  brush: BrushKind;
}

export function FillPopover({
  open,
  onClose,
  state,
  onChange,
  ignore,
  bottom,
}: {
  open: boolean;
  onClose: () => void;
  state: FillState;
  onChange: (patch: Partial<FillState>, continuous?: boolean) => void;
  ignore: React.RefObject<HTMLElement | null>[];
  bottom?: number | string;
}) {
  const fillOn = state.fill.kind !== "none";
  const colors = SKETCH_COLORS.concat(["#ff6b42", "#173b59"]).map((c) => ({ value: c, label: c }));
  return (
    <Popover open={open} onClose={onClose} ignore={ignore} bottom={bottom}>
      <div className="fill-scroll">
        <label className="row-between">
          <span className="field-label">{t("Fill")}</span>
          <input
            type="checkbox"
            role="switch"
            className="toggle"
            checked={fillOn}
            onChange={(e) => onChange({ fill: e.target.checked ? { kind: "solid", color: state.fillColor } : { kind: "none" } })}
          />
        </label>
        {fillOn ? (
          <div className="palette is-compact" style={{ marginTop: 8 }}>
            <ColorDots colors={colors} value={state.fillColor} onChange={(c) => onChange({ fillColor: c, fill: { kind: "solid", color: c } })} />
          </div>
        ) : null}
        <hr className="soft-hr" />
        <label className="row-between">
          <span className="field-label">{t("Stroke")}</span>
          <input type="checkbox" role="switch" className="toggle" checked={state.outline} onChange={(e) => onChange({ outline: e.target.checked })} />
        </label>
        {state.outline ? (
          <>
            <div className="palette is-compact" style={{ marginTop: 8 }}>
              <ColorDots colors={colors} value={state.strokeColor} onChange={(c) => onChange({ strokeColor: c })} />
            </div>
            <Slider label={t("Stroke width")} icon="size" min={1} max={120} value={state.width} display={String(state.width)} onChange={(v) => onChange({ width: v }, true)} onEnd={() => onChange({}, false)} />
            <div className="chip-row">
              {BRUSHES.map((d) => (
                <button key={d.id} type="button" className={`chip${state.brush === d.id ? " is-active" : ""}`} onClick={() => onChange({ brush: d.id })}>
                  {t(d.label)}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

export interface SelectionInfo {
  stroke: Stroke;
}

/** Style changes for the selected object (undoable in the parent). */
export type StylePatch = Partial<Pick<Stroke, "brush" | "color" | "width" | "opacity" | "texture" | "fill" | "outline">>;

export function DrawBar({
  tool,
  onTool,
  tools,
  prefs,
  onPrefs,
  color,
  onColor,
  selection,
  onSelectionStyle,
  right,
  popBottom,
}: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  tools: DrawTool[];
  prefs: DrawPrefs;
  onPrefs: (p: Partial<DrawPrefs>) => void;
  color: string;
  onColor: (c: string) => void;
  selection: Stroke | null;
  /** continuous = mid-drag (one undo step for the whole drag). */
  onSelectionStyle: (patch: StylePatch, continuous?: boolean) => void;
  /** Extra buttons at the right end (Layers, Done). */
  right?: ReactNode;
  popBottom?: number | string;
}) {
  const [pop, setPop] = useState<"size" | "palette" | "shapes" | "fill" | null>(null);
  const [brushOpen, setBrushOpen] = useState(false);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const colorRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLButtonElement>(null);
  const ignore = [
    colorRef,
    sizeRef,
    ...["brush", "eraser", "shape", "select"].map((id) => ({
      get current() {
        return refs.current[id] ?? null;
      },
    })),
  ];

  const sel = selection;
  const selShape = Boolean(sel?.shape);
  const fillMode = tool === "shape" || selShape;
  const erase = tool === "eraser" && !sel;
  const sizeKey: BrushKind | "eraser" = erase ? "eraser" : prefs.brush;
  const size = sel ? sel.width : prefs.sizes[sizeKey];
  const shownColor = sel ? sel.color : color;

  const setSize = (v: number, continuous?: boolean) => {
    if (sel) onSelectionStyle({ width: v }, continuous);
    onPrefs({ sizes: { ...prefs.sizes, [sel ? sel.brush : sizeKey]: v } });
  };

  const fillState: FillState = sel
    ? {
        fill: sel.fill ?? { kind: "none" },
        fillColor: sel.fill?.kind === "solid" ? sel.fill.color : prefs.fillColor,
        outline: sel.outline !== false,
        strokeColor: sel.color,
        width: sel.width,
        brush: sel.brush,
      }
    : {
        fill: prefs.fillOn ? { kind: "solid", color: prefs.fillColor } : { kind: "none" },
        fillColor: prefs.fillColor,
        outline: prefs.outlineOn,
        strokeColor: color,
        width: prefs.sizes[prefs.brush],
        brush: prefs.brush,
      };

  const toolBtn = (tl: DrawTool) => {
    const meta: Record<DrawTool, { icon: IconName; label: string }> = {
      brush: { icon: BRUSH_ICON[prefs.brush], label: `${t("Brush")}: ${t(BRUSHES.find((b) => b.id === prefs.brush)?.label ?? "")}` },
      eraser: { icon: "eraser2", get label() { return t("Eraser"); } },
      shape: { icon: "cropRect", get label() { return t("Shape"); } },
      select: { icon: "select", get label() { return t("Select"); } },
    };
    return (
      <ToolButton
        key={tl}
        icon={meta[tl].icon}
        iconNode={tl === "shape" ? <ShapeIcon type={prefs.shape} /> : undefined}
        label={t(meta[tl].label)}
        active={tool === tl}
        btnRef={(el) => {
          refs.current[tl] = el;
        }}
        onClick={() => {
          if (tl === "brush" && tool === "brush") setBrushOpen(true);
          else if (tl === "eraser" && tool === "eraser") setPop(pop === "size" ? null : "size");
          else if (tl === "shape" && tool === "shape") setPop(pop === "shapes" ? null : "shapes");
          else {
            onTool(tl);
            setPop(tl === "shape" ? "shapes" : null);
          }
        }}
      />
    );
  };

  return (
    <>
      <div className="studio-tools is-tight">
        {tools.map(toolBtn)}
      </div>
      <div className="studio-sep" />
      <div className="studio-right" style={{ gap: 2 }}>
        <ColorButton color={shownColor} disabled={erase} btnRef={colorRef} onClick={() => setPop(pop === "palette" ? null : "palette")} />
        {fillMode ? (
          <button ref={sizeRef} type="button" className="st-tool" aria-label={t("Fill and stroke")} title={t("Fill and stroke")} onClick={() => setPop(pop === "fill" ? null : "fill")}>
            <span className="fill-glyph" style={{ background: fillState.fill.kind === "solid" ? fillState.fillColor : "transparent", borderColor: fillState.outline ? fillState.strokeColor : "#c8c8c8" }} />
          </button>
        ) : (
          <button ref={sizeRef} type="button" className="st-tool" aria-label={`Size ${size}`} title={t("Size")} onClick={() => setPop(pop === "size" ? null : "size")}>
            <span className="size-glyph">
              <span style={{ width: Math.max(3, Math.min(20, size / 2.5)), height: Math.max(3, Math.min(20, size / 2.5)) }} />
            </span>
          </button>
        )}
        {right}
      </div>

      <SizePopover
        open={pop === "size"}
        onClose={() => setPop(null)}
        value={size}
        max={erase ? 160 : 120}
        color={erase ? "#c8c8c8" : shownColor}
        onChange={(v) => setSize(v, true)}
        onEnd={() => sel && onSelectionStyle({}, false)}
        ignore={ignore}
        bottom={popBottom}
      />
      <PalettePopover
        open={pop === "palette"}
        onClose={() => setPop(null)}
        color={shownColor}
        onPick={(c) => {
          onColor(c);
          if (sel) onSelectionStyle({ color: c });
          if (tool === "eraser") onTool("brush");
        }}
        ignore={ignore}
        bottom={popBottom}
      />
      <ShapePickerPopover open={pop === "shapes"} onClose={() => setPop(null)} value={prefs.shape} onPick={(t) => onPrefs({ shape: t })} ignore={ignore} bottom={popBottom} />
      <FillPopover
        open={pop === "fill"}
        onClose={() => setPop(null)}
        state={fillState}
        ignore={ignore}
        bottom={popBottom}
        onChange={(patch, continuous) => {
          const prefPatch: Partial<DrawPrefs> = {};
          const style: StylePatch = {};
          if (patch.fill) {
            prefPatch.fillOn = patch.fill.kind !== "none";
            style.fill = patch.fill;
          }
          if (patch.fillColor) prefPatch.fillColor = patch.fillColor;
          if (patch.outline !== undefined) {
            prefPatch.outlineOn = patch.outline;
            style.outline = patch.outline;
          }
          if (patch.strokeColor) {
            onColor(patch.strokeColor);
            style.color = patch.strokeColor;
          }
          if (patch.width !== undefined) {
            prefPatch.sizes = { ...prefs.sizes, [sel ? sel.brush : prefs.brush]: patch.width };
            style.width = patch.width;
          }
          if (patch.brush) {
            prefPatch.brush = patch.brush;
            style.brush = patch.brush;
            style.texture = isTextured(patch.brush) ? prefs.texture : undefined;
          }
          onPrefs(prefPatch);
          if (sel) onSelectionStyle(style, continuous);
        }}
      />
      <BrushSettingsSheet
        open={brushOpen}
        onClose={() => setBrushOpen(false)}
        prefs={prefs}
        color={color}
        onBrush={(b) => {
          onPrefs({ brush: b });
          if (sel) onSelectionStyle({ brush: b, texture: isTextured(b) ? prefs.texture : undefined });
        }}
        onPrefs={onPrefs}
      />
    </>
  );
}
