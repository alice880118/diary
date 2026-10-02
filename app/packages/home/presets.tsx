import { useId, type ReactNode } from "react";
import { BOARD_W, type BoardItem } from "../db/types";
import { t } from "../i18n";

/**
 * Built-in board stickers. "Playful" redraws the Figma "IG / home" pieces as
 * vectors (gradient, grain, white die-cut edge); "Paper" are paper scraps.
 * Each preset renders into a box of its own aspect ratio (h / w).
 */
export interface Preset {
  id: string;
  set: "playful" | "paper";
  /** Height / width. */
  ratio: number;
  /** Default width as a fraction of the board width. */
  w: number;
  /** No white edge or shadow (doodle-like pieces). */
  flat?: boolean;
  render: (ids: Ids) => ReactNode;
}

type Ids = (name: string) => string;

const EDGE = "#ffffff";

/** Paper grain laid over the fill, clipped to the shape. */
function Grain({ id, strength = 0.22, freq = 0.9, tint = "0.35 0.3 0.6" }: { id: string; strength?: number; freq?: number; tint?: string }) {
  const [r, g, b] = tint.split(" ");
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} stitchTiles="stitch" result="n" />
      <feColorMatrix in="n" type="matrix" values={`0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${strength * 4} -${strength * 1.6}`} result="c" />
      <feComposite in="c" in2="SourceAlpha" operator="in" result="m" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="m" />
      </feMerge>
    </filter>
  );
}

function Lin({ id, x1, y1, x2, y2, from, to }: { id: string; x1: number; y1: number; x2: number; y2: number; from: string; to: string }) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

/** Six-armed star as one outline (three crossing bars), so the fill has no seams. */
function asteriskPath(cx: number, cy: number, len: number, hw: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const [px, py] = [-dy, dx];
    pts.push(`${(cx + dx * len - px * hw).toFixed(1)} ${(cy + dy * len - py * hw).toFixed(1)}`);
    pts.push(`${(cx + dx * len + px * hw).toFixed(1)} ${(cy + dy * len + py * hw).toFixed(1)}`);
    const b = a + Math.PI / 6;
    pts.push(`${(cx + Math.cos(b) * hw * 2).toFixed(1)} ${(cy + Math.sin(b) * hw * 2).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const CLOUD_OVALS = (
  <>
    <ellipse cx={132} cy={323} rx={112} ry={202} transform="rotate(12 132 323)" />
    <ellipse cx={275} cy={270} rx={106} ry={200} transform="rotate(15 275 270)" />
    <ellipse cx={432} cy={221} rx={101} ry={201} transform="rotate(15 432 221)" />
  </>
);

const LAV = "#8b7af2";
const LAV_LIGHT = "#f3f0ff";

/** Shape drawn twice: a thick white edge underneath, then the gradient fill with grain. */
function Cut({ ids, children, edge = 12, fill, grain = true }: { ids: Ids; children: ReactNode; edge?: number; fill: string; grain?: boolean }) {
  return (
    <>
      <g fill={EDGE} stroke={EDGE} strokeWidth={edge * 2} strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
      <g fill={fill} filter={grain ? `url(#${ids("grain")})` : undefined}>{children}</g>
    </>
  );
}

const PLAYFUL: Preset[] = [
  {
    id: "squiggle",
    set: "playful",
    ratio: 570 / 402,
    w: 1,
    flat: true,
    render: () => (
      <svg viewBox="0 0 402 570" width="100%" height="100%" aria-hidden>
        <path
          d="M-6 32C70 6 190 -4 268 10c70 13 116 48 112 92-4 40-56 52-80 30-24-23 4-60 52-52 40 7 62 52 52 104-12 62-70 104-138 128-58 20-138 38-188 76-36 28-44 66-14 76 28 10 58-18 42-48-14-26-60-30-96-6"
          fill="none"
          stroke="#e4ffb1"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M402 352c-24 30-34 70-14 110 20 40 6 84-44 98-40 11-96 4-136-10"
          fill="none"
          stroke="#e4ffb1"
          strokeWidth={14}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "arrow",
    set: "playful",
    ratio: 1,
    w: 167 / BOARD_W,
    render: (ids) => (
      <svg viewBox="0 0 160 160" width="100%" height="100%" aria-hidden>
        <defs>
          <Lin id={ids("f")} x1={22} y1={140} x2={140} y2={20} from={LAV_LIGHT} to={LAV} />
          <Grain id={ids("grain")} />
        </defs>
        <Cut ids={ids} fill={`url(#${ids("f")})`} edge={9}>
          <path d="M146 14 132 112 104 86 40 150 10 120 74 56 48 28Z" />
        </Cut>
      </svg>
    ),
  },
  {
    id: "asterisk",
    set: "playful",
    ratio: 1.12,
    w: 189 / BOARD_W,
    render: (ids) => (
      <svg viewBox="0 0 200 224" width="100%" height="100%" aria-hidden>
        <defs>
          <Lin id={ids("f")} x1={100} y1={14} x2={100} y2={210} from={LAV} to={LAV_LIGHT} />
          <Grain id={ids("grain")} />
        </defs>
        <Cut ids={ids} fill={`url(#${ids("f")})`} edge={9}>
          <path d={asteriskPath(100, 112, 98, 22)} strokeLinejoin="round" />
        </Cut>
      </svg>
    ),
  },
  {
    id: "cloud",
    set: "playful",
    ratio: 546 / 556,
    w: 262 / BOARD_W,
    render: (ids) => (
      <svg viewBox="0 0 556 546" width="100%" height="100%" aria-hidden>
        <defs>
          <Lin id={ids("f")} x1={470} y1={30} x2={90} y2={510} from="#e4deff" to="#8a76f5" />
          <Grain id={ids("grain")} strength={0.3} freq={0.75} />
        </defs>
        {/* Ovals merged through a mask so their overlaps leave no seams. */}
        <mask id={ids("m")} maskUnits="userSpaceOnUse" x={0} y={0} width={556} height={546}>
          <g fill="#fff">{CLOUD_OVALS}</g>
        </mask>
        <g fill={EDGE} stroke={EDGE} strokeWidth={32}>
          {CLOUD_OVALS}
        </g>
        <rect width={556} height={546} fill={`url(#${ids("f")})`} mask={`url(#${ids("m")})`} filter={`url(#${ids("grain")})`} />
        <g fill="#5b3cf0">
          <circle cx={326} cy={165} r={11} />
          <circle cx={390} cy={153} r={11} />
        </g>
        <path d="M343 197q22 17 44-7" fill="none" stroke="#5b3cf0" strokeWidth={8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "pill",
    set: "playful",
    ratio: 64 / 236,
    w: 200 / BOARD_W,
    render: (ids) => (
      <svg viewBox="0 0 236 64" width="100%" height="100%" aria-hidden>
        <defs>
          <Lin id={ids("f")} x1={0} y1={0} x2={236} y2={0} from="#f6f8ff" to="#8fb2f7" />
          <Grain id={ids("grain")} strength={0.16} tint="0.3 0.4 0.7" />
        </defs>
        <Cut ids={ids} fill={`url(#${ids("f")})`} edge={7}>
          <rect x={8} y={8} width={220} height={48} rx={24} />
        </Cut>
        <text x={118} y={38} textAnchor="middle" fontFamily="Poppins, 'Noto Sans TC', sans-serif" fontSize={17} fill="#8fb2f7" fillOpacity={0.95}>
          {t("A little note today")}
        </text>
      </svg>
    ),
  },
  {
    id: "bubble",
    set: "playful",
    ratio: 110 / 210,
    w: 196 / BOARD_W,
    render: (ids) => (
      <svg viewBox="0 0 210 110" width="100%" height="100%" aria-hidden>
        <defs>
          <Lin id={ids("f")} x1={10} y1={10} x2={200} y2={90} from="#7ea6f2" to="#e9effd" />
          <Grain id={ids("grain")} strength={0.16} tint="0.3 0.4 0.7" />
        </defs>
        <Cut ids={ids} fill={`url(#${ids("f")})`} edge={7}>
          <path d="M30 8h150a22 22 0 0122 22v38a22 22 0 01-22 22h-36l-10 14-10-14H30A22 22 0 018 68V30A22 22 0 0130 8z" />
        </Cut>
        <text textAnchor="middle" fontFamily="Poppins, 'Noto Sans TC', sans-serif" fontSize={16} fill="#fff">
          <tspan x={105} y={44}>{t("Daily moments,")}</tspan>
          <tspan x={105} y={66}>{t("softly kept")}</tspan>
        </text>
      </svg>
    ),
  },
];

/** Small flat icons (64 x 64) from the design deck; the white edge comes from CSS. */
const ICONS: Record<string, string> = {
  heart: '<path d="M32 55S7 40 7 23a12.5 12.5 0 0125-5 12.5 12.5 0 0125 5c0 17-25 32-25 32z" fill="#f2a7bd"/><path d="M18 20a5 5 0 016-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>',
  star: '<path d="M32 5l8 17.2 18.8 2.1-14 12.7 3.9 18.6L32 46.2 15.3 55.6l3.9-18.6-14-12.7 18.8-2.1z" fill="#f4d774" stroke="#f4d774" stroke-width="3" stroke-linejoin="round"/>',
  flower: '<g fill="#f2a7bd"><circle cx="32" cy="16" r="11"/><circle cx="47" cy="27" r="11"/><circle cx="41" cy="45" r="11"/><circle cx="23" cy="45" r="11"/><circle cx="17" cy="27" r="11"/></g><circle cx="32" cy="32" r="8" fill="#f4d774"/>',
  smile: '<rect x="7" y="12" width="50" height="40" rx="11" fill="#9cc7ef"/><circle cx="24" cy="30" r="3.2" fill="#1b1b1b"/><circle cx="40" cy="30" r="3.2" fill="#1b1b1b"/><path d="M24 39q8 7 16 0" fill="none" stroke="#1b1b1b" stroke-width="3" stroke-linecap="round"/><path d="M50 6l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z" fill="#f08a6c"/>',
  sun: '<g stroke="#f2b84b" stroke-width="4" stroke-linecap="round"><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/></g><circle cx="32" cy="32" r="14" fill="#f2b84b"/>',
  music: '<circle cx="32" cy="32" r="25" fill="#2c2724"/><circle cx="32" cy="32" r="17" fill="none" stroke="#4a4440" stroke-width="1.5"/><circle cx="32" cy="32" r="8" fill="#f08a6c"/><circle cx="32" cy="32" r="2" fill="#2c2724"/>',
  leaf: '<path d="M10 54C10 27 27 9 55 9c0 28-17 45-45 45z" fill="#a8d8b9"/><path d="M13 51L43 21" stroke="#6aa56f" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
  cup: '<path d="M12 22h32v15a14 14 0 01-14 14h-4a14 14 0 01-14-14z" fill="#d7b98e"/><path d="M12 22h32v6H12z" fill="#fff8ec"/><path d="M44 27h3a6.5 6.5 0 010 13h-3" fill="none" stroke="#d7b98e" stroke-width="4.5"/><path d="M22 8c-3 4 3 6 0 10M31 8c-3 4 3 6 0 10" fill="none" stroke="#b9a48a" stroke-width="2.6" stroke-linecap="round"/>',
  camera: '<rect x="6" y="18" width="52" height="34" rx="7" fill="#c3b1e6"/><rect x="20" y="11" width="16" height="9" rx="3" fill="#c3b1e6"/><circle cx="32" cy="35" r="11" fill="#fffdf6"/><circle cx="32" cy="35" r="6" fill="#5a4a7a"/>',
  plant: '<path d="M20 40h24l-4 17H24z" fill="#d7b98e"/><path d="M32 40V22" stroke="#6aa56f" stroke-width="3"/><path d="M32 28c-12 0-17-7-17-15 10 0 17 5 17 15zM32 24c0-10 6-17 18-17 0 9-6 17-18 17z" fill="#7cc29a"/>',
  ticket: '<path d="M6 19h52v9a4.5 4.5 0 000 9v9H6v-9a4.5 4.5 0 000-9z" fill="#f3b48b"/><path d="M21 21v22" stroke="#fff" stroke-dasharray="3 3" stroke-width="2"/><rect x="27" y="27" width="22" height="4" rx="2" fill="#fff" opacity=".85"/><rect x="27" y="34" width="14" height="3" rx="1.5" fill="#fff" opacity=".7"/>',
  book: '<rect x="13" y="8" width="38" height="48" rx="3" fill="#7cc29a"/><rect x="13" y="8" width="8" height="48" rx="2" fill="#5fa57d"/><rect x="26" y="18" width="19" height="7" rx="1.5" fill="#fffdf6"/><rect x="26" y="29" width="13" height="3" rx="1.5" fill="#fffdf6" opacity=".8"/>',
};

const ICON_PRESETS: Preset[] = Object.entries(ICONS).map(([id, svg]) => ({
  id: `icon-${id}`,
  set: "playful",
  ratio: 1,
  w: 0.22,
  render: () => <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />,
}));

/** Torn edge along the top and bottom of a w x h strip. */
function tornRect(w: number, h: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const top: string[] = [];
  const bottom: string[] = [];
  const step = 8;
  for (let x = 0; x <= w; x += step) top.push(`${x} ${(rnd() * 5).toFixed(1)}`);
  for (let x = w; x >= 0; x -= step) bottom.push(`${x} ${(h - rnd() * 5).toFixed(1)}`);
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

function paper(id: string, ratio: number, w: number, body: (ids: Ids) => ReactNode): Preset {
  return {
    id,
    set: "paper",
    ratio,
    w,
    render: (ids) => (
      <svg viewBox={`0 0 200 ${200 * ratio}`} width="100%" height="100%" aria-hidden>
        <defs>
          <Grain id={ids("grain")} strength={0.3} freq={0.7} tint="0.35 0.28 0.2" />
        </defs>
        <g filter={`url(#${ids("grain")})`}>{body(ids)}</g>
      </svg>
    ),
  };
}

const PAPER: Preset[] = [
  paper("paper-kraft", 0.62, 0.36, () => <path d={tornRect(200, 124, 7)} fill="#d8b98e" />),
  paper("paper-lined", 0.7, 0.36, (ids) => (
    <>
      <defs>
        <pattern id={ids("lines")} width="200" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 15.5h200" stroke="#bcd0e8" strokeWidth="1" />
        </pattern>
      </defs>
      <path d={tornRect(200, 140, 3)} fill="#fffdf6" />
      <path d={tornRect(200, 140, 3)} fill={`url(#${ids("lines")})`} />
      <path d="M28 0v140" stroke="#f2a7bd" strokeWidth="1.5" />
    </>
  )),
  paper("paper-grid", 0.8, 0.32, (ids) => (
    <>
      <defs>
        <pattern id={ids("grid")} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0V14H0" fill="none" stroke="#cfe0cf" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="200" height="160" fill="#f6fbf3" />
      <rect width="200" height="160" fill={`url(#${ids("grid")})`} />
    </>
  )),
  paper("paper-label", 1, 0.24, () => (
    <>
      <circle cx="100" cy="100" r="96" fill="#fdf3d8" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="#e0a960" strokeWidth="3" strokeDasharray="6 7" />
    </>
  )),
  paper("paper-tape-stripe", 0.24, 0.42, (ids) => (
    <>
      <defs>
        <pattern id={ids("st")} width="18" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="9" height="48" fill="#f7c9d4" />
          <rect x="9" width="9" height="48" fill="#fdeef2" />
        </pattern>
      </defs>
      <path d="M0 4 6 0 12 5 18 0 24 4V44L18 48 12 43 6 48 0 44ZM176 4 182 0 188 5 194 0 200 4V44L194 48 188 43 182 48 176 44Z" fill={`url(#${ids("st")})`} opacity="0.9" />
      <rect x="20" y="0" width="160" height="48" fill={`url(#${ids("st")})`} opacity="0.9" />
    </>
  )),
  paper("paper-tape-dots", 0.24, 0.42, (ids) => (
    <>
      <defs>
        <pattern id={ids("dt")} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#cfe4fb" />
          <circle cx="6" cy="6" r="2.2" fill="#fff" />
        </pattern>
      </defs>
      <path d="M0 4 8 0 16 5 24 0 176 0 184 5 192 0 200 4 200 44 192 48 184 43 176 48 24 48 16 43 8 48 0 44Z" fill={`url(#${ids("dt")})`} opacity="0.9" />
    </>
  )),
  paper("paper-heart", 0.92, 0.26, () => (
    <path d="M100 178S10 122 10 62a46 46 0 0190-14 46 46 0 0190 14c0 60-90 116-90 116z" fill="#f3b3a6" />
  )),
  paper("paper-star", 0.96, 0.26, () => (
    <path d="M100 8l26 56 62 7-46 42 13 61-55-31-55 31 13-61-46-42 62-7z" fill="#f5dc8a" strokeLinejoin="round" />
  )),
];

export const PRESETS: Preset[] = [...PLAYFUL, ...ICON_PRESETS, ...PAPER];
const BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function presetById(id: string | undefined) {
  return id ? BY_ID.get(id) : undefined;
}

/** Renders a preset; ids stay unique per instance so gradients and filters don't collide. */
export function PresetArt({ id }: { id: string }) {
  const uid = useId().replace(/:/g, "");
  const p = presetById(id);
  if (!p) return null;
  return <>{p.render((name) => `${uid}-${name}`)}</>;
}

/** The Figma "IG / home" layout: centers and widths in artboard pixels (402 wide). */
const DEFAULT_LAYOUT: { id: string; cx: number; cy: number; w: number; rot: number }[] = [
  { id: "squiggle", cx: 201, cy: 504, w: 402, rot: 0 },
  { id: "pill", cx: 104, cy: 145, w: 196, rot: 31 },
  { id: "asterisk", cx: 314, cy: 197, w: 186, rot: -6 },
  { id: "arrow", cx: 98, cy: 407, w: 160, rot: 0 },
  { id: "bubble", cx: 304, cy: 446, w: 196, rot: -16 },
  { id: "cloud", cx: 209, cy: 712, w: 262, rot: 0 },
];

export function defaultItems(): BoardItem[] {
  return DEFAULT_LAYOUT.map((d, i) => ({
    id: `preset-${d.id}`,
    source: "preset",
    presetId: d.id,
    x: d.cx / BOARD_W,
    y: d.cy / BOARD_W,
    w: d.w / BOARD_W,
    rot: d.rot,
    z: i + 1,
  }));
}
