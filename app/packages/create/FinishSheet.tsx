import { useEffect, useState } from "react";
import type { Sticker, StickerVersion } from "../db/types";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { exportSize, renderStickerPng, saveOrShare, stickerFileName, type ExportQuality } from "../sticker/exportPng";
import { describeError } from "../db/idb";
import { t } from "../i18n";

export function ExportControls({ sticker, version }: { sticker: Sticker; version: StickerVersion }) {
  const toast = useToast();
  const [quality, setQuality] = useState<ExportQuality>("standard");
  const [busy, setBusy] = useState(false);
  const size = exportSize(version, quality);
  return (
    <div>
      <div className="tabs" style={{ marginBottom: 6 }}>
        {(["standard", "high"] as const).map((q) => {
          const s = exportSize(version, q);
          return (
            <button key={q} type="button" className={`tab${quality === q ? " is-active" : ""}`} onClick={() => setQuality(q)}>
              {q === "standard" ? t("Standard") : t("High quality")} {s.w}×{s.h}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const blob = await renderStickerPng(version, quality);
            const r = await saveOrShare(blob, stickerFileName(sticker, version, quality));
            if (r === "cancelled") toast(t("Export cancelled"));
            else toast(r === "shared" ? t("Sent to the share sheet") : t("PNG downloaded ({w}×{h})", { w: size.w, h: size.h }), "success");
          } catch (err) {
            toast(t("Export failed: {x}", { x: describeError(err) }), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("Exporting…") : t("Export PNG ({w}×{h} px)", { w: size.w, h: size.h })}
      </button>
      <p className="muted small">
        {t("Exports only this sticker, transparent outside the crop outline.")}{" "}
        {version.material === "holo" ? t("Holo uses the current fixed shine angle; PNG can't keep the animated effect.") : t("Uses the same print settings as the preview.")}
      </p>
    </div>
  );
}

export function FinishSheet({
  open,
  defaultName,
  defaultCategory,
  categories,
  busy,
  result,
  canReturn,
  onClose,
  onSave,
  onPaste,
}: {
  open: boolean;
  defaultName: string;
  defaultCategory: string;
  categories: string[];
  busy: boolean;
  result: { sticker: Sticker; version: StickerVersion } | null;
  canReturn: boolean;
  onClose: () => void;
  onSave: (name: string, category: string) => void;
  onPaste: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState(defaultCategory);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setCategory(defaultCategory);
      setTouched(false);
    }
  }, [open, defaultName, defaultCategory]);

  const err = !name.trim() ? t("Enter a sticker name") : null;

  return (
    <Sheet open={open} title={result ? t("Sticker saved") : t("Finish sticker")} onClose={onClose}>
      {result ? (
        <>
          <p className="confirm-msg">
            &ldquo;{result.sticker.name}&rdquo; version {result.version.no} was saved to your Library.
          </p>
          <button type="button" className="btn btn-primary btn-block" style={{ marginBottom: 10 }} onClick={onPaste}>
            {canReturn ? t("Add to the page you came from") : t("Add to diary…")}
          </button>
          <ExportControls sticker={result.sticker} version={result.version} />
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
            {t("Keep editing")}
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">{t("Sticker name")}</span>
            <input
              className={`input${touched && err ? " is-error" : ""}`}
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && err ? <span className="field-error">{err}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">{t("Category (optional)")}</span>
            <input className="input" value={category} maxLength={20} list="sticker-cats" onChange={(e) => setCategory(e.target.value)} placeholder={t("e.g. Plants, Travel, Lettering")} />
            <datalist id="sticker-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (!err) onSave(name.trim(), category.trim());
            }}
          >
            {busy ? t("Making sticker…") : t("Save sticker")}
          </button>
          <p className="muted small">{t("Each finish creates a new version; older versions already in your diary stay unchanged.")}</p>
        </>
      )}
    </Sheet>
  );
}
