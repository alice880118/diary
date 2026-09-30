import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { useAssetUrl } from "../db/assetUrl";
import {
  NOTE_BASE,
  type ImageObject,
  type LinkObject,
  type NoteObject,
  type PageObject,
  type StickerObject,
  type TextObject,
} from "../db/types";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import type { PeelState } from "../sticker/geometry";
import { StickerArt } from "../sticker/StickerArt";
import { fontStack } from "./fonts";

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
      {o.text || <span style={{ opacity: 0.35 }}>Enter text</span>}
    </div>
  );
});

export function ImageView({ o }: { o: ImageObject }) {
  const { url, missing } = useAssetUrl(o.assetId);
  if (missing) {
    return <div className="sticker-missing" style={{ position: "absolute", inset: 0 }}>Missing image</div>;
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
  { id: "#fff3a6", label: "Yellow" },
  { id: "#ffd6df", label: "Pink" },
  { id: "#cfe8ff", label: "Blue" },
  { id: "#d8f5c8", label: "Green" },
  { id: "#e8d3b0", label: "Kraft" },
  { id: "#fffdf6", label: "White" },
];

export const NOTE_SHAPES = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "torn", label: "Torn" },
  { id: "cloud", label: "Cloud" },
] as const;

export const NOTE_FIXES = [
  { id: "tape", label: "Tape" },
  { id: "pin", label: "Pin" },
  { id: "top", label: "Top edge" },
] as const;

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
          background:
            "repeating-linear-gradient(45deg, rgba(245,205,160,0.78) 0 8px, rgba(250,225,190,0.78) 8px 16px)",
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

export function LinkView({ o }: { o: LinkObject }) {
  const title = o.title || o.meta?.siteTitle || linkHost(o.url);
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
