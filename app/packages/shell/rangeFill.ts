/**
 * WebKit/Blink have no "progress" part for range inputs, so the v2 ink fill
 * is drawn from a --fill custom property kept in sync with each slider's
 * value: on user input, and whenever code (React, undo) sets .value.
 */
export function installRangeFill() {
  if (typeof window === "undefined") return;
  const proto = HTMLInputElement.prototype as HTMLInputElement & { __rangeFill?: boolean };
  if (proto.__rangeFill) return;
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!desc?.set || !desc.get) return;
  proto.__rangeFill = true;

  const update = (el: EventTarget | null) => {
    if (!(el instanceof HTMLInputElement) || el.type !== "range") return;
    const min = el.min === "" ? 0 : Number(el.min);
    const max = el.max === "" ? 100 : Number(el.max);
    const v = Number(desc.get!.call(el));
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
  };

  Object.defineProperty(HTMLInputElement.prototype, "value", {
    ...desc,
    set(this: HTMLInputElement, v: string) {
      desc.set!.call(this, v);
      // type/min/max may be applied after value while React creates the node.
      queueMicrotask(() => update(this));
    },
  });
  document.addEventListener("input", (e) => update(e.target), true);
  document.querySelectorAll("input[type=range]").forEach(update);
}
