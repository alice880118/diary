import { useEffect, useRef, type ReactNode } from "react";

/**
 * L2 settings panel that sits just above a bottom toolbar. No scrim, so the
 * canvas stays visible while adjusting; tapping outside or Escape closes it.
 * Render it inside the positioned container that holds the toolbar.
 */
export function Popover({
  open,
  onClose,
  children,
  title,
  bottom = 88,
  ignore,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  /** Distance from the container bottom, in px (toolbar height + gap). */
  bottom?: number;
  /** Elements whose taps should not close the popover (e.g. the toggling tool button). */
  ignore?: React.RefObject<HTMLElement | null>[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (ignore?.some((r) => r.current?.contains(t))) return;
      // A tap on the canvas only dismisses; it must not also draw.
      if (t instanceof HTMLCanvasElement) {
        e.stopPropagation();
        e.preventDefault();
      }
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
  }, [open, onClose, ignore]);

  if (!open) return null;
  return (
    <div ref={ref} className="popover" style={{ bottom }} role="dialog">
      {title ? <div className="popover-title">{title}</div> : null}
      {children}
    </div>
  );
}
