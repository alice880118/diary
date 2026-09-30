import { useEffect, useState } from "react";
import type { Sticker, StickerVersion } from "../db/types";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { exportSize, renderStickerPng, saveOrShare, stickerFileName, type ExportQuality } from "../sticker/exportPng";

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
              {q === "standard" ? "Standard" : "High quality"} {s.w}×{s.h}
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
            if (r === "cancelled") toast("Export cancelled");
            else toast(r === "shared" ? "Sent to the share sheet" : `PNG downloaded (${size.w}×${size.h})`, "success");
          } catch (err) {
            toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Exporting…" : `Export PNG (${size.w}×${size.h} px)`}
      </button>
      <p className="muted small">
        Exports only this sticker, transparent outside the crop outline.{" "}
        {version.material === "holo" ? "Holo uses the current fixed shine angle; PNG can't keep the animated effect." : "Uses the same print settings as the preview."}
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

  const err = !name.trim() ? "Enter a sticker name" : null;

  return (
    <Sheet open={open} title={result ? "Sticker saved" : "Finish sticker"} onClose={onClose}>
      {result ? (
        <>
          <p className="confirm-msg">
            &ldquo;{result.sticker.name}&rdquo; version {result.version.no} was saved to your Library.
          </p>
          <button type="button" className="btn btn-primary btn-block" style={{ marginBottom: 10 }} onClick={onPaste}>
            {canReturn ? "Add to the page you came from" : "Add to diary…"}
          </button>
          <ExportControls sticker={result.sticker} version={result.version} />
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
            Keep editing
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Sticker name</span>
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
            <span className="field-label">Category (optional)</span>
            <input className="input" value={category} maxLength={20} list="sticker-cats" onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Plants, Travel, Lettering" />
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
            {busy ? "Making sticker…" : "Save sticker"}
          </button>
          <p className="muted small">Each finish creates a new version; older versions already in your diary stay unchanged.</p>
        </>
      )}
    </Sheet>
  );
}
