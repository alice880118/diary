import { isZh } from "../i18n";
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random prefixed ID; works in insecure contexts where randomUUID is absent. */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

export function todayLocal(): string {
  return toLocalDate(new Date());
}

export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymOf(date: string): string {
  return date.slice(0, 7);
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/** Full weekday name, e.g. "Wednesday" / "星期三". */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const i = new Date(y, m - 1, d).getDay();
  return isZh() ? `星期${WEEKDAYS_ZH[i]}` : WEEKDAYS[i] ?? "";
}

/** 1-based month to full name; "Mar" style when short ("3月" in Chinese). */
export function monthName(m: number, short = false): string {
  if (isZh()) return `${m}月`;
  const n = MONTHS[m - 1] ?? "";
  return short ? n.slice(0, 3) : n;
}

/** "YYYY-MM" to "September 2026" / "2026年9月". */
export function formatYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return isZh() ? `${y}年${m}月` : `${monthName(m)} ${y}`;
}

/** "YYYY-MM-DD" to "Wed, Sep 30, 2026" / "2026年9月30日（三）". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (isZh()) return `${y}年${m}月${d}日（${WEEKDAYS_ZH[new Date(y, m - 1, d).getDay()]}）`;
  return `${weekdayOf(date).slice(0, 3)}, ${monthName(m, true)} ${d}, ${y}`;
}

/** "YYYY-MM-DD" to "Sep 30" / "9月30日". */
export function formatDateShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return isZh() ? `${m}月${d}日` : `${monthName(m, true)} ${d}`;
}

/** Epoch ms to "Sep 30, 2026, 10:27 PM". */
export function formatTimestamp(t: number, withTime = true): string {
  return new Date(t).toLocaleString(isZh() ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** "YYYY-MM-DD" to "Fri, Oct 2" / "10月2日（五）". */
export function formatDayChip(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (isZh()) return `${m}月${d}日（${WEEKDAYS_ZH[new Date(y, m - 1, d).getDay()]}）`;
  return `${weekdayOf(date).slice(0, 3)}, ${monthName(m, true)} ${d}`;
}
