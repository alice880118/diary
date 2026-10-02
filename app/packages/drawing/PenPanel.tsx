import type { BrushKind } from "../db/types";

export type PenTool = BrushKind | "eraser" | "select";

export interface PenState {
  tool: PenTool;
  color: string;
  width: number;
  opacity: number;
}
