/**
 * Path utilities and the after-the-fact Auto Smooth pass. Pure functions on
 * flat [x0, y0, x1, y1, ...] lists; pressure (if any) is carried along.
 */
export type SmoothLevel = "off" | "low" | "medium" | "high";

export const SMOOTH_LEVELS: SmoothLevel[] = ["off", "low", "medium", "high"];

export function pathLength(pts: number[]) {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** Evenly spaced points along the path (keeps both ends). */
export function resample(pts: number[], step: number, pressure?: number[]) {
  const n = pts.length / 2;
  if (n < 2 || step <= 0) return { pts: pts.slice(), pressure: pressure?.slice() };
  const out = [pts[0], pts[1]];
  const outP = pressure ? [pressure[0]] : undefined;
  let carry = 0;
  for (let i = 1; i < n; i++) {
    const ax = pts[(i - 1) * 2];
    const ay = pts[(i - 1) * 2 + 1];
    const bx = pts[i * 2];
    const by = pts[i * 2 + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    let t = step - carry;
    while (t <= seg) {
      const u = seg ? t / seg : 0;
      out.push(ax + (bx - ax) * u, ay + (by - ay) * u);
      if (outP && pressure) outP.push(pressure[i - 1] + (pressure[i] - pressure[i - 1]) * u);
      t += step;
    }
    carry = seg - (t - step);
  }
  const lx = pts[pts.length - 2];
  const ly = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 2] - lx, out[out.length - 1] - ly) > step * 0.25) {
    out.push(lx, ly);
    if (outP && pressure) outP.push(pressure[n - 1]);
  } else {
    out[out.length - 2] = lx;
    out[out.length - 1] = ly;
  }
  return { pts: out, pressure: outP };
}

/** Exactly `count` evenly spaced points (used for morph animations). */
export function resampleCount(pts: number[], count: number): number[] {
  const L = pathLength(pts);
  if (L === 0 || count < 2) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(pts[0], pts[1]);
    return out;
  }
  let r = resample(pts, L / (count - 1)).pts;
  while (r.length / 2 < count) r = r.concat(r.slice(-2));
  return r.slice(0, count * 2);
}

const SMOOTH: Record<Exclude<SmoothLevel, "off">, { radius: number; passes: number; maxShift: number }> = {
  // radius in resampled points; maxShift as a fraction of the stroke's size.
  low: { radius: 2, passes: 1, maxShift: 0.012 },
  medium: { radius: 3, passes: 2, maxShift: 0.022 },
  high: { radius: 5, passes: 3, maxShift: 0.035 },
};

/**
 * Smooths a finished freehand path without changing its intent: ends stay
 * pinned and no point moves further than a small fraction of the stroke size.
 */
export function autoSmooth(pts: number[], level: SmoothLevel, pressure?: number[]) {
  if (level === "off" || pts.length < 10) return { pts, pressure };
  const cfg = SMOOTH[level];
  const L = pathLength(pts);
  const step = Math.max(1.5, Math.min(6, L / 120));
  const r = resample(pts, step, pressure);
  const src = r.pts;
  const n = src.length / 2;
  if (n < 5) return { pts, pressure };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < src.length; i += 2) {
    minX = Math.min(minX, src[i]);
    maxX = Math.max(maxX, src[i]);
    minY = Math.min(minY, src[i + 1]);
    maxY = Math.max(maxY, src[i + 1]);
  }
  const limit = Math.max(1.5, Math.hypot(maxX - minX, maxY - minY) * cfg.maxShift);
  let cur = src.slice();
  for (let pass = 0; pass < cfg.passes; pass++) {
    const next = cur.slice();
    for (let i = 1; i < n - 1; i++) {
      // Shrink the window near the ends so the endpoints are not dragged inward.
      const rad = Math.min(cfg.radius, i, n - 1 - i);
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let k = -rad; k <= rad; k++) {
        const w = rad + 1 - Math.abs(k);
        sx += cur[(i + k) * 2] * w;
        sy += cur[(i + k) * 2 + 1] * w;
        sw += w;
      }
      next[i * 2] = sx / sw;
      next[i * 2 + 1] = sy / sw;
    }
    cur = next;
  }
  for (let i = 0; i < n; i++) {
    const dx = cur[i * 2] - src[i * 2];
    const dy = cur[i * 2 + 1] - src[i * 2 + 1];
    const d = Math.hypot(dx, dy);
    if (d > limit) {
      cur[i * 2] = src[i * 2] + (dx / d) * limit;
      cur[i * 2 + 1] = src[i * 2 + 1] + (dy / d) * limit;
    }
  }
  const keep = simplifyIndices(cur, 0.35);
  return {
    pts: keep.flatMap((i) => [Math.round(cur[i * 2] * 10) / 10, Math.round(cur[i * 2 + 1] * 10) / 10]),
    pressure: r.pressure ? keep.map((i) => Math.round((r.pressure as number[])[i] * 100) / 100) : undefined,
  };
}

/** Ramer–Douglas–Peucker; returns the kept point indices. */
export function simplifyIndices(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const bx = pts[b * 2];
    const by = pts[b * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i * 2 + 1]) - (ax - pts[i * 2]) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
