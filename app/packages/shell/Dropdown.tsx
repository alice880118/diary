import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { t } from "../i18n";

export type DropdownItem =
  | "separator"
  | {
      label: ReactNode;
      icon?: IconName;
      /** Leading content instead of an icon (e.g. a numbered step dot). */
      lead?: ReactNode;
      /** Trailing content (e.g. a status or check). */
      trail?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      highlighted?: boolean;
    };

const GAP = 6;
const EDGE = 8;

/**
 * L3 context menu anchored to a button. Renders in the app frame so sheets
 * and scroll containers never clip it; flips above the anchor when there is
 * no room below. Groups are split with "separator"; Delete goes last.
 */
export function Dropdown({
  open,
  anchor,
  onClose,
  items,
  align = "start",
  minWidth = 200,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  items: DropdownItem[];
  align?: "start" | "end";
  minWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const frame = document.querySelector<HTMLElement>(".app-frame") ?? document.body;
    const a = anchor.current?.getBoundingClientRect();
    const m = ref.current?.getBoundingClientRect();
    if (!a || !m) return;
    const f = frame.getBoundingClientRect();
    let left = align === "end" ? a.right - m.width : a.left;
    left = Math.min(Math.max(left, f.left + EDGE), f.right - m.width - EDGE);
    let top = a.bottom + GAP;
    if (top + m.height > f.bottom - EDGE && a.top - GAP - m.height >= f.top + EDGE) {
      top = a.top - GAP - m.height;
    }
    setPos({ left: left - f.left, top: top - f.top });
  }, [open, anchor, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;
  const frame = document.querySelector<HTMLElement>(".app-frame") ?? document.body;
  return createPortal(
    <div
      ref={ref}
      className="dropdown"
      role="menu"
      style={{ minWidth, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {items.map((it, i) =>
        it === "separator" ? (
          <hr key={`sep${i}`} />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`dropdown-item${it.danger ? " is-danger" : ""}${it.highlighted ? " is-highlighted" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.lead ?? (it.icon ? <Icon name={it.icon} size={18} /> : null)}
            <span className="dropdown-label">{typeof it.label === "string" ? t(it.label) : it.label}</span>
            {it.trail ? <span className="dropdown-trail">{it.trail}</span> : null}
          </button>
        ),
      )}
    </div>,
    frame,
  );
}
