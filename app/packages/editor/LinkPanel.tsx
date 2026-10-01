import { useEffect, useState } from "react";
import type { LinkDisplay, LinkObject, LinkShape } from "../db/types";
import { linkBox, normalizeUrl } from "../page/links";
import { LinkView } from "../page/ObjectViews";
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
  const [display, setDisplay] = useState<LinkDisplay>("card");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(initial?.url ?? "");
      setTitle(initial?.title ?? "");
      setDisplay(initial?.display ?? "card");
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
    shape: initial?.shape,
    color: initial?.color,
  };
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
                onSave({ url: normalized, title: title.trim(), display, shape: initial?.shape, color: initial?.color });
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
          <button type="button" className={`tab${display === "card" ? " is-active" : ""}`} onClick={() => setDisplay("card")}>
            Card
          </button>
          <button type="button" className={`tab${display === "text" ? " is-active" : ""}`} onClick={() => setDisplay("text")}>
            Text link
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Preview</span>
        <div style={{ position: "relative", width: 300, height: preview.h * k }}>
          <div style={{ position: "absolute", width: preview.w, height: preview.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
            <LinkView o={preview} />
          </div>
        </div>
        <span className="muted small">
          The URL is saved right away. Site info is fetched only if the site allows it; otherwise a simple card is shown that still opens the link.
        </span>
      </div>
    </Sheet>
  );
}
