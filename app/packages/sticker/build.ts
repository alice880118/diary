import { renderFinal } from "../art/render";
import { createCanvas, ctx2d, type ArtRuntime } from "../art/runtime";
import { canvasToBlob } from "../db/assetUrl";
import { ART_H, ART_W, type Artwork, type StickerMaterial } from "../db/types";
import { HOLO_ANGLE_DEG, HOLO_SIZE, HOLO_STOPS, holoPos } from "./StickerArt";

/** Union of the source shifted around a circle = morphological dilation. */
function dilate(src: HTMLCanvasElement, r: number): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = ctx2d(out);
  ctx.drawImage(src, 0, 0);
  if (r <= 0.5) return out;
  const rings = r > 6 ? [r, r * 0.66, r * 0.33] : [r, r * 0.5];
  for (const rr of rings) {
    const steps = Math.max(12, Math.ceil(rr * 1.6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  return out;
}

/** Hard alpha threshold so shapes have crisp, opaque interiors. */
function solidify(c: HTMLCanvasElement, threshold: number) {
  const ctx = ctx2d(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = a >= threshold ? 255 : a >= threshold * 0.5 ? (a - threshold * 0.5) * (510 / threshold) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function cropBaseShape(art: Artwork, rt: ArtRuntime, scale: number, content?: HTMLCanvasElement) {
  const w = Math.round(ART_W * scale);
  const h = Math.round(ART_H * scale);
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  const crop = art.sticker.crop;
  ctx.fillStyle = "#fff";
  if (crop.kind === "rect") {
    const r = crop.rect;
    roundRect(ctx, r.x * scale, r.y * scale, r.w * scale, r.h * scale, 18 * scale);
    ctx.fill();
  } else if (crop.kind === "circle") {
    const r = crop.rect;
    ctx.beginPath();
    ctx.ellipse((r.x + r.w / 2) * scale, (r.y + r.h / 2) * scale, (r.w / 2) * scale, (r.h / 2) * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (crop.kind === "manual" && crop.poly.length >= 6) {
    ctx.beginPath();
    ctx.moveTo(crop.poly[0] * scale, crop.poly[1] * scale);
    for (let i = 2; i < crop.poly.length; i += 2) {
      ctx.lineTo(crop.poly[i] * scale, crop.poly[i + 1] * scale);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    const src = content ?? renderFinal(art, rt, scale, { keepPaper: false });
    ctx.drawImage(src, 0, 0);
    solidify(c, 40);
  }
  return c;
}

function alphaBounds(c: HTMLCanvasElement) {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
  let minX = c.width;
  let minY = c.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropCanvas(c: HTMLCanvasElement, b: { x: number; y: number; w: number; h: number }) {
  const out = createCanvas(b.w, b.h);
  ctx2d(out).drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return out;
}

export interface BuiltSticker {
  art: HTMLCanvasElement;
  shape: HTMLCanvasElement;
  /** Size in artwork units. */
  w: number;
  h: number;
}

/**
 * The shape is the die-cut outline (base crop dilated by the border); the art
 * is the finished artwork clipped to the base crop. Paper is kept or removed
 * independently from the shape so the design itself is never cut away.
 */
export function buildSticker(art: Artwork, rt: ArtRuntime, scale = 1): BuiltSticker {
  const s = art.sticker;
  const content = renderFinal(art, rt, scale, { keepPaper: false });
  const base = cropBaseShape(art, rt, scale, content);
  const shape = solidify(dilate(base, s.border * scale), 60);
  const finalArt = s.keepPaper ? renderFinal(art, rt, scale, { keepPaper: true }) : content;
  const clipped = createCanvas(finalArt.width, finalArt.height);
  const cctx = ctx2d(clipped);
  cctx.drawImage(finalArt, 0, 0);
  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(s.crop.kind === "contour" && s.keepPaper ? shape : base, 0, 0);
  const b = alphaBounds(shape);
  if (!b) {
    throw new Error("Nothing inside the crop. Draw something or adjust the crop first.");
  }
  const pad = Math.round(2 * scale);
  const box = {
    x: Math.max(0, b.x - pad),
    y: Math.max(0, b.y - pad),
    w: Math.min(shape.width - Math.max(0, b.x - pad), b.w + pad * 2),
    h: Math.min(shape.height - Math.max(0, b.y - pad), b.h + pad * 2),
  };
  return {
    art: cropCanvas(clipped, box),
    shape: cropCanvas(shape, box),
    w: box.w / scale,
    h: box.h / scale,
  };
}

/** Same geometry as the CSS holo background (angle, size, position, stops). */
function holoFill(ctx: CanvasRenderingContext2D, w: number, h: number, angle: number) {
  const { p, q } = holoPos(angle);
  const bw = w * HOLO_SIZE;
  const bh = h * HOLO_SIZE;
  const ox = -(bw - w) * (p / 100);
  const oy = -(bh - h) * (q / 100);
  const t = (HOLO_ANGLE_DEG * Math.PI) / 180;
  const dx = Math.sin(t);
  const dy = -Math.cos(t);
  const len = Math.abs(bw * dx) + Math.abs(bh * dy);
  const cx = ox + bw / 2;
  const cy = oy + bh / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  for (const [s, c] of HOLO_STOPS) {
    g.addColorStop(s, c);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Flattens a sticker to PNG: outside the die-cut is transparent, white stock
 * stays white, clear film keeps alpha, holo uses the current fixed angle.
 */
export function composeStickerCanvas(
  artImg: CanvasImageSource,
  shapeImg: CanvasImageSource,
  w: number,
  h: number,
  material: StickerMaterial,
  holoAngle: number,
) {
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  const base = createCanvas(w, h);
  const b = ctx2d(base);
  if (material === "white") {
    b.fillStyle = "#fffefa";
    b.fillRect(0, 0, w, h);
  } else if (material === "clear") {
    b.fillStyle = "rgba(255,255,255,0.2)";
    b.fillRect(0, 0, w, h);
  } else {
    holoFill(b, w, h, holoAngle);
  }
  b.globalCompositeOperation = "destination-in";
  b.drawImage(shapeImg, 0, 0, w, h);
  ctx.drawImage(base, 0, 0);
  ctx.drawImage(artImg, 0, 0, w, h);
  const sheen = createCanvas(w, h);
  const sctx = ctx2d(sheen);
  const pos = 0.5 + 0.4 * Math.sin((holoAngle * Math.PI) / 180 + 0.6);
  const g = sctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(Math.max(0, pos - 0.14), "rgba(255,255,255,0)");
  g.addColorStop(pos, `rgba(255,255,255,${material === "white" ? 0.22 : 0.32})`);
  g.addColorStop(Math.min(1, pos + 0.14), "rgba(255,255,255,0)");
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, w, h);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(shapeImg, 0, 0, w, h);
  ctx.globalCompositeOperation = material === "holo" ? "overlay" : "source-atop";
  ctx.drawImage(sheen, 0, 0);
  return out;
}

export async function builtToBlobs(b: BuiltSticker) {
  const [art, shape] = await Promise.all([canvasToBlob(b.art), canvasToBlob(b.shape)]);
  return { art, shape };
}
