import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { t } from "../i18n";

/**
 * In-app color picker: a saturation / brightness square and a hue bar.
 *
 * It replaces the system picker (`<input type="color">`), whose behavior
 * differs per platform; on iOS it could close mid-drag. Dragging uses pointer
 * capture, so the drag keeps going outside the control and outside-tap
 * handlers of a surrounding popover never see it. `onChange` fires with
 * `live = true` on every move and once with `live = false` when the finger
 * or mouse is released.
 */

interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hexToHsv(hex: string): Hsv | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pointer handlers for a 2D (or 1D) drag area with capture. */
function useDrag(onMove: (x: number, y: number, live: boolean) => void) {
  const active = useRef<number | null>(null);
  const at = (e: ReactPointerEvent<HTMLElement>, live: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height), live);
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = e.pointerId;
      at(e, true);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current !== e.pointerId) return;
      at(e, true);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current !== e.pointerId) return;
      active.current = null;
      at(e, false);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current !== e.pointerId) return;
      active.current = null;
      at(e, false);
    },
  };
}

export function HsvPicker({ value, onChange }: { value: string; onChange: (color: string, live: boolean) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 1 });
  const [text, setText] = useState(value);
  const lastOut = useRef(value.toLowerCase());

  // Follow outside changes (a swatch tap), but keep our hue when the color
  // came from this picker (grays have no hue of their own).
  useEffect(() => {
    if (value.toLowerCase() === lastOut.current) return;
    const next = hexToHsv(value);
    if (next) setHsv((cur) => (next.s === 0 || next.v === 0 ? { ...next, h: cur.h } : next));
    setText(value);
    lastOut.current = value.toLowerCase();
  }, [value]);

  const emit = (next: Hsv, live: boolean) => {
    setHsv(next);
    const hex = hsvToHex(next);
    lastOut.current = hex;
    setText(hex);
    onChange(hex, live);
  };

  const sv = useDrag((x, y, live) => emit({ ...hsv, s: x, v: 1 - y }, live));
  const hue = useDrag((x, _y, live) => emit({ ...hsv, h: Math.min(359.9, x * 360) }, live));
  const hex = hsvToHex(hsv);

  const commitText = () => {
    const v = text.trim().startsWith("#") ? text.trim() : `#${text.trim()}`;
    const next = hexToHsv(v);
    if (next) emit(next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next, false);
    else setText(hex);
  };

  return (
    <div className="hsv-picker">
      <div
        className="hsv-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        role="slider"
        aria-label={t("Saturation and brightness")}
        aria-valuetext={hex}
        {...sv}
      >
        <span className="hsv-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="hsv-hue" role="slider" aria-label={t("Hue")} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} {...hue}>
        <span className="hsv-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      <div className="hsv-row">
        <span className="hsv-preview" style={{ background: hex }} />
        <input
          className="input hsv-hex"
          value={text}
          aria-label={t("Hex color")}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            }
          }}
        />
      </div>
    </div>
  );
}
