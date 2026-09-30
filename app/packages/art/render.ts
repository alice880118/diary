import { ART_H, ART_W, type Artwork, type ImageLayer, type PrintLayer } from "../db/types";
import { drawStrokes } from "../drawing/strokes";
import { fbm, smoothstep, valueNoise } from "../textures/noise";
import { shadeTexture, textureHeight } from "../textures/render";
import { createCanvas, ctx2d, maskHasContent, type ArtRuntime } from "./runtime";

/** Image layer after mask and crop, drawn into artwork space. */
function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  l: ImageLayer,
  rt: ArtRuntime,
  scale: number,
) {
  const img = rt.images.get(l.workAssetId);
  if (!img) return;
  const tmp = createCanvas(l.imgW, l.imgH);
  const t = ctx2d(tmp);
  t.drawImage(img, 0, 0, l.imgW, l.imgH);
  const mask = rt.imageMasks.get(l.id);
  if (mask) {
    t.globalCompositeOperation = "destination-in";
    t.drawImage(mask, 0, 0, l.imgW, l.imgH);
  }
  const sx = l.crop.l * l.imgW;
  const sy = l.crop.t * l.imgH;
  const sw = Math.max(1, l.imgW * (1 - l.crop.l - l.crop.r));
  const sh = Math.max(1, l.imgH * (1 - l.crop.t - l.crop.b));
  ctx.save();
  ctx.translate(l.x * scale, l.y * scale);
  ctx.rotate((l.rot * Math.PI) / 180);
  ctx.scale(l.scale * scale, l.scale * scale);
  ctx.drawImage(tmp, sx, sy, sw, sh, -l.imgW / 2 + sx, -l.imgH / 2 + sy, sw, sh);
  ctx.restore();
}

/** Draw layers composited on transparent background (the "original" art). */
export function renderSource(art: Artwork, rt: ArtRuntime, scale = 1, onlyLayerId?: string) {
  const out = createCanvas(ART_W * scale, ART_H * scale);
  const ctx = ctx2d(out);
  const layerCanvas = createCanvas(out.width, out.height);
  const lctx = ctx2d(layerCanvas);
  for (const l of art.layers) {
    if (!l.visible && l.id !== onlyLayerId) continue;
    if (onlyLayerId && l.id !== onlyLayerId) continue;
    if (l.kind === "draw") {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      lctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawStrokes(lctx, l.strokes);
      ctx.drawImage(layerCanvas, 0, 0);
    } else {
      drawImageLayer(ctx, l, rt, scale);
    }
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

interface FactorEntry {
  key: string;
  data: Float32Array;
}
const factorCache: FactorEntry[] = [];

/**
 * Per-layer ink modulation (grain specks, uneven coverage, paper relief).
 * Sampled in artwork units with the layer's fixed seed, so preview and
 * export at any scale produce the same pattern.
 */
function inkFactor(p: PrintLayer, textureId: string, w: number, h: number, scale: number) {
  const key = `${p.seed}|${p.grain}|${p.unevenness}|${p.paperShow}|${textureId}|${w}|${scale}`;
  const hit = factorCache.find((e) => e.key === key);
  if (hit) return hit.data;
  const speck = valueNoise(p.seed);
  const uneven = valueNoise(p.seed + 1);
  const height = p.paperShow > 0 ? textureHeight(textureId, w, h, scale) : null;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / scale;
    for (let x = 0; x < w; x++) {
      const u = x / scale;
      const i = y * w + x;
      let f = 1;
      if (p.grain > 0) {
        f *= 1 - p.grain * 0.7 * smoothstep(0.45, 0.95, speck(u / 1.4, v / 1.4));
      }
      if (p.unevenness > 0) {
        f *= 1 - p.unevenness * 0.55 * fbm(uneven, u / 36, v / 36, 3);
      }
      if (height) {
        f *= 1 - p.paperShow * 0.8 * (1 - height[i]);
      }
      out[i] = f;
    }
  }
  factorCache.unshift({ key, data: out });
  if (factorCache.length > 8) factorCache.pop();
  return out;
}

export interface InkPlane {
  layer: PrintLayer;
  alpha: Float32Array;
  rgb: [number, number, number];
}

export function usablePrintLayers(art: Artwork, rt: ArtRuntime) {
  return art.print.layers.filter((p) => p.visible && maskHasContent(rt.printMasks.get(p.id)));
}

export function usesPrint(art: Artwork, rt: ArtRuntime) {
  return art.print.enabled && usablePrintLayers(art, rt).length > 0;
}

export function inkPlanes(art: Artwork, rt: ArtRuntime, scale: number, only?: string): InkPlane[] {
  const w = Math.round(ART_W * scale);
  const h = Math.round(ART_H * scale);
  const planes: InkPlane[] = [];
  const tmp = createCanvas(w, h);
  const t = ctx2d(tmp);
  for (const p of art.print.layers) {
    if (only ? p.id !== only : !p.visible) continue;
    const mask = rt.printMasks.get(p.id);
    if (!mask) continue;
    t.clearRect(0, 0, w, h);
    t.imageSmoothingEnabled = true;
    t.drawImage(mask, p.offset.dx * scale, p.offset.dy * scale, w, h);
    const md = t.getImageData(0, 0, w, h).data;
    const f = inkFactor(p, art.texture.id, w, h, scale);
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = (md[i * 4 + 3] / 255) * p.density * f[i];
    }
    planes.push({ layer: p, alpha, rgb: hexToRgb(p.color) });
  }
  return planes;
}

/**
 * Transparent inks: each layer multiplies the light passing through it, so
 * overlaps mix (yellow over blue reads green) instead of covering.
 */
export function compositeInks(planes: InkPlane[], w: number, h: number, paper: ImageData | null) {
  const out = new ImageData(w, h);
  const d = out.data;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    let tr = 1;
    let tg = 1;
    let tb = 1;
    let clear = 1;
    for (const p of planes) {
      const a = p.alpha[i];
      if (a <= 0) continue;
      tr *= 1 - a * (1 - p.rgb[0]);
      tg *= 1 - a * (1 - p.rgb[1]);
      tb *= 1 - a * (1 - p.rgb[2]);
      clear *= 1 - a;
    }
    const o = i * 4;
    if (paper) {
      d[o] = paper.data[o] * tr;
      d[o + 1] = paper.data[o + 1] * tg;
      d[o + 2] = paper.data[o + 2] * tb;
      d[o + 3] = 255;
    } else {
      const A = 1 - clear;
      if (A < 0.004) {
        d[o + 3] = 0;
        continue;
      }
      d[o] = Math.max(0, Math.min(255, (1 - (1 - tr) / A) * 255));
      d[o + 1] = Math.max(0, Math.min(255, (1 - (1 - tg) / A) * 255));
      d[o + 2] = Math.max(0, Math.min(255, (1 - (1 - tb) / A) * 255));
      d[o + 3] = A * 255;
    }
  }
  return out;
}

const paperCache: { key: string; img: ImageData }[] = [];

export function renderPaper(art: Artwork, scale = 1) {
  const w = Math.round(ART_W * scale);
  const h = Math.round(ART_H * scale);
  const key = `${art.texture.id}|${art.texture.strength}|${scale}`;
  const hit = paperCache.find((e) => e.key === key);
  if (hit) return hit.img;
  const img = shadeTexture(art.texture.id, art.texture.strength, w, h, scale);
  paperCache.unshift({ key, img });
  if (paperCache.length > 3) paperCache.pop();
  return img;
}

/** Paper with the original drawing on top (draft view). */
export function renderDraft(art: Artwork, rt: ArtRuntime, scale = 1) {
  const out = createCanvas(ART_W * scale, ART_H * scale);
  const ctx = ctx2d(out);
  ctx.putImageData(renderPaper(art, scale), 0, 0);
  ctx.drawImage(renderSource(art, rt, scale), 0, 0);
  return out;
}

export function renderSingleInk(art: Artwork, rt: ArtRuntime, layerId: string, scale = 1) {
  const w = Math.round(ART_W * scale);
  const h = Math.round(ART_H * scale);
  const out = createCanvas(w, h);
  ctx2d(out).putImageData(compositeInks(inkPlanes(art, rt, scale, layerId), w, h, renderPaper(art, scale)), 0, 0);
  return out;
}

/**
 * Finished artwork. With print layers the ink composite replaces the source
 * art; otherwise the source art is used as-is.
 */
export function renderFinal(
  art: Artwork,
  rt: ArtRuntime,
  scale = 1,
  opts: { keepPaper: boolean },
): HTMLCanvasElement {
  const w = Math.round(ART_W * scale);
  const h = Math.round(ART_H * scale);
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  if (usesPrint(art, rt)) {
    const planes = inkPlanes(art, rt, scale);
    const paper = opts.keepPaper ? renderPaper(art, scale) : null;
    ctx.putImageData(compositeInks(planes, w, h, paper), 0, 0);
    return out;
  }
  if (opts.keepPaper) {
    ctx.putImageData(renderPaper(art, scale), 0, 0);
  }
  ctx.drawImage(renderSource(art, rt, scale), 0, 0);
  return out;
}

/** Alpha coverage of the printed/drawn content (for contour crops). */
export function contentCanvas(art: Artwork, rt: ArtRuntime, scale = 1) {
  return renderFinal(art, rt, scale, { keepPaper: false });
}
