import type { CSSProperties } from "react";
import { coverOf } from "./covers";

export function NotebookCover({
  cover,
  name,
  width = 130,
  style,
}: {
  cover: string;
  name: string;
  width?: number;
  style?: CSSProperties;
}) {
  const c = coverOf(cover);
  return (
    <div
      style={{
        position: "relative",
        width,
        height: width * 1.33,
        borderRadius: "4px 12px 12px 4px",
        boxShadow:
          "inset 6px 0 0 rgba(0,0,0,0.12), inset 8px 0 6px rgba(255,255,255,0.12), 0 6px 14px rgba(40,30,20,0.22)",
        overflow: "hidden",
        ...c.style,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "16%",
          right: "10%",
          top: "22%",
          padding: "8px 6px",
          background: "rgba(255,253,248,0.9)",
          borderRadius: 4,
          textAlign: "center",
          fontSize: Math.max(11, width / 9),
          fontWeight: 600,
          color: "#3a332c",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
        }}
      >
        {name || "Untitled"}
      </div>
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
