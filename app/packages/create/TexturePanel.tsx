import { useEffect, useState } from "react";
import { TEXTURE_CATEGORIES, TEXTURES, textureById, type TextureCategory } from "../textures/catalog";
import { textureCanvas, textureThumb } from "../textures/render";
import { Sheet } from "../shell/Sheet";

/** Generates thumbnails progressively so the panel opens instantly. */
function useThumbs(ids: string[]) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    let i = 0;
    const next = () => {
      if (!alive || i >= ids.length) return;
      const id = ids[i++];
      const url = textureThumb(id, 120);
      setThumbs((t) => (t[id] ? t : { ...t, [id]: url }));
      setTimeout(next, 0);
    };
    next();
    return () => {
      alive = false;
    };
  }, [ids.join("|")]);
  return thumbs;
}

export function TexturePanel({
  value,
  strength,
  onChange,
}: {
  value: string;
  strength: number;
  onChange: (id: string, strength: number) => void;
}) {
  const [cat, setCat] = useState<TextureCategory | "all">("all");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const list = TEXTURES.filter((t) => cat === "all" || t.category === cat);
  const thumbs = useThumbs(list.map((t) => t.id));
  const cur = textureById(value);

  useEffect(() => {
    if (!zoomOpen) return;
    setZoomUrl(null);
    const t = setTimeout(() => {
      setZoomUrl(textureCanvas(value, strength, 360, 360, 1).toDataURL("image/png"));
    }, 30);
    return () => clearTimeout(t);
  }, [zoomOpen, value, strength]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{cur.name}</div>
          <div className="muted small">
            {TEXTURE_CATEGORIES.find((c) => c.id === cur.category)?.label} · ID {cur.id}
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setZoomOpen(true)}>
          Zoom in
        </button>
      </div>
      <label className="small">
        Strength {Math.round(strength * 100)}%
        <input type="range" min={0} max={100} value={Math.round(strength * 100)} onChange={(e) => onChange(value, Number(e.target.value) / 100)} />
      </label>
      <div className="hscroll" style={{ margin: "6px 0 8px" }}>
        <button type="button" className={`chip${cat === "all" ? " is-active" : ""}`} onClick={() => setCat("all")}>
          All 30
        </button>
        {TEXTURE_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`chip${cat === c.id ? " is-active" : ""}`} onClick={() => setCat(c.id)}>
            {c.label} {TEXTURES.filter((t) => t.category === c.id).length}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {list.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id, strength)}
              aria-pressed={active}
              style={{
                padding: 3,
                border: active ? "2px solid var(--accent)" : "1px solid var(--line)",
                borderRadius: 10,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  aspectRatio: "1",
                  borderRadius: 7,
                  background: thumbs[t.id] ? `url(${thumbs[t.id]}) center/cover` : "var(--muted)",
                }}
              />
              <div className="small" style={{ marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: active ? 600 : 400 }}>
                {active ? "✓ " : ""}
                {t.name}
              </div>
            </button>
          );
        })}
      </div>
      <Sheet open={zoomOpen} title={`${cur.name} (1:1 detail)`} onClose={() => setZoomOpen(false)}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {zoomUrl ? (
            <img src={zoomUrl} alt={cur.name} style={{ width: 360, maxWidth: "100%", imageRendering: "auto", borderRadius: 8 }} />
          ) : (
            <div className="muted" style={{ padding: 60 }}>Generating…</div>
          )}
        </div>
        <p className="muted small">Preview and export use the same texture coordinates and scale, so the texture never stretches with screen size.</p>
      </Sheet>
    </div>
  );
}
