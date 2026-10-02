import { useEffect, useRef, useState, type RefObject } from "react";
import { inkMask } from "../art/render";
import type { ArtRuntime } from "../art/runtime";
import type { ArtLayer, CropKind, PrintLayer, StickerMaterial, StickerSettings } from "../db/types";
import {
  INK_PALETTE,
  MAX_PRINT_LAYERS,
  offsetAmount,
  offsetAngle,
  regenerateMisregistration,
  withOffset,
} from "../print/layers";
import { ColorDots } from "../shell/ColorDots";
import { Dropdown } from "../shell/Dropdown";
import { Icon, type IconName } from "../shell/Icon";
import { Popover } from "../shell/Popover";
import { Sheet } from "../shell/Sheet";
import { TEXTURE_CATEGORIES, TEXTURES, textureById, type TextureCategory } from "../textures/catalog";
import { textureScaleOf, textureThumb } from "../textures/render";
import { SortableRows } from "./SketchTools";
import { t } from "../i18n";

export type PrintView = "composite" | "single" | "draft" | "mask";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function Slider({
  label,
  min,
  max,
  value,
  display,
  onChange,
  onEnd,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
  onEnd?: () => void;
}) {
  return (
    <label className="slider-row" onPointerUp={onEnd} onKeyUp={onEnd}>
      <span className="slider-text">{label}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{display}</span>
    </label>
  );
}

/** Generates thumbnails progressively so lists open instantly. */
function useThumbs(ids: string[], size = 112) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = ids.join("|");
  useEffect(() => {
    let alive = true;
    let i = 0;
    const next = () => {
      if (!alive || i >= ids.length) return;
      const id = ids[i++];
      const url = textureThumb(id, size);
      setThumbs((t) => (t[id] ? t : { ...t, [id]: url }));
      setTimeout(next, 0);
    };
    next();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return thumbs;
}

/** "Fine watercolor" → "Fine" when the category already says watercolor. */
export function textureShortName(id: string) {
  const tx = textureById(id);
  const cat = TEXTURE_CATEGORIES.find((c) => c.id === tx.category)?.label ?? "";
  const short = tx.name.replace(new RegExp(`\\s+${cat}$`, "i"), "");
  return t(short || tx.name);
}

/* ------------------------------------------------------------------ */
/* Paper                                                               */
/* ------------------------------------------------------------------ */

export const PAPER_STRIP_H = 122;

export function PaperStrip({
  value,
  onPick,
  onAdjust,
  onAll,
  adjustRef,
  adjustOpen,
}: {
  value: string;
  onPick: (id: string) => void;
  onAdjust: () => void;
  onAll: () => void;
  adjustRef: RefObject<HTMLButtonElement>;
  adjustOpen: boolean;
}) {
  const [cat, setCat] = useState<TextureCategory | "all">("all");
  const list = TEXTURES.filter((t) => cat === "all" || t.category === cat);
  const thumbs = useThumbs(list.map((t) => t.id));
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [cat]);
  return (
    <div className="paper-strip">
      <div className="cat-row">
        <button type="button" className={`cat-pill${cat === "all" ? " is-active" : ""}`} onClick={() => setCat("all")}>
          {t("All")}
        </button>
        {TEXTURE_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`cat-pill${cat === c.id ? " is-active" : ""}`} onClick={() => setCat(c.id)}>
            {t(c.label)}
          </button>
        ))}
      </div>
      <div className="thumb-row">
        <button ref={adjustRef} type="button" className={`thumb-act${adjustOpen ? " is-active" : ""}`} aria-label={t("Adjust texture")} onClick={onAdjust}>
          <Icon name="sliders" />
        </button>
        <div className="thumb-scroll">
          {list.map((t) => (
            <button
              key={t.id}
              ref={t.id === value ? activeRef : undefined}
              type="button"
              className={`tex-thumb${t.id === value ? " is-active" : ""}`}
              aria-label={textureShortName(t.id)}
              aria-pressed={t.id === value}
              style={{ backgroundImage: thumbs[t.id] ? `url(${thumbs[t.id]})` : undefined }}
              onClick={() => onPick(t.id)}
            />
          ))}
        </div>
        <button type="button" className="thumb-act" aria-label={t("All papers")} onClick={onAll}>
          <Icon name="gridAll" />
        </button>
      </div>
    </div>
  );
}

export function TexturePopover({
  open,
  onClose,
  texture,
  onChange,
  onEnd,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  texture: { id: string; strength: number; scale?: number };
  onChange: (patch: { strength?: number; scale?: number }) => void;
  onEnd: () => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  const scale = textureScaleOf(texture);
  return (
    <Popover open={open} onClose={onClose} bottom={PAPER_STRIP_H + 12} ignore={ignore}>
      <Slider
        label={t("Strength")}
        min={0}
        max={100}
        value={Math.round(texture.strength * 100)}
        display={`${Math.round(texture.strength * 100)}%`}
        onChange={(v) => onChange({ strength: v / 100 })}
        onEnd={onEnd}
      />
      <Slider
        label={t("Texture scale")}
        min={100}
        max={400}
        value={Math.round(scale * 100)}
        display={`${Math.round(scale * 100)}%`}
        onChange={(v) => onChange({ scale: v / 100 })}
        onEnd={onEnd}
      />
    </Popover>
  );
}

export function PaperSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onPick: (id: string) => void;
}) {
  const [cat, setCat] = useState<TextureCategory | "all">("all");
  const list = TEXTURES.filter((t) => cat === "all" || t.category === cat);
  const thumbs = useThumbs(open ? list.map((t) => t.id) : [], 160);
  return (
    <Sheet open={open} title={t("Paper")} onClose={onClose} studio height={470} headerRight={<span className="muted small" style={{ paddingRight: 8 }}>{TEXTURES.length}</span>}>
      <div className="utabs" role="tablist">
        <button type="button" role="tab" aria-selected={cat === "all"} className={cat === "all" ? "is-active" : ""} onClick={() => setCat("all")}>
          {t("All")}
        </button>
        {TEXTURE_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? "is-active" : ""} onClick={() => setCat(c.id)}>
            {t(c.label)}
          </button>
        ))}
      </div>
      <div className="paper-grid">
        {list.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`grid-cell${t.id === value ? " is-active" : ""}`}
            aria-pressed={t.id === value}
            onClick={() => {
              onPick(t.id);
              onClose();
            }}
          >
            <i style={{ backgroundImage: thumbs[t.id] ? `url(${thumbs[t.id]})` : undefined }} />
            <span>{textureShortName(t.id)}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

export const PRINT_VIEWS: { id: PrintView; label: string; icon: IconName }[] = [
  { id: "composite", get label() { return t("Composite"); }, icon: "viewComposite" },
  { id: "single", get label() { return t("Single ink"); }, icon: "viewSingle" },
  { id: "mask", get label() { return t("Mask only"); }, icon: "viewMask" },
  { id: "draft", get label() { return t("Sketch"); }, icon: "pen2" },
];

export function InkColorPopover({
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
    <Popover open={open} onClose={onClose} title={t("Ink color")} ignore={ignore}>
      <div className="palette">
        <ColorDots
          colors={INK_PALETTE.map((c) => ({ value: c.color, label: t(c.name) }))}
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

function InkThumb({ layer, rt, empty }: { layer: PrintLayer; rt: ArtRuntime | null; empty: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const m = rt ? inkMask(rt, layer) : undefined;
    if (!c || !m || empty) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(m, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = layer.color;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
  });
  if (empty) return <span className="layer-thumb is-empty" aria-label={t("No area yet")} />;
  return <canvas ref={ref} className="layer-thumb" width={88} height={88} aria-hidden />;
}

/** Short ink name: drops the "Ink 3 · " prefix older layers were named with. */
export function inkLabel(p: PrintLayer) {
  const n = p.name.replace(/^Ink \d+ · /, "");
  // Default palette names are stored in English; show them in the UI language.
  return n === "Custom" || INK_PALETTE.some((x) => x.name === n) ? t(n) : n;
}

export function InksSheet({
  open,
  onClose,
  layers,
  rt,
  rtTick,
  empty,
  activeId,
  enabled,
  artLayers,
  onEnabled,
  onSelect,
  onAdd,
  onUpdate,
  onDuplicate,
  onDelete,
  onReorder,
  onFromLayer,
  onClearMask,
  onInkColor,
}: {
  open: boolean;
  onClose: () => void;
  layers: PrintLayer[];
  rt: ArtRuntime | null;
  rtTick: number;
  empty: Set<string>;
  activeId: string | null;
  enabled: boolean;
  artLayers: ArtLayer[];
  onEnabled: (v: boolean) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (p: PrintLayer) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move to an index in the stored (bottom-first) array. */
  onReorder: (id: string, toIndex: number) => void;
  onFromLayer: (inkId: string, artLayerId: string) => void;
  onClearMask: (inkId: string) => void;
  onInkColor: (inkId: string) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [areaFor, setAreaFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const full = layers.length >= MAX_PRINT_LAYERS;
  const top = [...layers].reverse().map((l) => ({ ...l, name: inkLabel(l) }));
  const menuInk = layers.find((l) => l.id === menuFor) ?? null;
  void rtTick;

  useEffect(() => {
    if (!open) {
      setMenuFor(null);
      setAreaFor(null);
      setRenaming(null);
    }
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      studio
      height={400}
      title={
        <>
          {t("Inks")}{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
            {layers.length}/{MAX_PRINT_LAYERS}
          </span>
        </>
      }
      headerRight={
        <span className="row" style={{ gap: 10 }}>
          <label className="toggle-label">
            <span>{t("Stencil")}</span>
            <input type="checkbox" role="switch" className="toggle" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
          </label>
          <button type="button" className="icon-btn is-filled" aria-label={t("New ink")} disabled={full} onClick={onAdd}>
            <Icon name="plus" />
          </button>
        </span>
      }
    >
      {layers.length === 0 ? (
        <div className="empty-state" style={{ padding: "28px 16px" }}>
          <div className="empty-title">{t("No inks yet")}</div>
          <div className="empty-hint">{t("Add up to {n} inks, then paint where each one prints.", { n: MAX_PRINT_LAYERS })}</div>
        </div>
      ) : (
        <SortableRows items={top} activeId={activeId} onSelect={onSelect} onMove={(id, to) => onReorder(id, layers.length - 1 - to)}>
          {(row) => {
            const l = layers.find((x) => x.id === row.id) as PrintLayer;
            return (
              <>
                <InkThumb layer={l} rt={rt} empty={empty.has(l.id)} />
                <div className="layer-name">
                  {renaming === l.id ? (
                    <input
                      className="input"
                      autoFocus
                      defaultValue={inkLabel(l)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        onUpdate({ ...l, name: e.target.value.trim() || l.name });
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <b>
                      <span className="ink-chip" style={{ background: l.color }} />
                      {inkLabel(l)}
                    </b>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  style={l.visible ? undefined : { color: "#bbb" }}
                  aria-label={l.visible ? t("Hide {x}", { x: inkLabel(l) }) : t("Show {x}", { x: inkLabel(l) })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ ...l, visible: !l.visible });
                  }}
                >
                  <Icon name={l.visible ? "eye" : "eyeOff"} size={18} />
                </button>
                <button
                  type="button"
                  className={`icon-btn${menuFor === l.id ? " is-pressed" : ""}`}
                  aria-label={t("More for {x}", { x: inkLabel(l) })}
                  onClick={(e) => {
                    e.stopPropagation();
                    menuRef.current = e.currentTarget;
                    setMenuFor(menuFor === l.id ? null : l.id);
                  }}
                >
                  <Icon name="more" size={18} />
                </button>
              </>
            );
          }}
        </SortableRows>
      )}
      <Dropdown
        open={menuInk !== null}
        anchor={menuRef}
        align="end"
        minWidth={220}
        onClose={() => setMenuFor(null)}
        items={
          menuInk
            ? [
                { icon: "edit", get label() { return t("Rename"); }, onSelect: () => setRenaming(menuInk.id) },
                { icon: "palette2", get label() { return t("Ink color"); }, onSelect: () => onInkColor(menuInk.id) },
                "separator",
                { icon: "layerArea", get label() { return t("Area from layer…"); }, onSelect: () => setAreaFor(menuInk.id) },
                { icon: "clearArea", get label() { return t("Clear area"); }, disabled: empty.has(menuInk.id), onSelect: () => onClearMask(menuInk.id) },
                "separator",
                { icon: "copy", get label() { return t("Duplicate"); }, disabled: full, onSelect: () => onDuplicate(menuInk.id) },
                { icon: "trash", get label() { return t("Delete"); }, danger: true, onSelect: () => onDelete(menuInk.id) },
              ]
            : []
        }
      />
      <Dropdown
        open={areaFor !== null}
        anchor={menuRef}
        align="end"
        minWidth={220}
        onClose={() => setAreaFor(null)}
        items={artLayers
          .slice()
          .reverse()
          .map((a) => ({
            icon: (a.kind === "image" ? "image2" : "layers") as IconName,
            label: a.name,
            onSelect: () => areaFor && onFromLayer(areaFor, a.id),
          }))}
      />
    </Sheet>
  );
}

export function PrintParamsSheet({
  open,
  onClose,
  layer,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  layer: PrintLayer | null;
  /** record: false while dragging, true at the end of a drag, undefined for one-off changes. */
  onUpdate: (p: PrintLayer, record?: boolean) => void;
}) {
  if (!layer) return null;
  const l = layer;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const end = () => onUpdate(l, true);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      modal={false}
      height={372}
      title={
        <span className="row" style={{ gap: 8 }}>
          <span className="ink-chip is-lg" style={{ background: l.color }} />
          {inkLabel(l)}
        </span>
      }
      headerRight={
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="icon-btn" aria-label={t("Regenerate offset and grain")} title={t("Regenerate offset and grain")} onClick={() => onUpdate(regenerateMisregistration(l))}>
            <Icon name="dice" />
          </button>
          <button type="button" className="icon-btn" aria-label={t("Reset offset")} title={t("Reset offset")} onClick={() => onUpdate(withOffset(l, 0, 0))}>
            <Icon name="reset" />
          </button>
          <button type="button" className="icon-btn" aria-label={t("Close")} onClick={onClose}>
            <Icon name="close" />
          </button>
        </span>
      }
    >
      <Slider label={t("Density")} min={0} max={100} value={Math.round(l.density * 100)} display={pct(l.density)} onChange={(v) => onUpdate({ ...l, density: v / 100 }, false)} onEnd={end} />
      <Slider label={t("Show-through")} min={0} max={100} value={Math.round(l.paperShow * 100)} display={pct(l.paperShow)} onChange={(v) => onUpdate({ ...l, paperShow: v / 100 }, false)} onEnd={end} />
      <hr className="soft-hr" />
      <Slider label={t("Grain")} min={0} max={100} value={Math.round(l.grain * 100)} display={pct(l.grain)} onChange={(v) => onUpdate({ ...l, grain: v / 100 }, false)} onEnd={end} />
      <Slider label={t("Unevenness")} min={0} max={100} value={Math.round(l.unevenness * 100)} display={pct(l.unevenness)} onChange={(v) => onUpdate({ ...l, unevenness: v / 100 }, false)} onEnd={end} />
      <hr className="soft-hr" />
      <Slider
        label={t("Offset")}
        min={0}
        max={100}
        value={Math.round(offsetAmount(l) * 10000)}
        display={`${(offsetAmount(l) * 100).toFixed(2)}%`}
        onChange={(v) => onUpdate(withOffset(l, v / 10000, offsetAngle(l)), false)}
        onEnd={end}
      />
      <Slider
        label={t("Angle")}
        min={0}
        max={359}
        value={Math.round((offsetAngle(l) + 360) % 360)}
        display={`${Math.round((offsetAngle(l) + 360) % 360)}°`}
        onChange={(v) => onUpdate(withOffset(l, offsetAmount(l), v), false)}
        onEnd={end}
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Sticker                                                             */
/* ------------------------------------------------------------------ */

const MATERIAL_SWATCH: Record<StickerMaterial, string> = {
  white: "#fff",
  clear: "repeating-linear-gradient(45deg,#eee 0 4px,#fff 4px 8px)",
  holo: "linear-gradient(135deg,#f9c6e8,#c6e3f9,#d8f9c6,#f9eec6)",
};

const MATERIAL_ORDER: { id: StickerMaterial; label: string }[] = [
  { id: "white", get label() { return t("White"); } },
  { id: "clear", get label() { return t("Clear"); } },
  { id: "holo", get label() { return t("Holo"); } },
];

export const CUTS: { id: CropKind; label: string; icon: IconName }[] = [
  { id: "contour", get label() { return t("Contour"); }, icon: "cropContour" },
  { id: "rect", get label() { return t("Rect"); }, icon: "cropRect" },
  { id: "circle", get label() { return t("Circle"); }, icon: "cropCircle" },
  { id: "manual", get label() { return t("Lasso"); }, icon: "cropLasso" },
];

export function MaterialPopover({
  open,
  onClose,
  s,
  onChange,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  s: StickerSettings;
  onChange: (next: StickerSettings, continuous?: boolean) => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  return (
    <Popover open={open} onClose={onClose} ignore={ignore}>
      <div className="tabs is-tall">
        {MATERIAL_ORDER.map((m) => (
          <button key={m.id} type="button" className={`tab${s.material === m.id ? " is-active" : ""}`} aria-pressed={s.material === m.id} onClick={() => onChange({ ...s, material: m.id })}>
            <i className="mat-swatch" style={{ background: MATERIAL_SWATCH[m.id] }} />
            {t(m.label)}
          </button>
        ))}
      </div>
      {s.material === "holo" ? (
        <label className="slider-row" style={{ marginTop: 12 }} onPointerUp={() => onChange(s)}>
          <span className="slider-text">{t("Shine angle")}</span>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(s.holoAngle)}
            aria-label={t("Shine angle")}
            onChange={(e) => onChange({ ...s, holoAngle: Number(e.target.value) }, true)}
          />
          <span className="slider-value">{Math.round(s.holoAngle)}°</span>
        </label>
      ) : null}
    </Popover>
  );
}

export function CutPopover({
  open,
  onClose,
  s,
  onChange,
  onAutoFit,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  s: StickerSettings;
  onChange: (next: StickerSettings, continuous?: boolean) => void;
  onAutoFit: () => void;
  ignore: RefObject<HTMLElement | null>[];
}) {
  const kind = s.crop.kind;
  return (
    <Popover open={open} onClose={onClose} ignore={ignore} canvasPassThrough={kind !== "contour"}>
      <div className="tabs is-tall">
        {CUTS.map((c) => (
          <button key={c.id} type="button" className={`tab${kind === c.id ? " is-active" : ""}`} aria-pressed={kind === c.id} onClick={() => onChange({ ...s, crop: { ...s.crop, kind: c.id } })}>
            <Icon name={c.icon} size={20} />
            {t(c.label)}
          </button>
        ))}
      </div>
      <label className="slider-row" style={{ marginTop: 12, marginBottom: 0 }} onPointerUp={() => onChange(s)}>
        <span className="slider-text">{t("Border")}</span>
        <input type="range" min={0} max={48} value={s.border} aria-label={t("Border")} onChange={(e) => onChange({ ...s, border: Number(e.target.value) }, true)} />
        <span className="slider-value">{s.border}</span>
      </label>
      {kind === "rect" || kind === "circle" ? (
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="muted small">{t("Drag the box; drag its corner to resize.")}</span>
          <button type="button" className="btn btn-sm" onClick={onAutoFit}>
            {t("Auto-fit")}
          </button>
        </div>
      ) : kind === "manual" ? (
        <div className="muted small" style={{ marginTop: 8 }}>
          {s.crop.poly.length >= 6 ? t("Draw again to replace the outline.") : t("Draw around the part to keep.")}
        </div>
      ) : null}
    </Popover>
  );
}
