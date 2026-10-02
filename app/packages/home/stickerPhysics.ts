/**
 * Soft 2D "scatter" physics for stickers: each body floats with a velocity and
 * spin, bounces off walls and solid UI rects (losing some energy), slows down
 * with drag, and settles once slow. Pure state + step function so the same
 * logic can drive any surface; the caller renders the bodies.
 *
 * Units are the caller's surface units (board units on the home board).
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Body {
  id: string;
  cx: number;
  cy: number;
  /** Unrotated size. */
  w: number;
  h: number;
  /** Degrees. */
  rot: number;
  vx: number;
  vy: number;
  /** Degrees per second. */
  vr: number;
  settled: boolean;
}

export interface World {
  /** Area bodies must stay inside. */
  bounds: Rect;
  /** Solid areas (nav bar, floating controls) bodies bounce off. */
  solids: Rect[];
}

export const PHYSICS = {
  /** Fraction of speed kept after a bounce. */
  restitution: 0.55,
  /** Velocity decay per second (exp(-drag * t)). */
  drag: 1.25,
  spinDrag: 1.7,
  /** Below this speed (units/s) a body settles. */
  settleSpeed: 16,
  minStart: 180,
  maxStart: 360,
  maxSpin: 70,
  /** Safety stop. */
  maxSeconds: 7,
};

/** Half extents of a body's axis-aligned box at its current rotation. */
export function halfExtents(b: Pick<Body, "w" | "h" | "rot">) {
  const r = (b.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hx: (c * b.w + s * b.h) / 2, hy: (s * b.w + c * b.h) / 2 };
}

/** Random direction, speed and spin. */
export function kick(b: Body, rand = Math.random): Body {
  const a = rand() * Math.PI * 2;
  const v = PHYSICS.minStart + rand() * (PHYSICS.maxStart - PHYSICS.minStart);
  return { ...b, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: (rand() * 2 - 1) * PHYSICS.maxSpin, settled: false };
}

/** Keeps a body inside the bounds and out of solids, reflecting its velocity. */
export function resolve(b: Body, world: World, bounce = true): Body {
  const { hx, hy } = halfExtents(b);
  let { cx, cy, vx, vy } = b;
  const e = bounce ? PHYSICS.restitution : 0;
  const B = world.bounds;
  // Bodies larger than the area are centered on that axis.
  if (hx * 2 >= B.x1 - B.x0) {
    cx = (B.x0 + B.x1) / 2;
    vx = 0;
  } else if (cx - hx < B.x0) {
    cx = B.x0 + hx;
    if (vx < 0) vx = -vx * e;
  } else if (cx + hx > B.x1) {
    cx = B.x1 - hx;
    if (vx > 0) vx = -vx * e;
  }
  if (hy * 2 >= B.y1 - B.y0) {
    cy = (B.y0 + B.y1) / 2;
    vy = 0;
  } else if (cy - hy < B.y0) {
    cy = B.y0 + hy;
    if (vy < 0) vy = -vy * e;
  } else if (cy + hy > B.y1) {
    cy = B.y1 - hy;
    if (vy > 0) vy = -vy * e;
  }
  for (const r of world.solids) {
    const ox = Math.min(cx + hx, r.x1) - Math.max(cx - hx, r.x0);
    const oy = Math.min(cy + hy, r.y1) - Math.max(cy - hy, r.y0);
    if (ox <= 0 || oy <= 0) continue;
    // Push out along the shallower axis, unless that would leave the bounds.
    const rc = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    const pushY = oy < ox;
    if (pushY) {
      const up = cy < rc.y;
      const ny = up ? r.y0 - hy : r.y1 + hy;
      if (ny - hy >= B.y0 - 0.5 && ny + hy <= B.y1 + 0.5) {
        cy = ny;
        if ((up && vy > 0) || (!up && vy < 0)) vy = -vy * e;
        continue;
      }
    }
    const left = cx < rc.x;
    cx = left ? r.x0 - hx : r.x1 + hx;
    if ((left && vx > 0) || (!left && vx < 0)) vx = -vx * e;
  }
  return { ...b, cx, cy, vx, vy };
}

/** Advances unsettled bodies by dt seconds. */
export function step(bodies: Body[], dt: number, world: World): Body[] {
  const k = Math.exp(-PHYSICS.drag * dt);
  const kr = Math.exp(-PHYSICS.spinDrag * dt);
  return bodies.map((b) => {
    if (b.settled) return b;
    let n: Body = { ...b, cx: b.cx + b.vx * dt, cy: b.cy + b.vy * dt, rot: b.rot + b.vr * dt, vx: b.vx * k, vy: b.vy * k, vr: b.vr * kr };
    n = resolve(n, world);
    if (Math.hypot(n.vx, n.vy) < PHYSICS.settleSpeed) n = { ...resolve(n, world, false), vx: 0, vy: 0, vr: 0, settled: true };
    return n;
  });
}

/**
 * Shake detector for devicemotion: two strong jolts within a short window.
 * Returns a handler to attach to the "devicemotion" event.
 */
export function shakeDetector(onShake: () => void, threshold = 17, cooldownMs = 1500) {
  let lastJolt = 0;
  let lastShake = 0;
  return (e: DeviceMotionEvent) => {
    const a = e.acceleration ?? e.accelerationIncludingGravity;
    if (!a) return;
    const g = e.acceleration ? 0 : 9.81;
    const m = Math.abs(Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) - g);
    const now = performance.now();
    if (m < threshold) return;
    if (now - lastJolt < 600 && now - lastShake > cooldownMs) {
      lastShake = now;
      onShake();
    }
    lastJolt = now;
  };
}

/** iOS asks for motion permission from a user gesture; elsewhere this is a no-op. */
export async function requestMotionPermission(): Promise<boolean> {
  const D = typeof DeviceMotionEvent === "undefined" ? undefined : (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> });
  if (!D?.requestPermission) return true;
  try {
    return (await D.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
