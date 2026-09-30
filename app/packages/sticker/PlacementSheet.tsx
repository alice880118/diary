import { useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import { useLive } from "../db/events";
import { formatDate, formatDateShort, todayLocal } from "../db/id";
import { describeError } from "../db/idb";
import { createPage, listNotebooks, listPages, sortPagesByDate } from "../db/repo";
import { PageSurface } from "../page/PageSurface";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";

/** Choose a notebook and page (or a new page) to paste a sticker into. */
export function PlacementSheet({
  open,
  stickerId,
  onClose,
  beforeNavigate,
}: {
  open: boolean;
  stickerId: string | null;
  onClose: () => void;
  beforeNavigate?: () => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const notebooks = useLive(listNotebooks, []);
  const [nid, setNid] = useState<string | null>(null);
  const [pid, setPid] = useState<string | "new" | null>(null);
  const pages = useLive(async () => (nid ? sortPagesByDate(await listPages(nid)).reverse() : []), [nid]);

  useEffect(() => {
    if (open) {
      setPid(null);
      if (!nid && notebooks.data?.length) setNid(notebooks.data[0].id);
    }
  }, [open, notebooks.data, nid]);

  const confirm = async () => {
    if (!stickerId || !nid || !pid) return;
    if (beforeNavigate && !(await beforeNavigate())) return;
    try {
      let target = pid;
      if (pid === "new") {
        const p = await createPage(nid, todayLocal());
        target = p.id;
      }
      onClose();
      navigate(`/page/${target}/edit?addSticker=${stickerId}`);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const nbs = notebooks.data ?? [];
  return (
    <Sheet
      open={open}
      title="Add to diary"
      onClose={onClose}
      tall
      footer={
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!pid} onClick={() => void confirm()}>
            Add
          </button>
        </div>
      }
    >
      {nbs.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-title">No notebooks yet</div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate("/diary")}>
            Create one
          </button>
        </div>
      ) : (
        <>
          <div className="small" style={{ marginBottom: 4 }}>Notebook</div>
          <div className="hscroll" style={{ marginBottom: 12 }}>
            {nbs.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`chip${nid === n.id ? " is-active" : ""}`}
                onClick={() => {
                  setNid(n.id);
                  setPid(null);
                }}
              >
                {n.name}
              </button>
            ))}
          </div>
          <div className="small" style={{ marginBottom: 4 }}>Page</div>
          <button
            type="button"
            className="btn btn-block"
            style={{
              marginBottom: 10,
              borderColor: pid === "new" ? "var(--accent)" : undefined,
              color: pid === "new" ? "var(--accent)" : undefined,
            }}
            onClick={() => setPid("new")}
          >
            {pid === "new" ? "✓ " : "+ "}New page ({formatDate(todayLocal())})
          </button>
          {(pages.data ?? []).length === 0 ? (
            <div className="muted small">This notebook has no pages yet. Add a new page to get started.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {(pages.data ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPid(p.id)}
                  style={{
                    padding: 4,
                    border: pid === p.id ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRadius: 10,
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  <PageSurface page={p} width={90} thumb />
                  <div className="small">
                    {pid === p.id ? "✓ " : ""}
                    {formatDateShort(p.date)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
