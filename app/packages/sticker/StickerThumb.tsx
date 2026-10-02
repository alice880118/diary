import type { Sticker } from "../db/types";
import { latestVersion } from "./snap";
import { StickerArt } from "./StickerArt";
import { t } from "../i18n";

export function StickerThumb({ sticker, size = 72 }: { sticker: Sticker; size?: number }) {
  const v = latestVersion(sticker);
  if (!v) {
    return <div className="muted small">{t("No version")}</div>;
  }
  const k = Math.min(size / v.w, size / v.h);
  return (
    <div style={{ position: "relative", width: v.w * k, height: v.h * k }}>
      <StickerArt
        artAssetId={v.artAssetId}
        shapeAssetId={v.shapeAssetId}
        material={v.material}
        w={v.w * k}
        h={v.h * k}
        angle={v.holoAngle}
      />
    </div>
  );
}
