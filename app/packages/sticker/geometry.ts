export interface PeelState {
  /** Unit vector pointing toward the lifted side (local sticker coords). */
  ux: number;
  uy: number;
  /** Folded depth in local units measured from the far edge. */
  amount: number;
  /** 0..1 lift used for shadow strength. */
  lift: number;
}

type Pt = [number, number];

/** Sutherland–Hodgman clip of the box [0,w]x[0,h] by dot(p - c, u) <= t (or >= t). */
export function clipBox(
  w: number,
  h: number,
  ux: number,
  uy: number,
  t: number,
  keepLess: boolean,
): Pt[] {
  const cx = w / 2;
  const cy = h / 2;
  const f = (p: Pt) => {
    const d = (p[0] - cx) * ux + (p[1] - cy) * uy - t;
    return keepLess ? -d : d;
  };
  const poly: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) {
      out.push(a);
    }
    if ((fa >= 0) !== (fb >= 0)) {
      const k = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

export function polygonCss(pts: Pt[]): string {
  if (pts.length < 3) {
    return "polygon(0 0, 0 0, 0 0)";
  }
  return `polygon(${pts.map((p) => `${p[0].toFixed(2)}px ${p[1].toFixed(2)}px`).join(", ")})`;
}

export function maxExtent(w: number, h: number, ux: number, uy: number) {
  return Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
}

/** CSS matrix reflecting local points across the fold line. */
export function reflectMatrix(w: number, h: number, ux: number, uy: number, t: number) {
  const k = (w / 2) * ux + (h / 2) * uy + t;
  const a = 1 - 2 * ux * ux;
  const b = -2 * ux * uy;
  const d = 1 - 2 * uy * uy;
  return `matrix(${a}, ${b}, ${b}, ${d}, ${2 * k * ux}, ${2 * k * uy})`;
}

/** CSS linear-gradient angle for a direction vector in screen coords. */
export function cssAngle(ux: number, uy: number) {
  return (Math.atan2(ux, -uy) * 180) / Math.PI;
}
