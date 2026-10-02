import assert from "node:assert/strict";
import { test } from "node:test";
import { kick, step, type Body, type World } from "../app/packages/home/stickerPhysics.ts";

const world: World = { bounds: { x0: 0, y0: 0, x1: 400, y1: 700 }, solids: [{ x0: 0, y0: 640, x1: 400, y1: 720 }, { x0: 260, y0: 0, x1: 400, y1: 60 }] };

function run(bodies: Body[], seconds = 10) {
  let b = bodies;
  for (let t = 0; t < seconds; t += 1 / 60) b = step(b, 1 / 60, world);
  return b;
}

test("scattered stickers settle inside the safe area", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start: Body[] = Array.from({ length: 12 }, (_, i) =>
    kick({ id: String(i), cx: 60 + (i % 4) * 90, cy: 120 + Math.floor(i / 4) * 150, w: 80, h: 60, rot: 0, vx: 0, vy: 0, vr: 0, settled: false }, rand),
  );
  const end = run(start);
  for (const b of end) {
    assert.ok(b.settled, "settled");
    const hx = 60;
    assert.ok(b.cx - 30 >= -0.5 && b.cx + 30 <= 400.5 + hx, "inside x");
    // Never left resting under the nav bar.
    assert.ok(b.cy + 25 <= 640.5, `above nav: ${b.cy}`);
  }
});

test("bounces lose energy", () => {
  const b: Body = { id: "a", cx: 390, cy: 300, w: 20, h: 20, rot: 0, vx: 300, vy: 0, vr: 0, settled: false };
  const [n] = step([b], 1 / 60, world);
  assert.ok(n.vx < 0 && Math.abs(n.vx) < 300 * 0.6, "reflected with loss");
});
