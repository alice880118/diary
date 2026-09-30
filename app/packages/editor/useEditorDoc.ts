import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../db/idb";
import { savePage } from "../db/repo";
import type { Page } from "../db/types";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

const HISTORY_MAX = 60;
const SAVE_DELAY = 700;

type Content = Pick<Page, "objects" | "ink" | "style" | "date">;

function contentOf(p: Page): Content {
  return { objects: p.objects, ink: p.ink, style: p.style, date: p.date };
}

/**
 * Editor document with undo/redo and debounced autosave. "saved" is only
 * reported after the IndexedDB transaction has committed.
 */
export function useEditorDoc(initial: Page) {
  const [page, setPage] = useState<Page>(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const past = useRef<Content[]>([]);
  const future = useRef<Content[]>([]);
  const [, force] = useState(0);
  const latest = useRef(page);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);

  latest.current = page;

  const runSave = useCallback(async (): Promise<boolean> => {
    if (inflight.current) {
      await inflight.current;
    }
    if (!dirty.current) {
      return true;
    }
    dirty.current = false;
    setStatus("saving");
    const snapshot = latest.current;
    const job = savePage(snapshot)
      .then(() => {
        if (!dirty.current) {
          setStatus("saved");
          setError(null);
        }
        return true;
      })
      .catch((err: unknown) => {
        dirty.current = true;
        setStatus("error");
        setError(describeError(err));
        return false;
      });
    inflight.current = job;
    const ok = await job;
    inflight.current = null;
    if (ok && dirty.current) {
      return runSave();
    }
    return ok;
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus((s) => (s === "error" ? s : "pending"));
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void runSave();
    }, SAVE_DELAY);
  }, [runSave]);

  /** Applies a change; `record` false for transient updates (e.g. metadata). */
  const commit = useCallback(
    (next: Page | ((p: Page) => Page), record = true) => {
      const prev = latest.current;
      const value = typeof next === "function" ? next(prev) : next;
      if (record) {
        past.current.push(contentOf(prev));
        if (past.current.length > HISTORY_MAX) {
          past.current.shift();
        }
        future.current = [];
      }
      latest.current = value;
      setPage(value);
      schedule();
    },
    [schedule],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(contentOf(latest.current));
    const value = { ...latest.current, ...prev };
    latest.current = value;
    setPage(value);
    force((n) => n + 1);
    schedule();
  }, [schedule]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(contentOf(latest.current));
    const value = { ...latest.current, ...next };
    latest.current = value;
    setPage(value);
    force((n) => n + 1);
    schedule();
  }, [schedule]);

  /** Commits pending changes now; resolves false if saving failed. */
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return runSave();
  }, [runSave]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  return {
    page,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    status,
    error,
    flush,
    retry: runSave,
    hasUnsaved: () => dirty.current || inflight.current !== null,
  };
}
