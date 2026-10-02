import { useEffect, useState } from "react";
import { isValidDate } from "../db/id";
import { Sheet } from "../shell/Sheet";
import { t } from "../i18n";

export function DateSheet({
  open,
  title,
  initial,
  confirmText,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  initial: string;
  confirmText: string;
  onClose: () => void;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState(initial);
  useEffect(() => {
    if (open) {
      setDate(initial);
    }
  }, [open, initial]);
  const valid = isValidDate(date);
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onConfirm(date)}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="field-label">{t("Entry date")}</span>
        <input
          type="date"
          className={`input${valid ? "" : " is-error"}`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {!valid ? <span className="field-error">{t("Choose a valid date")}</span> : null}
      </label>
      <p className="muted small">{t("The date decides which month the page belongs to. You can reorder pages separately.")}</p>
    </Sheet>
  );
}
