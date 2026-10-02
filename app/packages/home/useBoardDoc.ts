import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../db/idb";
import { DEFAULT_BOARD_BG, getHomeBoard, saveHomeBoard } from "../db/repo";
import type { HomeBoard } from "../db/types";
import { defaultItems } from "./presets";

const SAVE_DELAY = 500;
const MAX_HISTORY = 60;

export function defaultBoard(): HomeBoard {
  return { key: "home", background: { ...DEFAULT_BOARD_BG }, items: defaultItems(), strokes: [], updatedAt: 0 };
}

/**
 * The home board with snapshot undo/redo and debounced autosave. Nothing is
 * written until the first change, so an untouched board stays the default.
 */
export function useBoardDoc() {
  const [board, setBoard] = useState<HomeBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const past = useRef<HomeBoard[]>([]);
  const future = useRef<HomeBoard[]>([]);
  const [, bump] = useState(0);
  const pending = useRef<HomeBoard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cur = useRef<HomeBoard | null>(null);
  cur.current = board;

  useEffect(() => {
    let alive = true;
    getHomeBoard()
      .then((b) => alive && setBoard(b ?? defaultBoard()))
      .catch((err) => alive && setError(describeError(err)));
    return () => {
      alive = false;
    };
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const b = pending.current;
    pending.current = null;
    if (b) void saveHomeBoard(b).catch((err) => setError(describeError(err)));
  }, []);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  const schedule = useCallback(
    (b: HomeBoard) => {
      pending.current = b;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  /** One undoable change. */
  const commit = useCallback(
    (fn: (b: HomeBoard) => HomeBoard) => {
      const prev = cur.current;
      if (!prev) return;
      const next = fn(prev);
      if (next === prev) return;
      past.current = [...past.current.slice(-(MAX_HISTORY - 1)), prev];
      future.current = [];
      cur.current = next;
      setBoard(next);
      schedule(next);
    },
    [schedule],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !cur.current) return;
    future.current.push(cur.current);
    cur.current = prev;
    setBoard(prev);
    schedule(prev);
    bump((n) => n + 1);
  }, [schedule]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !cur.current) return;
    past.current.push(cur.current);
    cur.current = next;
    setBoard(next);
    schedule(next);
    bump((n) => n + 1);
  }, [schedule]);

  return {
    board,
    error,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
