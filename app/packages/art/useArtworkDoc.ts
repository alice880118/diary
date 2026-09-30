import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../db/idb";
import { saveArtwork } from "../db/repo";
import type { Artwork } from "../db/types";
import type { SaveStatus } from "../editor/useEditorDoc";

const HISTORY_MAX = 40;
const SAVE_DELAY = 800;

/** Artwork document with undo/redo; masks are immutable assets so history stays valid. */
export function useArtworkDoc(initial: Artwork) {
  const [art, setArt] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const past = useRef<Artwork[]>([]);
  const future = useRef<Artwork[]>([]);
  const latest = useRef(art);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const [, force] = useState(0);
  latest.current = art;

  const runSave = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setStatus("saving");
    const job = saveArtwork(latest.current)
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
    if (ok && dirty.current) return runSave();
    return ok;
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus((s) => (s === "error" ? s : "pending"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void runSave();
    }, SAVE_DELAY);
  }, [runSave]);

  const commit = useCallback(
    (next: Artwork | ((a: Artwork) => Artwork), record = true) => {
      const prev = latest.current;
      const value = typeof next === "function" ? next(prev) : next;
      if (record) {
        past.current.push(prev);
        if (past.current.length > HISTORY_MAX) past.current.shift();
        future.current = [];
      }
      latest.current = value;
      setArt(value);
      schedule();
    },
    [schedule],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    latest.current = prev;
    setArt(prev);
    force((n) => n + 1);
    schedule();
  }, [schedule]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    latest.current = next;
    setArt(next);
    force((n) => n + 1);
    schedule();
  }, [schedule]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return runSave();
  }, [runSave]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  return {
    art,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    status,
    error,
    flush,
    retry: runSave,
    latest,
  };
}
