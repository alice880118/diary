import { monthName } from "../db/id";
import { StickerArt } from "../sticker/StickerArt";
import { PageSurface } from "../page/PageSurface";
import { Icon } from "../shell/Icon";
import type { MonthPreview } from "./monthPreview";

export function MonthVisual({ preview, size }: { preview: MonthPreview; size: number }) {
  if (preview.sticker) {
    const s = preview.sticker;
    const k = Math.min(size / s.w, size / s.h) * 0.9;
    return (
      <div
        style={{
          position: "relative",
          width: s.w * k,
          height: s.h * k,
          transform: "rotate(-4deg)",
        }}
      >
        <StickerArt
          artAssetId={s.artAssetId}
          shapeAssetId={s.shapeAssetId}
          material={s.material}
          w={s.w * k}
          h={s.h * k}
          angle={s.holoAngle}
        />
      </div>
    );
  }
  if (preview.samplePage) {
    return <PageSurface page={preview.samplePage} width={size * 0.72} thumb />;
  }
  return (
    <div
      style={{
        width: size * 0.6,
        height: size * 0.6,
        borderRadius: "50%",
        border: "2px dashed var(--border)",
      }}
    />
  );
}

export function MonthCard({
  month,
  preview,
  onOpen,
}: {
  month: number;
  preview: MonthPreview;
  onOpen: () => void;
}) {
  const empty = preview.count === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="month-card"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 6,
        padding: 10,
        minHeight: 176,
        border: `1px solid ${empty ? "var(--muted)" : "#e6e6e3"}`,
        borderRadius: 14,
        background: empty ? "var(--muted)" : "var(--card)",
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      <div className="row-between">
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {monthName(month, true)}
        </span>
        <span className="badge" aria-label={`${preview.count} pages`}>{preview.count}</span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 84,
        }}
      >
        {empty ? (
          <span className="muted" aria-label="Add page">
            <Icon name="plus" size={20} />
          </span>
        ) : (
          <MonthVisual preview={preview} size={84} />
        )}
      </div>
      {!empty ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            color: "var(--ink)",
            maxHeight: 34,
            overflow: "hidden",
          }}
        >
          {preview.highlightManual ? "★ " : ""}
          {preview.highlight}
        </div>
      ) : null}
    </button>
  );
}
