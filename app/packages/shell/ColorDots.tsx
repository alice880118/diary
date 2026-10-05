import { useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n";

/**
 * Preset swatches plus a "+" that opens the system color picker.
 *
 * While the user drags inside the system picker, `onChange` fires with
 * `live = true` on every move; the final pick (picker closed) arrives with
 * `live = false`, as does a tap on a preset swatch. Callers that close
 * themselves after a pick must wait for the final one, or the picker's input
 * is unmounted mid-drag and the system picker closes with it.
 */
export function ColorDots({
  colors,
  value,
  onChange,
}: {
  colors: { value: string; label: string }[];
  value: string;
  onChange: (color: string, live?: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The color being dragged. The input shows it until the pick is committed,
  // even if the caller does not apply live colors, so React never snaps the
  // input (and the open system picker) back mid-drag.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  // React's onChange is the native "input" event (every drag move); the
  // native "change" event fires once when the pick is committed.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onCommit = () => {
      const c = draftRef.current ?? el.value;
      draftRef.current = null;
      setDraft(null);
      onChangeRef.current(c, false);
    };
    el.addEventListener("change", onCommit);
    return () => el.removeEventListener("change", onCommit);
  }, []);
  const norm = value.toLowerCase();
  const shown = draft ?? value;
  const custom = shown !== "" && !colors.some((c) => c.value.toLowerCase() === shown.toLowerCase());

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
      <label
        htmlFor={id}
        className={`swatch swatch-add${custom ? " is-active" : ""}`}
        style={custom ? { background: shown } : undefined}
        aria-label={t("Custom color")}
      >
        {custom ? null : "+"}
        <input
          ref={inputRef}
          id={id}
          type="color"
          value={draft ?? (/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff")}
          onChange={(e) => {
            draftRef.current = e.target.value;
            setDraft(e.target.value);
            onChange(e.target.value, true);
          }}
        />
      </label>
    </div>
  );
}
