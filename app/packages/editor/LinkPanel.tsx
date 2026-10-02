import { useEffect, useState } from "react";
import type { LinkDisplay, LinkObject, LinkShape } from "../db/types";
import { linkBox, normalizeUrl } from "../page/links";
import { LINK_COLORS, LINK_SHAPE_IDS, LinkSticker, LinkView } from "../page/ObjectViews";
import { ColorDots } from "../shell/ColorDots";
import { Sheet } from "../shell/Sheet";

export interface LinkDraft {
  url: string;
  title: string;
  display: LinkDisplay;
  shape?: LinkShape;
  color?: string;
}

export function LinkPanel({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: LinkObject | null;
  onClose: () => void;
  onSave: (d: LinkDraft) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [display, setDisplay] = useState<LinkDisplay>("sticker");
  const [shape, setShape] = useState<LinkShape>("circle");
  const [color, setColor] = useState(LINK_COLORS[0]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(initial?.url ?? "");
      setTitle(initial?.title ?? "");
      setDisplay(initial?.display ?? "sticker");
      setShape(initial?.shape ?? "circle");
      setColor(initial?.color ?? LINK_COLORS[0]);
      setTouched(false);
    }
  }, [open, initial]);

  const normalized = normalizeUrl(url);
  const error = touched && !normalized ? "Enter a valid http or https URL" : null;
  const preview: LinkObject = {
    id: "preview",
    type: "link",
    x: 0,
    y: 0,
    ...linkBox(display),
    rot: 0,
    z: 0,
    locked: false,
    url: normalized ?? "https://example.com",
    title,
    display,
    meta: initial?.url === normalized ? initial.meta : null,
    shape,
    color,
  };
  /** v1 looks stay selectable only for links that already use them. */
  const legacy = initial?.display === "card" || initial?.display === "text" ? initial.display : null;
  const displays: { id: LinkDisplay; label: string }[] = [
    { id: "sticker", label: "Sticker" },
    { id: "tag", label: "Tag" },
    ...(legacy ? [{ id: legacy, label: legacy === "card" ? "Card" : "Text link" }] : []),
  ];
  const k = 300 / preview.w;

  return (
    <Sheet
      open={open}
      title={initial ? "Edit link" : "Add link"}
      onClose={onClose}
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setTouched(true);
              if (normalized) {
                onSave({
                  url: normalized,
                  title: title.trim(),
                  display,
                  ...(display === "sticker" ? { shape, color } : { shape: initial?.shape, color: initial?.color }),
                });
              }
            }}
          >
            Save
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="field-label">URL</span>
        <input
          className={`input${error ? " is-error" : ""}`}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {error ? <span className="field-error">{error}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">Title (optional)</span>
        <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to use the site title or domain" />
      </label>
      <div className="field">
        <span className="field-label">Display</span>
        <div className="tabs">
          {displays.map((d) => (
            <button key={d.id} type="button" className={`tab${display === d.id ? " is-active" : ""}`} onClick={() => setDisplay(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {display === "sticker" ? (
        <>
          <div className="field">
            <span className="field-label">Shape</span>
            <div className="link-shapes">
              {LINK_SHAPE_IDS.map((id) => (
                <button key={id} type="button" className={shape === id ? "is-active" : ""} aria-label={id} aria-pressed={shape === id} onClick={() => setShape(id)}>
                  <LinkSticker shape={id} color={shape === id ? "#1b1b1b" : "#cfcfcf"} arrow={false} style={{ width: 30, height: 30, filter: "none" }} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Color</span>
            <ColorDots colors={LINK_COLORS.map((c) => ({ value: c, label: c }))} value={color} onChange={setColor} />
          </div>
        </>
      ) : null}
      <div className="field">
        <span className="field-label">Preview</span>
        <div className="link-preview">
          {display === "sticker" ? (
            <LinkSticker shape={shape} color={color} style={{ width: 80, height: 80 }} />
          ) : (
            <div style={{ position: "relative", width: 300, height: preview.h * k }}>
              <div style={{ position: "absolute", width: preview.w, height: preview.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
                <LinkView o={preview} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
