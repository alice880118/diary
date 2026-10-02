import { useEffect, useState } from "react";
import type { PageStyle } from "../db/types";
import { PAGE_STYLES } from "../page/PageBackground";
import { PageStylePicker } from "../page/PageStylePicker";
import { Tape } from "../shell/Tape";
import { COVERS, coverOf } from "./covers";
import { NotebookCover } from "./NotebookCover";
import { t } from "../i18n";

export interface NotebookFormValue {
  name: string;
  cover: string;
  defaultStyle: PageStyle;
}

export const NAME_MAX = 30;

/**
 * Name, cover and default page style. With `id` the submit button is left
 * out so a sheet footer can submit it (`<button form={id}>`); `onValidChange`
 * reports whether it can be submitted.
 */
export function NotebookForm({
  initial,
  submitText,
  busy,
  onSubmit,
  id,
  onValidChange,
}: {
  initial?: NotebookFormValue;
  submitText?: string;
  busy?: boolean;
  onSubmit: (v: NotebookFormValue) => void;
  id?: string;
  onValidChange?: (valid: boolean) => void;
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

  useEffect(() => {
    onValidChange?.(!error);
  }, [error, onValidChange]);

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) {
          onSubmit({ name: trimmed, cover, defaultStyle: style });
        }
      }}
    >
      <div className="nb-preview journal-bg">
        <Tape pattern="grid" color="#f3b48b" style={{ top: 10, left: 18, width: 60, transform: "rotate(-8deg)" }} />
        <NotebookCover cover={cover} name={trimmed || t("My diary")} width={104} />
      </div>
      <label className="field">
        <span className="field-label">
          <span>{t("Name")}</span>
          <span className="field-aside">
            {trimmed.length}/{NAME_MAX}
          </span>
        </span>
        <input
          className={`input${touched && error && (trimmed || !id) ? " is-error" : ""}`}
          value={name}
          placeholder={t("e.g. Everyday life, Travel journal")}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && error && (trimmed || !id) ? <span className="field-error">{error}</span> : null}
      </label>
      <div className="field">
        <span className="field-label">
          {t("Cover")}
          <span className="field-aside">{t(coverOf(cover).label)}</span>
        </span>
        <div className="hscroll-fade">
          <div className="hscroll" style={{ gap: 10, padding: "4px 36px 4px 3px" }}>
            {COVERS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`opt${cover === c.id ? " is-active" : ""}`}
                onClick={() => setCover(c.id)}
                aria-pressed={cover === c.id}
              >
                <NotebookCover cover={c.id} name="" bare width={48} className="opt-box" style={{ borderRadius: "3px 8px 8px 3px" }} />
                {t(c.label)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <span className="field-label">
          {t("Default page style")}
          <span className="field-aside">{t(PAGE_STYLES.find((s) => s.id === style)?.label ?? "")}</span>
        </span>
        <PageStylePicker value={style} onChange={setStyle} />
        <span className="muted small">{t("You can change the style for each page later.")}</span>
      </div>
      {id ? null : (
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t("Working…") : submitText}
        </button>
      )}
    </form>
  );
}
