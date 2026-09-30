export class RemovalCancelled extends Error {
  constructor() {
    super("Background removal canceled.");
  }
}

type Rgb = [number, number, number];

function dist2(d: Uint8ClampedArray, i: number, c: Rgb) {
  const r = d[i] - c[0];
  const g = d[i + 1] - c[1];
  const b = d[i + 2] - c[2];
  return r * r + g * g + b * b;
}

/** Most common border colours (quantised), used as background candidates. */
function borderPalette(d: Uint8ClampedArray, w: number, h: number): Rgb[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 16) return;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += d[i];
    e.g += d[i + 1];
    e.b += d[i + 2];
    buckets.set(key, e);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  const total = 2 * (w + h);
  return [...buckets.values()]
    .filter((e) => e.n > total * 0.04)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((e) => [e.r / e.n, e.g / e.n, e.b / e.n] as Rgb);
}

/**
 * Local, offline background removal: flood fill from the image border over
 * pixels close to the dominant border colours. Returns an alpha mask
 * (255 = keep). Never changes image colours.
 */
export async function removeBackground(
  img: ImageData,
  tolerance: number,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<Uint8ClampedArray> {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const bg = new Uint8Array(n);
  const palette = borderPalette(d, w, h);
  const tol = (18 + tolerance * 1.4) ** 2;
  const stepTol = (8 + tolerance * 0.6) ** 2;
  const isBgColor = (i4: number) => {
    if (d[i4 + 3] < 16) return true;
    for (const c of palette) {
      if (dist2(d, i4, c) <= tol) return true;
    }
    return false;
  };

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (p: number) => {
    if (!bg[p] && isBgColor(p * 4)) {
      bg[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }

  const CHUNK = 60000;
  while (head < tail) {
    const stop = Math.min(tail, head + CHUNK);
    while (head < stop) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      const p4 = p * 4;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbors) {
        if (q < 0 || bg[q]) continue;
        const q4 = q * 4;
        const dr = d[q4] - d[p4];
        const dg = d[q4 + 1] - d[p4 + 1];
        const db = d[q4 + 2] - d[p4 + 2];
        if (isBgColor(q4) && dr * dr + dg * dg + db * db <= stepTol * 4) {
          bg[q] = 1;
          queue[tail++] = q;
        }
      }
      if (tail >= n) break;
    }
    onProgress(Math.min(0.9, tail / n));
    await new Promise((r) => setTimeout(r, 0));
    if (signal.aborted) throw new RemovalCancelled();
  }

  // Soften the edge by one pixel so cut-outs are not jagged.
  const mask = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) mask[i] = bg[i] ? 0 : 255;
  const soft = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = y + oy;
        if (yy < 0 || yy >= h) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          if (xx < 0 || xx >= w) continue;
          sum += mask[yy * w + xx];
          cnt++;
        }
      }
      soft[y * w + x] = sum / cnt;
    }
    if (y % 128 === 0) {
      onProgress(0.9 + (0.1 * y) / h);
      await new Promise((r) => setTimeout(r, 0));
      if (signal.aborted) throw new RemovalCancelled();
    }
  }
  onProgress(1);
  return soft;
}

export function maskToCanvas(mask: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a canvas.");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = mask[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
