import { useNavigate, useParams } from "@remix-run/react";
import { useState } from "react";
import { useLive } from "~/packages/db/events";
import { formatDate, formatDateShort, formatYm, todayLocal, ymOf } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import {
  createPage,
  duplicatePage,
  getMonth,
  getNotebook,
  listPages,
  pagesInMonth,
  setPageDate,
  trashPage,
} from "~/packages/db/repo";
import type { Page } from "~/packages/db/types";
import { DateSheet } from "~/packages/notebook/DateSheet";
import { MonthVisual } from "~/packages/notebook/MonthCard";
import { computeMonthPreview } from "~/packages/notebook/monthPreview";
import { MonthPreviewSheet } from "~/packages/notebook/MonthPreviewSheet";
import { PageSurface } from "~/packages/page/PageSurface";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { ConfirmSheet, Menu } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { t } from "~/packages/i18n";

function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthRecords() {
  const { nid = "", ym = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editPreview, setEditPreview] = useState(false);
  const [menuFor, setMenuFor] = useState<Page | null>(null);
  const [dateFor, setDateFor] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState<Page | null>(null);

  const data = useLive(async () => {
    const [nb, pages, overview] = await Promise.all([
      getNotebook(nid),
      listPages(nid),
      getMonth(nid, ym),
    ]);
    return { nb, pages, overview };
  }, [nid, ym]);

  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return (
      <Screen header={<AppHeader title={t("Invalid month")} left={<BackButton to={`/diary/${nid}`} />} />}>
        <EmptyState title={t("This month isn't valid")} />
      </Screen>
    );
  }
  const year = ym.slice(0, 4);
  const back = `/diary/${nid}?y=${year}`;

  if (!data.data) {
    return <Screen header={<AppHeader title="" left={<BackButton to={back} />} />}>{null}</Screen>;
  }
  const { nb, pages, overview } = data.data;
  if (!nb || nb.deletedAt) {
    return (
      <Screen header={<AppHeader title={t("Notebook not found")} left={<BackButton to="/diary" />} />}>
        <EmptyState title={t("This notebook doesn't exist or is in the trash")} />
      </Screen>
    );
  }
  const monthPages = pagesInMonth(pages, ym);
  const preview = computeMonthPreview(ym, monthPages, overview);
  const today = todayLocal();
  const defaultDate = ymOf(today) === ym ? today : `${ym}-01`;

  const add = async (date: string) => {
    try {
      const p = await createPage(nid, date);
      setAdding(false);
      navigate(`/page/${p.id}/edit`);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  return (
    <Screen
      header={
        <AppHeader
          title={formatYm(ym)}
          subtitle={nb.name}
          left={<BackButton to={back} />}
          right={
            <button type="button" className="icon-btn" aria-label={t("New page")} onClick={() => setAdding(true)}>
              <Icon name="plus" />
            </button>
          }
        />
      }
    >
      <div className="pad">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => navigate(`/diary/${nid}/m/${shiftYm(ym, -1)}`, { replace: true })}>
            <Icon name="chevronLeft" size={16} /> {t("Previous month")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => navigate(`/diary/${nid}/m/${shiftYm(ym, 1)}`, { replace: true })}>
            {t("Next month")} <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <div className="card row" style={{ gap: 14, alignItems: "center" }}>
          <div style={{ width: 84, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MonthVisual preview={preview} size={84} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted small">
              {t("Month highlight")} {preview.highlightManual ? t("(manual)") : t("(auto)")}
            </div>
            <div style={{ fontWeight: 600, margin: "4px 0 8px", lineHeight: 1.4 }}>
              {preview.highlight || t("No entries yet")}
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setEditPreview(true)}>
              <Icon name="edit" size={16} /> {t("Edit month preview")}
            </button>
          </div>
        </div>

        {monthPages.length === 0 ? (
          <EmptyState
            title={t("No entries this month")}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={18} /> {t("Add first page")}
              </button>
            }
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 16 }}>
            {monthPages.map((p) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => navigate(`/page/${p.id}`)}
                  style={{ border: 0, padding: 0, background: "none", cursor: "pointer" }}
                  aria-label={t("Open page for {x}", { x: formatDate(p.date) })}
                >
                  <PageSurface page={p} width={100} thumb />
                </button>
                <div className="row" style={{ width: "100%", justifyContent: "space-between" }}>
                  <span className="small">{formatDateShort(p.date)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ minWidth: 36, height: 36 }}
                    aria-label={t("Page actions")}
                    onClick={() => setMenuFor(p)}
                  >
                    <Icon name="more" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {monthPages.length ? (
          <button type="button" className="btn btn-block" style={{ marginTop: 18 }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> {t("New page")}
          </button>
        ) : null}
      </div>

      <DateSheet
        open={adding}
        title={t("New page")}
        initial={defaultDate}
        confirmText={t("Create and edit")}
        onClose={() => setAdding(false)}
        onConfirm={(d) => void add(d)}
      />
      <DateSheet
        open={dateFor !== null}
        title={t("Change date")}
        initial={dateFor?.date ?? today}
        confirmText={t("Save")}
        onClose={() => setDateFor(null)}
        onConfirm={async (d) => {
          if (!dateFor) return;
          try {
            await setPageDate(dateFor.id, d);
            toast(ymOf(d) === ym ? t("Date changed") : t("Moved to {x}", { x: formatYm(ymOf(d)) }), "success");
          } catch (err) {
            toast(describeError(err), "error");
          }
          setDateFor(null);
        }}
      />
      <Menu
        open={menuFor !== null}
        title={menuFor ? formatDate(menuFor.date) : ""}
        onClose={() => setMenuFor(null)}
        items={
          menuFor
            ? [
                { get label() { return t("Read"); }, onSelect: () => navigate(`/page/${menuFor.id}`) },
                { get label() { return t("Edit"); }, onSelect: () => navigate(`/page/${menuFor.id}/edit`) },
                { get label() { return t("Change date"); }, onSelect: () => setDateFor(menuFor) },
                {
                  get label() { return t("Duplicate page"); },
                  onSelect: async () => {
                    try {
                      await duplicatePage(menuFor.id);
                      toast(t("Page duplicated"), "success");
                    } catch (err) {
                      toast(describeError(err), "error");
                    }
                  },
                },
                { get label() { return t("Delete"); }, danger: true, onSelect: () => setDeleting(menuFor) },
              ]
            : []
        }
      />
      <ConfirmSheet
        open={deleting !== null}
        title={t("Delete page")}
        danger
        confirmText={t("Move to trash")}
        message={t("The page will be moved to the trash. You can restore it from Settings → Trash.")}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await trashPage(deleting.id).catch((err) => toast(describeError(err), "error"));
          setDeleting(null);
        }}
      />
      <MonthPreviewSheet
        open={editPreview}
        onClose={() => setEditPreview(false)}
        overview={overview}
        monthPages={monthPages}
      />
    </Screen>
  );
}
