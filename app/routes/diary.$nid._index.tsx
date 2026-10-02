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
import { MonthCard } from "~/packages/notebook/MonthCard";
import { computeMonthPreview } from "~/packages/notebook/monthPreview";
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
  const years = Array.from(new Set([thisYear, ...pages.map((p) => Number(p.date.slice(0, 4)))])).sort();
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

  return (
    <Screen
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
      <div className="pad">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("Previous year")}
            onClick={() => setParams({ y: String(year - 1) })}
          >
            <Icon name="chevronLeft" />
          </button>
          <div className="hscroll" style={{ flex: 1, justifyContent: "center" }}>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`chip${y === year ? " is-active" : ""}`}
                onClick={() => setParams({ y: String(y) })}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("Next year")}
            onClick={() => setParams({ y: String(year + 1) })}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
            const monthPages = pagesInMonth(pages, ym);
            const ov = months.find((m) => m.ym === ym);
            const preview = computeMonthPreview(ym, monthPages, ov);
            return (
              <MonthCard
                key={ym}
                month={i + 1}
                preview={preview}
                onOpen={() => navigate(`/diary/${nid}/m/${ym}`)}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 18 }}
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" size={18} /> {t("New entry")}
        </button>
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
