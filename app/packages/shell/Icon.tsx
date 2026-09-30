import type { CSSProperties } from "react";

const PATHS: Record<string, string> = {
  back: "M15 5l-7 7 7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 001.7-1l2.4 1 2-3.4z",
  plus: "M12 5v14M5 12h14",
  book: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10",
  brush: "M4 20c3 0 5-1.5 5-4a2.5 2.5 0 00-5 0c0 1.5-1 2.5-1 4zM9 14l9-9a2 2 0 013 3l-9 9",
  sticker: "M5 4h10l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM15 4v4h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  note: "M5 4h14v11l-5 5H5zM14 20v-5h5",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  copy: "M8 8h11v12H8zM5 16V4h11",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  unlock: "M6 11h12v9H6zM8 11V8a4 4 0 017.5-2",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.8 9.8 0 005-1.4",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12M18 6L6 18",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  eraser: "M8 20h12M4 16l9-9 6 6-7 7H8z",
  select: "M5 3l14 8-6 2-2 6z",
  lasso: "M12 4c5 0 8 2.5 8 5.5S16.4 15 12 15s-8-2.5-8-5.5S7 4 12 4zM7 14c-1 2 0 4 2 5",
  palette: "M12 3a9 9 0 000 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 004-4c0-4.5-4-8-9-8zM7.5 11h.01M10 7h.01M15 7h.01",
  print: "M7 8V3h10v5M5 8h14a2 2 0 012 2v6h-4v4H7v-4H3v-6a2 2 0 012-2z",
  scissors: "M6 7a2.5 2.5 0 100 .1M6 17a2.5 2.5 0 100 .1M8 8l12 10M8 16L20 6",
  texture: "M4 4h16v16H4zM4 9l5-5M4 14l10-10M4 19L19 4M9 20L20 9M14 20l6-6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  pages: "M7 3h9l4 4v12H7zM4 6v15h12",
  swap: "M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4",
  pin: "M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  folder: "M3 6h6l2 2h10v11H3z",
  zoomIn: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M11 8v6M8 11h6",
  out: "M14 4h6v6M20 4l-8 8M10 5H4v15h15v-6",
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 22,
  style,
  title,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  title?: string;
}) {
  const d = PATHS[name] ?? PATHS.more;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
