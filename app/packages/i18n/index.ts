/**
 * Minimal i18n: English source strings are the keys, translations live in
 * per-language tables, and anything missing falls back to English. The
 * language is a per-device preference (localStorage), read synchronously on
 * the client so the first render is already in the right language.
 */
import { ZH_TW } from "./zh-TW";

export type Lang = "en" | "zh-TW";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh-TW", label: "繁體中文" },
];

const KEY = "diary.lang";

function initialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "zh-TW") return v;
  } catch {
    // Fall through to the browser language.
  }
  return /^zh/i.test(navigator.language || "") ? "zh-TW" : "en";
}

let current: Lang = initialLang();
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // Still applies for this session.
  }
  if (typeof document !== "undefined") document.documentElement.lang = l === "zh-TW" ? "zh-Hant" : "en";
  for (const fn of listeners) fn(l);
}

export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Translates an English UI string. `{name}` placeholders are filled from
 * `vars`; use separate keys for singular / plural.
 */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = current === "zh-TW" ? ZH_TW[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Count phrase: picks "{n} page" / "{n} pages" style keys. */
export function tn(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many, { n });
}

export function isZh() {
  return current === "zh-TW";
}
