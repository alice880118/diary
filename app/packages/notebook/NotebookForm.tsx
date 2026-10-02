import { useState } from "react";
import type { PageStyle } from "../db/types";
import { PAGE_STYLES } from "../page/PageBackground";
import { PageStylePicker } from "../page/PageStylePicker";
import { Icon } from "../shell/Icon";
import { COVERS } from "./covers";
import { NotebookCover } from "./NotebookCover";
import { t } from "../i18n";

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
    ? t("Enter a notebook name")
    : trimmed.length > NAME_MAX
      ? t("Name must be {NAME_MAX} characters or fewer", { NAME_MAX })
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
        <NotebookCover cover={cover} name={trimmed || t("My diary")} width={120} />
      </div>
      <label className="field">
        <span className="field-label">
          <span>{t("Name")}</span>
          <span>
            {trimmed.length}/{NAME_MAX}
          </span>
        </span>
        <input
          className={`input${touched && error ? " is-error" : ""}`}
          value={name}
          placeholder={t("e.g. Everyday life, Travel journal")}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && error ? <span className="field-error">{error}</span> : null}
      </label>
      <div className="field">
        <span className="field-label">{t("Cover")}</span>
        <div className="hscroll" style={{ paddingBottom: 8 }}>
          {/* 1fr columns in a max-content grid all take the widest option's width. */}
          <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 8, width: "max-content" }}>
            {COVERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCover(c.id)}
                aria-pressed={cover === c.id}
                aria-label={t(c.label)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "6px 8px",
                  border: cover === c.id ? "2px solid var(--primary)" : "2px solid transparent",
                  borderRadius: 10,
                  background: "none",
                  cursor: "pointer",
                }}
              >
                <NotebookCover cover={c.id} name="" width={52} />
                <div className="small" style={{ marginTop: 6, whiteSpace: "nowrap", textAlign: "center" }}>
                  {t(c.label)}
                </div>
                {cover === c.id ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="check" size={12} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <span className="field-label">
          {t("Default page style")}
          <span>{t(PAGE_STYLES.find((s) => s.id === style)?.label ?? "")}</span>
        </span>
        <PageStylePicker value={style} onChange={setStyle} />
        <span className="muted small">{t("New pages use this style. You can change it for each page later.")}</span>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t("Working…") : submitText}
      </button>
    </form>
  );
}
