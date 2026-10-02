import type { PageObject } from "../db/types";
import { Icon } from "../shell/Icon";
import { Sheet } from "../shell/Sheet";
import { isOffPage, OBJECT_LABEL } from "./geometry";
import { t } from "../i18n";

function describe(o: PageObject) {
  switch (o.type) {
    case "text":
      return o.text.slice(0, 16) || "(Empty text)";
    case "note":
      return o.text.slice(0, 16) || t("Sticky note");
    case "link":
      return o.title || o.url;
    case "sticker":
      return o.snap.name;
    default:
      return "";
  }
}

export function LayersPanel({
  open,
  objects,
  selectedId,
  onClose,
  onSelect,
  onToggleLock,
  onShift,
  onBringIn,
}: {
  open: boolean;
  objects: PageObject[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
  onShift: (id: string, dir: 1 | -1) => void;
  onBringIn: (id: string) => void;
}) {
  const list = [...objects].sort((a, b) => b.z - a.z);
  return (
    <Sheet open={open} title={t("Layers (top first)")} onClose={onClose} tall>
      {list.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-title">{t("No objects on this page yet")}</div>
        </div>
      ) : (
        list.map((o, i) => (
          <div
            key={o.id}
            className="row"
            style={{
              padding: "6px 4px",
              borderBottom: "1px solid var(--line)",
              background: o.id === selectedId ? "var(--accent-soft)" : undefined,
              borderRadius: 8,
            }}
          >
            <button
              type="button"
              style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "none", minHeight: 44, cursor: "pointer" }}
              onClick={() => {
                onSelect(o.id);
                onClose();
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {OBJECT_LABEL[o.type]}
                {o.locked ? " 🔒" : ""}
                {isOffPage(o) ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>{t("Off page")}</span> : null}
              </div>
              <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {describe(o)}
              </div>
            </button>
            {isOffPage(o) ? (
              <button type="button" className="btn btn-sm" onClick={() => onBringIn(o.id)}>
                {t("Move back")}
              </button>
            ) : null}
            <button type="button" className="icon-btn" aria-label={o.locked ? t("Unlock") : t("Lock")} onClick={() => onToggleLock(o.id)}>
              <Icon name={o.locked ? "lock" : "unlock"} size={20} />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Bring forward")} disabled={i === 0} onClick={() => onShift(o.id, 1)}>
              <Icon name="up" size={20} />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Send backward")} disabled={i === list.length - 1} onClick={() => onShift(o.id, -1)}>
              <Icon name="down" size={20} />
            </button>
          </div>
        ))
      )}
    </Sheet>
  );
}
