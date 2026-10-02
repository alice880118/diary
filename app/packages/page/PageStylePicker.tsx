import { todayLocal } from "../db/id";
import { PAGE_H, PAGE_W, type PageStyle } from "../db/types";
import { PAGE_STYLES, PageBackground } from "./PageBackground";
import { t } from "../i18n";

export function PageStylePicker({
  value,
  onChange,
  date,
}: {
  value: PageStyle;
  onChange: (s: PageStyle) => void;
  date?: string;
}) {
  const w = 46;
  const scale = w / PAGE_W;
  return (
    <div className="hscroll" style={{ gap: 10, padding: "4px 3px 4px" }}>
      {PAGE_STYLES.map((s) => {
        const active = s.id === value;
        return (
          <button key={s.id} type="button" className={`opt${active ? " is-active" : ""}`} onClick={() => onChange(s.id)} aria-pressed={active}>
            <div
              className="opt-box"
              style={{
                position: "relative",
                width: w,
                height: w * (PAGE_H / PAGE_W),
                overflow: "hidden",
                border: "1px solid #e6e6e3",
              }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                <PageBackground style={s.id} date={date ?? todayLocal()} />
              </div>
            </div>
            {t(s.label)}
          </button>
        );
      })}
    </div>
  );
}
