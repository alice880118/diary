/**
 * Realtime stroke stabilizer: filters pointer positions while the user is
 * drawing. Velocity-aware exponential smoothing: slow, careful movement is
 * smoothed the most (that is where hand tremor shows), fast flicks follow
 * the pointer closely so the line never lags far behind the finger.
 */
export type StabilizerLevel = "off" | "medium" | "strong";

export const STABILIZER_LEVELS: StabilizerLevel[] = ["off", "medium", "strong"];

const PARAMS: Record<Exclude<StabilizerLevel, "off">, { base: number; gain: number }> = {
  // base: follow factor at rest; gain: extra follow per screen px/ms of speed.
  medium: { base: 0.38, gain: 0.35 },
  strong: { base: 0.16, gain: 0.18 },
};

export class Stabilizer {
  private sx = 0;
  private sy = 0;
  private lt = 0;
  private started = false;
  private readonly level: StabilizerLevel;
  /** Surface units per screen pixel, so speed is measured on screen. */
  private readonly unitsPerPx: number;

  constructor(level: StabilizerLevel, unitsPerPx = 1) {
    this.level = level;
    this.unitsPerPx = unitsPerPx;
  }

  /** Returns the stabilized point for a raw input point. */
  push(x: number, y: number, t: number): [number, number] {
    if (!this.started || this.level === "off") {
      this.started = true;
      this.sx = x;
      this.sy = y;
      this.lt = t;
      return [x, y];
    }
    const p = PARAMS[this.level];
    const dt = Math.max(1, t - this.lt);
    this.lt = t;
    const distPx = Math.hypot(x - this.sx, y - this.sy) / this.unitsPerPx;
    const speed = distPx / dt;
    const k = Math.min(1, p.base + speed * p.gain);
    this.sx += (x - this.sx) * k;
    this.sy += (y - this.sy) * k;
    return [this.sx, this.sy];
  }

  /** Points that ease the smoothed position onto the final raw point. */
  finish(x: number, y: number): number[] {
    if (this.level === "off" || !this.started) return [];
    const d = Math.hypot(x - this.sx, y - this.sy);
    if (d < 0.5) return [];
    const n = Math.min(6, Math.max(1, Math.round(d / 4)));
    const out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      out.push(this.sx + (x - this.sx) * u, this.sy + (y - this.sy) * u);
    }
    this.sx = x;
    this.sy = y;
    return out;
  }
}
