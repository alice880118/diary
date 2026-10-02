import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Kind = "info" | "error" | "success";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  text: string;
  kind: Kind;
  action?: ToastAction;
}

type Show = (text: string, kind?: Kind, action?: ToastAction) => void;

const ToastContext = createContext<Show>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback<Show>((text, kind = "info", action) => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-2), { id, text, kind, action }]);
    setTimeout(
      () => setItems((cur) => cur.filter((t) => t.id !== id)),
      kind === "error" ? 5000 : action ? 4500 : 2600,
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}${t.action ? " has-action" : ""}`}>
            {t.text}
            {t.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  setItems((cur) => cur.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
