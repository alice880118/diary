import type { CSSProperties } from "react";

/** v2 icons that need several shapes or fills (24 grid, stroke 1.8). */
const RICH: Record<string, string> = {
  // Hugeicons free set (MIT): Globe02Icon, Settings01Icon.
  globe: '<circle cx="12" cy="12" r="10"/><path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z"/><path d="M21 15H3"/><path d="M21 9H3"/>',
  settings: '<path d="M21.3175 7.14139L20.8239 6.28479C20.4506 5.63696 20.264 5.31305 19.9464 5.18388C19.6288 5.05472 19.2696 5.15664 18.5513 5.36048L17.3311 5.70418C16.8725 5.80994 16.3913 5.74994 15.9726 5.53479L15.6357 5.34042C15.2766 5.11043 15.0004 4.77133 14.8475 4.37274L14.5136 3.37536C14.294 2.71534 14.1842 2.38533 13.9228 2.19657C13.6615 2.00781 13.3143 2.00781 12.6199 2.00781H11.5051C10.8108 2.00781 10.4636 2.00781 10.2022 2.19657C9.94085 2.38533 9.83106 2.71534 9.61149 3.37536L9.27753 4.37274C9.12465 4.77133 8.84845 5.11043 8.48937 5.34042L8.15249 5.53479C7.73374 5.74994 7.25259 5.80994 6.79398 5.70418L5.57375 5.36048C4.85541 5.15664 4.49625 5.05472 4.17867 5.18388C3.86109 5.31305 3.67445 5.63696 3.30115 6.28479L2.80757 7.14139C2.45766 7.74864 2.2827 8.05227 2.31666 8.37549C2.35061 8.69871 2.58483 8.95918 3.05326 9.48012L4.0843 10.6328C4.3363 10.9518 4.51521 11.5078 4.51521 12.0077C4.51521 12.5078 4.33636 13.0636 4.08433 13.3827L3.05326 14.5354C2.58483 15.0564 2.35062 15.3168 2.31666 15.6401C2.2827 15.9633 2.45766 16.2669 2.80757 16.8741L3.30114 17.7307C3.67443 18.3785 3.86109 18.7025 4.17867 18.8316C4.49625 18.9608 4.85542 18.8589 5.57377 18.655L6.79394 18.3113C7.25263 18.2055 7.73387 18.2656 8.15267 18.4808L8.4895 18.6752C8.84851 18.9052 9.12464 19.2442 9.2775 19.6428L9.61149 20.6403C9.83106 21.3003 9.94085 21.6303 10.2022 21.8191C10.4636 22.0078 10.8108 22.0078 11.5051 22.0078H12.6199C13.3143 22.0078 13.6615 22.0078 13.9228 21.8191C14.1842 21.6303 14.294 21.3003 14.5136 20.6403L14.8476 19.6428C15.0004 19.2442 15.2765 18.9052 15.6356 18.6752L15.9724 18.4808C16.3912 18.2656 16.8724 18.2055 17.3311 18.3113L18.5513 18.655C19.2696 18.8589 19.6288 18.9608 19.9464 18.8316C20.264 18.7025 20.4506 18.3785 20.8239 17.7307L21.3175 16.8741C21.6674 16.2669 21.8423 15.9633 21.8084 15.6401C21.7744 15.3168 21.5402 15.0564 21.0718 14.5354L20.0407 13.3827C19.7887 13.0636 19.6098 12.5078 19.6098 12.0077C19.6098 11.5078 19.7888 10.9518 20.0407 10.6328L21.0718 9.48012C21.5402 8.95918 21.7744 8.69871 21.8084 8.37549C21.8423 8.05227 21.6674 7.74864 21.3175 7.14139Z"/><path d="M15.5195 12C15.5195 13.933 13.9525 15.5 12.0195 15.5C10.0865 15.5 8.51953 13.933 8.51953 12C8.51953 10.067 10.0865 8.5 12.0195 8.5C13.9525 8.5 15.5195 10.067 15.5195 12Z"/>',
  marker: '<path d="M9 15l-4 4h5l2-2"/><path d="M9 15l8.5-8.5a2.1 2.1 0 013 3L12 18z"/>',
  pencil: '<path d="M4 20l2-6L16 4l4 4L10 18z"/><path d="M6 14l4 4"/>',
  eraser2: '<path d="M8 20h12"/><path d="M4.5 14.5l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L12 19H8z"/><path d="M9 10l5 5"/>',
  pen2: '<path d="M4 20l1-5L15.5 4.5a2.1 2.1 0 013 3L8 18z"/><path d="M13.5 6.5l3 3"/>',
  size: '<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8"/>',
  opacity: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  image2: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  wand: '<path d="M4 20L15 9"/><path d="M15 4v2M15 12v2M19 8h2M9 8h2M18 5l-1.5 1.5M18 11l-1.5-1.5"/>',
  lassoAdd: '<path d="M14 16c-4 0-9-2-9-6s4-6 8-6 7 2 7 5"/><path d="M8 15c-1 2 0 4 2 4"/><path d="M18 13v6M15 16h6"/>',
  lassoSub: '<path d="M14 16c-4 0-9-2-9-6s4-6 8-6 7 2 7 5"/><path d="M8 15c-1 2 0 4 2 4"/><path d="M15 16h6"/>',
  viewComposite: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  viewSingle: '<circle cx="12" cy="12" r="6"/>',
  viewMask: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 20L20 4"/><path d="M12 20L20 12M4 12l8-8"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8" fill="currentColor"/><circle cx="15" cy="15" r=".8" fill="currentColor"/><circle cx="15" cy="9" r=".8" fill="currentColor"/><circle cx="9" cy="15" r=".8" fill="currentColor"/>',
  reset: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7"/><path d="M4 4v4h4"/>',
  scissors2: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 18M8 15.5L20 6"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  sheetPaper: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  material: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 16l8-8M12 16l4-4"/>',
  cropRect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  cropCircle: '<circle cx="12" cy="12" r="8"/>',
  cropContour: '<path d="M7 5c4-2 6 2 9 1s4 3 2 6 1 6-3 7-5-2-8-1-4-3-2-6-2-5 2-7z"/>',
  cropLasso: '<path d="M14 16c-4 0-9-2-9-6s4-6 8-6 7 2 7 5-3 7-6 7"/><path d="M8 15c-1 2 0 4 2 4"/>',
  layerArea: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M8 16l4 2 4-2"/>',
  clearArea: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 9l6 6M15 9l-6 6"/>',
  palette2: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-2 0-3 4 0 5-1 2-3 2-4a9 9 0 00-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  gridAll: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  brush2: '<path d="M3 21c3 0 5-1 5-4a3 3 0 016 0"/><path d="M11 14L20 5"/>',
};

const PATHS: Record<string, string> = {
  back: "M15 5l-7 7 7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 001.7-1l2.4 1 2-3.4z",
  plus: "M12 5v14M5 12h14",
  book: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10",
  home: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5",
  stickerPlus: "M6 3h9l4 4v6M6 3v18h7M18 16v6M15 19h6",
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
  arrowDownRight: "M7 7l10 10M17 9v8H9",
  arrowUpRight: "M7 17L17 7M9 7h8v8",
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

export type IconName = keyof typeof PATHS | keyof typeof RICH;

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
  const rich = RICH[name];
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
      {rich ? <g dangerouslySetInnerHTML={{ __html: rich }} /> : <path d={d} />}
    </svg>
  );
}
