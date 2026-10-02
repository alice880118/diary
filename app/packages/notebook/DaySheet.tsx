import { useEffect, useState } from "react";
import { describeError } from "../db/idb";
import { formatDateShort, formatDayChip } from "../db/id";
import { updateMonth } from "../db/repo";
import type { MonthlyOverview, Page } from "../db/types";
import { t, tn } from "../i18n";
import { Icon } from "../shell/Icon";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { SnapFill } from "./MonthCover";
import { firstLine, firstSticker, pageSummary } from "./monthPreview";

/** Small dot-paper thumbnail with the page's first sticker. */
export function PageChip({ page }: { page: Page }) {
  const snap = firstSticker(page);
  return (
    <div className="page-chip">
      {snap ? (
        <div style={{ width: snap.w >= snap.h ? "66%" : `${(66 * snap.w) / snap.h}%` }}>
          <SnapFill snap={snap} rot={-6} />
        </div>
      ) : (
        <Icon name="pen" size={16} />
      )}
    </div>
  );
}

/** Pages on one day: open one, act on one, or add another. */
export function DaySheet({
  date,
  pages,
  onClose,
  onOpen,
  onMore,
  onAdd,
}: {
  date: string | null;
  pages: Page[];
  onClose: () => void;
  onOpen: (p: Page) => void;
  onMore: (p: Page) => void;
  onAdd: (date: string) => void;
}) {
  return (
    <Sheet
      open={date !== null}
      title={
        <div>
          <div>{date ? formatDayChip(date) : ""}</div>
          <div className="sheet-sub">{tn(pages.length, "{n} page", "{n} pages")}</div>
        </div>
      }
      onClose={onClose}
    >
      {pages.map((p, i) => {
        const title = firstLine(p) || t("Untitled");
        const body = pageSummary(p, 60).replace(title, "").trim();
        return (
          <div key={p.id} className="day-row">
            <button type="button" className="day-open" onClick={() => onOpen(p)}>
              <PageChip page={p} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ell" style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
                {body ? <div className="ell muted" style={{ fontSize: 12 }}>{body}</div> : null}
              </div>
              <span className="badge">
                {i + 1} / {pages.length}
              </span>
            </button>
            <button type="button" className="icon-btn" aria-label={t("Page actions")} onClick={() => onMore(p)}>
              <Icon name="more" size={18} />
            </button>
          </div>
        );
      })}
      {date ? (
        <button type="button" className="btn btn-block" style={{ marginTop: 16 }} onClick={() => onAdd(date)}>
          <Icon name="plus" size={18} />
          {t("New page on {date}", { date: formatDateShort(date) })}
        </button>
      ) : null}
    </Sheet>
  );
}

export const HIGHLIGHT_MAX = 40;

/** Edits the month highlight; blank goes back to the automatic text. */
export function HighlightSheet({ open, onClose, overview, auto }: { open: boolean; onClose: () => void; overview: MonthlyOverview; auto: string }) {
  const toast = useToast();
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText(overview.highlight ?? "");
  }, [open, overview]);
  const save = async (highlight: string | null) => {
    try {
      await updateMonth(overview.notebookId, overview.ym, (m) => ({ ...m, highlight }));
      onClose();
    } catch (err) {
      toast(describeError(err), "error");
    }
  };
  return (
    <Sheet
      open={open}
      title={t("Month highlight")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" style={{ marginRight: "auto" }} onClick={() => void save(null)}>
            {t("Reset to default")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save(text.trim() || null)}>
            {t("Save")}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          <span>{t("Month highlight")}</span>
          <span className="field-aside">
            {text.length}/{HIGHLIGHT_MAX}
          </span>
        </span>
        <input
          className="input"
          value={text}
          maxLength={HIGHLIGHT_MAX}
          placeholder={auto || t("Leave blank to use text from the latest page")}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </label>
      <p className="muted small">{t("Leave blank to use text from the latest page")}</p>
    </Sheet>
  );
}
