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
  const w = 56;
  const scale = w / PAGE_W;
  return (
    <div className="hscroll" style={{ paddingBottom: 6 }}>
      {PAGE_STYLES.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            aria-pressed={active}
            style={{
              flex: "0 0 auto",
              padding: 4,
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: 10,
              background: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                position: "relative",
                width: w,
                height: w * (PAGE_H / PAGE_W),
                overflow: "hidden",
                borderRadius: 3,
                boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                <PageBackground style={s.id} date={date ?? todayLocal()} />
              </div>
            </div>
            <div className="small" style={{ marginTop: 4, fontWeight: active ? 600 : 400 }}>
              {active ? "✓ " : ""}
              {t(s.label)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
