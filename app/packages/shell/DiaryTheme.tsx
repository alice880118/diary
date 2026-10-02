import { useEffect } from "react";
import { useLive } from "../db/events";
import { getSettings } from "../db/repo";
import { luminance } from "./FillPicker";

export const DIARY_BG_DEFAULT = "#fdfaf2";
export const DIARY_BG_COLORS = ["#fdfaf2", "#f3f1ec", "#fbeee6", "#fdf3d8", "#eaf4e4", "#e6f0fb", "#efe8f8", "#ffffff", "#2f2b26"];

/** Applies the "Diary background" setting as CSS variables on the document. */
export function DiaryTheme() {
  const settings = useLive(getSettings, []);
  const bg = settings.data?.diaryBg;
  useEffect(() => {
    const root = document.documentElement.style;
    if (!bg) {
      root.removeProperty("--diary-bg");
      root.removeProperty("--diary-dot");
      return;
    }
    root.setProperty("--diary-bg", bg);
    // Dots stay visible on dark colors.
    root.setProperty("--diary-dot", luminance(bg) < 0.3 ? "rgb(255 255 255 / 0.22)" : "rgb(120 100 70 / 0.22)");
  }, [bg]);
  return null;
}
