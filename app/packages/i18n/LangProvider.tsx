import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dropdown } from "../shell/Dropdown";
import { Icon } from "../shell/Icon";
import { getLang, LANGS, onLangChange, setLang, t, type Lang } from "./index";

/** Re-mounts the app when the language changes so every string re-renders. */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(getLang());
  useEffect(() => {
    document.documentElement.lang = getLang() === "zh-TW" ? "zh-Hant" : "en";
    return onLangChange(setState);
  }, []);
  return <div key={lang} style={{ display: "contents" }}>{children}</div>;
}

/** Header button (same size as Settings) that switches the app language. */
export function LanguageButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cur = getLang();
  return (
    <>
      <button ref={ref} type="button" className="icon-btn" aria-label={t("Language")} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <Icon name="globe" />
      </button>
      <Dropdown
        open={open}
        anchor={ref}
        align="end"
        minWidth={170}
        onClose={() => setOpen(false)}
        items={LANGS.map((l) => ({
          label: l.label,
          highlighted: l.id === cur,
          trail: l.id === cur ? <Icon name="check" size={18} /> : undefined,
          onSelect: () => setLang(l.id),
        }))}
      />
    </>
  );
}
