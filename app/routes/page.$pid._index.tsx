import { useNavigate, useParams } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "~/packages/db/events";
import { formatDate, ymOf } from "~/packages/db/id";
import { getNotebook, getPage, listPages, movePage } from "~/packages/db/repo";
import { openExternal } from "~/packages/page/links";
import { PageSurface } from "~/packages/page/PageSurface";
import { PageFlipper } from "~/packages/reader/PageFlipper";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { useReduceMotion } from "~/packages/shell/motion";
import { Sheet } from "~/packages/shell/Sheet";
import { useElementSize } from "~/packages/shell/useSize";

export default function Reader() {
  const { pid = "" } = useParams();
  const navigate = useNavigate();
  const reduce = useReduceMotion();
  const bodyRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bodyRef);
  const [thumbs, setThumbs] = useState(false);

  const data = useLive(async () => {
    const page = await getPage(pid);
    if (!page) return { page: undefined, pages: [], nb: undefined };
    const [pages, nb] = await Promise.all([listPages(page.notebookId), getNotebook(page.notebookId)]);
    return { page, pages, nb };
  }, [pid]);

  const pages = data.data?.pages ?? [];
  const index = pages.findIndex((p) => p.id === pid);

  const onIndexChange = useCallback(
    (i: number) => {
      const p = pages[i];
      if (p) {
        navigate(`/page/${p.id}`, { replace: true });
      }
    },
    [pages, navigate],
  );

  useEffect(() => {
    if (thumbs) {
      document.getElementById(`thumb-${pid}`)?.scrollIntoView({ block: "center" });
    }
  }, [thumbs, pid]);

  const page = data.data?.page;
  if (data.data && (!page || page.deletedAt || index < 0)) {
    return (
      <Screen header={<AppHeader title="Page not found" left={<BackButton to="/diary" />} />}>
        <EmptyState title="This page doesn't exist or is in the trash" />
      </Screen>
    );
  }
  const back = page ? `/diary/${page.notebookId}/m/${ymOf(page.date)}` : "/diary";

  return (
    <Screen
      header={
        <AppHeader
          title={page ? formatDate(page.date) : ""}
          subtitle={data.data?.nb?.name}
          left={<BackButton to={back} />}
          right={
            <>
              <button type="button" className="icon-btn" aria-label="Page thumbnails" onClick={() => setThumbs(true)}>
                <Icon name="pages" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Edit"
                onClick={() => navigate(`/page/${pid}/edit`)}
              >
                <Icon name="edit" />
              </button>
            </>
          }
        />
      }
      bodyStyle={{ overflow: "hidden" }}
    >
      <div ref={bodyRef} style={{ position: "absolute", inset: 0 }}>
        {size.width > 0 && index >= 0 ? (
          <PageFlipper
            pages={pages}
            index={index}
            onIndexChange={onIndexChange}
            width={size.width}
            height={size.height}
            reduceMotion={reduce}
            onOpenLink={openExternal}
          />
        ) : null}
      </div>
      <Sheet open={thumbs} title="Pages (in reading order)" onClose={() => setThumbs(false)} tall>
        <div className="muted small" style={{ marginBottom: 10 }}>
          Tap a thumbnail to jump to it. Use the arrows to reorder pages; dates stay the same.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pages.map((p, i) => (
            <div
              key={p.id}
              id={`thumb-${p.id}`}
              className="row"
              style={{
                padding: 6,
                borderRadius: 12,
                background: p.id === pid ? "var(--accent-soft)" : "transparent",
              }}
            >
              <button
                type="button"
                style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}
                onClick={() => {
                  setThumbs(false);
                  navigate(`/page/${p.id}`, { replace: true });
                }}
              >
                <PageSurface page={p} width={60} thumb />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Page {i + 1}</div>
                <div className="muted small">{formatDate(p.date)}</div>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => movePage(p.id, -1)}
              >
                <Icon name="up" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Move down"
                disabled={i === pages.length - 1}
                onClick={() => movePage(p.id, 1)}
              >
                <Icon name="down" />
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}
