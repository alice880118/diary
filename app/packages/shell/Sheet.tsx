import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Bottom sheet that stays above the virtual keyboard by tracking
 * visualViewport, so text inputs remain visible while typing.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  tall = false,
  modal = true,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
  modal?: boolean;
}) {
  const [kbOffset, setKbOffset] = useState(0);

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(offset);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div className={`sheet-root${modal ? "" : " is-modeless"}`}>
      {modal ? <div className="sheet-backdrop" onClick={onClose} /> : null}
      <section
        className={`sheet${tall ? " is-tall" : ""}`}
        style={{ bottom: kbOffset }}
        role="dialog"
        aria-modal={modal}
        aria-label={typeof title === "string" ? title : undefined}
      >
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </section>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmText = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      <div className="confirm-msg">{message}</div>
    </Sheet>
  );
}

export function Menu({
  open,
  title,
  items,
  onClose,
}: {
  open: boolean;
  title: string;
  items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="menu-list">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className={`menu-item${it.danger ? " is-danger" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
