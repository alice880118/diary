import { useEffect, useRef, useState } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

export function emitChange() {
  for (const l of listeners) {
    l();
  }
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export interface LiveResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/** Re-runs the query whenever any repository write is committed. */
export function useLive<T>(
  query: () => Promise<T>,
  deps: unknown[],
): LiveResult<T> {
  const [state, setState] = useState<LiveResult<T>>({
    data: undefined,
    error: null,
    loading: true,
  });
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const run = () => {
      const mine = ++seq;
      queryRef
        .current()
        .then((data) => {
          if (alive && mine === seq) {
            setState({ data, error: null, loading: false });
          }
        })
        .catch((err: unknown) => {
          if (alive && mine === seq) {
            setState((s) => ({
              data: s.data,
              error: err instanceof Error ? err.message : String(err),
              loading: false,
            }));
          }
        });
    };
    run();
    const off = subscribe(run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
