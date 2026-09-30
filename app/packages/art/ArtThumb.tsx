import { useEffect, useRef, useState } from "react";
import type { Artwork } from "../db/types";
import { renderFinal } from "./render";
import { loadRuntime } from "./runtime";

let queue: Promise<unknown> = Promise.resolve();

/** Serialize thumbnail renders so a long list does not stall the UI. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

export function ArtThumb({ art, size = 120 }: { art: Artwork; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void enqueue(async () => {
      if (!alive) return;
      const rt = await loadRuntime(art);
      if (!alive) return;
      const scale = 0.2;
      const img = renderFinal(art, rt, scale, { keepPaper: true });
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }).catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art.id, art.updatedAt]);

  if (failed) return <div className="muted small">No preview</div>;
  return <canvas ref={ref} width={size} height={size} style={{ width: "100%", height: "100%", display: "block" }} />;
}
