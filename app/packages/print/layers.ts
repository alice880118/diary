import { newId, randomSeed } from "../db/id";
import { ART_H, ART_W, type PrintLayer } from "../db/types";
import { mulberry32 } from "../textures/noise";

export const MAX_PRINT_LAYERS = 15;

/** Riso-like ink palette; users can still pick any colour. */
export const INK_PALETTE = [
  { color: "#ff48b0", name: "Fluorescent pink" },
  { color: "#ffe800", name: "Yellow" },
  { color: "#0078bf", name: "Blue" },
  { color: "#00a95c", name: "Green" },
  { color: "#ff6c2f", name: "Orange" },
  { color: "#765ba7", name: "Purple" },
  { color: "#e45d50", name: "Red" },
  { color: "#3d5588", name: "Navy" },
  { color: "#000000", name: "Black" },
  { color: "#88898a", name: "Gray" },
];

/** Default misregistration: 0.1%–0.5% of the short side, direction from seed. */
export function offsetFromSeed(seed: number, amount?: number) {
  const rnd = mulberry32(seed);
  const short = Math.min(ART_W, ART_H);
  const frac = amount ?? 0.001 + rnd() * 0.004;
  const angle = rnd() * Math.PI * 2;
  const mag = short * frac;
  return { dx: Math.cos(angle) * mag, dy: Math.sin(angle) * mag };
}

export function offsetAmount(p: PrintLayer) {
  return Math.hypot(p.offset.dx, p.offset.dy) / Math.min(ART_W, ART_H);
}

export function offsetAngle(p: PrintLayer) {
  return (Math.atan2(p.offset.dy, p.offset.dx) * 180) / Math.PI;
}

export function withOffset(p: PrintLayer, amountFrac: number, angleDeg: number): PrintLayer {
  const mag = Math.min(ART_W, ART_H) * amountFrac;
  const a = (angleDeg * Math.PI) / 180;
  return { ...p, offset: { dx: Math.cos(a) * mag, dy: Math.sin(a) * mag } };
}

export function newPrintLayer(index: number): PrintLayer {
  const seed = randomSeed();
  const ink = INK_PALETTE[index % INK_PALETTE.length];
  return {
    id: newId("pl"),
    name: `Ink ${index + 1} · ${ink.name}`,
    color: ink.color,
    visible: true,
    maskAssetId: null,
    density: 0.9,
    grain: 0.45,
    unevenness: 0.35,
    paperShow: 0.4,
    seed,
    offset: offsetFromSeed(seed),
  };
}

export function regenerateMisregistration(p: PrintLayer): PrintLayer {
  const seed = randomSeed();
  return { ...p, seed, offset: offsetFromSeed(seed) };
}
