import { useState } from "react";
import { t } from "../i18n";
import { HsvPicker } from "./HsvPicker";

/**
 * Preset swatches plus a "+" that opens the in-app color picker below them.
 *
 * `onChange(color, live, fromPicker)`: a swatch tap is a final pick
 * (`live = false`). Dragging in the picker fires `live = true` on every move
 * and `live = false` on release, with `fromPicker = true`; callers that close
 * after a pick should stay open for picker changes.
 */
export function ColorDots({
  colors,
  value,
  onChange,
}: {
  colors: { value: string; label: string }[];
  value: string;
  onChange: (color: string, live?: boolean, fromPicker?: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const norm = value.toLowerCase();
  const custom = norm !== "" && !colors.some((c) => c.value.toLowerCase() === norm);
  return (
    <div className="row-wrap">
      {colors.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`swatch${c.value.toLowerCase() === norm ? " is-active" : ""}`}
          style={{ background: c.value }}
          aria-label={c.label}
          onClick={() => onChange(c.value, false)}
        />
      ))}
      <button
        type="button"
        className={`swatch swatch-add${custom || picking ? " is-active" : ""}`}
        style={custom ? { background: value } : undefined}
        aria-label={t("Custom color")}
        aria-expanded={picking}
        onClick={() => setPicking((v) => !v)}
      >
        {custom ? null : "+"}
      </button>
      {picking ? <HsvPicker value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(c, live) => onChange(c, live, true)} /> : null}
    </div>
  );
}
