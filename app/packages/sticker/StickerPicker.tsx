import { useState } from "react";
import { useLive } from "../db/events";
import { listStickers } from "../db/repo";
import type { Sticker } from "../db/types";
import { Icon } from "../shell/Icon";
import { StickerThumb } from "./StickerThumb";

export function StickerPicker({
  onPick,
  onCreate,
}: {
  onPick: (s: Sticker) => void;
  onCreate: () => void;
}) {
  const stickers = useLive(listStickers, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const all = stickers.data ?? [];
  const cats = Array.from(new Set(all.map((s) => s.category).filter(Boolean)));
  const list = all.filter(
    (s) =>
      (!cat || s.category === cat) &&
      (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="row" style={{ flex: 1, position: "relative" }}>
          <input
            className="input"
            placeholder="Search stickers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
          <span style={{ position: "absolute", left: 10, color: "var(--ink-soft)" }}>
            <Icon name="search" size={18} />
          </span>
        </div>
        <button type="button" className="btn" onClick={onCreate}>
          <Icon name="plus" size={18} /> New
        </button>
      </div>
      {cats.length ? (
        <div className="hscroll" style={{ marginBottom: 10 }}>
          <button type="button" className={`chip${cat === null ? " is-active" : ""}`} onClick={() => setCat(null)}>
            All
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className={`chip${cat === c ? " is-active" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      ) : null}
      {all.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-title">No stickers yet</div>
          <div className="empty-hint">Draw or import a photo in Create to make your first sticker.</div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onCreate}>
            Create sticker
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-title">No matching stickers</div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              setQ("");
              setCat(null);
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="sticker-grid">
          {list.map((s) => (
            <button key={s.id} type="button" className="sticker-cell" onClick={() => onPick(s)}>
              <StickerThumb sticker={s} size={70} />
              <span className="sticker-cell-name">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
