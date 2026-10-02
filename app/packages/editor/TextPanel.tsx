import type { TextObject, TextWeight } from "../db/types";
import { FONTS, TEXT_COLORS } from "../page/fonts";
import { Sheet } from "../shell/Sheet";
import { t } from "../i18n";

const WEIGHTS: { id: TextWeight; label: string }[] = [
  { id: 400, get label() { return t("Regular"); } },
  { id: 500, get label() { return t("Medium"); } },
  { id: 600, get label() { return t("Semibold"); } },
  { id: 700, get label() { return t("Bold"); } },
];

export function TextPanel({
  obj,
  onChange,
  onClose,
}: {
  obj: TextObject | null;
  onChange: (patch: Partial<TextObject>) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={obj !== null} title={t("Text")} onClose={onClose} modal={false}>
      {obj ? (
        <>
          <textarea
            className="textarea"
            autoFocus
            value={obj.text}
            placeholder={t("Type something…")}
            rows={3}
            onChange={(e) => onChange({ text: e.target.value })}
            style={{ fontSize: 16, minHeight: 72 }}
          />
          <div className="hscroll" style={{ margin: "8px 0" }}>
            {FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip${obj.font === f.id ? " is-active" : ""}`}
                style={{ fontFamily: f.stack }}
                onClick={() => onChange({ font: f.id })}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          <div className="tabs" style={{ marginBottom: 8 }} role="group" aria-label={t("Weight")}>
            {WEIGHTS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`tab${(obj.weight ?? 400) === w.id ? " is-active" : ""}`}
                style={{ fontWeight: w.id }}
                onClick={() => onChange({ weight: w.id })}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 12 }}>
            <label className="small" style={{ flex: 1 }}>
              {t("Size")} {obj.size}
              <input
                type="range"
                min={16}
                max={120}
                value={obj.size}
                onChange={(e) => onChange({ size: Number(e.target.value) })}
              />
            </label>
            <div className="row" style={{ gap: 4 }}>
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`chip${obj.align === a ? " is-active" : ""}`}
                  onClick={() => onChange({ align: a })}
                >
                  {a === "left" ? t("Left") : a === "center" ? t("Center") : t("Right")}
                </button>
              ))}
            </div>
          </div>
          <div className="hscroll" style={{ marginTop: 6 }}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${obj.color === c ? " is-active" : ""}`}
                style={{ background: c, flex: "0 0 auto", width: 30, height: 30 }}
                aria-label={t("Text color {c}", { c })}
                onClick={() => onChange({ color: c })}
              />
            ))}
            <input type="color" value={obj.color} aria-label={t("Custom text color")} onChange={(e) => onChange({ color: e.target.value })} />
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
