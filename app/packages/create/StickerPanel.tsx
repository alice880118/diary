import type { CropKind, StickerSettings } from "../db/types";
import { MATERIALS } from "../sticker/StickerArt";

const CROPS: { id: CropKind; label: string }[] = [
  { id: "contour", label: "Contour" },
  { id: "rect", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "manual", label: "Freehand (lasso)" },
];

export function StickerPanel({
  s,
  onChange,
  onAutoFit,
  previewMode,
  onPreviewMode,
}: {
  s: StickerSettings;
  onChange: (next: StickerSettings, continuous?: boolean) => void;
  onAutoFit: () => void;
  previewMode: "static" | "shine" | "crop";
  onPreviewMode: (m: "static" | "shine" | "crop") => void;
}) {
  const r = s.crop.rect;
  const setRect = (patch: Partial<typeof r>) =>
    onChange({ ...s, crop: { ...s.crop, rect: { ...r, ...patch } } }, true);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={`tab${previewMode === "static" ? " is-active" : ""}`} onClick={() => onPreviewMode("static")}>
          Static
        </button>
        <button type="button" className={`tab${previewMode === "shine" ? " is-active" : ""}`} onClick={() => onPreviewMode("shine")}>
          Shine
        </button>
        <button type="button" className={`tab${previewMode === "crop" ? " is-active" : ""}`} onClick={() => onPreviewMode("crop")}>
          Crop area
        </button>
      </div>

      <div className="small" style={{ marginBottom: 4 }}>Material</div>
      <div className="row-wrap" style={{ marginBottom: 4 }}>
        {MATERIALS.map((m) => (
          <button key={m.id} type="button" className={`chip${s.material === m.id ? " is-active" : ""}`} onClick={() => onChange({ ...s, material: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="muted small" style={{ marginBottom: 10 }}>{MATERIALS.find((m) => m.id === s.material)?.hint}</div>

      <div className="small" style={{ marginBottom: 4 }}>Crop</div>
      <div className="row-wrap" style={{ marginBottom: 6 }}>
        {CROPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${s.crop.kind === c.id ? " is-active" : ""}`}
            onClick={() => {
              onChange({ ...s, crop: { ...s.crop, kind: c.id } });
              if (c.id === "manual") onPreviewMode("crop");
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {s.crop.kind === "manual" ? (
        <div className="muted small" style={{ marginBottom: 6 }}>
          In &ldquo;Crop area&rdquo;, draw around the part you want to keep. {s.crop.poly.length >= 6 ? "Set." : "Not set yet."}
        </div>
      ) : null}
      {s.crop.kind === "rect" || s.crop.kind === "circle" ? (
        <div style={{ marginBottom: 6 }}>
          <button type="button" className="btn btn-sm" onClick={onAutoFit} style={{ marginBottom: 4 }}>
            Auto-fit to artwork
          </button>
          <div className="row" style={{ gap: 10 }}>
            <label className="small" style={{ flex: 1 }}>
              Width {Math.round(r.w)}
              <input type="range" min={60} max={1024} value={r.w} onChange={(e) => setRect({ w: Number(e.target.value) })} onPointerUp={() => onChange(s)} />
            </label>
            <label className="small" style={{ flex: 1 }}>
              Height {Math.round(r.h)}
              <input type="range" min={60} max={1024} value={r.h} onChange={(e) => setRect({ h: Number(e.target.value) })} onPointerUp={() => onChange(s)} />
            </label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <label className="small" style={{ flex: 1 }}>
              Horizontal {Math.round(r.x)}
              <input type="range" min={-200} max={1024} value={r.x} onChange={(e) => setRect({ x: Number(e.target.value) })} onPointerUp={() => onChange(s)} />
            </label>
            <label className="small" style={{ flex: 1 }}>
              Vertical {Math.round(r.y)}
              <input type="range" min={-200} max={1024} value={r.y} onChange={(e) => setRect({ y: Number(e.target.value) })} onPointerUp={() => onChange(s)} />
            </label>
          </div>
        </div>
      ) : null}

      <label className="small" style={{ display: "block" }}>
        Border width {s.border}
        <input
          type="range"
          min={0}
          max={48}
          value={s.border}
          onChange={(e) => onChange({ ...s, border: Number(e.target.value) }, true)}
          onPointerUp={() => onChange(s)}
        />
      </label>

      <div className="small" style={{ margin: "8px 0 4px" }}>Paper</div>
      <div className="tabs" style={{ marginBottom: 4 }}>
        <button type="button" className={`tab${s.keepPaper ? " is-active" : ""}`} onClick={() => onChange({ ...s, keepPaper: true })}>
          Keep paper
        </button>
        <button type="button" className={`tab${!s.keepPaper ? " is-active" : ""}`} onClick={() => onChange({ ...s, keepPaper: false })}>
          Remove paper
        </button>
      </div>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Removing paper only drops the white paper surface; the artwork and ink texture stay. A transparent background, the clear material, and white ink are separate settings.
      </div>

      {s.material === "holo" ? (
        <label className="small" style={{ display: "block" }}>
          Shine angle (used for PNG export) {Math.round(s.holoAngle)}°
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(s.holoAngle)}
            onChange={(e) => onChange({ ...s, holoAngle: Number(e.target.value) }, true)}
            onPointerUp={() => onChange(s)}
          />
        </label>
      ) : null}
    </div>
  );
}
