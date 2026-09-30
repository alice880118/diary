import { useEffect, useState } from "react";
import { useLive } from "../db/events";
import { monthName } from "../db/id";
import { listStickers, saveMonth } from "../db/repo";
import type { MonthlyOverview, Page, StickerSnap } from "../db/types";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { snapFromSticker } from "../sticker/snap";
import { StickerArt } from "../sticker/StickerArt";
import { MonthCard } from "./MonthCard";
import { computeMonthPreview } from "./monthPreview";

function SnapThumb({ snap, active, onPick }: { snap: StickerSnap; active: boolean; onPick: () => void }) {
  const size = 64;
  const k = Math.min(size / snap.w, size / snap.h);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      style={{
        flex: "0 0 auto",
        width: 80,
        height: 88,
        padding: 4,
        border: active ? "2px solid var(--accent)" : "1px solid var(--line)",
        borderRadius: 10,
        background: "#fff",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <div style={{ position: "relative", width: snap.w * k, height: snap.h * k }}>
        <StickerArt
          artAssetId={snap.artAssetId}
          shapeAssetId={snap.shapeAssetId}
          material={snap.material}
          w={snap.w * k}
          h={snap.h * k}
          angle={snap.holoAngle}
          flat
        />
      </div>
      <span className="small" style={{ maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {active ? "✓ " : ""}
        {snap.name}
      </span>
    </button>
  );
}

export function MonthPreviewSheet({
  open,
  onClose,
  overview,
  monthPages,
}: {
  open: boolean;
  onClose: () => void;
  overview: MonthlyOverview;
  monthPages: Page[];
}) {
  const toast = useToast();
  const [text, setText] = useState(overview.highlight ?? "");
  const [sticker, setSticker] = useState<StickerSnap | null>(overview.sticker);
  const stickers = useLive(listStickers, []);

  useEffect(() => {
    if (open) {
      setText(overview.highlight ?? "");
      setSticker(overview.sticker);
    }
  }, [open, overview]);

  const usedInMonth: StickerSnap[] = [];
  const seen = new Set<string>();
  for (const p of monthPages) {
    for (const o of p.objects) {
      if (o.type === "sticker") {
        const key = `${o.snap.stickerId}@${o.snap.version}`;
        if (!seen.has(key)) {
          seen.add(key);
          usedInMonth.push(o.snap);
        }
      }
    }
  }
  const library = (stickers.data ?? [])
    .map(snapFromSticker)
    .filter((s): s is StickerSnap => s !== null && !seen.has(`${s.stickerId}@${s.version}`));

  const draft: MonthlyOverview = { ...overview, highlight: text.trim() || null, sticker };
  const preview = computeMonthPreview(overview.ym, monthPages, draft);
  const month = Number(overview.ym.slice(5, 7));
  const isSame = (s: StickerSnap) =>
    sticker?.stickerId === s.stickerId && sticker?.version === s.version;

  const save = async (next: MonthlyOverview) => {
    try {
      await saveMonth(next);
      toast("Month preview updated", "success");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  return (
    <Sheet
      open={open}
      title={`${monthName(month)} preview`}
      onClose={onClose}
      tall
      footer={
        <div className="row-between">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => save({ ...overview, highlight: null, sticker: null })}
          >
            Reset to default
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(draft)}>
            Save
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 150 }}>
          <MonthCard month={month} preview={preview} onOpen={() => undefined} />
        </div>
      </div>
      <div className="muted small" style={{ textAlign: "center", marginBottom: 12 }}>
        Highlight: {preview.highlightManual ? "manual" : "auto"} · Sticker:{" "}
        {preview.stickerManual ? "manual" : preview.sticker ? "auto (first on latest page)" : "auto (page thumbnail)"}
      </div>
      <label className="field">
        <span className="field-label">
          <span>Month highlight</span>
          <span>{text.length}/40</span>
        </span>
        <input
          className="input"
          value={text}
          maxLength={40}
          placeholder="Leave blank to use text from the latest page"
          onChange={(e) => setText(e.target.value)}
        />
        {text ? (
          <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setText("")}>
            Clear highlight (use default)
          </button>
        ) : null}
      </label>
      <div className="field">
        <span className="field-label">
          <span>Cover sticker</span>
          {sticker ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSticker(null)}>
              Clear (use default)
            </button>
          ) : null}
        </span>
        <span className="muted small">Only affects the month card preview. It won't add the sticker to any page.</span>
        {usedInMonth.length ? (
          <>
            <div className="small" style={{ marginTop: 6 }}>Used this month</div>
            <div className="hscroll">
              {usedInMonth.map((s) => (
                <SnapThumb key={`${s.stickerId}@${s.version}`} snap={s} active={isSame(s)} onPick={() => setSticker(s)} />
              ))}
            </div>
          </>
        ) : null}
        <div className="small" style={{ marginTop: 6 }}>Library</div>
        {library.length ? (
          <div className="hscroll">
            {library.map((s) => (
              <SnapThumb key={`${s.stickerId}@${s.version}`} snap={s} active={isSame(s)} onPick={() => setSticker(s)} />
            ))}
          </div>
        ) : (
          <span className="muted small">No stickers yet. Make one in Create.</span>
        )}
      </div>
    </Sheet>
  );
}
