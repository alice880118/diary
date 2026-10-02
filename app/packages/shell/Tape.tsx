import type { CSSProperties } from "react";
import type { TapePattern } from "../db/types";
import { tapeFill } from "../page/ObjectViews";

/** Decorative washi tape strip, positioned by the caller. */
export function Tape({ pattern = "stripe", color, style }: { pattern?: TapePattern; color?: string; style?: CSSProperties }) {
  return <span className="deco-tape" aria-hidden style={{ background: tapeFill(pattern, color), ...style }} />;
}
