import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLive } from "../db/events";
import { getSettings } from "../db/repo";

interface MotionState {
  reduce: boolean;
}

const MotionContext = createContext<MotionState>({ reduce: false });

export function MotionProvider({ children }: { children: ReactNode }) {
  const settings = useLive(getSettings, []);
  const [systemReduce, setSystemReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduce(mq.matches);
    const onChange = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const pref = settings.data?.motion ?? "system";
  const reduce = pref === "reduce" || (pref === "system" && systemReduce);

  useEffect(() => {
    document.documentElement.dataset.motion = reduce ? "reduce" : "full";
  }, [reduce]);

  return (
    <MotionContext.Provider value={{ reduce }}>{children}</MotionContext.Provider>
  );
}

export function useReduceMotion() {
  return useContext(MotionContext).reduce;
}
