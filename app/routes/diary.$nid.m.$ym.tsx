import { useNavigate, useParams } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { useLive } from "~/packages/db/events";
import { MONTHS, formatDate, formatYm, monthName, toLocalDate, todayLocal, ymOf } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import {
  carryOverGoals,
  coverOfMonth,
  createPage,
  duplicatePage,
  getMonth,
  getNotebook,
  getSettings,
  listPages,
  pagesInMonth,
  prevYm,
  setPageDate,
  trashPage,
} from "~/packages/db/repo";
import type { Page } from "~/packages/db/types";
import { DateSheet } from "~/packages/notebook/DateSheet";
import { DaySheet, HighlightSheet } from "~/packages/notebook/DaySheet";
import { GoalsCard, GoalsSheet } from "~/packages/notebook/Goals";
import { CoverNote, CoverSheet, SnapFill, coverSnap } from "~/packages/notebook/MonthCover";
import { computeMonthPreview, firstLine, firstSticker, pagesByDate } from "~/packages/notebook/monthPreview";
import "~/packages/notebook/calendar.css";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { ConfirmSheet, Menu } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { isZh, t, tn } from "~/packages/i18n";

function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const WEEK_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/** Calendar cells covering the month in whole weeks. */
function monthGrid(ym: string, weekStart: 0 | 1) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const days = new Date(y, m, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(y, m - 1, 1 - lead + i);
    return { date: toLocalDate(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 };
  });
}

export default function MonthRecords() {
  const { nid = "", ym = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState<string | null>(null);
  const [editHighlight, setEditHighlight] = useState(false);
  const [editCover, setEditCover] = useState(false);
  const [editGoals, setEditGoals] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Page | null>(null);
  const [dateFor, setDateFor] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState<Page | null>(null);
  const carriedFor = useRef<string | null>(null);

  const data = useLive(async () => {
    const [nb, pages, overview, settings] = await Promise.all([
      getNotebook(nid),
      listPages(nid),
      getMonth(nid, ym),
      getSettings(),
    ]);
    return { nb, pages, overview, settings };
  }, [nid, ym]);

  const today = todayLocal();
  useEffect(() => {
    // First visit to the current month brings over last month's open goals.
    if (ym !== ymOf(today) || carriedFor.current === `${nid}:${ym}`) return;
    carriedFor.current = `${nid}:${ym}`;
    carryOverGoals(nid, ym)
      .then((n) => {
        if (n) toast(tn(n, "{n} goal carried over from {month}", "{n} goals carried over from {month}").replace("{month}", monthName(Number(prevYm(ym).slice(5, 7)))), "success");
      })
      .catch(() => undefined);
  }, [nid, ym, today, toast]);

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
  const { nb, pages, overview, settings } = data.data;
  if (!nb || nb.deletedAt) {
    return (
      <Screen header={<AppHeader title={t("Notebook not found")} left={<BackButton to="/diary" />} />}>
        <EmptyState title={t("This notebook doesn't exist or is in the trash")} />
      </Screen>
    );
  }
  const monthPages = pagesInMonth(pages, ym);
  const preview = computeMonthPreview(ym, monthPages, overview);
  const byDate = pagesByDate(monthPages);
  const weekStart = settings.weekStart ?? 1;
  const grid = monthGrid(ym, weekStart);
  const week = Array.from({ length: 7 }, (_, i) => (isZh() ? WEEK_ZH : WEEK_EN)[(i + weekStart) % 7]);
  const defaultDate = ymOf(today) === ym ? today : `${ym}-01`;
  const month = Number(ym.slice(5, 7));
  const go = (delta: number) => navigate(`/diary/${nid}/m/${shiftYm(ym, delta)}`, { replace: true });

  const add = async (date: string) => {
    try {
      const p = await createPage(nid, date);
      setAdding(null);
      setDay(null);
      navigate(`/page/${p.id}/edit`);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const openDay = (date: string) => {
    const list = byDate.get(date) ?? [];
    if (list.length === 0) setAdding(date);
    else if (list.length === 1) navigate(`/page/${list[0].id}`);
    else setDay(date);
  };

  return (
    <Screen
      bodyClassName="journal-bg"
      header={
        <AppHeader
          title={nb.name}
          subtitle={formatYm(ym)}
          left={<BackButton to={back} />}
          right={
            <button type="button" className="icon-btn" aria-label={t("New page")} onClick={() => setAdding(defaultDate)}>
              <Icon name="plus" />
            </button>
          }
        />
      }
    >
      <div className="pad cal-body">
        <div className="cal-title">
          <div style={{ minWidth: 0 }}>
            <div className="muted cal-year">{year}</div>
            <div className="cal-h1">{isZh() ? `${month}月` : MONTHS[month - 1]}</div>
          </div>
          <div className="float-ctrl">
            <button type="button" className="icon-btn" aria-label={t("Previous month")} onClick={() => go(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Next month")} onClick={() => go(1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
        <button type="button" className="cal-highlight" onClick={() => setEditHighlight(true)} aria-label={t("Month highlight")}>
          <span className="ell">
            {preview.highlight ? <span className="marker">{preview.highlight}</span> : <span className="muted">{t("Add a highlight for this month")}</span>}
          </span>
          <span className="muted" style={{ flex: "none", display: "flex" }}>
            <Icon name="edit" size={15} />
          </span>
        </button>

        <div className="cal-top">
          <GoalsCard overview={overview} onEdit={() => setEditGoals(true)} />
          <button type="button" className="cal-cover" aria-label={t("Month cover")} onClick={() => setEditCover(true)}>
            <CoverNote cover={coverOfMonth(overview)} snap={coverSnap(overview, monthPages)} caption={t("Cover · {m}", { m: monthName(month, true) })} width="86%" />
          </button>
        </div>

        <div className="cal-week" aria-hidden>
          {week.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="card cal-grid" role="grid">
          {grid.map((c, i) => {
            const list = c.inMonth ? byDate.get(c.date) ?? [] : [];
            const first = list[0];
            const snap = first ? firstSticker(first) : null;
            const text = first ? firstLine(first) : "";
            const last = i >= grid.length - 7;
            return (
              <button
                key={c.date}
                type="button"
                role="gridcell"
                className={`cal-cell${last ? " is-last" : ""}${day === c.date ? " is-sel" : ""}`}
                disabled={!c.inMonth}
                aria-label={c.inMonth ? `${formatDate(c.date)}${list.length ? ` · ${tn(list.length, "{n} page", "{n} pages")}` : ""}` : undefined}
                onClick={() => openDay(c.date)}
              >
                <span className={`cal-d${c.inMonth ? "" : " is-out"}${c.date === today && c.inMonth ? " is-today" : ""}`}>{c.day}</span>
                {first ? (
                  <>
                    <span className="cal-sg">
                      {snap ? (
                        <span className="cal-stk" style={snap.h > snap.w ? { width: `${(62 * snap.w) / snap.h}%` } : undefined}>
                          <SnapFill snap={snap} rot={((c.day % 3) - 1) * 7} />
                        </span>
                      ) : (
                        <span className="cal-dot" />
                      )}
                    </span>
                    {text ? <span className="cal-tx">{text}</span> : null}
                    {list.length > 1 ? <span className="cnt cal-cnt">{list.length}</span> : null}
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <DaySheet
        date={day}
        pages={day ? byDate.get(day) ?? [] : []}
        onClose={() => setDay(null)}
        onOpen={(p) => navigate(`/page/${p.id}`)}
        onMore={(p) => setMenuFor(p)}
        onAdd={(d) => void add(d)}
      />
      <DateSheet
        open={adding !== null}
        title={t("New page")}
        initial={adding ?? defaultDate}
        confirmText={t("Create and edit")}
        onClose={() => setAdding(null)}
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
      <HighlightSheet open={editHighlight} onClose={() => setEditHighlight(false)} overview={overview} auto={preview.highlightManual ? "" : preview.highlight} />
      <CoverSheet open={editCover} onClose={() => setEditCover(false)} overview={overview} monthPages={monthPages} />
      <GoalsSheet open={editGoals} onClose={() => setEditGoals(false)} overview={overview} />
    </Screen>
  );
}
