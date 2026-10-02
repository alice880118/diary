import type { CSSProperties, ReactNode } from "react";
import { MONTHS, formatDateShort, monthName, toLocalDate, todayLocal } from "../db/id";
import { coverOfMonth } from "../db/repo";
import type { MonthlyOverview, Page, StickerSnap } from "../db/types";
import { isZh, t, tn } from "../i18n";
import { TAPE_COLORS } from "../page/ObjectViews";
import { PageSurface } from "../page/PageSurface";
import { Icon } from "../shell/Icon";
import { Tape } from "../shell/Tape";
import { SnapFill } from "./MonthCover";
import { computeMonthPreview, topStickers } from "./monthPreview";

/** "24 days" with the leading number in bold. */
export function rich(text: string): ReactNode {
  const m = /^(\d+)(.*)$/.exec(text);
  return m ? (
    <>
      <b>{m[1]}</b>
      {m[2]}
    </>
  ) : (
    text
  );
}

function Placed({ snap, style, rot }: { snap: StickerSnap; style: CSSProperties; rot: number }) {
  return (
    <span className="placed" style={style}>
      <SnapFill snap={snap} rot={rot} />
    </span>
  );
}

const fullMonth = (m: number) => (isZh() ? `${m}月` : MONTHS[m - 1]);

/** Current month, enlarged: highlight, page count, and its three most used stickers. */
export function ThisMonthCard({ ym, pages, overview, onOpen }: { ym: string; pages: Page[]; overview: MonthlyOverview | undefined; onOpen: () => void }) {
  const preview = computeMonthPreview(ym, pages, overview);
  const top = topStickers(pages, 3);
  const latest = pages.reduce((m, p) => Math.max(m, p.updatedAt), 0);
  const updated = latest ? (toLocalDate(new Date(latest)) === todayLocal() ? t("updated today") : t("updated {date}", { date: formatDateShort(toLocalDate(new Date(latest))) })) : "";
  const spots: [CSSProperties, number][] = [
    [{ width: "60%", left: "36%", top: 0 }, -8],
    [{ width: "48%", left: 0, top: "38%" }, 8],
    [{ width: "32%", left: "62%", top: "64%" }, 14],
  ];
  return (
    <button type="button" className="card this-month" onClick={onOpen}>
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <span className="tag">{t("This month")}</span>
        <div className="this-month-name">{fullMonth(Number(ym.slice(5, 7)))}</div>
        {preview.highlight && pages.length ? (
          <div className="this-month-hl">
            <span className="marker">{preview.highlight}</span>
          </div>
        ) : null}
        <div className="muted this-month-sub">
          {tn(pages.length, "{n} page", "{n} pages")}
          {updated ? ` · ${updated}` : ""}
        </div>
      </div>
      <div className="this-month-art">
        {top.map((s, i) => (
          <Placed key={`${s.stickerId}@${s.version}`} snap={s} style={spots[i][0]} rot={spots[i][1]} />
        ))}
        {!top.length ? (
          <span className="muted" style={{ display: "grid", placeItems: "center", height: "100%" }}>
            <Icon name="plus" size={22} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

/** One month in the year grid: a collage of its two most used stickers. */
export function YearMonthCard({
  ym,
  index,
  pages,
  overview,
  current,
  future,
  onOpen,
}: {
  ym: string;
  index: number;
  pages: Page[];
  overview: MonthlyOverview | undefined;
  current: boolean;
  future: boolean;
  onOpen: () => void;
}) {
  const m = Number(ym.slice(5, 7));
  const name = monthName(m, true);
  if (!pages.length) {
    return (
      <button type="button" className={`card month-tile is-empty${future ? " is-future" : ""}${current ? " is-current" : ""}`} onClick={onOpen} aria-label={fullMonth(m)}>
        <span className="month-tile-name">{name}</span>
        <span className="month-tile-plus">
          <Icon name="plus" size={20} />
        </span>
      </button>
    );
  }
  const preview = computeMonthPreview(ym, pages, overview);
  const top = topStickers(pages, 2);
  const cover = overview?.cover ? coverOfMonth(overview) : null;
  return (
    <button type="button" className={`card month-tile${current ? " is-current" : ""}`} onClick={onOpen} aria-label={`${fullMonth(m)} · ${tn(pages.length, "{n} page", "{n} pages")}`}>
      <Tape
        pattern={cover?.tapePattern ?? "dots"}
        color={cover?.tapeColor ?? TAPE_COLORS[index % TAPE_COLORS.length]}
        style={{ top: -7, left: "50%", marginLeft: -20, width: 40, height: 15, transform: "rotate(-3deg)" }}
      />
      <span className="month-tile-head">
        <span className="month-tile-name">{name}</span>
        <span className="badge">{pages.length}</span>
      </span>
      <span className="month-tile-art">
        {top.length === 2 ? (
          <>
            <Placed snap={top[0]} style={{ width: "54%", left: "8%", top: "6%" }} rot={-6} />
            <Placed snap={top[1]} style={{ width: "38%", left: "54%", top: "42%" }} rot={10} />
          </>
        ) : top.length === 1 ? (
          <Placed snap={top[0]} style={{ width: "56%", left: "22%", top: "8%" }} rot={-5} />
        ) : preview.samplePage ? (
          <span className="month-tile-page">
            <PageSurface page={preview.samplePage} width={46} thumb />
          </span>
        ) : null}
      </span>
      <span className="ell month-tile-hl">{preview.highlight}</span>
    </button>
  );
}
