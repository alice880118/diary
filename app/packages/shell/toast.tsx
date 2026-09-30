import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Kind = "info" | "error" | "success";

interface ToastItem {
  id: number;
  text: string;
  kind: Kind;
}

type Show = (text: string, kind?: Kind) => void;

const ToastContext = createContext<Show>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback<Show>((text, kind = "info") => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-2), { id, text, kind }]);
    setTimeout(
      () => setItems((cur) => cur.filter((t) => t.id !== id)),
      kind === "error" ? 5000 : 2600,
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
