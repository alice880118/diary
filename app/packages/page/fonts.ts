/** System font stacks only, so no font licensing is needed; missing fonts fall back. */
export const FONTS: { id: string; label: string; stack: string }[] = [
  {
    id: "sans",
    label: "Sans",
    stack: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: '"Songti TC", "Noto Serif TC", "PMingLiU", "MingLiU", serif',
  },
  {
    id: "kai",
    label: "Kaiti",
    stack: '"Kaiti TC", "BiauKai", "DFKai-SB", "STKaiti", "KaiTi", serif',
  },
  {
    id: "hand",
    label: "Handwritten",
    stack: '"Comic Sans MS", "Chalkboard SE", "Segoe Print", "Kaiti TC", cursive',
  },
  {
    id: "mono",
    label: "Mono",
    stack: '"SF Mono", "Consolas", "Menlo", monospace',
  },
];

export function fontStack(id: string): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
}

export const TEXT_COLORS = [
  "#2f2a25",
  "#6f665c",
  "#d2553f",
  "#e07b9a",
  "#d99a1e",
  "#3f8a5a",
  "#3868b8",
  "#7a5bb5",
];
