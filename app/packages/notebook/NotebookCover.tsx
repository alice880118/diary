import { t } from "../i18n";
import type { CSSProperties } from "react";
import { coverOf } from "./covers";

/**
 * Paper notebook cover. `width` in px, or "fluid" to fill the parent's width
 * (the label then scales with the cover). `bare` hides the name label.
 */
export function NotebookCover({
  cover,
  name,
  width = 130,
  bare = false,
  className,
  style,
}: {
  cover: string;
  name: string;
  width?: number | "fluid";
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const c = coverOf(cover);
  const fluid = width === "fluid";
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: fluid ? "100%" : width,
        ...(fluid ? { aspectRatio: "1 / 1.33", containerType: "inline-size" } : { height: width * 1.33 }),
        borderRadius: "4px 12px 12px 4px",
        boxShadow:
          "inset 6px 0 0 rgba(0,0,0,0.12), inset 8px 0 6px rgba(255,255,255,0.12), 0 6px 14px rgba(40,30,20,0.18)",
        overflow: "hidden",
        ...c.style,
        ...style,
      }}
    >
      {bare ? null : (
        <div
          style={{
            position: "absolute",
            left: "14%",
            right: "9%",
            top: "22%",
            padding: fluid ? "7% 4px" : "8px 6px",
            background: "rgba(255,253,248,0.92)",
            borderRadius: 4,
            textAlign: "center",
            fontSize: fluid ? "clamp(10px, 10.5cqi, 14px)" : Math.max(10, Math.min(16, width * 0.105)),
            fontWeight: 600,
            color: "#3a332c",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          }}
        >
          {name || t("Untitled")}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "12%",
          bottom: "12%",
          width: 5,
          background: "rgba(0,0,0,0.1)",
        }}
      />
    </div>
  );
}
