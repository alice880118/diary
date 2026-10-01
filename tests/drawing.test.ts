import assert from "node:assert/strict";
import { test } from "node:test";
import { boxCorners, mapPoints, resizeBox, shapeFallbackPoints } from "../app/packages/drawing/geometry.ts";
import { recognize } from "../app/packages/drawing/recognition.ts";
import { autoSmooth, pathLength } from "../app/packages/drawing/smoothing.ts";
import { Stabilizer } from "../app/packages/drawing/stabilizer.ts";

/** Deterministic jitter. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

function sample(f: (u: number) => [number, number], n: number, jitter: number, seed = 1) {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const [x, y] = f(i / n);
    out.push(x + r() * jitter, y + r() * jitter);
  }
  return out;
}

test("a wobbly diagonal is recognized as a line that keeps its ends", () => {
  const pts = sample((u) => [100 + u * 300, 100 + u * 160], 80, 6);
  const r = recognize(pts);
  assert.equal(r?.kind, "line");
  const s = r!.shape;
  const half = s.w / 2;
  const a = (s.rot * Math.PI) / 180;
  assert.ok(Math.hypot(s.cx - Math.cos(a) * half - pts[0], s.cy - Math.sin(a) * half - pts[1]) < 1e-6);
  assert.ok(Math.abs(s.w - Math.hypot(300, 160)) < 10);
});

test("a shaky, not quite closed loop becomes a circle", () => {
  const pts = sample((u) => {
    const t = -Math.PI / 2 + u * Math.PI * 2 * 0.95;
    return [300 + Math.cos(t) * 120, 300 + Math.sin(t) * 120];
  }, 120, 8);
  const r = recognize(pts);
  assert.equal(r?.kind, "circle");
  assert.ok(Math.abs(r!.shape.w - 240) < 24);
  assert.ok(Math.abs(r!.shape.cx - 300) < 12 && Math.abs(r!.shape.cy - 300) < 12);
});

test("a flat loop becomes an ellipse with its aspect ratio", () => {
  const pts = sample((u) => {
    const t = u * Math.PI * 2 * 0.97;
    return [400 + Math.cos(t) * 200, 300 + Math.sin(t) * 90];
  }, 140, 6);
  const r = recognize(pts);
  assert.equal(r?.kind, "ellipse");
  const ratio = Math.min(r!.shape.w, r!.shape.h) / Math.max(r!.shape.w, r!.shape.h);
  assert.ok(Math.abs(ratio - 0.45) < 0.08, `ratio ${ratio}`);
});

test("a C shape becomes an arc with its sweep", () => {
  const pts = sample((u) => {
    const t = Math.PI * 0.4 + u * Math.PI * 1.2;
    return [300 + Math.cos(t) * 150, 300 + Math.sin(t) * 150];
  }, 90, 5);
  const r = recognize(pts);
  assert.equal(r?.kind, "arc");
  const deg = Math.abs((r!.shape.sweep ?? 0) * 180) / Math.PI;
  assert.ok(Math.abs(deg - 216) < 20, `sweep ${deg}`);
  assert.ok(Math.abs(r!.shape.w / 2 - 150) < 15);
});

test("ordinary doodles are left alone", () => {
  const wave = sample((u) => [100 + u * 400, 300 + Math.sin(u * Math.PI * 4) * 60], 120, 3);
  assert.equal(recognize(wave), null);
  const s = sample((u) => [200 + Math.sin(u * Math.PI * 2) * 80, 100 + u * 300], 100, 3, 7);
  assert.equal(recognize(s), null);
  const zig = [100, 100, 200, 220, 300, 90, 400, 230, 500, 100];
  assert.equal(recognize(zig), null);
  const spiral = sample((u) => {
    const t = u * Math.PI * 5;
    return [300 + Math.cos(t) * (30 + u * 120), 300 + Math.sin(t) * (30 + u * 120)];
  }, 160, 2);
  assert.equal(recognize(spiral), null);
  assert.equal(recognize([0, 0, 5, 5, 10, 8]), null);
});

test("auto smooth pins the ends and only nudges the path", () => {
  const pts = sample((u) => [100 + u * 400, 200 + Math.sin(u * Math.PI) * 120], 160, 7, 3);
  const out = autoSmooth(pts, "high").pts;
  assert.deepEqual(out.slice(0, 2), [Math.round(pts[0] * 10) / 10, Math.round(pts[1] * 10) / 10]);
  assert.deepEqual(out.slice(-2), [Math.round(pts[pts.length - 2] * 10) / 10, Math.round(pts[pts.length - 1] * 10) / 10]);
  assert.ok(pathLength(out) < pathLength(pts), "jitter removed");
  assert.equal(autoSmooth(pts, "off").pts, pts);
});

test("the stabilizer damps tremor on slow strokes", () => {
  const r = rng(9);
  const s = new Stabilizer("strong", 1);
  let rawDev = 0;
  let outDev = 0;
  for (let i = 0; i < 200; i++) {
    const y = 100 + r() * 8;
    const [, oy] = s.push(i * 0.5, y, i * 16);
    if (i > 20) {
      rawDev += Math.abs(y - 100);
      outDev += Math.abs(oy - 100);
    }
  }
  assert.ok(outDev < rawDev * 0.5, `${outDev} vs ${rawDev}`);
  const off = new Stabilizer("off", 1);
  assert.deepEqual(off.push(3, 4, 0), [3, 4]);
  assert.deepEqual(off.push(9, 1, 16), [9, 1]);
});

test("resizing from a corner keeps the opposite corner fixed, also when rotated", () => {
  const b = { cx: 100, cy: 100, w: 80, h: 40, rot: 30 };
  const before = boxCorners(b)[0];
  const r = resizeBox(b, 2, 180, 190);
  const after = boxCorners(r)[0];
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-6);
  const pts = [60, 80, 140, 120];
  assert.deepEqual(mapPoints(pts, { cx: 100, cy: 100, w: 80, h: 40, rot: 0 }, { cx: 100, cy: 100, w: 80, h: 40, rot: 0 }), pts);
});

test("shapes produce closed outline fallback points", () => {
  const pts = shapeFallbackPoints({ type: "hexagon", cx: 0, cy: 0, w: 100, h: 100, rot: 0 });
  assert.equal(pts.length, 14);
  assert.deepEqual(pts.slice(0, 2), pts.slice(-2));
});
