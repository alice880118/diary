import { useId } from "react";

/** Preset swatches plus a "+" that opens the system color picker. */
export function ColorDots({
  colors,
  value,
  onChange,
}: {
  colors: { value: string; label: string }[];
  value: string;
  onChange: (color: string) => void;
}) {
  const id = useId();
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
          onClick={() => onChange(c.value)}
        />
      ))}
      <label
        htmlFor={id}
        className={`swatch swatch-add${custom ? " is-active" : ""}`}
        style={custom ? { background: value } : undefined}
        aria-label="Custom color"
      >
        {custom ? null : "+"}
        <input
          id={id}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
