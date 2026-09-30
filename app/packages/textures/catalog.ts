import { cellular, fbm, fract, mulberry32, smoothstep, valueNoise } from "./noise";

export type TextureCategory = "watercolor" | "geometric" | "vintage" | "handmade" | "fine";

export const TEXTURE_CATEGORIES: { id: TextureCategory; label: string }[] = [
  { id: "watercolor", label: "Watercolor" },
  { id: "geometric", label: "Geometric" },
  { id: "vintage", label: "Vintage" },
  { id: "handmade", label: "Handmade" },
  { id: "fine", label: "Fine" },
];

/** Height generator: w x h output pixels, s = pixels per texture unit. */
type Gen = (w: number, h: number, s: number, seed: number) => Float32Array;

export interface TextureDef {
  id: string;
  name: string;
  category: TextureCategory;
  /** Relief amplitude used when shading the height map. */
  relief: number;
  gen: Gen;
}

function field(w: number, h: number, s: number, fn: (u: number, v: number) => number) {
  const out = new Float32Array(w * h);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const v = y / s;
    for (let x = 0; x < w; x++) {
      out[i++] = fn(x / s, v);
    }
  }
  return out;
}

interface FiberOpts {
  density: number;
  len: [number, number];
  width: [number, number];
  alpha: [number, number];
  bend: number;
}

/** Fibers drawn in texture units so 1x and 2x renders share the same layout. */
function fibers(w: number, h: number, s: number, seed: number, o: FiberOpts) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const out = new Float32Array(w * h);
  if (!ctx) return out;
  const rnd = mulberry32(seed);
  const uw = w / s;
  const uh = h / s;
  const count = Math.round((o.density * uw * uh) / (1024 * 1024));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const x = rnd() * uw;
    const y = rnd() * uh;
    const a = rnd() * Math.PI * 2;
    const len = o.len[0] + rnd() * (o.len[1] - o.len[0]);
    const bend = (rnd() - 0.5) * o.bend * len;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const mx = (x + ex) / 2 - Math.sin(a) * bend;
    const my = (y + ey) / 2 + Math.cos(a) * bend;
    ctx.strokeStyle = `rgba(255,255,255,${o.alpha[0] + rnd() * (o.alpha[1] - o.alpha[0])})`;
    ctx.lineWidth = o.width[0] + rnd() * (o.width[1] - o.width[0]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4] / 255;
  }
  return out;
}

function mix(a: Float32Array, b: Float32Array, wa: number, wb: number) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * wa + b[i] * wb;
  return out;
}

const n = valueNoise;

export const TEXTURES: TextureDef[] = [
  /* ---------- Watercolor ---------- */
  {
    id: "wc-fine",
    name: "Fine watercolor",
    category: "watercolor",
    relief: 0.9,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => fbm(a, u / 3, v / 3, 3, 0.55));
    },
  },
  {
    id: "wc-rough",
    name: "Rough watercolor",
    category: "watercolor",
    relief: 2.2,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => {
        const f = fbm(a, u / 16, v / 16, 4, 0.55);
        return 1 - Math.abs(f * 2 - 1);
      });
    },
  },
  {
    id: "wc-cold",
    name: "Cold-press",
    category: "watercolor",
    relief: 1.6,
    gen: (w, h, s, seed) => {
      const c = cellular(seed);
      const a = n(seed + 3);
      return field(w, h, s, (u, v) => smoothstep(0, 0.9, c(u / 9, v / 9)) * 0.8 + a(u / 2, v / 2) * 0.2);
    },
  },
  {
    id: "wc-granule",
    name: "Granulating",
    category: "watercolor",
    relief: 1.4,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const b = n(seed + 7);
      return field(w, h, s, (u, v) => {
        const pit = smoothstep(0.72, 0.9, b(u / 1.6, v / 1.6));
        return fbm(a, u / 6, v / 6, 2) * 0.7 - pit * 0.5 + 0.3;
      });
    },
  },
  {
    id: "wc-soft",
    name: "Soft wash",
    category: "watercolor",
    relief: 2.6,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => fbm(a, u / 70, v / 70, 3, 0.45));
    },
  },
  {
    id: "wc-fiber",
    name: "Fibrous",
    category: "watercolor",
    relief: 1.2,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const base = field(w, h, s, (u, v) => fbm(a, u / 5, v / 5, 3));
      const f = fibers(w, h, s, seed + 1, { density: 900, len: [10, 30], width: [0.6, 1.2], alpha: [0.2, 0.5], bend: 0.3 });
      return mix(base, f, 0.7, 0.5);
    },
  },

  /* ---------- Geometric emboss ---------- */
  {
    id: "geo-dot",
    name: "Dot screen",
    category: "geometric",
    relief: 2.4,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const dx = fract(u / 24) - 0.5;
        const dy = fract(v / 24) - 0.5;
        return 1 - smoothstep(0.12, 0.24, Math.hypot(dx, dy));
      }),
  },
  {
    id: "geo-grid",
    name: "Grid",
    category: "geometric",
    relief: 2.2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const gx = Math.abs(fract(u / 28) - 0.5);
        const gy = Math.abs(fract(v / 28) - 0.5);
        return smoothstep(0.42, 0.49, Math.max(gx, gy));
      }),
  },
  {
    id: "geo-diamond",
    name: "Diamond",
    category: "geometric",
    relief: 2.2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const d = Math.abs(fract(u / 36) - 0.5) + Math.abs(fract(v / 36) - 0.5);
        return smoothstep(0.4, 0.48, d) * (1 - smoothstep(0.5, 0.56, d)) + smoothstep(0.1, 0.02, d) * 0.6;
      }),
  },
  {
    id: "geo-circle",
    name: "Ripple rings",
    category: "geometric",
    relief: 2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const dx = fract(u / 44) - 0.5;
        const dy = fract(v / 44) - 0.5;
        const r = Math.hypot(dx, dy);
        return r > 0.48 ? 0 : 0.5 + 0.5 * Math.cos(r * Math.PI * 12);
      }),
  },
  {
    id: "geo-wave",
    name: "Wave",
    category: "geometric",
    relief: 2.2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const y = v / 18 + Math.sin(u / 22) * 0.9;
        return smoothstep(0.35, 0.5, Math.abs(fract(y) - 0.5));
      }),
  },
  {
    id: "geo-line",
    name: "Ribbed",
    category: "geometric",
    relief: 1.8,
    gen: (w, h, s) => field(w, h, s, (u) => 0.5 + 0.5 * Math.cos((u / 9) * Math.PI * 2)),
  },
  {
    id: "geo-weave",
    name: "Basket weave",
    category: "geometric",
    relief: 2.4,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const cu = Math.floor(u / 20);
        const cv = Math.floor(v / 20);
        const fu = fract(u / 20);
        const fv = fract(v / 20);
        const horizontal = (cu + cv) % 2 === 0;
        const t = horizontal ? fv : fu;
        return Math.sin(t * Math.PI) * (horizontal ? 0.9 + 0.1 * Math.sin(fu * Math.PI) : 0.9 + 0.1 * Math.sin(fv * Math.PI));
      }),
  },
  {
    id: "geo-patch",
    name: "Patchwork",
    category: "geometric",
    relief: 2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const cu = Math.floor(u / 64);
        const cv = Math.floor(v / 64);
        const fu = fract(u / 64);
        const fv = fract(v / 64);
        const seam = smoothstep(0.46, 0.5, Math.max(Math.abs(fu - 0.5), Math.abs(fv - 0.5)));
        const kind = (cu * 3 + cv * 5) % 3;
        const stripe =
          kind === 0 ? fract(u / 8) : kind === 1 ? fract(v / 8) : fract((u + v) / 11);
        return (1 - seam) * (0.35 + 0.35 * Math.sin(stripe * Math.PI * 2)) + seam * 0.05;
      }),
  },

  /* ---------- Vintage print paper ---------- */
  {
    id: "vp-mottle",
    name: "Mottled",
    category: "vintage",
    relief: 1.3,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const b = n(seed + 5);
      return field(w, h, s, (u, v) => fbm(a, u / 30, v / 30, 3) * 0.6 + smoothstep(0.6, 0.8, b(u / 7, v / 7)) * 0.4);
    },
  },
  {
    id: "vp-ink",
    name: "Ink stain",
    category: "vintage",
    relief: 1.5,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const b = n(seed + 9);
      return field(w, h, s, (u, v) => {
        const stain = smoothstep(0.62, 0.7, fbm(b, u / 90, v / 90, 3));
        const ring = smoothstep(0.6, 0.62, fbm(b, u / 90, v / 90, 3)) - stain;
        return 0.5 + (a(u / 2, v / 2) - 0.5) * 0.4 - stain * 0.2 + ring * 0.6;
      });
    },
  },
  {
    id: "vp-coarse",
    name: "Coarse",
    category: "vintage",
    relief: 2,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const b = n(seed + 2);
      return field(w, h, s, (u, v) => fbm(a, u / 4, v / 4, 3, 0.6) * 0.8 + smoothstep(0.85, 0.95, b(u / 3, v / 3)) * 0.5);
    },
  },
  {
    id: "vp-finegrain",
    name: "Fine grain",
    category: "vintage",
    relief: 0.9,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => a(u / 1.2, v / 1.2) * 0.8 + a(u / 12 + 50, v / 12) * 0.2);
    },
  },
  {
    id: "vp-oldfiber",
    name: "Aged fiber",
    category: "vintage",
    relief: 1.1,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const base = field(w, h, s, (u, v) => fbm(a, u / 40, v / 40, 3));
      const f = fibers(w, h, s, seed + 4, { density: 500, len: [20, 60], width: [0.5, 1], alpha: [0.25, 0.6], bend: 0.5 });
      return mix(base, f, 0.6, 0.6);
    },
  },
  {
    id: "vp-laid",
    name: "Laid",
    category: "vintage",
    relief: 1.4,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => {
        const laid = 0.5 + 0.5 * Math.cos((v / 4.5) * Math.PI * 2);
        const chain = 1 - smoothstep(0, 1.6, Math.abs(fract(u / 90) * 90 - 45));
        return laid * 0.55 + chain * 0.5 + (a(u / 3, v / 3) - 0.5) * 0.2;
      });
    },
  },

  /* ---------- Handmade fiber paper ---------- */
  {
    id: "hf-long",
    name: "Long fiber",
    category: "handmade",
    relief: 1.6,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const base = field(w, h, s, (u, v) => fbm(a, u / 20, v / 20, 2));
      const f = fibers(w, h, s, seed + 1, { density: 700, len: [60, 180], width: [0.6, 1.6], alpha: [0.3, 0.7], bend: 0.6 });
      return mix(base, f, 0.35, 0.85);
    },
  },
  {
    id: "hf-short",
    name: "Short fiber",
    category: "handmade",
    relief: 1.5,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const base = field(w, h, s, (u, v) => fbm(a, u / 10, v / 10, 2));
      const f = fibers(w, h, s, seed + 2, { density: 5000, len: [4, 12], width: [0.6, 1.3], alpha: [0.3, 0.7], bend: 0.4 });
      return mix(base, f, 0.35, 0.8);
    },
  },
  {
    id: "hf-cotton",
    name: "Cotton fluff",
    category: "handmade",
    relief: 1.8,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const b = n(seed + 11);
      return field(w, h, s, (u, v) => {
        const clump = smoothstep(0.5, 0.75, fbm(b, u / 14, v / 14, 4, 0.6));
        return clump * 0.8 + a(u / 2.5, v / 2.5) * 0.2;
      });
    },
  },
  {
    id: "hf-natural",
    name: "Irregular",
    category: "handmade",
    relief: 2,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const base = field(w, h, s, (u, v) => {
        const t = fbm(a, u / 45, v / 45, 4, 0.6);
        return smoothstep(0.3, 0.7, t);
      });
      const f = fibers(w, h, s, seed + 6, { density: 1200, len: [15, 70], width: [0.8, 2], alpha: [0.2, 0.55], bend: 0.8 });
      return mix(base, f, 0.6, 0.55);
    },
  },
  {
    id: "hf-soft",
    name: "Soft ripple",
    category: "handmade",
    relief: 1.6,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => {
        const warp = fbm(a, u / 60, v / 60, 3) * 8;
        return 0.5 + 0.5 * Math.sin(v / 7 + warp);
      });
    },
  },
  {
    id: "hf-mixed",
    name: "Mixed fiber",
    category: "handmade",
    relief: 1.7,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      const flecks = n(seed + 13);
      const base = field(w, h, s, (u, v) => fbm(a, u / 12, v / 12, 2) * 0.6 + smoothstep(0.9, 0.97, flecks(u / 5, v / 5)) * 0.8);
      const long = fibers(w, h, s, seed + 7, { density: 300, len: [60, 150], width: [0.8, 1.6], alpha: [0.3, 0.6], bend: 0.7 });
      const short = fibers(w, h, s, seed + 8, { density: 2500, len: [4, 14], width: [0.6, 1.2], alpha: [0.25, 0.6], bend: 0.4 });
      return mix(mix(base, long, 1, 0.6), short, 1, 0.5);
    },
  },

  /* ---------- Fine surface ---------- */
  {
    id: "fn-smooth",
    name: "Smooth",
    category: "fine",
    relief: 0.6,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => fbm(a, u / 8, v / 8, 3));
    },
  },
  {
    id: "fn-linen",
    name: "Linen",
    category: "fine",
    relief: 0.9,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => {
        const x = 0.5 + 0.5 * Math.sin(u * 1.3 + a(u / 30, v / 30) * 3);
        const y = 0.5 + 0.5 * Math.sin(v * 1.3 + a(u / 30 + 9, v / 30) * 3);
        return x * 0.5 + y * 0.5;
      });
    },
  },
  {
    id: "fn-dot",
    name: "Fine dots",
    category: "fine",
    relief: 1.2,
    gen: (w, h, s) =>
      field(w, h, s, (u, v) => {
        const dx = fract(u / 9 + (Math.floor(v / 9) % 2) * 0.5) - 0.5;
        const dy = fract(v / 9) - 0.5;
        return 1 - smoothstep(0.08, 0.2, Math.hypot(dx, dy));
      }),
  },
  {
    id: "fn-low",
    name: "Low contrast",
    category: "fine",
    relief: 0.35,
    gen: (w, h, s, seed) => {
      const a = n(seed);
      return field(w, h, s, (u, v) => fbm(a, u / 25, v / 25, 4, 0.6));
    },
  },
];

export const TEXTURE_SEED = 20260930;

export function textureById(id: string): TextureDef {
  return TEXTURES.find((t) => t.id === id) ?? TEXTURES[TEXTURES.length - 4];
}
