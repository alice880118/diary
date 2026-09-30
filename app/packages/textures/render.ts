import { TEXTURE_SEED, textureById } from "./catalog";

interface HeightEntry {
  key: string;
  height: Float32Array;
}

const heightCache: HeightEntry[] = [];
const MAX_CACHE = 5;

/** Height map in [0,1] for w x h pixels at s pixels per texture unit (cached). */
export function textureHeight(id: string, w: number, h: number, s: number): Float32Array {
  const key = `${id}|${w}|${h}|${s}`;
  const hit = heightCache.findIndex((e) => e.key === key);
  if (hit >= 0) {
    const [e] = heightCache.splice(hit, 1);
    heightCache.unshift(e);
    return e.height;
  }
  const def = textureById(id);
  const raw = def.gen(w, h, s, TEXTURE_SEED);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }
  const span = max - min || 1;
  for (let i = 0; i < raw.length; i++) raw[i] = (raw[i] - min) / span;
  heightCache.unshift({ key, height: raw });
  if (heightCache.length > MAX_CACHE) heightCache.pop();
  return raw;
}

/** White paper shaded by a top-left light over the height map. */
export function shadeTexture(
  id: string,
  strength: number,
  w: number,
  h: number,
  s: number,
): ImageData {
  const def = textureById(id);
  const hm = textureHeight(id, w, h, s);
  const img = new ImageData(w, h);
  const d = img.data;
  const k = def.relief * strength * 55 * s;
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : y;
    const y1 = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : x;
      const x1 = x < w - 1 ? x + 1 : x;
      const i = y * w + x;
      const gx = hm[y * w + x1] - hm[y * w + x0];
      const gy = hm[y1 * w + x] - hm[y0 * w + x];
      let b = 247 + (gx + gy) * 0.5 * k + (hm[i] - 0.5) * 7 * strength;
      if (b > 255) b = 255;
      if (b < 200) b = 200;
      const o = i * 4;
      d[o] = Math.min(255, b + 2.5);
      d[o + 1] = Math.min(255, b + 1.2);
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  return img;
}

export function textureCanvas(id: string, strength: number, w: number, h: number, s: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")?.putImageData(shadeTexture(id, strength, w, h, s), 0, 0);
  return c;
}

const thumbCache = new Map<string, string>();

export function textureThumb(id: string, size = 120): string {
  const key = `${id}|${size}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const url = textureCanvas(id, 0.9, size, size, 1).toDataURL("image/png");
  thumbCache.set(key, url);
  return url;
}
