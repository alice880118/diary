import { useEffect, useState, type CSSProperties } from "react";
import { useLive } from "../db/events";
import { describeError } from "../db/idb";
import { formatYm, monthName } from "../db/id";
import { coverOfMonth, listStickers, updateMonth } from "../db/repo";
import type { CoverFix, CoverShape, MonthCover, MonthlyOverview, Page, StickerSnap, TapePattern } from "../db/types";
import { t } from "../i18n";
import { noteShapeCss, TAPE_COLORS, TAPE_PATTERNS, tapeFill } from "../page/ObjectViews";
import { Icon } from "../shell/Icon";
import { Sheet } from "../shell/Sheet";
import { Tape } from "../shell/Tape";
import { useToast } from "../shell/toast";
import { snapFromSticker } from "../sticker/snap";
import { StickerArt } from "../sticker/StickerArt";
import { topStickers } from "./monthPreview";

/** A sticker that fills the width of its box, keeping its aspect ratio. */
export function SnapFill({ snap, rot = 0, style }: { snap: StickerSnap; rot?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${snap.w} / ${snap.h}`, transform: rot ? `rotate(${rot}deg)` : undefined, ...style }}>
      <StickerArt artAssetId={snap.artAssetId} shapeAssetId={snap.shapeAssetId} material={snap.material} w={100} h={(100 * snap.h) / snap.w} angle={snap.holoAngle + rot} />
    </div>
  );
}

const DOT = "radial-gradient(#d9d2c3 1px, transparent 1.3px) 0 0 / 10px 10px";

/** The month cover: a taped polaroid (or sticky-note shape) holding the cover sticker. */
export function CoverNote({ cover, snap, caption, width }: { cover: MonthCover; snap: StickerSnap | null; caption?: string; width: string | number }) {
  const polaroid = cover.shape === "polaroid";
  const photo = (
    <div style={{ aspectRatio: "1.2", background: `${DOT}, ${cover.paper}`, display: "grid", placeItems: "center", ...(polaroid ? null : { aspectRatio: "1" }) }}>
      {snap ? (
        <div style={{ width: snap.w >= snap.h ? "50%" : `${(50 * snap.w) / snap.h}%` }}>
          <SnapFill snap={snap} rot={-6} />
        </div>
      ) : (
        <span style={{ color: "#c2bdb2" }}>
          <Icon name="sticker" size={22} />
        </span>
      )}
    </div>
  );
  return (
    <div style={{ position: "relative", width, margin: "0 auto", transform: "rotate(2.5deg)" }}>
      <div
        style={{
          position: "relative",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          ...(polaroid ? { background: "#fff", padding: "6px 6px 5px" } : { background: cover.paper, ...noteShapeCss(cover.shape as Exclude<CoverShape, "polaroid">) }),
        }}
      >
        {polaroid ? photo : <div style={{ padding: "12%" }}>{photo}</div>}
        {polaroid && caption ? (
          <div className="ell" style={{ fontSize: 11, fontWeight: 500, textAlign: "center", marginTop: 4 }}>
            {caption}
          </div>
        ) : null}
      </div>
      {cover.fix === "tape" ? (
        <Tape pattern={cover.tapePattern} color={cover.tapeColor} style={{ top: -8, left: "24%", width: "52%", transform: "rotate(-6deg)" }} />
      ) : cover.fix === "pin" ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -6,
            left: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #ff9c8a, #d2553f 55%, #8e2a1c)",
            boxShadow: "1px 2px 3px rgba(0,0,0,0.35)",
          }}
        />
      ) : null}
    </div>
  );
}

/** Cover sticker shown for a month: the chosen one, else the month's most used. */
export function coverSnap(overview: MonthlyOverview | undefined, monthPages: Page[]): StickerSnap | null {
  return overview?.sticker ?? topStickers(monthPages, 1)[0] ?? null;
}

const SHAPES: { id: CoverShape; label: string }[] = [
  { id: "polaroid", get label() { return t("Polaroid"); } },
  { id: "square", get label() { return t("Square"); } },
  { id: "rounded", get label() { return t("Rounded"); } },
  { id: "torn", get label() { return t("Torn"); } },
  { id: "cloud", get label() { return t("Cloud"); } },
];

const FIXES: { id: CoverFix; label: string }[] = [
  { id: "tape", get label() { return t("Tape"); } },
  { id: "pin", get label() { return t("Pin"); } },
  { id: "none", get label() { return t("None"); } },
];

const PAPERS = ["#fff1a1", "#fbd3dc", "#cfe4fb", "#d6f3cc", "#e2cda7", "#fdfaf0"];

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  const custom = !colors.includes(value);
  return (
    <div className="swatch-row">
      {colors.map((c) => (
        <button key={c} type="button" className={`swatch-dot${value === c ? " is-active" : ""}`} style={{ background: c }} aria-label={c} aria-pressed={value === c} onClick={() => onChange(c)} />
      ))}
      <label className={`swatch-dot is-add${custom ? " is-active" : ""}`} style={custom ? { background: value } : undefined} aria-label={label}>
        {custom ? null : <Icon name="plus" size={16} />}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function SnapPick({ snap, active, onPick }: { snap: StickerSnap; active: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`cover-pick${active ? " is-active" : ""}`} aria-pressed={active} aria-label={snap.name} onClick={onPick}>
      <div style={{ width: snap.w >= snap.h ? "62%" : `${(62 * snap.w) / snap.h}%` }}>
        <SnapFill snap={snap} />
      </div>
    </button>
  );
}

export function CoverSheet({
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
  const [cover, setCover] = useState<MonthCover>(coverOfMonth(overview));
  const [sticker, setSticker] = useState<StickerSnap | null>(overview.sticker);
  const library = useLive(listStickers, []);

  useEffect(() => {
    if (open) {
      setCover(coverOfMonth(overview));
      setSticker(overview.sticker);
    }
  }, [open, overview]);

  const used = topStickers(monthPages, 50);
  const seen = new Set(used.map((s) => `${s.stickerId}@${s.version}`));
  const more = (library.data ?? []).map(snapFromSticker).filter((s): s is StickerSnap => !!s && !seen.has(`${s.stickerId}@${s.version}`));
  const same = (s: StickerSnap) => sticker?.stickerId === s.stickerId && sticker?.version === s.version;
  const shown = sticker ?? used[0] ?? null;
  const patch = (p: Partial<MonthCover>) => setCover((c) => ({ ...c, ...p }));

  const save = async () => {
    try {
      await updateMonth(overview.notebookId, overview.ym, (m) => ({ ...m, cover, sticker }));
      onClose();
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const month = Number(overview.ym.slice(5, 7));
  return (
    <Sheet
      open={open}
      title={
        <div>
          <div>{t("Month cover")}</div>
          <div className="sheet-sub">{formatYm(overview.ym)}</div>
        </div>
      }
      onClose={onClose}
      tall
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t("Done")}
          </button>
        </>
      }
    >
      <div className="cover-preview journal-bg">
        <CoverNote cover={cover} snap={shown} caption={t("Cover · {m}", { m: monthName(month, true) })} width={120} />
      </div>

      <div className="field-label cover-label">
        {t("Cover sticker")} <span className="field-aside">{sticker ? sticker.name : t("Auto")}</span>
      </div>
      <div className="hscroll" style={{ gap: 10, padding: 3 }}>
        <button type="button" className={`cover-pick is-auto${!sticker ? " is-active" : ""}`} aria-pressed={!sticker} onClick={() => setSticker(null)}>
          {t("Auto")}
        </button>
        {[...used, ...more].map((s) => (
          <SnapPick key={`${s.stickerId}@${s.version}`} snap={s} active={same(s)} onPick={() => setSticker(s)} />
        ))}
      </div>

      <div className="field-label cover-label">{t("Paper color")}</div>
      <Swatches colors={PAPERS} value={cover.paper} onChange={(paper) => patch({ paper })} label={t("Custom color")} />

      <div className="field-label cover-label">{t("Shape")}</div>
      <div className="chip-row">
        {SHAPES.map((s) => (
          <button key={s.id} type="button" className={`chip${cover.shape === s.id ? " is-active" : ""}`} onClick={() => patch({ shape: s.id })}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="field-label cover-label">{t("Attach with")}</div>
      <div className="chip-row">
        {FIXES.map((f) => (
          <button key={f.id} type="button" className={`chip${cover.fix === f.id ? " is-active" : ""}`} onClick={() => patch({ fix: f.id })}>
            {f.label}
          </button>
        ))}
      </div>

      {cover.fix === "tape" ? (
        <>
          <div className="field-label cover-label">
            {t("Tape pattern")} <span className="field-aside">{t(TAPE_PATTERNS.find((p) => p.id === cover.tapePattern)?.label ?? "")}</span>
          </div>
          <div className="tape-grid">
            {TAPE_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tape-cell${cover.tapePattern === p.id ? " is-active" : ""}`}
                onClick={() => patch({ tapePattern: p.id as TapePattern })}
              >
                <i style={{ background: tapeFill(p.id, cover.tapeColor) }} />
                {t(p.label)}
              </button>
            ))}
          </div>
          <div className="field-label cover-label">{t("Tape color")}</div>
          <Swatches colors={TAPE_COLORS} value={cover.tapeColor} onChange={(tapeColor) => patch({ tapeColor })} label={t("Custom color")} />
        </>
      ) : null}
    </Sheet>
  );
}

