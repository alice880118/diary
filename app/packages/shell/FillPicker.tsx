import type { ColorFill } from "../db/types";
import { t } from "../i18n";
import { Icon } from "./Icon";

export const SOLID_COLORS = [
  "#fedaff",
  "#f3c3c9",
  "#ffe3c2",
  "#fff1a1",
  "#d6f3cc",
  "#cdeedd",
  "#cfe4fb",
  "#d9c8f2",
  "#e2cda7",
  "#fdfaf2",
  "#ffffff",
  "#3a3346",
];

const GRADIENTS: [string, string][] = [
  ["#fedaff", "#ffffff"],
  ["#d9c8f2", "#cfe4fb"],
  ["#ffe3c2", "#f3c3c9"],
  ["#cdeedd", "#fff1a1"],
  ["#cfe4fb", "#ffffff"],
  ["#3a3346", "#8a76f5"],
];

const ANGLES: { deg: number; icon: "down" | "arrowDownRight" | "chevronRight" | "arrowUpRight"; label: string }[] = [
  { deg: 180, icon: "down", get label() { return t("Top to bottom"); } },
  { deg: 135, icon: "arrowDownRight", get label() { return t("Diagonal"); } },
  { deg: 90, icon: "chevronRight", get label() { return t("Left to right"); } },
  { deg: 45, icon: "arrowUpRight", get label() { return t("Diagonal up"); } },
];

export function fillCss(f: ColorFill): string {
  return f.kind === "solid" ? f.color : `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})`;
}

/** Relative luminance 0..1 of a #rrggbb color. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Palette dots plus a custom color input. */
export function ColorDotsPicker({ colors = SOLID_COLORS, value, onChange }: { colors?: string[]; value: string; onChange: (c: string) => void }) {
  const custom = !colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="fill-dots">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`fill-dot${c.toLowerCase() === value.toLowerCase() ? " is-active" : ""}`}
          style={{ background: c }}
          aria-label={c}
          aria-pressed={c.toLowerCase() === value.toLowerCase()}
          onClick={() => onChange(c)}
        />
      ))}
      <label className={`fill-dot is-add${custom ? " is-active" : ""}`} style={custom ? { background: value } : undefined} aria-label={t("Custom color")}>
        {custom ? null : <Icon name="plus" size={16} />}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** Solid or gradient fill editor. */
export function FillPicker({ value, onChange }: { value: ColorFill; onChange: (f: ColorFill) => void }) {
  const grad = value.kind === "gradient" ? value : { kind: "gradient" as const, from: value.color, to: "#ffffff", angle: 180 };
  return (
    <div className="fill-picker">
      <div className="tabs">
        <button type="button" className={`tab${value.kind === "solid" ? " is-active" : ""}`} onClick={() => onChange({ kind: "solid", color: value.kind === "solid" ? value.color : value.from })}>
          {t("Solid")}
        </button>
        <button type="button" className={`tab${value.kind === "gradient" ? " is-active" : ""}`} onClick={() => onChange(grad)}>
          {t("Gradient")}
        </button>
      </div>
      {value.kind === "solid" ? (
        <ColorDotsPicker value={value.color} onChange={(color) => onChange({ kind: "solid", color })} />
      ) : (
        <>
          <div className="fill-grads">
            {GRADIENTS.map(([from, to]) => {
              const on = value.from === from && value.to === to;
              return (
                <button
                  key={from + to}
                  type="button"
                  className={on ? "is-active" : ""}
                  aria-pressed={on}
                  style={{ background: `linear-gradient(${value.angle}deg, ${from}, ${to})` }}
                  onClick={() => onChange({ ...value, from, to })}
                />
              );
            })}
          </div>
          <div className="fill-stops">
            <label className="fill-stop">
              <span style={{ background: value.from }} />
              {t("From")}
              <input type="color" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
            </label>
            <label className="fill-stop">
              <span style={{ background: value.to }} />
              {t("To")}
              <input type="color" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            </label>
            <div className="fill-angles">
              {ANGLES.map((a) => (
                <button
                  key={a.deg}
                  type="button"
                  className={`icon-btn${value.angle === a.deg ? " is-active" : ""}`}
                  aria-label={a.label}
                  aria-pressed={value.angle === a.deg}
                  onClick={() => onChange({ ...value, angle: a.deg })}
                >
                  <Icon name={a.icon} size={18} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
