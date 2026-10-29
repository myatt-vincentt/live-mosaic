// Where a person can be. The portrait mask also marks bits of the room (a
// cloth, a box, a wall) as "person", so it is only trusted inside a region
// built from what is really tracked: the face (head and the body below it)
// and each hand (its bones and the forearm running out of the picture).
// Hands become capsules (segments with a radius) in screen heights, x scaled
// by the aspect ratio.

/** Capsules the shader can hold. */
export const MAX_CAPSULES = 48;

export type Capsules = {
  /** ax, ay, bx, by per capsule. */
  seg: Float32Array;
  radius: Float32Array;
  count: number;
};

export const createCapsules = (): Capsules => ({
  seg: new Float32Array(MAX_CAPSULES * 4),
  radius: new Float32Array(MAX_CAPSULES),
  count: 0,
});

const FINGERS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const PALM = [
  [5, 9],
  [9, 13],
  [13, 17],
  [0, 17],
  [0, 9],
];

const push = (
  c: Capsules,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) => {
  if (c.count >= MAX_CAPSULES) return;
  c.seg.set([ax, ay, bx, by], c.count * 4);
  c.radius[c.count] = r;
  c.count += 1;
};

/** Rebuild the capsules from this frame's hands (21 points each, screen uv, y up). */
export const buildCapsules = (
  c: Capsules,
  hands: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  aspect: number,
) => {
  c.count = 0;
  hands.forEach((uv) => {
    if (uv.length < 21) return;
    const P = uv.map((p) => ({ x: p.x * aspect, y: p.y }));
    const size = Math.max(0.02, Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y));
    FINGERS.forEach((chain) => {
      for (let k = 0; k + 1 < chain.length; k += 1) {
        const a = P[chain[k]];
        const b = P[chain[k + 1]];
        push(c, a.x, a.y, b.x, b.y, 0.24 * size);
      }
    });
    PALM.forEach(([i, j]) =>
      push(c, P[i].x, P[i].y, P[j].x, P[j].y, 0.45 * size),
    );
    // The forearm: from the wrist away from the fingers, out of the picture.
    const dx = P[0].x - P[9].x;
    const dy = P[0].y - P[9].y;
    const len = Math.hypot(dx, dy) || 1;
    push(
      c,
      P[0].x,
      P[0].y,
      P[0].x + (dx / len) * 6 * size,
      P[0].y + (dy / len) * 6 * size,
      0.55 * size,
    );
  });
  return c;
};
