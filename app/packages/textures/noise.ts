export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Lattice value noise in [0,1]; deterministic for a given seed. */
export function valueNoise(seed: number) {
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash2(ix, iy, seed);
    const b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed);
    const d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function fbm(
  n: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  gain = 0.5,
) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += n(x * f + i * 17.3, y * f - i * 9.1) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

/** Distance to nearest jittered feature point (cellular / Worley), in cell units. */
export function cellular(seed: number) {
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let best = 9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox;
        const cy = iy + oy;
        const px = cx + hash2(cx, cy, seed);
        const py = cy + hash2(cx, cy, seed + 101);
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  };
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function fract(x: number) {
  return x - Math.floor(x);
}
