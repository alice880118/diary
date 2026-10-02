import { useNavigate, useParams, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { useLive } from "~/packages/db/events";
import { todayLocal, ymOf } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import {
  createPage,
  getNotebook,
  listMonths,
  listPages,
  pagesInMonth,
} from "~/packages/db/repo";
import { DateSheet } from "~/packages/notebook/DateSheet";
import { ThisMonthCard, YearMonthCard, rich } from "~/packages/notebook/YearCards";
import { stickerCount } from "~/packages/notebook/monthPreview";
import "~/packages/notebook/calendar.css";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { useToast } from "~/packages/shell/toast";
import { t, tn } from "~/packages/i18n";

export default function MonthOverview() {
  const { nid = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("y")) || thisYear;
  const [adding, setAdding] = useState(false);

  const data = useLive(async () => {
    const [nb, pages, months] = await Promise.all([
      getNotebook(nid),
      listPages(nid),
      listMonths(nid),
    ]);
    return { nb, pages, months };
  }, [nid]);

  if (data.loading && !data.data) {
    return <Screen header={<AppHeader title="" left={<BackButton to="/diary" />} />}>{null}</Screen>;
  }
  const nb = data.data?.nb;
  if (!nb || nb.deletedAt) {
    return (
      <Screen header={<AppHeader title={t("Notebook not found")} left={<BackButton to="/diary" />} />}>
        <EmptyState title={t("This notebook doesn't exist or is in the trash")} hint={t("You can restore it from Settings → Trash.")} />
      </Screen>
    );
  }
  const { pages, months } = data.data!;
  const yearPages = pages.filter((p) => p.date.startsWith(`${year}-`));

  const addPage = async (date: string) => {
    try {
      const p = await createPage(nid, date);
      setAdding(false);
      navigate(`/page/${p.id}/edit`);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const today = todayLocal();
  const curYm = ymOf(today);
  const showMain = curYm.startsWith(`${year}-`);
  const days = new Set(yearPages.map((p) => p.date)).size;
  const go = (ym: string) => navigate(`/diary/${nid}/m/${ym}`);

  return (
    <Screen
      bodyClassName="journal-bg"
      header={
        <AppHeader
          title={nb.name}
          subtitle={`${year} · ${tn(yearPages.length, "{n} page", "{n} pages")}`}
          left={<BackButton to="/diary" />}
          right={
            <button type="button" className="icon-btn" aria-label={t("New entry")} onClick={() => setAdding(true)}>
              <Icon name="plus" />
            </button>
          }
        />
      }
    >
      <div className="pad cal-body">
        <div className="cal-title" style={{ alignItems: "center" }}>
          <div className="cal-h1">{year}</div>
          <div className="float-ctrl">
            <button type="button" className="icon-btn" aria-label={t("Previous year")} onClick={() => setParams({ y: String(year - 1) })}>
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Next year")} onClick={() => setParams({ y: String(year + 1) })}>
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
        <div className="cat-row">
          <span className="cat">{rich(tn(days, "{n} day", "{n} days"))}</span>
          <span className="cat">{rich(tn(yearPages.length, "{n} page", "{n} pages"))}</span>
          <span className="cat">{rich(tn(stickerCount(yearPages), "{n} sticker", "{n} stickers"))}</span>
        </div>

        {showMain ? <ThisMonthCard ym={curYm} pages={pagesInMonth(pages, curYm)} overview={months.find((m) => m.ym === curYm)} onOpen={() => go(curYm)} /> : null}

        <div className="year-grid">
          {Array.from({ length: 12 }, (_, i) => {
            const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
            const monthPages = pagesInMonth(pages, ym);
            const ov = months.find((m) => m.ym === ym);
            return (
              <YearMonthCard
                key={ym}
                ym={ym}
                index={i}
                pages={monthPages}
                overview={ov}
                current={ym === curYm}
                future={ym > curYm}
                onOpen={() => go(ym)}
              />
            );
          })}
        </div>
      </div>
      <DateSheet
        open={adding}
        title={t("New entry")}
        initial={todayLocal()}
        confirmText={t("Create and edit")}
        onClose={() => setAdding(false)}
        onConfirm={(d) => {
          void addPage(d);
          if (ymOf(d).slice(0, 4) !== String(year)) {
            setParams({ y: d.slice(0, 4) });
          }
        }}
      />
    </Screen>
  );
}
