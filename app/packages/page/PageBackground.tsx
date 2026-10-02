import { memo, useId } from "react";
import { formatDate, weekdayOf } from "../db/id";
import { PAGE_H, PAGE_W, type PageStyle } from "../db/types";
import { t } from "../i18n";

export const PAGE_STYLES: { id: PageStyle; label: string }[] = [
  { id: "lined", get label() { return t("Lined"); } },
  { id: "blank", get label() { return t("Blank"); } },
  { id: "dot", get label() { return t("Dot grid"); } },
  { id: "grid", get label() { return t("Grid"); } },
  { id: "dated", get label() { return t("Dated"); } },
];

const LINE = "#c9d6e6";
const DOT = "#b9b0a3";

/** Dated layout: header band (date, weekday, title line) then lined writing area. */
export const DATED_HEADER_H = 190;

function Lines({ from, gap, margin }: { from: number; gap: number; margin: boolean }) {
  const ys: number[] = [];
  for (let y = from; y < PAGE_H - 40; y += gap) {
    ys.push(y);
  }
  return (
    <g>
      {ys.map((y) => (
        <line key={y} x1={0} x2={PAGE_W} y1={y} y2={y} stroke={LINE} strokeWidth={1.5} />
      ))}
      {margin ? (
        <line x1={96} x2={96} y1={0} y2={PAGE_H} stroke="#eab3aa" strokeWidth={1.5} />
      ) : null}
    </g>
  );
}

export const PageBackground = memo(function PageBackground({
  style,
  date,
}: {
  style: PageStyle;
  date: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      width={PAGE_W}
      height={PAGE_H}
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <pattern id={`d${uid}`} width={40} height={40} patternUnits="userSpaceOnUse">
          <circle cx={20} cy={20} r={2.2} fill={DOT} />
        </pattern>
        <pattern id={`g${uid}`} width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#d6dde6" strokeWidth={1.2} />
        </pattern>
      </defs>
      <rect width={PAGE_W} height={PAGE_H} fill="#ffffff" />
      {style === "lined" ? <Lines from={120} gap={48} margin /> : null}
      {style === "dot" ? <rect width={PAGE_W} height={PAGE_H} fill={`url(#d${uid})`} /> : null}
      {style === "grid" ? <rect width={PAGE_W} height={PAGE_H} fill={`url(#g${uid})`} /> : null}
      {style === "dated" ? <DatedHeader date={date} /> : null}
    </svg>
  );
});

function DatedHeader({ date }: { date: string }) {
  const [y, m, d] = date.split("-").map(Number);
  return (
    <g>
      <text x={56} y={120} fontSize={96} fontWeight={700} fill="#3a332c" fontFamily="Georgia, serif">
        {String(d).padStart(2, "0")}
      </text>
      <text x={190} y={78} fontSize={30} fill="#6f665c" fontFamily="Georgia, serif">
        {y} / {String(m).padStart(2, "0")}
      </text>
      <text x={190} y={120} fontSize={28} fill="#d2553f">
        {weekdayOf(date)}
      </text>
      <text x={430} y={78} fontSize={22} fill="#9a8f82">
        {t("Title")}
      </text>
      <line x1={430} x2={850} y1={122} y2={122} stroke="#bfb3a3" strokeWidth={2} />
      <line x1={40} x2={860} y1={DATED_HEADER_H - 20} y2={DATED_HEADER_H - 20} stroke="#3a332c" strokeWidth={2.5} />
      <title>{formatDate(date)}</title>
      <Lines from={DATED_HEADER_H + 50} gap={48} margin={false} />
    </g>
  );
}
