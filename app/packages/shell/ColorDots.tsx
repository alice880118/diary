import { useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n";

/** Quiet time after the last picker change that counts as the final pick. */
const SETTLE_MS = 600;

/**
 * Preset swatches plus a "+" that opens the system color picker.
 *
 * `onChange(color, live, fromPicker)`: a swatch tap is a final pick
 * (`live = false`). The system picker reports `live = true` on every move
 * and a final pick (`live = false, fromPicker = true`) once it settles, is
 * dismissed or this control unmounts.
 *
 * The system picker has no reliable "done" event: Safari (iOS and macOS)
 * fires `change` on every move, not only when the picker closes. So nothing
 * here treats `change` as the end, and callers must not close or unmount this
 * control on picker changes (`fromPicker`), or the system picker closes with
 * its input mid-drag.
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
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The color being picked. The input shows it until the pick settles, even if
  // the caller does not apply live colors, so React never snaps the input (and
  // the open system picker) back mid-drag.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const c = draftRef.current;
    if (c === null) return;
    draftRef.current = null;
    setDraft(null);
    onChangeRef.current(c, false, true);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const move = (c: string) => {
    if (c === draftRef.current) return;
    draftRef.current = c;
    setDraft(c);
    onChangeRef.current(c, true, true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => settleRef.current(), SETTLE_MS);
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // "change" is just another move (Safari sends it continuously); losing
    // focus means the picker was dismissed.
    const onNativeChange = () => move(el.value);
    const onBlur = () => settleRef.current();
    el.addEventListener("change", onNativeChange);
    el.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("change", onNativeChange);
      el.removeEventListener("blur", onBlur);
      settleRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onChange={(e) => move(e.target.value)}
        />
      </label>
    </div>
  );
}
