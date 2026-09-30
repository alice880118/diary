import { memo, type CSSProperties, type ReactNode } from "react";
import { PAGE_H, PAGE_W, type Page, type PageObject } from "../db/types";
import { StrokeCanvas } from "../drawing/StrokeCanvas";
import { ObjectBody, objectFrameStyle } from "./ObjectViews";
import { PageBackground } from "./PageBackground";
import "./page.css";

export function sortByZ(objects: PageObject[]) {
  return [...objects].sort((a, b) => a.z - b.z);
}

/**
 * A page drawn in fixed 900x1200 page units and scaled to `width` px, so the
 * stored layout never depends on the device screen.
 */
export const PageSurface = memo(function PageSurface({
  page,
  width,
  thumb = false,
  swayKey = 0,
  still = true,
  onObjectClick,
  hideObjectIds,
  hideInk = false,
  children,
  style,
}: {
  page: Page;
  width: number;
  thumb?: boolean;
  swayKey?: number;
  still?: boolean;
  onObjectClick?: (o: PageObject) => void;
  hideObjectIds?: Set<string>;
  hideInk?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const scale = width / PAGE_W;
  return (
    <div
      className={`page-surface${thumb ? " is-thumb" : ""}`}
      style={{ width, height: width * (PAGE_H / PAGE_W), ...style }}
    >
      <div className="page-inner" style={{ transform: `scale(${scale})` }}>
        <PageBackground style={page.style} date={page.date} />
        {sortByZ(page.objects).map((o) =>
          hideObjectIds?.has(o.id) ? null : (
            <div
              key={o.id}
              style={{
                ...objectFrameStyle(o),
                cursor: onObjectClick && o.type === "link" ? "pointer" : undefined,
              }}
              onClick={onObjectClick ? () => onObjectClick(o) : undefined}
            >
              <ObjectBody o={o} swayKey={swayKey} still={still} pixelScale={scale} />
            </div>
          ),
        )}
        {hideInk ? null : (
          <StrokeCanvas
            strokes={page.ink}
            w={PAGE_W}
            h={PAGE_H}
            pixelWidth={width}
            style={{ zIndex: 10000 }}
          />
        )}
        {children}
      </div>
      {thumb ? null : <div className="page-spine" />}
    </div>
  );
});
