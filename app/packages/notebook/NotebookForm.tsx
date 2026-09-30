import { useState } from "react";
import type { PageStyle } from "../db/types";
import { PAGE_STYLES } from "../page/PageBackground";
import { PageStylePicker } from "../page/PageStylePicker";
import { COVERS } from "./covers";
import { NotebookCover } from "./NotebookCover";

export interface NotebookFormValue {
  name: string;
  cover: string;
  defaultStyle: PageStyle;
}

export const NAME_MAX = 30;

export function NotebookForm({
  initial,
  submitText,
  busy,
  onSubmit,
}: {
  initial?: NotebookFormValue;
  submitText: string;
  busy?: boolean;
  onSubmit: (v: NotebookFormValue) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cover, setCover] = useState(initial?.cover ?? COVERS[0].id);
  const [style, setStyle] = useState<PageStyle>(initial?.defaultStyle ?? "lined");
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const error = !trimmed
    ? "Enter a notebook name"
    : trimmed.length > NAME_MAX
      ? `Name must be ${NAME_MAX} characters or fewer`
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) {
          onSubmit({ name: trimmed, cover, defaultStyle: style });
        }
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
        <NotebookCover cover={cover} name={trimmed || "My diary"} width={120} />
      </div>
      <label className="field">
        <span className="field-label">
          <span>Name</span>
          <span>
            {trimmed.length}/{NAME_MAX}
          </span>
        </span>
        <input
          className={`input${touched && error ? " is-error" : ""}`}
          value={name}
          placeholder="e.g. Everyday life, Travel journal"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && error ? <span className="field-error">{error}</span> : null}
      </label>
      <div className="field">
        <span className="field-label">Cover</span>
        <div className="hscroll" style={{ paddingBottom: 8 }}>
          {COVERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCover(c.id)}
              aria-pressed={cover === c.id}
              aria-label={c.label}
              style={{
                flex: "0 0 auto",
                padding: 4,
                border: cover === c.id ? "2px solid var(--accent)" : "2px solid transparent",
                borderRadius: 10,
                background: "none",
                cursor: "pointer",
              }}
            >
              <NotebookCover cover={c.id} name="" width={52} />
              <div className="small" style={{ marginTop: 4 }}>
                {cover === c.id ? "✓ " : ""}
                {c.label}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">
          Default page style
          <span>{PAGE_STYLES.find((s) => s.id === style)?.label}</span>
        </span>
        <PageStylePicker value={style} onChange={setStyle} />
        <span className="muted small">New pages use this style. You can change it for each page later.</span>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Working…" : submitText}
      </button>
    </form>
  );
}
