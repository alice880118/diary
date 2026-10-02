import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useAssetUrl } from "../db/assetUrl";
import {
  NOTE_BASE,
  type ImageObject,
  type LinkObject,
  type NoteObject,
  type PageObject,
  type LinkShape,
  type StickerObject,
  type TapePattern,
  type TextObject,
} from "../db/types";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import type { PeelState } from "../sticker/geometry";
import { StickerArt } from "../sticker/StickerArt";
import { fontStack } from "./fonts";
import { t } from "../i18n";

export function objectFrameStyle(o: PageObject): CSSProperties {
  return {
    position: "absolute",
    left: o.x - o.w / 2,
    top: o.y - o.h / 2,
    width: o.w,
    height: o.h,
    transform: `rotate(${o.rot}deg)`,
    zIndex: o.z,
  };
}

export const TextView = forwardRef<HTMLDivElement, { o: TextObject }>(function TextView(
  { o },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: o.w,
        fontFamily: fontStack(o.font),
        fontSize: o.size,
        lineHeight: 1.45,
        color: o.color,
        textAlign: o.align,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {o.text || <span style={{ opacity: 0.35 }}>{t("Enter text")}</span>}
    </div>
  );
});

export function ImageView({ o }: { o: ImageObject }) {
  const { url, missing } = useAssetUrl(o.assetId);
  if (missing) {
    return <div className="sticker-missing" style={{ position: "absolute", inset: 0 }}>{t("Missing image")}</div>;
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        padding: 8,
        boxShadow: "0 3px 10px rgba(40,30,20,0.22)",
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : null}
    </div>
  );
}

export function StickerView({
  o,
  peel,
  angle,
}: {
  o: StickerObject;
  peel?: PeelState | null;
  angle?: number;
}) {
  return (
    <StickerArt
      artAssetId={o.snap.artAssetId}
      shapeAssetId={o.snap.shapeAssetId}
      material={o.snap.material}
      w={o.w}
      h={o.h}
      angle={angle ?? o.snap.holoAngle + o.rot}
      peel={peel}
    />
  );
}

export const NOTE_COLORS = [
  { id: "#fff3a6", get label() { return t("Yellow"); } },
  { id: "#ffd6df", get label() { return t("Pink"); } },
  { id: "#cfe8ff", get label() { return t("Blue"); } },
  { id: "#d8f5c8", get label() { return t("Green"); } },
  { id: "#e8d3b0", get label() { return t("Kraft"); } },
  { id: "#fffdf6", get label() { return t("White"); } },
];

export const NOTE_SHAPES = [
  { id: "square", get label() { return t("Square"); } },
  { id: "rounded", get label() { return t("Rounded"); } },
  { id: "torn", get label() { return t("Torn"); } },
  { id: "cloud", get label() { return t("Cloud"); } },
] as const;

export const NOTE_FIXES = [
  { id: "tape", get label() { return t("Tape"); } },
  { id: "pin", get label() { return t("Pin"); } },
  { id: "top", get label() { return t("Top edge"); } },
] as const;

/** Original (v1) tape, used whenever a note has no tapePattern. */
const LEGACY_TAPE =
  "repeating-linear-gradient(45deg, rgba(245,205,160,0.78) 0 8px, rgba(250,225,190,0.78) 8px 16px)";

export const TAPE_COLORS = ["#f3b48b", "#f2a7bd", "#f4d774", "#a8d8b9", "#9cc7ef", "#c3b1e6", "#d7b98e", "#bdbdbd"];

export const TAPE_PATTERNS: { id: TapePattern; label: string }[] = [
  { id: "solid", get label() { return t("Solid"); } },
  { id: "stripe", get label() { return t("Stripe"); } },
  { id: "diagonal", get label() { return t("Diagonal"); } },
  { id: "dots", get label() { return t("Dots"); } },
  { id: "gingham", get label() { return t("Gingham"); } },
  { id: "grid", get label() { return t("Grid"); } },
  { id: "wave", get label() { return t("Wave"); } },
  { id: "stars", get label() { return t("Stars"); } },
  { id: "hearts", get label() { return t("Hearts"); } },
  { id: "floral", get label() { return t("Floral"); } },
];

/** Washi-tape fill: a light motif over the tape color (made translucent by the caller). */
function tapeBackground(o: NoteObject): string {
  return o.tapePattern ? tapeFill(o.tapePattern, o.tapeColor) : LEGACY_TAPE;
}

export function tapeFill(pattern: TapePattern, color?: string): string {
  const base = color || TAPE_COLORS[0];
  const m = "rgba(255,255,255,0.55)";
  const glyph = (ch: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='17'><text x='9' y='13' font-size='11' text-anchor='middle' fill='white' fill-opacity='0.7'>${ch}</text></svg>`,
    )}") 0 0/18px 17px`;
  switch (pattern) {
    case "stripe":
      return `repeating-linear-gradient(90deg, ${m} 0 5px, transparent 5px 12px), ${base}`;
    case "diagonal":
      return `repeating-linear-gradient(45deg, ${m} 0 6px, transparent 6px 14px), ${base}`;
    case "dots":
      return `radial-gradient(${m} 2.5px, transparent 3px) 0 0/12px 12px, ${base}`;
    case "gingham":
      return `repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 7px, transparent 7px 14px), repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 7px, transparent 7px 14px), ${base}`;
    case "grid":
      return `linear-gradient(${m} 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, ${m} 1px, transparent 1px) 0 0/10px 10px, ${base}`;
    case "wave":
      return `radial-gradient(circle at 50% 0, transparent 5px, ${m} 5.5px 7px, transparent 7.5px) 0 0/14px 10px, ${base}`;
    case "stars":
      return `${glyph("★")}, ${base}`;
    case "hearts":
      return `${glyph("♥")}, ${base}`;
    case "floral":
      return `${glyph("✿")}, ${base}`;
    default:
      return base;
  }
}

function noteShapeStyle(o: NoteObject): CSSProperties {
  switch (o.shape) {
    case "rounded":
      return { borderRadius: 26 };
    case "torn": {
      const teeth: string[] = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        teeth.push(`${(i / n) * 100}% ${i % 2 === 0 ? 100 : 95}%`);
      }
      return { clipPath: `polygon(0 0, 100% 0, ${teeth.reverse().join(", ")})` };
    }
    case "cloud":
      return { borderRadius: "46% 54% 44% 56% / 52% 44% 56% 48%" };
    default:
      return { borderRadius: 3 };
  }
}

function Fixture({ o }: { o: NoteObject }) {
  const ax = o.anchor.x * o.w;
  const ay = o.anchor.y * o.h;
  if (o.fix === "pin") {
    return (
      <div
        style={{
          position: "absolute",
          left: ax - 13,
          top: ay - 13,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #ff9c8a, #d2553f 55%, #8e2a1c)",
          boxShadow: "2px 4px 5px rgba(0,0,0,0.35)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />
    );
  }
  if (o.fix === "tape") {
    return (
      <div
        style={{
          position: "absolute",
          left: ax - 55,
          top: ay - 17,
          width: 110,
          height: 34,
          transform: "rotate(-7deg)",
          background: tapeBackground(o),
          opacity: o.tapePattern ? 0.82 : undefined,
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />
    );
  }
  return null;
}

/**
 * Sticky note. The fixture stays put while the note body sways around the
 * anchor; sway is purely visual and never changes the stored position.
 */
export function NoteView({
  o,
  swayKey,
  still,
  pixelScale,
}: {
  o: NoteObject;
  swayKey: number;
  still: boolean;
  pixelScale: number;
}) {
  const origin =
    o.fix === "top" ? `${o.anchor.x * 100}% 0%` : `${o.anchor.x * 100}% ${o.anchor.y * 100}%`;
  const animate = !still && swayKey > 0 && o.sway > 0;
  const amp = (o.fix === "top" ? 26 : 7) * o.sway;
  const bodyStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: o.color,
    boxShadow: "0 4px 10px rgba(40,30,20,0.2)",
    transformOrigin: origin,
    ...noteShapeStyle(o),
    ...(animate
      ? ({
          animation: `${o.fix === "top" ? "note-flutter" : "note-sway"} 1.7s cubic-bezier(.3,.6,.4,1) 70ms both`,
          "--amp": `${amp}deg`,
        } as CSSProperties)
      : null),
  };
  const s = o.w / NOTE_BASE;
  return (
    <>
      <div key={animate ? swayKey : "still"} style={bodyStyle}>
        {o.fix === "top" ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 18,
              background: "linear-gradient(rgba(0,0,0,0.07), rgba(255,255,255,0.15))",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: `${o.fix === "top" ? 26 : 22}px 18px 18px`,
            fontSize: o.textSize,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            overflow: "hidden",
            color: "#3a332c",
            fontFamily: fontStack("hand"),
          }}
        >
          {o.text}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: NOTE_BASE,
            height: (NOTE_BASE * o.h) / o.w,
            transform: `scale(${s})`,
            transformOrigin: "0 0",
          }}
        >
          <StrokeCanvas
            strokes={o.strokes}
            w={NOTE_BASE}
            h={(NOTE_BASE * o.h) / o.w}
            pixelWidth={o.w * pixelScale}
          />
        </div>
      </div>
      <Fixture o={o} />
    </>
  );
}

export function linkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export const LINK_COLORS = ["#f08a6c", "#f2b84b", "#7cc29a", "#6aa4e8", "#a68be0", "#1b1b1b"];

export const LINK_SHAPE_IDS: LinkShape[] = ["circle", "square", "triangle", "hexagon", "star"];

const LINK_SHAPES: Record<LinkShape, (c: string) => ReactNode> = {
  circle: (c) => <circle cx="32" cy="32" r="28" fill={c} />,
  square: (c) => <rect x="5" y="5" width="54" height="54" rx="10" fill={c} />,
  triangle: (c) => <path d="M32 4l29 52H3z" fill={c} stroke={c} strokeWidth="4" strokeLinejoin="round" />,
  hexagon: (c) => <path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill={c} stroke={c} strokeWidth="3" strokeLinejoin="round" />,
  star: (c) => (
    <path
      d="M32 4l8.2 17.6 19.3 2.3-14.2 13.2 3.7 19.1L32 46.8 15 56.2l3.7-19.1L4.5 23.9l19.3-2.3z"
      fill={c}
      stroke={c}
      strokeWidth="3"
      strokeLinejoin="round"
    />
  ),
};

export function LinkSticker({
  shape = "circle",
  color,
  label,
  arrow = true,
  style,
}: {
  shape?: LinkShape;
  color?: string;
  label?: string;
  arrow?: boolean;
  style?: CSSProperties;
}) {
  const draw = LINK_SHAPES[shape] ?? LINK_SHAPES.circle;
  return (
    <svg
      viewBox="0 0 64 64"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: "block", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.15))", ...style }}
    >
      {draw(color || LINK_COLORS[0])}
      {arrow ? (
        <g transform={`translate(${shape === "triangle" ? "22 26" : "22 22"}) scale(.85)`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M9 7h8v8" />
        </g>
      ) : null}
    </svg>
  );
}

export function LinkView({ o }: { o: LinkObject }) {
  const title = o.title || o.meta?.siteTitle || linkHost(o.url);
  if (o.display === "sticker") {
    return (
      <LinkSticker
        shape={o.shape}
        color={o.color}
        label={title}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    );
  }
  if (o.display === "tag") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          background: "#fff",
          border: "2px solid #e3e3e0",
          borderRadius: 999,
          fontSize: 24,
          color: "#1b1b1b",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden>🔗</span>
        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        {title !== linkHost(o.url) ? (
          <span style={{ color: "#7a7a7a", fontSize: 20, flex: "0 0 auto" }}>{linkHost(o.url)}</span>
        ) : null}
      </div>
    );
  }
  if (o.display === "text") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 30,
          color: "#2c5aa0",
          textDecoration: "underline",
          textUnderlineOffset: 5,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        <span aria-hidden>🔗</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      </div>
    );
  }
  const img = o.meta?.status === "ok" ? o.meta.image : undefined;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        background: "#fff",
        border: "2px solid #e2d9cb",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 3px 8px rgba(40,30,20,0.12)",
      }}
    >
      {img ? (
        <img
          src={img}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: "34%", objectFit: "cover", background: "#eee" }}
        />
      ) : (
        <div
          style={{
            width: "26%",
            background: "#efe8dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
          }}
        >
          🔗
        </div>
      )}
      <div style={{ flex: 1, padding: "14px 18px", minWidth: 0 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#2f2a25",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {o.meta?.description ? (
          <div style={{ fontSize: 20, color: "#6f665c", marginTop: 6, maxHeight: 56, overflow: "hidden" }}>
            {o.meta.description}
          </div>
        ) : null}
        <div style={{ fontSize: 20, color: "#2c5aa0", marginTop: 8 }}>
          {linkHost(o.url)}
          {o.meta?.status === "loading" ? " · Loading…" : ""}
        </div>
      </div>
    </div>
  );
}

export function ObjectBody({
  o,
  swayKey = 0,
  still = true,
  pixelScale = 1,
  peel,
  holoAngle,
  textRef,
}: {
  o: PageObject;
  swayKey?: number;
  still?: boolean;
  pixelScale?: number;
  peel?: PeelState | null;
  holoAngle?: number;
  textRef?: (el: HTMLDivElement | null) => void;
}): ReactNode {
  switch (o.type) {
    case "text":
      return <TextView o={o} ref={textRef} />;
    case "image":
      return <ImageView o={o} />;
    case "sticker":
      return <StickerView o={o} peel={peel} angle={holoAngle} />;
    case "note":
      return <NoteView o={o} swayKey={swayKey} still={still} pixelScale={pixelScale} />;
    case "link":
      return <LinkView o={o} />;
  }
}
