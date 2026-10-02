import type { CSSProperties } from "react";
import { useAssetUrl } from "../db/assetUrl";
import type { StickerMaterial } from "../db/types";
import {
  clipBox,
  cssAngle,
  maxExtent,
  polygonCss,
  reflectMatrix,
  type PeelState,
} from "./geometry";
import { t } from "../i18n";

export const MATERIALS: { id: StickerMaterial; label: string; hint: string }[] = [
  { id: "clear", get label() { return t("Clear"); }, get hint() { return t("Unprinted areas show the paper beneath, with a subtle film sheen."); } },
  { id: "holo", get label() { return t("Holo"); }, get hint() { return t("Opaque iridescent base that shimmers as you drag."); } },
  { id: "white", get label() { return t("White"); }, get hint() { return t("Opaque white backing inside the cut line."); } },
];

export const HOLO_ANGLE_DEG = 115;
export const HOLO_SIZE = 3.2;
export const HOLO_STOPS: [number, string][] = [
  [0, "#ffb3de"],
  [0.18, "#ffe89a"],
  [0.34, "#a6f7d2"],
  [0.5, "#9fd0ff"],
  [0.66, "#d9b2ff"],
  [0.82, "#ffb3de"],
  [1, "#fff1a8"],
];

export function holoPos(angle: number) {
  return {
    p: 50 + 45 * Math.sin((angle * Math.PI) / 180),
    q: 50 + 45 * Math.cos((angle * Math.PI) / 90),
  };
}

export function holoBackground(angle: number): CSSProperties {
  const { p, q } = holoPos(angle);
  const stops = HOLO_STOPS.map(([t, c]) => `${c} ${t * 100}%`).join(", ");
  return {
    backgroundImage: `linear-gradient(${HOLO_ANGLE_DEG}deg, ${stops})`,
    backgroundSize: `${HOLO_SIZE * 100}% ${HOLO_SIZE * 100}%`,
    backgroundPosition: `${p}% ${q}%`,
  };
}

function sheen(material: StickerMaterial, angle: number): CSSProperties {
  const pos = 50 + 48 * Math.sin((angle * Math.PI) / 180 + 0.6);
  if (material === "holo") {
    return {
      backgroundImage:
        "linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.75) 38%, rgba(160,220,255,0.5) 46%, transparent 60%), linear-gradient(60deg, rgba(255,120,200,0.25), rgba(120,255,220,0.25), rgba(140,160,255,0.25))",
      backgroundSize: "260% 260%, 100% 100%",
      backgroundPosition: `${pos}% 50%, 0 0`,
      mixBlendMode: "color-dodge",
      opacity: 0.55,
    };
  }
  return {
    backgroundImage:
      "linear-gradient(120deg, transparent 32%, rgba(255,255,255,0.7) 46%, transparent 58%)",
    backgroundSize: "260% 260%",
    backgroundPosition: `${pos}% 50%`,
    mixBlendMode: "screen",
    opacity: material === "clear" ? 0.55 : 0.35,
  };
}

function maskStyle(url: string): CSSProperties {
  const v = `url("${url}")`;
  return {
    WebkitMaskImage: v,
    maskImage: v,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

const FILL: CSSProperties = { position: "absolute", inset: 0 };

function FaceLayers({
  shapeUrl,
  artUrl,
  material,
  angle,
}: {
  shapeUrl: string;
  artUrl: string;
  material: StickerMaterial;
  angle: number;
}) {
  const base: CSSProperties =
    material === "holo"
      ? holoBackground(angle)
      : material === "white"
        ? { background: "#fffefa" }
        : { background: "rgba(255,255,255,0.2)" };
  return (
    <>
      <div style={{ ...FILL, ...maskStyle(shapeUrl), ...base }} />
      <img
        src={artUrl}
        alt=""
        draggable={false}
        style={{ ...FILL, width: "100%", height: "100%", pointerEvents: "none" }}
      />
      <div style={{ ...FILL, ...maskStyle(shapeUrl), ...sheen(material, angle) }} />
    </>
  );
}

function BackLayers({
  shapeUrl,
  artUrl,
  material,
  gradAngle,
}: {
  shapeUrl: string;
  artUrl: string;
  material: StickerMaterial;
  gradAngle: number;
}) {
  const shade = `linear-gradient(${gradAngle}deg, rgba(0,0,0,0.18) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0.5) 80%, rgba(0,0,0,0.05) 100%)`;
  if (material === "clear") {
    return (
      <>
        <img
          src={artUrl}
          alt=""
          draggable={false}
          style={{ ...FILL, width: "100%", height: "100%", opacity: 0.45 }}
        />
        <div
          style={{
            ...FILL,
            ...maskStyle(shapeUrl),
            background: `rgba(255,255,255,0.35)`,
            backgroundImage: shade,
          }}
        />
      </>
    );
  }
  return (
    <div
      style={{
        ...FILL,
        ...maskStyle(shapeUrl),
        background: material === "holo" ? "#e9e7ef" : "#f3efe7",
        backgroundImage: shade,
      }}
    />
  );
}

/**
 * Sticker rendering in local box units (w x h). The peel folds the lifted side
 * across a line perpendicular to the peel direction and shows the backing.
 */
export function StickerArt({
  artAssetId,
  shapeAssetId,
  ...rest
}: {
  artAssetId: string;
  shapeAssetId: string;
  material: StickerMaterial;
  w: number;
  h: number;
  angle: number;
  peel?: PeelState | null;
  flat?: boolean;
}) {
  const art = useAssetUrl(artAssetId);
  const shape = useAssetUrl(shapeAssetId);

  if (art.missing || shape.missing) {
    return (
      <div className="sticker-missing" style={{ ...FILL }}>
        {t("Missing asset")}
      </div>
    );
  }
  if (!art.url || !shape.url) {
    return null;
  }
  return <StickerArtView artUrl={art.url} shapeUrl={shape.url} {...rest} />;
}

export function StickerArtView({
  artUrl,
  shapeUrl,
  material,
  w,
  h,
  angle,
  peel,
  flat = false,
}: {
  artUrl: string;
  shapeUrl: string;
  material: StickerMaterial;
  w: number;
  h: number;
  angle: number;
  peel?: PeelState | null;
  /** Skip shadows (thumbnails). */
  flat?: boolean;
}) {
  const art = { url: artUrl };
  const shape = { url: shapeUrl };
  const lift = peel?.lift ?? 0;
  const shadow = flat
    ? undefined
    : material === "clear"
      ? `drop-shadow(0 0 0.8px rgba(60,50,40,0.45)) drop-shadow(0 ${1 + lift * 8}px ${1.5 + lift * 10}px rgba(40,30,20,${0.12 + lift * 0.18}))`
      : `drop-shadow(0 ${1 + lift * 8}px ${1.5 + lift * 10}px rgba(40,30,20,${0.22 + lift * 0.2}))`;

  const amount = peel ? Math.max(0, peel.amount) : 0;
  if (!peel || amount < 0.5) {
    return (
      <div style={{ ...FILL, filter: shadow }}>
        <FaceLayers shapeUrl={shape.url} artUrl={art.url} material={material} angle={angle} />
      </div>
    );
  }

  const { ux, uy } = peel;
  const t = maxExtent(w, h, ux, uy) - amount;
  const flatClip = polygonCss(clipBox(w, h, ux, uy, t, true));
  const flapClip = polygonCss(clipBox(w, h, ux, uy, t, false));
  const reflect = reflectMatrix(w, h, ux, uy, t);
  const gradAngle = cssAngle(ux, uy);

  return (
    <div style={{ ...FILL }}>
      <div style={{ ...FILL, filter: shadow }}>
        <div style={{ ...FILL, clipPath: flatClip, WebkitClipPath: flatClip }}>
          <FaceLayers shapeUrl={shape.url} artUrl={art.url} material={material} angle={angle} />
        </div>
      </div>
      <div
        style={{
          ...FILL,
          transformOrigin: "0 0",
          transform: reflect,
          filter: "drop-shadow(0 2px 3px rgba(30,20,10,0.35))",
        }}
      >
        <div style={{ ...FILL, clipPath: flapClip, WebkitClipPath: flapClip }}>
          <BackLayers
            shapeUrl={shape.url}
            artUrl={art.url}
            material={material}
            gradAngle={gradAngle}
          />
        </div>
      </div>
    </div>
  );
}
