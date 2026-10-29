import { describe, expect, it } from "vitest";

import { feedSwipe, swipeState } from "./swipe";

/** Feed a path sampled at `hz`; returns the swipes that fired, with their times. */
const run = (
  path: (t: number) => { x: number; y: number } | null,
  seconds: number,
  hz = 15,
  s = swipeState(),
) => {
  const fired: { t: number; dir: number }[] = [];
  for (let i = 0; i <= seconds * hz; i += 1) {
    const t = (i / hz) * 1000;
    const dir = feedSwipe(s, t, path(t / 1000));
    if (dir) fired.push({ t: t / 1000, dir });
  }
  return fired;
};

/** Hold still, sweep from x0 to x1 over `dur` seconds starting at `at`, hold. */
const sweep =
  (x0: number, x1: number, at = 1, dur = 0.3, y = 0.5) =>
  (t: number) => {
    const k = Math.min(1, Math.max(0, (t - at) / dur));
    const e = k * k * (3 - 2 * k);
    return { x: x0 + (x1 - x0) * e, y };
  };

describe("air swipe", () => {
  it("fires once for a quick sweep to the left", () => {
    expect(run(sweep(0.75, 0.3), 3).map((f) => f.dir)).toEqual([-1]);
  });

  it("fires once for a quick sweep to the right", () => {
    expect(run(sweep(0.25, 0.7), 3).map((f) => f.dir)).toEqual([1]);
  });

  it("ignores a slow drift across the screen", () => {
    expect(run(sweep(0.8, 0.2, 0.5, 3), 4)).toEqual([]);
  });

  it("ignores a short quick flick", () => {
    expect(run(sweep(0.5, 0.4, 1, 0.12), 3)).toEqual([]);
  });

  it("ignores waving in place", () => {
    const wave = (t: number) => ({
      x: 0.5 + 0.07 * Math.sin(t * Math.PI * 2 * 2.2),
      y: 0.45 + 0.02 * Math.sin(t * 9),
    });
    expect(run(wave, 30)).toEqual([]);
  });

  it("ignores a big up-and-down move", () => {
    const up = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - 1) / 0.3));
      return { x: 0.5 + 0.12 * k, y: 0.8 - 0.6 * k };
    };
    expect(run(up, 3)).toEqual([]);
  });

  it("doesn't flip back when the hand returns", () => {
    const there = sweep(0.75, 0.3, 1);
    const back = sweep(0.3, 0.75, 1.6);
    const path = (t: number) => (t < 1.6 ? there(t) : back(t));
    expect(run(path, 4).map((f) => f.dir)).toEqual([-1]);
  });

  it("lets two swipes the same way through after a rest", () => {
    const a = sweep(0.75, 0.3, 1);
    const reset = sweep(0.3, 0.75, 1.6, 1.4); // slow return
    const b = sweep(0.75, 0.3, 3.5);
    const path = (t: number) => {
      if (t < 1.6) return a(t);
      if (t < 3.5) return reset(t);
      return b(t);
    };
    expect(run(path, 5).map((f) => f.dir)).toEqual([-1, -1]);
  });

  it("ignores the tracker swapping two hands", () => {
    // Two hands far apart; the reading jumps between them now and then.
    const swap = (t: number) => ({
      x: Math.floor(t * 1.7) % 2 ? 0.25 : 0.75,
      y: 0.5 + 0.01 * Math.sin(t * 7),
    });
    expect(run(swap, 30)).toEqual([]);
  });

  it("waits for a hand that has just come into view", () => {
    const enter = (t: number) =>
      t < 1 ? null : { x: Math.max(0.3, 0.9 - (t - 1) * 3), y: 0.5 };
    expect(run(enter, 2)).toEqual([]);
  });
});
