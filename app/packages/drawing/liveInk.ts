import { newId } from "../db/id";
import type { BrushKind, Stroke } from "../db/types";
import type { PenState, PenTool } from "./PenPanel";

function brushOf(tool: PenTool): BrushKind {
  return tool === "marker" || tool === "pencil" ? tool : "pen";
}
import { drawStroke, simplifyPoints } from "./strokes";

/**
 * Draws the in-progress stroke on a dedicated overlay canvas so only one
 * stroke is repainted per frame, keeping input latency low.
 */
export class LiveInk {
  private points: number[] = [];
  private raf = 0;
  private readonly id = newId("st");

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Backing pixels per surface unit. */
    private readonly scale: number,
    private readonly pen: PenState,
  ) {}

  add(x: number, y: number) {
    this.points.push(x, y);
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.paint();
      });
    }
  }

  private previewStroke(): Stroke {
    const erase = this.pen.tool === "eraser";
    return {
      id: this.id,
      mode: "draw",
      brush: brushOf(this.pen.tool),
      color: erase ? "#fffdf8" : this.pen.color,
      width: this.pen.width,
      opacity: erase ? 0.9 : this.pen.opacity,
      points: this.points,
    };
  }

  private paint() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    drawStroke(ctx, this.previewStroke());
  }

  clear() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  finish(): Stroke | null {
    this.clear();
    if (this.points.length < 2) return null;
    const erase = this.pen.tool === "eraser";
    return {
      id: this.id,
      mode: erase ? "erase" : "draw",
      brush: brushOf(this.pen.tool),
      color: this.pen.color,
      width: this.pen.width,
      opacity: this.pen.opacity,
      points: simplifyPoints(this.points),
    };
  }
}
