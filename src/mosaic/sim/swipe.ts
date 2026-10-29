// Air swipe from the palm's sideways speed. Pure (see swipe.test.ts).
//
// Feed it one hand's palm at each new detection (fractions of the screen,
// as the person sees themselves), or null when the hand is gone. A swipe
// fires once, −1 for a sweep to the screen's left, +1 to the right, when:
//   - the palm moves sideways fast (over `fast`), keeps going that way, and
//     covers `travel` of the screen width, mostly sideways;
//   - it doesn't count again until the palm has slowed (under `slow`) —
//     hysteresis, so one sweep is one swipe;
//   - after a swipe it rests (`cooldown`), and for a while longer ignores a
//     sweep back the other way (`returnBlock`): the hand returning, or a wave.
// A hand that has just come into view settles first: arriving at the edge of
// the frame reads as a fast sideways move.

export type SwipeConfig = {
  /** Palm speed that starts a sweep, and below which it ends (screen widths / s). */
  fast: number;
  slow: number;
  /** Sideways distance a sweep must cover (screen widths). */
  travel: number;
  /** Sideways travel must beat vertical travel by this factor. */
  straightness: number;
  /** A sweep longer than this (ms) isn't a swipe. */
  maxTime: number;
  /** Rest after a swipe, and how long a sweep back is ignored (ms). */
  cooldown: number;
  returnBlock: number;
  /** A newly seen hand is watched this long before it can swipe (ms). */
  settle: number;
  /** Detections further apart than this (ms) start over. */
  gap: number;
  /** Speed smoothing (0..1, share of the new reading). */
  smooth: number;
  /**
   * A palm that jumps further than this between two detections (screen
   * widths) is taken as a different hand (the tracker swapped its two
   * hands), and watched afresh.
   */
  jump: number;
};

export const SWIPE: SwipeConfig = {
  fast: 0.9,
  slow: 0.35,
  travel: 0.2,
  straightness: 1.4,
  maxTime: 700,
  cooldown: 700,
  returnBlock: 1100,
  settle: 300,
  gap: 250,
  smooth: 0.6,
  jump: 0.2,
};

type Point = { x: number; y: number };

export type SwipeState = {
  last: (Point & { t: number }) | null;
  since: number;
  vx: number;
  vy: number;
  /** False until the palm has slowed down after a sweep. */
  armed: boolean;
  run: { dir: -1 | 1; x: number; y: number; t: number } | null;
  restUntil: number;
  back: { dir: -1 | 1; until: number } | null;
  /** For the dev readout. */
  fired: number;
  lastDir: -1 | 0 | 1;
};

export const swipeState = (): SwipeState => ({
  last: null,
  since: -1,
  vx: 0,
  vy: 0,
  armed: true,
  run: null,
  restUntil: 0,
  back: null,
  fired: 0,
  lastDir: 0,
});

/** Add a detection at time `t` (ms); returns −1 / +1 when a swipe fires, else 0. */
export const feedSwipe = (
  s: SwipeState,
  t: number,
  p: Point | null,
  cfg: SwipeConfig = SWIPE,
): -1 | 0 | 1 => {
  if (!p) {
    s.last = null;
    s.since = -1;
    s.run = null;
    s.vx = 0;
    s.vy = 0;
    return 0;
  }
  const prev = s.last;
  const jumped = !!prev && Math.hypot(p.x - prev.x, p.y - prev.y) > cfg.jump;
  if (!prev || t - prev.t > cfg.gap || jumped) {
    s.last = { t, x: p.x, y: p.y };
    if (!prev || s.since < 0 || jumped) s.since = t;
    s.run = null;
    s.vx = 0;
    s.vy = 0;
    return 0;
  }
  const dt = (t - prev.t) / 1000;
  if (dt <= 0) return 0;
  s.vx += ((p.x - prev.x) / dt - s.vx) * cfg.smooth;
  s.vy += ((p.y - prev.y) / dt - s.vy) * cfg.smooth;
  s.last = { t, x: p.x, y: p.y };
  if (t - s.since < cfg.settle) return 0;

  const speed = Math.abs(s.vx);
  if (!s.armed) {
    if (speed < cfg.slow) s.armed = true;
    return 0;
  }
  const dir: -1 | 1 = s.vx < 0 ? -1 : 1;
  if (!s.run) {
    if (speed > cfg.fast && speed > Math.abs(s.vy) * cfg.straightness)
      s.run = { dir, x: prev.x, y: prev.y, t: prev.t };
    else return 0;
  } else if (
    dir !== s.run.dir ||
    speed < cfg.slow ||
    t - s.run.t > cfg.maxTime
  ) {
    s.run = null;
    return 0;
  }
  const { run } = s;
  const travel = (p.x - run.x) * run.dir;
  const rise = Math.abs(p.y - run.y);
  if (travel < cfg.travel || travel < rise * cfg.straightness) return 0;
  // This sweep is done either way: wait for the palm to slow down.
  s.run = null;
  s.armed = false;
  if (t < s.restUntil) return 0;
  if (s.back && s.back.dir !== run.dir && t < s.back.until) return 0;
  s.restUntil = t + cfg.cooldown;
  s.back = { dir: run.dir, until: t + cfg.returnBlock };
  s.fired += 1;
  s.lastDir = run.dir;
  return run.dir;
};
